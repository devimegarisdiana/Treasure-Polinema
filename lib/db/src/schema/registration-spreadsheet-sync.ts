import { randomUUID } from "node:crypto";
import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { teamRegistrationsTable } from "./team-registrations";

export const registrationSpreadsheetSyncTable = pgTable("registration_spreadsheet_sync", {
  id: uuid("id").primaryKey().$defaultFn(() => randomUUID()),
  registrationId: uuid("registration_id").notNull().unique()
    .references(() => teamRegistrationsTable.id, { onDelete: "cascade" }),
  status: text("status").$type<"pending" | "processing" | "sent" | "failed">().notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  revision: integer("revision").notNull().default(1),
  syncedRevision: integer("synced_revision").notNull().default(0),
  claimToken: uuid("claim_token"),
  includeDocuments: boolean("include_documents").notNull().default(false),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
