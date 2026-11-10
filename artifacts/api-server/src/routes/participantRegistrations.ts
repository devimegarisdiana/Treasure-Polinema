import { Router, type IRouter } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, teamRegistrationsTable as registrations, teamRegistrationMembersTable as members, registrationUploadsTable as uploads, registrationSpreadsheetSyncTable as sync } from "@workspace/db";
import { CompleteParticipantRegistrationBody, CompleteParticipantRegistrationParams, CompleteParticipantRegistrationResponse, ListParticipantRegistrationsResponse } from "@workspace/api-zod";
import { registrationOwner, sameSiteRequest } from "../lib/participantAuth";
import { advisoryLockKey } from "../lib/advisoryLock";
import { freezeDocument, RegistrationDocumentError, type FrozenDocument } from "../lib/registrationDocuments";
import { processRegistrationSpreadsheetSync } from "../lib/registrationSpreadsheetSync";

const router: IRouter = Router();
type SavedRegistration = typeof registrations.$inferSelect;
type SavedUpload = typeof uploads.$inferSelect;

function studentIdFor(position: number, firstPosition: number, files: SavedUpload[], registration: SavedRegistration) {
  const linked = files.find((file) => file.purpose === "student_id" && file.memberPosition === position);
  if (linked || position !== firstPosition) return linked;
  const legacy = files.filter((file) => file.purpose === "student_id" && file.memberPosition === null);
  return legacy.find((file) => file.id === registration.studentIdUploadId) ?? (legacy.length === 1 ? legacy[0] : undefined);
}

async function detail(registration: SavedRegistration) {
  const [people, files, [job]] = await Promise.all([
    db.select().from(members).where(eq(members.registrationId, registration.id)).orderBy(members.position),
    db.select().from(uploads).where(eq(uploads.registrationId, registration.id)),
    db.select().from(sync).where(eq(sync.registrationId, registration.id)).limit(1),
  ]);
  const payment = files.find((file) => file.purpose === "payment_proof");
  return {
    id: registration.id, referenceCode: registration.referenceCode,
    teamName: registration.teamName, revision: registration.detailsRevision,
    members: people.map((person) => {
      const file = studentIdFor(person.position, people[0]?.position, files, registration);
      return { position: person.position, fullName: person.fullName,
        studentIdFileName: file?.fileName ?? null, studentIdUrl: file ? `/api/storage${file.objectPath}` : null };
    }),
    paymentProofUrl: payment ? `/api/storage${payment.objectPath}` : null,
    spreadsheetStatus: job?.status ?? "not_requested",
  };
}

router.use("/participant-registrations", (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (!sameSiteRequest(req)) { res.status(403).json({ error: "Use the TREASURE participant page." }); return; }
  if (!registrationOwner(req)) { res.status(401).json({ error: "Please sign in." }); return; }
  next();
});

router.get("/participant-registrations", async (req, res) => {
  try {
    const own = await db.select().from(registrations).where(eq(registrations.ownerId, registrationOwner(req)!));
    res.json(ListParticipantRegistrationsResponse.parse({ items: await Promise.all(own.map(detail)) }));
  } catch {
    req.log.error("Unable to load participant registrations");
    res.status(500).json({ error: "Your registrations could not be loaded. Please retry." });
  }
});

