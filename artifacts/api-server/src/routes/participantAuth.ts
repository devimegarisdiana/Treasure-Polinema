import { Router, type IRouter } from "express";
import { eq, or, sql } from "drizzle-orm";
import { db, participantAccountsTable as accounts, participantSessionsTable as sessions } from "@workspace/db";
import { CreateParticipantAccountBody, CreateParticipantAccountResponse, GetParticipantSessionResponse, SignInParticipantBody, SignInParticipantResponse } from "@workspace/api-zod";
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
    const session = newParticipantSession(account.id);
    await db.transaction(async (tx) => {
      const oldToken = participantToken(req);
      if (oldToken) await tx.delete(sessions).where(eq(sessions.tokenHash, tokenHash(oldToken)));
      await tx.insert(sessions).values(session.row);
    });
    setParticipantCookie(req, res, session.token);
    res.json(SignInParticipantResponse.parse({ user: { id: `participant:${account.id}`, username: account.username, email: account.email } }));
  } catch (error) {
    req.log.error("Participant sign-in failed");
    res.status(503).json({ error: error instanceof AuthBusyError ? error.message : "Sign-in is temporarily unavailable. Please retry shortly." });
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
