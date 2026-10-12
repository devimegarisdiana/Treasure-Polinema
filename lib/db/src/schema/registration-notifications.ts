import { randomUUID } from "node:crypto";
import { integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { teamRegistrationsTable } from "./team-registrations";

// A transactional outbox: no email is queued for a rolled-back registration.
export const registrationNotificationsTable = pgTable("registration_notifications", {
  id: uuid("id").primaryKey().$defaultFn(() => randomUUID()),
  registrationId: uuid("registration_id").notNull().unique()
    .references(() => teamRegistrationsTable.id, { onDelete: "cascade" }),
  status: text("status").$type<"pending" | "processing" | "sent" | "failed">().notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  providerId: varchar("provider_id", { length: 100 }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
