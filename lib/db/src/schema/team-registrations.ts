import { integer, pgTable, serial, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type { z } from "zod/v4";

export const teamRegistrationsTable = pgTable("team_registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionKey: uuid("submission_key").notNull().unique(),
  referenceCode: varchar("reference_code", { length: 24 }).notNull().unique(),
  teamName: varchar("team_name", { length: 120 }).notNull(),
  contactEmail: varchar("contact_email", { length: 254 }).notNull(),
  contactPhone: varchar("contact_phone", { length: 40 }).notNull(),
  consentedAt: timestamp("consented_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teamRegistrationMembersTable = pgTable("team_registration_members", {
  id: serial("id").primaryKey(),
  registrationId: uuid("registration_id").notNull().references(() => teamRegistrationsTable.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  fullName: varchar("full_name", { length: 160 }).notNull(),
  institution: varchar("institution", { length: 200 }).notNull(),
  studyProgram: varchar("study_program", { length: 160 }).notNull(),
  educationLevel: text("education_level").$type<"diploma" | "undergraduate">().notNull(),
  feeCategory: text("fee_category").$type<"indonesian" | "international">().notNull(),
});

export const insertTeamRegistrationSchema = createInsertSchema(teamRegistrationsTable).omit({ id: true, consentedAt: true, createdAt: true });
export const insertTeamRegistrationMemberSchema = createInsertSchema(teamRegistrationMembersTable).omit({ id: true });
export type InsertTeamRegistration = z.infer<typeof insertTeamRegistrationSchema>;
export type TeamRegistration = typeof teamRegistrationsTable.$inferSelect;
export type TeamRegistrationMember = typeof teamRegistrationMembersTable.$inferSelect;
