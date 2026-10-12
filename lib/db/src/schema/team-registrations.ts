import { randomUUID } from "node:crypto";
import { boolean, integer, pgTable, serial, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type { z } from "zod/v4";

export const teamRegistrationsTable = pgTable("team_registrations", {
  id: uuid("id").primaryKey().$defaultFn(() => randomUUID()),
  submissionKey: uuid("submission_key").notNull().unique(),
  referenceCode: varchar("reference_code", { length: 24 }).notNull().unique(),
  teamName: varchar("team_name", { length: 120 }).notNull(),
  contactEmail: varchar("contact_email", { length: 254 }).notNull(),
  contactPhone: varchar("contact_phone", { length: 40 }).notNull(),
  ownerId: varchar("owner_id"),
  alternativePhone: varchar("alternative_phone", { length: 40 }),
  institution: varchar("institution", { length: 200 }),
  facultyDepartment: varchar("faculty_department", { length: 200 }),
  countryOfOrigin: varchar("country_of_origin", { length: 100 }),
  competition: varchar("competition", { length: 160 }),
  hasEdugateTraining: boolean("has_edugate_training"),
  studentIdUploadId: uuid("student_id_upload_id"),
  paymentUploadId: uuid("payment_upload_id"),
  consentedAt: timestamp("consented_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teamRegistrationMembersTable = pgTable("team_registration_members", {
  id: serial("id").primaryKey(),
  registrationId: uuid("registration_id").notNull().references(() => teamRegistrationsTable.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  fullName: varchar("full_name", { length: 160 }).notNull(),
  institution: varchar("institution", { length: 200 }),
  studyProgram: varchar("study_program", { length: 160 }),
  educationLevel: text("education_level").$type<"diploma" | "undergraduate">(),
  feeCategory: text("fee_category").$type<"indonesian" | "international">(),
});

export const registrationUploadsTable = pgTable("registration_uploads", {
  id: uuid("id").primaryKey().$defaultFn(() => randomUUID()),
  ownerId: varchar("owner_id").notNull(),
  submissionKey: uuid("submission_key").notNull(),
  purpose: text("purpose").$type<"student_id" | "payment_proof">().notNull(),
  objectPath: text("object_path").notNull().unique(),
  fileName: varchar("file_name", { length: 200 }).notNull(),
  contentType: varchar("content_type", { length: 40 }).notNull(),
  fileSize: integer("file_size").notNull(),
  registrationId: uuid("registration_id").references(() => teamRegistrationsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertTeamRegistrationSchema = createInsertSchema(teamRegistrationsTable).omit({ id: true, consentedAt: true, createdAt: true });
export const insertTeamRegistrationMemberSchema = createInsertSchema(teamRegistrationMembersTable).omit({ id: true });
export type InsertTeamRegistration = z.infer<typeof insertTeamRegistrationSchema>;
export type TeamRegistration = typeof teamRegistrationsTable.$inferSelect;
export type TeamRegistrationMember = typeof teamRegistrationMembersTable.$inferSelect;
