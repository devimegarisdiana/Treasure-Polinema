import { randomUUID } from "node:crypto";
import { index, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

// Separate from Replit users: a participant email can never grant organizer access.
export const participantAccountsTable = pgTable("participant_accounts", {
  id: uuid("id").primaryKey().$defaultFn(() => randomUUID()),
  username: text("username").notNull().unique(),
  email: varchar("email", { length: 254 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const participantSessionsTable = pgTable("participant_sessions", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  accountId: uuid("account_id").notNull().references(() => participantAccountsTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [index("participant_session_expiry").on(table.expiresAt)]);

export const participantAuthLimitsTable = pgTable("participant_auth_limits", {
  key: varchar("key", { length: 64 }).primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  count: integer("count").notNull().default(1),
});
