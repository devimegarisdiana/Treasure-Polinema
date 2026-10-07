import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, teamRegistrationsTable, teamRegistrationMembersTable, registrationUploadsTable } from "@workspace/db";
import { CreateTeamRegistrationBody, CreateTeamRegistrationResponse } from "@workspace/api-zod";
import { freezeDocument, RegistrationDocumentError, type FrozenDocument } from "../lib/registrationDocuments";

const router: IRouter = Router();

router.post("/registrations/teams", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Please sign in before submitting your registration." });
    return;
  }
  const ownerId = req.user.id;
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
    const [prior] = await db.select().from(teamRegistrationsTable)
      .where(eq(teamRegistrationsTable.submissionKey, data.submissionKey)).limit(1);
    if (prior) {
      if (prior.ownerId !== ownerId) {
        res.status(400).json({ error: "The submission key is invalid. Please start a new registration." });
        return;
      }
      res.status(201).json(CreateTeamRegistrationResponse.parse({ referenceCode: prior.referenceCode, submittedAt: prior.createdAt }));
      return;
    }
    const uploads = await db.select().from(registrationUploadsTable).where(and(
      inArray(registrationUploadsTable.id, [data.studentIdUploadId, data.paymentUploadId]),
      eq(registrationUploadsTable.ownerId, ownerId),
      eq(registrationUploadsTable.submissionKey, data.submissionKey),
    ));
    const studentId = uploads.find((u) => u.id === data.studentIdUploadId && u.purpose === "student_id" && !u.registrationId);
    const payment = uploads.find((u) => u.id === data.paymentUploadId && u.purpose === "payment_proof" && !u.registrationId);
    if (!studentId || !payment) {
      res.status(400).json({ error: "Please upload the team leader's student ID and payment proof for this registration." });
      return;
    }
    frozen.push(await freezeDocument(studentId));
    frozen.push(await freezeDocument(payment));
    const receipt = await db.transaction(async (tx) => {
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
        if (!existing || existing.ownerId !== ownerId) throw new Error("Registration retry could not be resolved");
        return { referenceCode: existing.referenceCode, submittedAt: existing.createdAt, created: false };
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
      return { referenceCode: created.referenceCode, submittedAt: created.createdAt, created: true };
    });
    committed = receipt.created;
    res.status(201).json(CreateTeamRegistrationResponse.parse(receipt));
  } catch (error) {
    if (error instanceof RegistrationDocumentError) {
      res.status(400).json({ error: error.message });
      return;
    }
    // Never log participant names, email addresses, phone numbers, or request bodies.
    req.log.error("Unable to persist team registration");
    res.status(500).json({ error: "Your registration has not been saved. Please try again; your entries are still available." });
  } finally {
    await Promise.all(frozen.map((doc) =>
      (committed ? doc.source : doc.file).delete({ ignoreNotFound: true }).catch(() => {}),
    ));
  }
});

export default router;
