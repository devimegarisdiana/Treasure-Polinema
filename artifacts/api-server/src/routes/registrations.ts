import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, teamRegistrationsTable, teamRegistrationMembersTable, registrationUploadsTable, registrationNotificationsTable, registrationSpreadsheetSyncTable } from "@workspace/db";
import { CreateTeamRegistrationBody, CreateTeamRegistrationResponse } from "@workspace/api-zod";
import { freezeDocument, RegistrationDocumentError, type FrozenDocument } from "../lib/registrationDocuments";
import { processRegistrationNotifications } from "../lib/registrationNotifications";
import { processRegistrationSpreadsheetSync } from "../lib/registrationSpreadsheetSync";
import { registrationOwner, sameSiteRequest } from "../lib/participantAuth";
import { advisoryLockKey } from "../lib/advisoryLock";

const router: IRouter = Router();

router.post("/registrations/teams", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  if (!sameSiteRequest(req)) { res.status(403).json({ error: "Please use the TREASURE registration page." }); return; }
  const ownerId = registrationOwner(req);
  if (!ownerId) {
    res.status(401).json({ error: "Please sign in before submitting your registration." });
    return;
  }
  // Trim only strings; retain invalid input types so contract validation rejects them.
  const body = req.body;
  const trim = (value: unknown): unknown => typeof value === "string" ? value.trim() : value;
  const normalized = body && typeof body === "object" && !Array.isArray(body) ? {
    ...body,
    teamName: trim(body.teamName),
    contactEmail: trim(body.contactEmail),
    contactPhone: trim(body.contactPhone),
    alternativePhone: trim(body.alternativePhone),
    institution: trim(body.institution),
    facultyDepartment: trim(body.facultyDepartment),
    otherCountry: trim(body.otherCountry),
    members: Array.isArray(body.members) ? body.members.map((member: unknown) => {
      if (!member || typeof member !== "object" || Array.isArray(member)) return member;
      const value = member as Record<string, unknown>;
      return { fullName: trim(value.fullName) };
    }) : body.members,
  } : body;
  const parsed = CreateTeamRegistrationBody.safeParse(normalized);
  if (!parsed.success || parsed.data.website?.trim()) {
    res.status(400).json({ error: "Registration details are incomplete or invalid. Please check the form." });
    return;
  }

  const data = parsed.data;
  if (data.countryOfOrigin === "Other" && !data.otherCountry?.trim()) {
    res.status(400).json({ error: "Please enter your other country selection." });
    return;
  }
  const frozen: FrozenDocument[] = [];
  let committed = false;
  try {
    // Serializing a submission *before* inspecting its uploads prevents a retry
    // from racing the first request's object copies and returning a false 500.
    // The transaction lock is shared by API replicas and released at commit.
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${advisoryLockKey(data.submissionKey)}::bigint)`);
      const [prior] = await tx.select().from(teamRegistrationsTable)
        .where(eq(teamRegistrationsTable.submissionKey, data.submissionKey)).limit(1);
      if (prior) {
        if (prior.ownerId !== ownerId) {
          return { status: 400 as const, error: "The submission key is invalid. Please start a new registration." };
        }
        return { status: 201 as const, receipt: { referenceCode: prior.referenceCode, submittedAt: prior.createdAt }, created: false };
      }
      const uploads = await tx.select().from(registrationUploadsTable).where(and(
        inArray(registrationUploadsTable.id, [data.studentIdUploadId, data.paymentUploadId]),
        eq(registrationUploadsTable.ownerId, ownerId),
        eq(registrationUploadsTable.submissionKey, data.submissionKey),
      ));
      const studentId = uploads.find((u) => u.id === data.studentIdUploadId && u.purpose === "student_id" && !u.registrationId);
      const payment = uploads.find((u) => u.id === data.paymentUploadId && u.purpose === "payment_proof" && !u.registrationId);
      if (!studentId || !payment) {
        return { status: 400 as const, error: "Please upload the team leader's student ID and payment proof for this registration." };
      }
      frozen.push(await freezeDocument(studentId));
      frozen.push(await freezeDocument(payment));
      const [created] = await tx.insert(teamRegistrationsTable).values({
        submissionKey: data.submissionKey,
        referenceCode: `TR26-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
        teamName: data.teamName ?? data.members[0].fullName.slice(0, 120),
        contactEmail: data.contactEmail.toLowerCase(),
        contactPhone: data.contactPhone,
        ownerId,
        alternativePhone: data.alternativePhone,
        institution: data.institution,
        facultyDepartment: data.facultyDepartment,
        countryOfOrigin: data.countryOfOrigin === "Other" ? data.otherCountry : data.countryOfOrigin,
        competition: data.competition,
        hasEdugateTraining: data.hasEdugateTraining,
        studentIdUploadId: data.studentIdUploadId,
        paymentUploadId: data.paymentUploadId,
      }).onConflictDoNothing({ target: teamRegistrationsTable.submissionKey }).returning();
      if (!created) {
        const [existing] = await tx.select().from(teamRegistrationsTable)
          .where(eq(teamRegistrationsTable.submissionKey, data.submissionKey)).limit(1);
        if (!existing) throw new Error("Registration retry could not be resolved");
        if (existing.ownerId !== ownerId) {
          return { status: 400 as const, error: "The submission key is invalid. Please start a new registration." };
        }
        return { status: 201 as const, receipt: { referenceCode: existing.referenceCode, submittedAt: existing.createdAt }, created: false };
      }
      await tx.insert(teamRegistrationMembersTable).values(data.members.map((member, position) => ({
        ...member,
        institution: data.institution,
        registrationId: created.id,
        position,
      })));
      for (const [index, upload] of [studentId, payment].entries()) {
        await tx.update(registrationUploadsTable).set({
          objectPath: frozen[index].objectPath,
          registrationId: created.id,
        }).where(eq(registrationUploadsTable.id, upload.id));
      }
      await tx.insert(registrationNotificationsTable).values({ registrationId: created.id });
      await tx.insert(registrationSpreadsheetSyncTable).values({ registrationId: created.id });
      return { status: 201 as const, receipt: { referenceCode: created.referenceCode, submittedAt: created.createdAt }, created: true };
    });
    if (result.status === 400) {
      res.status(400).json({ error: result.error });
      return;
    }
    committed = result.created;
    res.status(201).json(CreateTeamRegistrationResponse.parse(result.receipt));
    if (result.created) {
      void processRegistrationNotifications();
      void processRegistrationSpreadsheetSync();
    }
  } catch (error) {
    if (error instanceof RegistrationDocumentError) {
      res.status(400).json({ error: error.message });
      return;
    }
    // Never log participant names, email addresses, phone numbers, or request bodies.
    req.log.error("Unable to persist team registration");
    res.status(500).json({ error: "We could not confirm your registration. Please retry using the same form; your entries are still available." });
  } finally {
    if (frozen.length) {
      // If commit succeeded but its acknowledgement was lost, never delete the
      // documents now referenced by the saved registration.
      let saved: boolean | null = committed;
      if (!saved) {
        try {
          const [record] = await db.select({ ownerId: teamRegistrationsTable.ownerId })
            .from(teamRegistrationsTable).where(eq(teamRegistrationsTable.submissionKey, data.submissionKey)).limit(1);
          saved = record?.ownerId === ownerId;
        } catch { saved = null; }
      }
      if (saved !== null) {
        await Promise.all(frozen.map((doc) =>
          (saved ? doc.source : doc.file).delete({ ignoreNotFound: true }).catch(() => {}),
        ));
      }
    }
  }
});

export default router;
