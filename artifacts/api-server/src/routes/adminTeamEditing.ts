import { Router, type IRouter } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, teamRegistrationsTable as registrations, teamRegistrationMembersTable as members,
  registrationUploadsTable as uploads, registrationSpreadsheetSyncTable as sync } from "@workspace/db";
import { RequestAdminMemberUploadParams, RequestAdminMemberUploadBody, RequestAdminMemberUploadResponse,
  UpdateAdminRegistrationMembersParams, UpdateAdminRegistrationMembersBody, UpdateAdminRegistrationMembersResponse } from "@workspace/api-zod";
import { registrationStorage } from "./storage";
import { advisoryLockKey } from "../lib/advisoryLock";
import { freezeDocument, RegistrationDocumentError, type FrozenDocument } from "../lib/registrationDocuments";
import { processRegistrationSpreadsheetSync } from "../lib/registrationSpreadsheetSync";
import { localStorageEnabled } from "../lib/localObjectStorage";

// Mounted only after the organizer authentication, authorization and same-site checks.
const router: IRouter = Router();
export const organizerUploadOwner = (id: string) => `organizer:${id}`;

router.post("/admin/registrations/:id/member-uploads", async (req, res) => {
  const params = RequestAdminMemberUploadParams.safeParse(req.params);
  const body = RequestAdminMemberUploadBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Select a JPG, PNG, WebP or PDF up to 10 MB for an existing member." }); return; }
  try {
    const [person] = await db.select({ id: members.id }).from(members).where(and(
      eq(members.registrationId, params.data.id), eq(members.position, body.data.memberPosition),
    )).limit(1);
    if (!person) { res.status(404).json({ error: "Team member not found. Reload the registration." }); return; }
    const signedURL = await registrationStorage.getObjectEntityUploadURL();
    // Keep organizer transport under /admin, where its session middleware runs.
    const uploadURL = localStorageEnabled()
      ? signedURL.replace("/api/storage/local-uploads/", "/api/admin/member-local-uploads/") : signedURL;
    const [upload] = await db.insert(uploads).values({
      ownerId: organizerUploadOwner(req.organizer!.id), submissionKey: body.data.submissionKey,
      purpose: "student_id", completionRegistrationId: params.data.id, memberPosition: body.data.memberPosition,
      objectPath: registrationStorage.normalizeObjectEntityPath(signedURL),
      fileName: body.data.name, contentType: body.data.contentType, fileSize: body.data.size,
    }).returning({ id: uploads.id });
    res.json(RequestAdminMemberUploadResponse.parse({ uploadId: upload.id, uploadURL }));
  } catch {
    req.log.error("Unable to prepare organizer member upload");
    res.status(503).json({ error: "The upload could not be started. Please retry." });
  }
});

