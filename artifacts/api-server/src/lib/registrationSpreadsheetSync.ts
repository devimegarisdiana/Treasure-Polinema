import { eq, sql } from "drizzle-orm";
import {
  db,
  registrationSpreadsheetSyncTable,
  teamRegistrationsTable,
  teamRegistrationMembersTable,
} from "@workspace/db";
import { logger } from "./logger";

type SheetRegistration = {
  referenceCode: string;
  teamName: string;
  competition: string | null;
  institution: string | null;
  submittedAt: string;
  memberNames: string[];
  contactEmail: string;
  contactPhone: string;
  alternativePhone: string | null;
};

let running = false;

async function sendToSpreadsheet(data: SheetRegistration): Promise<void> {
  const endpoint = process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim();
  const token = process.env.GOOGLE_SHEETS_SYNC_TOKEN;
  if (!endpoint || !token) throw new Error("Spreadsheet sync is not configured.");

  const parsedUrl = new URL(endpoint);
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "script.google.com") {
    throw new Error("Spreadsheet sync endpoint is not an approved HTTPS Apps Script URL.");
  }

  const response = await fetch(parsedUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, registration: data }),
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => null) as { ok?: boolean } | null;
  if (!response.ok || result?.ok !== true) throw new Error("Spreadsheet rejected the registration update.");
}

export async function processRegistrationSpreadsheetSync(): Promise<void> {
  if (process.env.GOOGLE_SHEETS_SYNC_ENABLED !== "true" ||
      !process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim() ||
      !process.env.GOOGLE_SHEETS_SYNC_TOKEN) return;
  if (running) return;
  running = true;
  try {
    for (let count = 0; count < 5; count++) {
      const result = await db.execute(sql`
        WITH candidate AS (
          SELECT id FROM registration_spreadsheet_sync
          WHERE (status IN ('pending', 'failed') AND next_attempt_at <= now())
             OR (status = 'processing' AND locked_at < now() - interval '5 minutes')
          ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE registration_spreadsheet_sync AS s
        SET status = 'processing', locked_at = now(), attempts = attempts + 1
        FROM candidate WHERE s.id = candidate.id
        RETURNING s.id, s.registration_id, s.attempts
      `);
      const job = result.rows[0] as { id: string; registration_id: string; attempts: number } | undefined;
      if (!job) break;
      try {
        const [registration] = await db.select().from(teamRegistrationsTable)
          .where(eq(teamRegistrationsTable.id, job.registration_id)).limit(1);
        if (!registration) throw new Error("The registration could not be found.");
        const members = await db.select({ name: teamRegistrationMembersTable.fullName })
          .from(teamRegistrationMembersTable)
          .where(eq(teamRegistrationMembersTable.registrationId, registration.id))
          .orderBy(teamRegistrationMembersTable.position);

        await sendToSpreadsheet({
          referenceCode: registration.referenceCode,
          teamName: registration.teamName,
          competition: registration.competition,
          institution: registration.institution,
          submittedAt: registration.createdAt.toISOString(),
          memberNames: members.map((member) => member.name),
          // The current registration form stores a shared team contact,
          // not a separate email or phone for every member.
          contactEmail: registration.contactEmail,
          contactPhone: registration.contactPhone,
          alternativePhone: registration.alternativePhone,
        });
        await db.update(registrationSpreadsheetSyncTable).set({
          status: "sent", syncedAt: new Date(), lockedAt: null, lastError: null,
        }).where(eq(registrationSpreadsheetSyncTable.id, job.id));
      } catch {
        const delay = Math.min(15 * 60_000, 60_000 * 2 ** Math.min(job.attempts - 1, 4));
        await db.update(registrationSpreadsheetSyncTable).set({
          status: "failed",
          lastError: "Spreadsheet update failed. Check the Apps Script endpoint, token, and sheet access; automatic retry is scheduled.",
          lockedAt: null,
          nextAttemptAt: new Date(Date.now() + delay),
        }).where(eq(registrationSpreadsheetSyncTable.id, job.id));
        logger.warn("A registration spreadsheet update failed; it remains queued for retry");
      }
    }
  } catch {
    logger.error("Unable to process the registration spreadsheet queue");
  } finally {
    running = false;
  }
}

export function startRegistrationSpreadsheetSyncWorker() {
  void processRegistrationSpreadsheetSync();
  const timer = setInterval(() => void processRegistrationSpreadsheetSync(), 30_000);
  timer.unref();
  return timer;
}
