import { randomUUID } from "node:crypto";
import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { teamRegistrationsTable } from "./team-registrations";

export const registrationSpreadsheetSyncTable = pgTable("registration_spreadsheet_sync", {
  id: uuid("id").primaryKey().$defaultFn(() => randomUUID()),
  registrationId: uuid("registration_id").notNull().unique()
    .references(() => teamRegistrationsTable.id, { onDelete: "cascade" }),
  status: text("status").$type<"pending" | "processing" | "sent" | "failed">().notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
