import { randomUUID } from "node:crypto";
import { index, pgTable, timestamp, uuid, varchar, text } from "drizzle-orm/pg-core";

// Provisioned only from server secrets. No public organizer signup.
export const organizerAccountsTable = pgTable("organizer_accounts", {
  id: uuid("id").primaryKey().$defaultFn(() => randomUUID()),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizerSessionsTable = pgTable("organizer_sessions", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  accountId: uuid("account_id").notNull().references(() => organizerAccountsTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [index("organizer_session_expiry").on(table.expiresAt)]);