router.post("/participant-registrations/:id/complete", async (req, res) => {
  const params = CompleteParticipantRegistrationParams.safeParse(req.params);
  const parsed = CompleteParticipantRegistrationBody.safeParse({
    ...req.body, teamName: typeof req.body?.teamName === "string" ? req.body.teamName.trim() : req.body?.teamName,
  });
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Enter a team name and check the student ID uploads." }); return; }
  const ownerId = registrationOwner(req)!;
  const id = params.data.id;
  const data = parsed.data;
  const frozen: FrozenDocument[] = [];
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${advisoryLockKey(`complete:${id}`)}::bigint)`);
      const [registration] = await tx.select().from(registrations).where(and(eq(registrations.id, id), eq(registrations.ownerId, ownerId))).limit(1);
      if (!registration) return { status: 404, error: "Registration not found." };
      const people = await tx.select().from(members).where(eq(members.registrationId, id)).orderBy(members.position);
      const files = await tx.select().from(uploads).where(eq(uploads.registrationId, id));
      const ids = data.members.map((person) => person.studentIdUploadId);
      if (new Set(ids).size !== ids.length || new Set(data.members.map((person) => person.position)).size !== data.members.length ||
          data.members.some((person) => !people.some((saved) => saved.position === person.position))) {
        return { status: 400, error: "Upload a separate student ID for each existing team member." };
      }
      // A lost response can be retried safely, even after the revision advanced.
      if (registration.detailsRevision === data.revision + 1 && registration.teamName === data.teamName &&
          data.members.every((person) => files.some((file) => file.id === person.studentIdUploadId &&
            file.memberPosition === person.position && file.submissionKey === data.submissionKey))) {
        return { status: 200 };
      }
      if (registration.detailsRevision !== data.revision) return { status: 409, error: "This team was updated in another session. Reload its latest details before saving." };
      if (!people.length) return { status: 409, error: "The saved member list is unavailable. Contact the organizers." };
      const missing = people.filter((person) => !studentIdFor(person.position, people[0].position, files, registration));
      if (missing.length !== data.members.length || missing.some((person) => !data.members.some((input) => input.position === person.position))) {
        return { status: 400, error: "Supply a student ID for each missing member. Existing documents cannot be replaced here." };
      }
      const drafts = ids.length ? await tx.select().from(uploads).where(and(inArray(uploads.id, ids),
        eq(uploads.ownerId, ownerId), eq(uploads.submissionKey, data.submissionKey),
        eq(uploads.completionRegistrationId, id))) : [];
      for (const person of data.members) {
        const draft = drafts.find((file) => file.id === person.studentIdUploadId && file.purpose === "student_id" &&
          file.memberPosition === person.position && !file.registrationId);
        if (!draft) return { status: 400, error: "A student ID upload is invalid or belongs to a different team. Select the file again." };
      }
      for (const person of data.members) frozen.push(await freezeDocument(drafts.find((file) => file.id === person.studentIdUploadId)!));
      for (const [index, person] of data.members.entries()) {
        await tx.update(uploads).set({ objectPath: frozen[index].objectPath, registrationId: id, memberPosition: person.position })
          .where(eq(uploads.id, person.studentIdUploadId));
      }
      await tx.update(registrations).set({ teamName: data.teamName, detailsRevision: registration.detailsRevision + 1 })
        .where(eq(registrations.id, id));
      // Never touch email jobs. Only the existing spreadsheet row is refreshed.
      await tx.insert(sync).values({ registrationId: id, includeDocuments: true }).onConflictDoUpdate({
        target: sync.registrationId,
        set: { revision: sql`${sync.revision} + 1`,
          status: sql`CASE WHEN ${sync.status} = 'processing' THEN 'processing' ELSE 'pending' END`,
          includeDocuments: true, attempts: 0, lastError: null, nextAttemptAt: new Date() },
      });
      return { status: 200 };
    });
    if (result.status !== 200) { res.status(result.status).json({ error: result.error }); return; }
    const [saved] = await db.select().from(registrations).where(and(eq(registrations.id, id), eq(registrations.ownerId, ownerId)));
    res.json(CompleteParticipantRegistrationResponse.parse(await detail(saved)));
    void processRegistrationSpreadsheetSync();
  } catch (error) {
    if (error instanceof RegistrationDocumentError) { res.status(400).json({ error: error.message }); return; }
    req.log.error("Unable to complete participant registration");
    res.status(500).json({ error: "The update could not be confirmed. Your original registration is safe. Retry with the same form." });
  } finally {
    // Resolve uncertain commits before deleting copies; originals are never
    // deleted here, so successful retries cannot lose the uploaded document.
    for (const file of frozen) {
      try {
        const [saved] = await db.select({ id: uploads.id }).from(uploads).where(eq(uploads.objectPath, file.objectPath)).limit(1);
        if (!saved) await file.file.delete({ ignoreNotFound: true });
      } catch { /* An uncertain commit must retain its file. */ }
    }
  }
});

export default router;
