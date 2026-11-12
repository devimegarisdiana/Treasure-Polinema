import { Router, type IRouter } from "express";
import { isRegistrationClosed, registrationClosedMessage } from "../lib/registrationPolicy";
import { and, eq, gt, or, sql } from "drizzle-orm";
import { db, participantAccountsTable as accounts, participantSessionsTable as sessions } from "@workspace/db";
import { ChangeParticipantPasswordBody, ChangeParticipantPasswordResponse, CreateParticipantAccountBody, CreateParticipantAccountResponse, GetParticipantSessionResponse, SignInParticipantBody, SignInParticipantResponse } from "@workspace/api-zod";
import { AuthBusyError, clearParticipantCookie, hashPassword, limitAuthentication, newParticipantSession, participantToken, sameSiteRequest, setParticipantCookie, tokenHash, verifyPassword } from "../lib/participantAuth";
import { advisoryLockKey } from "../lib/advisoryLock";

const router: IRouter = Router();
router.use("/participant-auth", (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (!sameSiteRequest(req)) { res.status(403).json({ error: "Please use the TREASURE registration page." }); return; }
  next();
});

router.get("/participant-auth/me", (req, res) => {
  res.json(GetParticipantSessionResponse.parse({ user: req.participant ?? null }));
});

router.post("/participant-auth/signup", async (req, res) => {
  if (isRegistrationClosed()) { res.status(410).json({ error: registrationClosedMessage }); return; }
  const parsed = CreateParticipantAccountBody.safeParse({
    ...req.body,
    username: typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : req.body?.username,
    email: typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : req.body?.email,
  });
  if (!parsed.success) { res.status(400).json({ error: "Use a username with at least 12 characters, a valid email, and a password with 12–128 characters." }); return; }
  const { username, email, password } = parsed.data;
  try {
    if (!await limitAuthentication(req, email)) {
      res.setHeader("Retry-After", "900");
      res.status(429).json({ error: "Too many account attempts. Please try again in 15 minutes." }); return;
    }
    const passwordHash = await hashPassword(password);
    const result = await db.transaction(async (tx) => {
      // Usernames may now contain @ and spaces. Keep usernames and email
      // identifiers unambiguous, including simultaneous account creation.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${advisoryLockKey("participant-signup-identifiers")}::bigint)`);
      const [existing] = await tx.select({ id: accounts.id }).from(accounts)
        .where(or(eq(accounts.username, username), eq(accounts.email, email),
          eq(accounts.username, email), eq(accounts.email, username))).limit(1);
      if (existing) return null;
      const [account] = await tx.insert(accounts).values({ username, email, passwordHash })
        .returning({ id: accounts.id, username: accounts.username, email: accounts.email });
      const session = newParticipantSession(account.id);
      const oldToken = participantToken(req);
      if (oldToken) await tx.delete(sessions).where(eq(sessions.tokenHash, tokenHash(oldToken)));
      await tx.insert(sessions).values(session.row);
      return { user: { ...account, id: `participant:${account.id}` }, token: session.token };
    });
    if (!result) { res.status(409).json({ error: "This username or email is already registered. Sign in or choose another." }); return; }
    setParticipantCookie(req, res, result.token);
    res.status(201).json(CreateParticipantAccountResponse.parse({ user: result.user }));
  } catch (error) {
    if ((error as { cause?: { code?: string } })?.cause?.code === "23505") {
      res.status(409).json({ error: "This username or email is already registered. Sign in or choose another." }); return;
    }
    req.log.error("Participant account creation failed");
    res.status(503).json({ error: error instanceof AuthBusyError ? error.message : "Your account could not be created. Please retry shortly." });
  }
});

