import { eq } from "drizzle-orm";
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
