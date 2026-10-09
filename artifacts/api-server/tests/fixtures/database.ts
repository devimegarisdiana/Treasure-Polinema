import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import {
  teamRegistrationsTable, teamRegistrationMembersTable,
  registrationUploadsTable, registrationNotificationsTable,
} from "@workspace/db/schema";

// Never import the production DB entry point: it constructs a network Pool.
export { teamRegistrationsTable, teamRegistrationMembersTable, registrationUploadsTable, registrationNotificationsTable };
export {
  participantAccountsTable, participantSessionsTable, participantAuthLimitsTable,
} from "@workspace/db/schema";
export const postgres = new PGlite();
const schema = { teamRegistrationsTable, teamRegistrationMembersTable, registrationUploadsTable, registrationNotificationsTable };
export const statements: string[] = [];
export const db = drizzle(postgres, {
  schema,
  logger: { logQuery(query) { statements.push(query); } },
});

export async function initializeDatabase() {
  // Generate DDL from the real Drizzle tables instead of maintaining a test copy.
  const empty = generateDrizzleJson({});
  const current = generateDrizzleJson(schema);
  for (const sql of await generateMigration(empty, current)) {
    await postgres.exec(sql);
  }
}
