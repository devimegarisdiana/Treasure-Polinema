import { eq, sql } from "drizzle-orm";
import { db, teamRegistrationsTable, registrationSpreadsheetSyncTable } from "@workspace/db";

// Enqueue metadata only from this runtime's database. No backup, file, account,
// or remote database is read. Existing jobs (including failed/sent) stay intact.
export async function queueExistingRegistrationSpreadsheets() {
  return db.transaction(async (tx) => {
    const registrations = await tx.select({
      id: teamRegistrationsTable.id, syncId: registrationSpreadsheetSyncTable.id,
    })
      .from(teamRegistrationsTable)
      .leftJoin(registrationSpreadsheetSyncTable,
        eq(registrationSpreadsheetSyncTable.registrationId, teamRegistrationsTable.id));
    const missing = registrations.filter(({ syncId }) => syncId === null);
    let queuedCount = 0;
    for (let offset = 0; offset < missing.length; offset += 500) {
      const inserted = await tx.insert(registrationSpreadsheetSyncTable)
        .values(missing.slice(offset, offset + 500).map(({ id }) => ({ registrationId: id })))
        .onConflictDoNothing({ target: registrationSpreadsheetSyncTable.registrationId })
        .returning({ id: registrationSpreadsheetSyncTable.id });
      queuedCount += inserted.length;
    }
    return { queuedCount, alreadyQueuedCount: registrations.length - queuedCount };
  });
}

// Explicit organizer action only. Revisions refresh the same reference row;
// email notifications and original private files remain untouched.
export async function refreshExistingRegistrationDocuments() {
  return db.transaction(async (tx) => {
    const registrations = await tx.select({ id: teamRegistrationsTable.id }).from(teamRegistrationsTable);
    for (const registration of registrations) {
      await tx.insert(registrationSpreadsheetSyncTable).values({ registrationId: registration.id, includeDocuments: true })
        .onConflictDoUpdate({ target: registrationSpreadsheetSyncTable.registrationId, set: {
          revision: sql`${registrationSpreadsheetSyncTable.revision} + 1`,
          status: sql`CASE WHEN ${registrationSpreadsheetSyncTable.status} = 'processing' THEN 'processing' ELSE 'pending' END`,
          includeDocuments: true, nextAttemptAt: new Date(), attempts: 0, lastError: null,
        } });
    }
    return { queuedCount: registrations.length, alreadyQueuedCount: 0 };
  });
}
