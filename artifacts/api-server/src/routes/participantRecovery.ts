import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, participantAccountsTable as accounts, participantSessionsTable as sessions, teamRegistrationsTable as registrations } from "@workspace/db";
import { GetRegistrationParticipantAccountParams, GetRegistrationParticipantAccountResponse, ResetRegistrationPasswordParams, ResetRegistrationPasswordBody, ResetRegistrationPasswordResponse } from "@workspace/api-zod";
import { AuthBusyError, hashPassword, limitAuthentication } from "../lib/participantAuth";

// Mounted after the organizer authentication/authorization middleware.
const router: IRouter = Router();
const accountProjection = { id: accounts.id, username: accounts.username, email: accounts.email, mustChangePassword: accounts.mustChangePassword };
const linkedOwner = eq(registrations.ownerId, sql`'participant:' || ${accounts.id}::text`);

router.get("/admin/registrations/:id/participant-account", async (req, res) => {
  const parsed = GetRegistrationParticipantAccountParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid registration reference." }); return; }
  try {
    const [registration] = await db.select({ id: registrations.id }).from(registrations).where(eq(registrations.id, parsed.data.id)).limit(1);
    if (!registration) { res.status(404).json({ error: "Registration not found." }); return; }
    const [account] = await db.select(accountProjection).from(registrations)
      .innerJoin(accounts, linkedOwner).where(eq(registrations.id, parsed.data.id)).limit(1);
    res.json(GetRegistrationParticipantAccountResponse.parse({ account: account ?? null }));
  } catch {
    req.log.error("Unable to load linked participant account");
    res.status(503).json({ error: "Participant account could not be loaded. Please retry." });
  }
});

router.post("/admin/registrations/:id/reset-password", async (req, res) => {
  const params = ResetRegistrationPasswordParams.safeParse(req.params);
  const body = ResetRegistrationPasswordBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Confirm the linked participant account before resetting its password." }); return; }
  try {
    if (!await limitAuthentication(req, `organizer-reset:${req.organizer?.id}`)) {
      res.setHeader("Retry-After", "900");
      res.status(429).json({ error: "Too many reset attempts. Try again in 15 minutes." }); return;
    }
    const temporaryPassword = randomBytes(18).toString("base64url");
    const passwordHash = await hashPassword(temporaryPassword);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
    const result = await db.transaction(async (tx) => {
      const [account] = await tx.select(accountProjection).from(accounts).where(eq(accounts.id, body.data.accountId)).for("update");
      if (!account) return null;
      const [registration] = await tx.select({ ownerId: registrations.ownerId }).from(registrations)
        .where(eq(registrations.id, params.data.id)).for("update");
      if (registration?.ownerId !== `participant:${account.id}`) return null;
      await tx.update(accounts).set({ passwordHash, mustChangePassword: true, temporaryPasswordExpiresAt: expiresAt }).where(eq(accounts.id, account.id));
      await tx.delete(sessions).where(eq(sessions.accountId, account.id));
      return account;
    });
    if (!result) { res.status(409).json({ error: "This participant account is no longer linked to the selected team. Reload the record." }); return; }
    req.log.info({ registrationId: params.data.id, organizerId: req.organizer?.id }, "Organizer reset a participant password");
    // Only this response contains the generated secret; no DB, email, log, or query cache stores it.
    res.json(ResetRegistrationPasswordResponse.parse({ username: result.username, temporaryPassword, expiresAt: expiresAt.toISOString() }));
  } catch (error) {
    req.log.error("Participant password reset failed");
    res.status(503).json({ error: error instanceof AuthBusyError ? error.message : "Reset could not be confirmed. Reload the account before trying a new reset; a previous password may already be invalid." });
  }
});

export default router;
