import { ReplitConnectors } from "@replit/connectors-sdk";
import { eq, sql } from "drizzle-orm";
import { db, registrationNotificationsTable, teamRegistrationsTable, teamRegistrationMembersTable } from "@workspace/db";
import { logger } from "./logger";

export function notificationSetup() {
  const recipient = process.env.REGISTRATION_NOTIFICATION_EMAIL?.trim() || null;
  const sender = process.env.REGISTRATION_EMAIL_FROM?.trim() || null;
  return {
    recipient,
    sender,
    note: !recipient || !sender
      ? "Email notifications are not configured. Set the notification recipient and sender."
      : sender.includes("@resend.dev")
        ? "Resend's test sender can only email the Resend account owner. For other recipients, configure a verified sending domain and update REGISTRATION_EMAIL_FROM. A valid Resend connection is required."
        : null,
  };
}

function providerError(status: number, message: string): string {
  if (/api key|unauthorized|invalid token/i.test(message) || status === 401) {
    return "Resend rejected the API key. Update the credentials in the connected Resend integration.";
  }
  if (/verify|verified|domain|testing emails|own email/i.test(message)) {
    return "Resend rejected the sender or recipient. Verify a sending domain, or use the account owner's address with the test sender.";
  }
  if (status === 429) return "Resend rate limit reached. The notification will be retried.";
  return `Email provider rejected the notification (HTTP ${status}). Check the Resend connection and sender configuration.`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

let running = false;

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Email provider timed out.")), 20_000);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function processRegistrationNotifications(): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Atomic leasing works across server replicas. Expired leases survive restarts.
    for (let count = 0; count < 5; count++) {
      const result = await db.execute(sql`
        WITH candidate AS (
          SELECT id FROM registration_notifications
          WHERE (status IN ('pending', 'failed') AND next_attempt_at <= now())
             OR (status = 'processing' AND locked_at < now() - interval '5 minutes')
          ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE registration_notifications AS n
        SET status = 'processing', locked_at = now(), attempts = attempts + 1
        FROM candidate WHERE n.id = candidate.id
        RETURNING n.id, n.registration_id, n.attempts
      `);
      const job = result.rows[0] as { id: string; registration_id: string; attempts: number } | undefined;
      if (!job) break;
      try {
        const setup = notificationSetup();
        if (!setup.recipient || !setup.sender) throw new Error("Email notification sender or recipient is not configured.");
        const [registration] = await db.select().from(teamRegistrationsTable)
          .where(eq(teamRegistrationsTable.id, job.registration_id)).limit(1);
        if (!registration) throw new Error("The registration could not be found.");
        const members = await db.select({ name: teamRegistrationMembersTable.fullName })
          .from(teamRegistrationMembersTable)
          .where(eq(teamRegistrationMembersTable.registrationId, registration.id))
          .orderBy(teamRegistrationMembersTable.position);
        const text = [
          "New TREASURE 2026 registration",
          `Reference: ${registration.referenceCode}`,
          `Team leader: ${members[0]?.name ?? registration.teamName}`,
          `Institution: ${registration.institution ?? "Not provided"}`,
          `Competition: ${registration.competition === "business_simulation" ? "Business Simulation" : registration.competition ?? "Not provided"}`,
          `Team members: ${members.length}`,
          `Submitted: ${registration.createdAt.toISOString()}`,
          "",
          "The registration has been saved. Open the organizer dashboard on the TREASURE 2026 website to review the team and its private documents.",
          "This notification does not confirm payment approval.",
        ].join("\n");
        // The SDK obtains fresh credentials for each send; never read API keys.
        const response = await withTimeout(new ReplitConnectors().proxy("resend", "/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": `treasure-registration-${job.id}` },
          body: {
            from: setup.sender,
            to: [setup.recipient],
            subject: `TREASURE 2026 — new registration ${registration.referenceCode}`,
            text,
            html: `<div style="font-family:Arial,sans-serif;line-height:1.65"><h2>New TREASURE 2026 registration</h2><p>${escapeHtml(text.split("\n").slice(1).join("\n")).replaceAll("\n", "<br>")}</p></div>`,
          },
        }));
        const payload = await response.json() as { id?: string; message?: string };
        if (!response.ok || !payload.id) throw new Error(providerError(response.status, payload.message ?? ""));
        await db.update(registrationNotificationsTable).set({
          status: "sent", sentAt: new Date(), providerId: payload.id, lockedAt: null, lastError: null,
        }).where(eq(registrationNotificationsTable.id, job.id));
      } catch (error) {
        const known = error instanceof Error && (
          error.message.startsWith("Resend") || error.message.startsWith("Email provider") ||
          error.message.startsWith("Email notification") || error.message.startsWith("The registration")
        );
        const lastError = known ? (error as Error).message : "Email delivery failed. Check the connected Resend integration; automatic retry is scheduled.";
        const delay = Math.min(15 * 60_000, 60_000 * 2 ** Math.min(job.attempts - 1, 4));
        await db.update(registrationNotificationsTable).set({
          status: "failed", lastError, lockedAt: null, nextAttemptAt: new Date(Date.now() + delay),
        }).where(eq(registrationNotificationsTable.id, job.id));
        logger.warn("A registration email notification failed; it remains queued for retry");
      }
      // Resend's sending rate limit also applies to retries.
      await new Promise((resolve) => setTimeout(resolve, 650));
    }
  } catch {
    logger.error("Unable to process the registration notification queue");
  } finally {
    running = false;
  }
}

export function startRegistrationNotificationWorker() {
  void processRegistrationNotifications();
  const timer = setInterval(() => void processRegistrationNotifications(), 30_000);
  timer.unref();
  return timer;
}