router.post("/participant-auth/signin", async (req, res) => {
  const parsed = SignInParticipantBody.safeParse({
    ...req.body,
    identifier: typeof req.body?.identifier === "string" ? req.body.identifier.trim().toLowerCase() : req.body?.identifier,
  });
  if (!parsed.success) { res.status(400).json({ error: "Enter your username or email and password." }); return; }
  const { identifier, password } = parsed.data;
  try {
    if (!await limitAuthentication(req, identifier)) {
      res.setHeader("Retry-After", "900");
      res.status(429).json({ error: "Too many sign-in attempts. Please try again in 15 minutes." }); return;
    }
    const [account] = await db.select().from(accounts)
      .where(or(eq(accounts.username, identifier), eq(accounts.email, identifier))).limit(1);
    if (!await verifyPassword(password, account?.passwordHash) || !account) {
      res.status(401).json({ error: "The username/email or password is incorrect." }); return;
    }
    if (account.mustChangePassword && (!account.temporaryPasswordExpiresAt || account.temporaryPasswordExpiresAt <= new Date())) {
      res.status(401).json({ error: "Your temporary password has expired. Ask the organizer to reset it again." }); return;
    }
    const session = newParticipantSession(account.id);
    const signedIn = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(accounts).where(eq(accounts.id, account.id)).for("update");
      // Serialize with organizer resets: a verified old password must not create
      // a new session after its credential has been replaced.
      if (!current || current.passwordHash !== account.passwordHash ||
        (current.mustChangePassword && (!current.temporaryPasswordExpiresAt || current.temporaryPasswordExpiresAt <= new Date()))) return false;
      const oldToken = participantToken(req);
      if (oldToken) await tx.delete(sessions).where(eq(sessions.tokenHash, tokenHash(oldToken)));
      await tx.insert(sessions).values(session.row);
      return true;
    });
    if (!signedIn) { res.status(401).json({ error: "Your password changed. Sign in again with your latest password." }); return; }
    setParticipantCookie(req, res, session.token);
    res.json(SignInParticipantResponse.parse({ user: { id: `participant:${account.id}`, username: account.username, email: account.email, mustChangePassword: account.mustChangePassword } }));
  } catch (error) {
    req.log.error("Participant sign-in failed");
    res.status(503).json({ error: error instanceof AuthBusyError ? error.message : "Sign-in is temporarily unavailable. Please retry shortly." });
  }
});

router.post("/participant-auth/change-password", async (req, res) => {
  const parsed = ChangeParticipantPasswordBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Enter your current password and a new password with 12–128 characters." }); return; }
  const token = participantToken(req);
  if (!req.participant || !token) { res.status(401).json({ error: "Please sign in again." }); return; }
  if (parsed.data.currentPassword === parsed.data.newPassword) { res.status(400).json({ error: "Choose a new password different from your current password." }); return; }
  try {
    if (!await limitAuthentication(req, `password-change:${req.participant.id}`)) {
      res.setHeader("Retry-After", "900");
      res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." }); return;
    }
    const accountId = req.participant.id.replace(/^participant:/, "");
    const passwordHash = await hashPassword(parsed.data.newPassword);
    const result = await db.transaction(async (tx) => {
      const [account] = await tx.select().from(accounts).where(eq(accounts.id, accountId)).for("update");
      const [active] = await tx.select().from(sessions).where(and(
        eq(sessions.accountId, accountId), eq(sessions.tokenHash, tokenHash(token)), gt(sessions.expiresAt, new Date()),
      )).limit(1);
      if (!account || !active ||
        (account.mustChangePassword && (!account.temporaryPasswordExpiresAt || account.temporaryPasswordExpiresAt <= new Date())) ||
        !await verifyPassword(parsed.data.currentPassword, account.passwordHash)) return null;
      await tx.update(accounts).set({ passwordHash, mustChangePassword: false, temporaryPasswordExpiresAt: null }).where(eq(accounts.id, accountId));
      await tx.delete(sessions).where(eq(sessions.accountId, accountId));
      const session = newParticipantSession(accountId);
      await tx.insert(sessions).values(session.row);
      return { token: session.token, user: { id: `participant:${accountId}`, username: account.username, email: account.email, mustChangePassword: false } };
    });
    if (!result) { res.status(401).json({ error: "Your current password or session is no longer valid. Sign in again if the organizer reset your password." }); return; }
    setParticipantCookie(req, res, result.token);
    res.json(ChangeParticipantPasswordResponse.parse({ user: result.user }));
  } catch (error) {
    req.log.error("Participant password change failed");
    res.status(503).json({ error: error instanceof AuthBusyError ? error.message : "Password change could not be confirmed. Try signing in with your new password before retrying." });
  }
});

router.post("/participant-auth/signout", async (req, res) => {
  try {
    const token = participantToken(req);
    if (token) await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash(token)));
    clearParticipantCookie(req, res);
    res.json({ success: true });
  } catch {
    res.status(503).json({ error: "Sign-out could not be completed. Please retry." });
  }
});

export default router;
