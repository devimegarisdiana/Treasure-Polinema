import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, teamRegistrationsTable, teamRegistrationMembersTable } from "@workspace/db";
import { CreateTeamRegistrationBody, CreateTeamRegistrationResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/registrations/teams", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  // Trim only strings; retain invalid input types so contract validation rejects them.
  const body = req.body;
  const trim = (value: unknown): unknown => typeof value === "string" ? value.trim() : value;
  const normalized = body && typeof body === "object" && !Array.isArray(body) ? {
    ...body,
    teamName: trim(body.teamName),
    contactEmail: trim(body.contactEmail),
    contactPhone: trim(body.contactPhone),
    members: Array.isArray(body.members) ? body.members.map((member: unknown) => {
      if (!member || typeof member !== "object" || Array.isArray(member)) return member;
      const value = member as Record<string, unknown>;
      return { ...value, fullName: trim(value.fullName), institution: trim(value.institution), studyProgram: trim(value.studyProgram) };
    }) : body.members,
  } : body;
  const parsed = CreateTeamRegistrationBody.safeParse(normalized);
  if (!parsed.success || parsed.data.website?.trim()) {
    res.status(400).json({ error: "Data pendaftaran belum lengkap atau tidak valid. Periksa kembali isian formulir." });
    return;
  }

  try {
    const data = parsed.data;
    const receipt = await db.transaction(async (tx) => {
      const [created] = await tx.insert(teamRegistrationsTable).values({
        submissionKey: data.submissionKey,
        referenceCode: `TR26-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
        teamName: data.teamName,
        contactEmail: data.contactEmail.toLowerCase(),
        contactPhone: data.contactPhone,
      }).onConflictDoNothing({ target: teamRegistrationsTable.submissionKey }).returning();
      if (!created) {
        const [existing] = await tx.select().from(teamRegistrationsTable)
          .where(eq(teamRegistrationsTable.submissionKey, data.submissionKey)).limit(1);
        if (!existing) throw new Error("Registration retry could not be resolved");
        return { referenceCode: existing.referenceCode, submittedAt: existing.createdAt };
      }
      await tx.insert(teamRegistrationMembersTable).values(data.members.map((member, position) => ({
        ...member,
        registrationId: created.id,
        position,
      })));
      return { referenceCode: created.referenceCode, submittedAt: created.createdAt };
    });
    res.status(201).json(CreateTeamRegistrationResponse.parse(receipt));
  } catch {
    // Never log participant names, email addresses, phone numbers, or request bodies.
    req.log.error("Unable to persist team registration");
    res.status(500).json({ error: "Pendaftaran belum tersimpan. Silakan coba lagi; isian Anda tetap tersedia." });
  }
});

export default router;
