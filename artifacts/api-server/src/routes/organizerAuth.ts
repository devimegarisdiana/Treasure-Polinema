import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, organizerSessionsTable as sessions } from "@workspace/db";
import { GetOrganizerSessionResponse, SignInOrganizerBody, SignInOrganizerResponse } from "@workspace/api-zod";
import { AuthBusyError, limitAuthentication, sameSiteRequest, tokenHash, verifyPassword } from "../lib/participantAuth";
import { clearOrganizerCookie, createOrganizerSession, organizerAccount, organizerToken, OrganizerSetupError, setOrganizerCookie } from "../lib/organizerAuth";

const router: IRouter = Router();
router.use("/organizer-auth", (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (!sameSiteRequest(req)) { res.status(403).json({ error: "Please use the organizer dashboard." }); return; }
  next();
});
router.get("/organizer-auth/me", (req, res) => {
  res.json(GetOrganizerSessionResponse.parse({ user: req.organizer ?? null }));
});
router.post("/organizer-auth/signin", async (req, res) => {
  const parsed = SignInOrganizerBody.safeParse({
    ...req.body,
    username: typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : req.body?.username,
  });
  if (!parsed.success) { res.status(400).json({ error: "Enter your organizer username and password." }); return; }
  try {
    const { username, password } = parsed.data;
    if (!await limitAuthentication(req, `organizer:${username}`)) {
      res.setHeader("Retry-After", "900");
      res.status(429).json({ error: "Too many sign-in attempts. Please try again in 15 minutes." }); return;
    }
    const account = await organizerAccount();
    const validPassword = await verifyPassword(password, account.passwordHash);
    if (!validPassword || username !== account.username) {
      res.status(401).json({ error: "The username or password is incorrect." }); return;
    }
    const token = await createOrganizerSession(req, account);
    setOrganizerCookie(req, res, token);
    res.json(SignInOrganizerResponse.parse({ user: { id: `organizer:${account.id}`, username: account.username } }));
  } catch (error) {
    req.log.error({ reason: error instanceof OrganizerSetupError ? error.message : "service-error" }, "Organizer sign-in failed");
    res.status(503).json({ error: error instanceof AuthBusyError || error instanceof OrganizerSetupError ? error.message : "Organizer sign-in is temporarily unavailable. Please retry shortly." });
  }
});
router.post("/organizer-auth/signout", async (req, res) => {
  try {
    const token = organizerToken(req);
    if (token) await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash(token)));
    clearOrganizerCookie(req, res);
    res.json({ success: true });
  } catch {
    res.status(503).json({ error: "Sign-out could not be completed. Please retry." });
  }
});
export default router;