router.patch("/admin/registrations/:id/members", async (req, res) => {
  const params = UpdateAdminRegistrationMembersParams.safeParse(req.params);
  const body = UpdateAdminRegistrationMembersBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Check the team name, member names and confirmation." }); return; }
  const data = body.data;
  data.teamName = data.teamName.trim();
  data.members.forEach(person => { person.fullName = person.fullName.trim(); });
  if (data.teamName.length < 2 || data.members.some(person => !person.fullName ||
    (person.action === "replacement" && !person.studentIdUploadId) ||
    (person.action === "correction" && !!person.studentIdUploadId))) {
    res.status(400).json({ error: "Each replacement needs a new student ID. Name corrections keep the existing document." }); return;
  }
  const id = params.data.id;
  const frozen: FrozenDocument[] = [];
  try {
    const result = await db.transaction(async tx => {
      // Share the participant completion lock, including the file-copy phase.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${advisoryLockKey(`complete:${id}`)}::bigint)`);
      const [registration] = await tx.select().from(registrations).where(eq(registrations.id, id)).for("update");
      if (!registration) return { status: 404, error: "Registration not found." };
      const people = await tx.select().from(members).where(eq(members.registrationId, id)).orderBy(members.position);
      const files = await tx.select().from(uploads).where(eq(uploads.registrationId, id));
      if (people.length !== data.members.length || new Set(data.members.map(person => person.position)).size !== people.length ||
        data.members.some(person => !people.some(saved => saved.position === person.position))) {
        return { status: 400, error: "Keep the existing member positions and team size. Reload the team." };
      }
      const replacements = data.members.filter(person => person.action === "replacement");
      const ids = replacements.map(person => person.studentIdUploadId!);
      if (new Set(ids).size !== ids.length) return { status: 400, error: "Upload a separate student ID for each replacement." };
      // A repeated request after a lost response must not detach the newly saved files.
      if (registration.detailsRevision === data.revision + 1 && registration.teamName === data.teamName &&
        data.members.every(person => people.some(saved => saved.position === person.position && saved.fullName === person.fullName)) &&
        replacements.every(person => files.some(file => file.id === person.studentIdUploadId &&
          file.memberPosition === person.position && file.submissionKey === data.submissionKey))) {
        return { status: 200, revision: registration.detailsRevision };
      }
      if (registration.detailsRevision !== data.revision) return { status: 409, error: "This team changed in another session. Reload its latest details before editing." };
      const drafts = ids.length ? await tx.select().from(uploads).where(and(inArray(uploads.id, ids),
        eq(uploads.ownerId, organizerUploadOwner(req.organizer!.id)), eq(uploads.completionRegistrationId, id),
        eq(uploads.submissionKey, data.submissionKey))) : [];
      for (const person of replacements) {
        const draft = drafts.find(file => file.id === person.studentIdUploadId && file.purpose === "student_id" &&
          file.memberPosition === person.position && !file.registrationId && file.objectPath.startsWith("/objects/uploads/"));
        if (!draft) return { status: 400, error: "A replacement document belongs to another team, member or editing session. Select it again." };
      }
      for (const person of replacements) frozen.push(await freezeDocument(drafts.find(file => file.id === person.studentIdUploadId)!));
      let leaderUploadId = registration.studentIdUploadId;
      for (const [index, person] of replacements.entries()) {
        const legacy = files.filter(file => file.purpose === "student_id" && file.memberPosition === null);
        const old = files.filter(file => file.purpose === "student_id" && (file.memberPosition === person.position ||
          (person.position === people[0].position && file.memberPosition === null &&
            (file.id === registration.studentIdUploadId || legacy.length === 1))));
        // Retain old bytes and metadata, but never display the old person's ID as the replacement's.
        for (const file of old) await tx.update(uploads).set({ registrationId: null, completionRegistrationId: id })
          .where(eq(uploads.id, file.id));
        await tx.update(uploads).set({ registrationId: id, ownerId: registration.ownerId ?? organizerUploadOwner(req.organizer!.id),
          objectPath: frozen[index].objectPath, memberPosition: person.position }).where(eq(uploads.id, person.studentIdUploadId!));
        if (person.position === people[0].position) leaderUploadId = person.studentIdUploadId!;
      }
      for (const person of data.members) await tx.update(members).set({
        fullName: person.fullName,
        ...(person.action === "replacement" ? { institution: null, studyProgram: null, educationLevel: null, feeCategory: null } : {}),
      }).where(and(eq(members.registrationId, id), eq(members.position, person.position)));
      await tx.update(registrations).set({ teamName: data.teamName, studentIdUploadId: leaderUploadId,
        detailsRevision: registration.detailsRevision + 1 }).where(eq(registrations.id, id));
      await tx.insert(sync).values({ registrationId: id, includeDocuments: true }).onConflictDoUpdate({
        target: sync.registrationId,
        set: { revision: sql`${sync.revision} + 1`, status: sql`CASE WHEN ${sync.status} = 'processing' THEN 'processing' ELSE 'pending' END`,
          includeDocuments: true, attempts: 0, lastError: null, nextAttemptAt: new Date() },
      });
      return { status: 200, revision: registration.detailsRevision + 1 };
    });
    if (result.status !== 200) { res.status(result.status).json({ error: result.error }); return; }
    req.log.info({ registrationId: id, organizerId: req.organizer!.id }, "Organizer updated team member details");
    res.json(UpdateAdminRegistrationMembersResponse.parse({ status: "saved", revision: result.revision }));
    void processRegistrationSpreadsheetSync();
  } catch (error) {
    if (error instanceof RegistrationDocumentError) { res.status(400).json({ error: error.message }); return; }
    req.log.error("Unable to confirm organizer team edit");
    res.status(503).json({ error: "The update could not be confirmed. Retry the same form or reload the team to check its latest details." });
  } finally {
    for (const file of frozen) {
      try {
        const [saved] = await db.select({ id: uploads.id }).from(uploads).where(eq(uploads.objectPath, file.objectPath)).limit(1);
        if (!saved) await file.file.delete({ ignoreNotFound: true });
      } catch { /* Keep documents if the commit outcome cannot be confirmed. */ }
    }
  }
});

export default router;
