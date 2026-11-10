import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, registrationSpreadsheetSyncTable as sync, teamRegistrationsTable as registrations, teamRegistrationMembersTable as members } from "@workspace/db";
import { logger } from "./logger";
import { spreadsheetRequest, syncPrivateDriveDocuments } from "./registrationDriveSync";

let running = false;

export async function processRegistrationSpreadsheetSync(): Promise<void> {
  if (process.env.GOOGLE_SHEETS_SYNC_ENABLED !== "true" || !process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim() ||
      !process.env.GOOGLE_SHEETS_SYNC_TOKEN || running) return;
  running = true;
  try {
    for (let count = 0; count < 5; count++) {
      const token = randomUUID();
      const result = await db.execute(sql`
        WITH candidate AS (
          SELECT id FROM registration_spreadsheet_sync
          WHERE (status IN ('pending', 'failed') AND next_attempt_at <= now())
             OR (status = 'processing' AND locked_at < now() - interval '5 minutes')
          ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE registration_spreadsheet_sync AS s
        SET status = 'processing', locked_at = now(), claim_token = ${token}::uuid, attempts = attempts + 1
        FROM candidate WHERE s.id = candidate.id
        RETURNING s.id, s.registration_id, s.attempts, s.revision, s.include_documents
      `);
      const job = result.rows[0] as { id: string; registration_id: string; attempts: number; revision: number; include_documents: boolean } | undefined;
      if (!job) break;
      const claim = and(eq(sync.id, job.id), eq(sync.claimToken, token));
      try {
        const [registration] = await db.select().from(registrations).where(eq(registrations.id, job.registration_id)).limit(1);
        if (!registration) throw new Error("Registration not found.");
        const people = await db.select({ name: members.fullName, position: members.position }).from(members)
          .where(eq(members.registrationId, registration.id)).orderBy(members.position);
        const documentsSynced = process.env.GOOGLE_DRIVE_SYNC_ENABLED === "true" && job.include_documents;
        const documents = documentsSynced ? await syncPrivateDriveDocuments(registration.id, registration.referenceCode) : [];
        const legacyStudentIds = documents.filter((file) => file.purpose === "student_id" && file.memberPosition === null);
        const studentIds = people.map((person) => {
          const doc = documents.find((file) => file.purpose === "student_id" && file.memberPosition === person.position)
            ?? (person.position === people[0]?.position
              ? documents.find((file) => file.purpose === "student_id" && file.uploadId === registration.studentIdUploadId)
                ?? (legacyStudentIds.length === 1 ? legacyStudentIds[0] : undefined) : undefined);
          return { name: person.name, url: doc?.url ?? null };
        });
        await spreadsheetRequest({ protocolVersion: 2, registration: {
          referenceCode: registration.referenceCode, revision: job.revision,
          teamName: registration.teamName, competition: registration.competition, institution: registration.institution,
          submittedAt: registration.createdAt.toISOString(), memberNames: people.map((person) => person.name),
          contactEmail: registration.contactEmail, contactPhone: registration.contactPhone, alternativePhone: registration.alternativePhone,
          documentsSynced, studentIds, paymentProofUrl: documents.find((file) => file.purpose === "payment_proof")?.url ?? null,
        } });
        await db.update(sync).set({
          status: sql`CASE WHEN ${sync.revision} = ${job.revision} THEN 'sent' ELSE 'pending' END`,
          syncedRevision: sql`GREATEST(${sync.syncedRevision}, ${job.revision})`,
          syncedAt: new Date(), lockedAt: null, claimToken: null, lastError: null, nextAttemptAt: new Date(),
        }).where(claim);
      } catch {
        const delay = Math.min(15 * 60_000, 60_000 * 2 ** Math.min(job.attempts - 1, 4));
        await db.update(sync).set({
          status: sql`CASE WHEN ${sync.revision} = ${job.revision} THEN 'failed' ELSE 'pending' END`,
          lastError: "Google Sheets / private Drive update failed. Check the Apps Script deployment and permissions; automatic retry is scheduled.",
          lockedAt: null, claimToken: null,
          nextAttemptAt: sql`CASE WHEN ${sync.revision} = ${job.revision} THEN ${new Date(Date.now() + delay)}::timestamptz ELSE now() END`,
        }).where(claim);
        logger.warn("A private registration spreadsheet update failed and remains queued");
      }
    }
  } catch {
    logger.error("Unable to process the registration spreadsheet queue");
  } finally { running = false; }
}

export function startRegistrationSpreadsheetSyncWorker() {
  void processRegistrationSpreadsheetSync();
  const timer = setInterval(() => void processRegistrationSpreadsheetSync(), 30_000);
  timer.unref();
  return timer;
}
