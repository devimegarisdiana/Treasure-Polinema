import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, postgres, participantAccountsTable as accounts, teamRegistrationsTable as registrations,
  teamRegistrationMembersTable as members, registrationUploadsTable as uploads,
  registrationNotificationsTable as notifications, registrationSpreadsheetSyncTable as sync } from "./fixtures/portableDatabase";
import { hashPassword } from "../src/lib/participantAuth";
import { LocalFile } from "../src/lib/localObjectStorage";
import { setTestRegistrationClosed } from "./fixtures/registrationPolicy";
import app from "../src/app";
import { attachmentDisposition, formatDocumentDownloadName } from "../src/lib/documentDownloadName";
import { GetAdminRegistrationResponse, ListParticipantRegistrationsResponse,
  RequestAdminMemberUploadResponse, UpdateAdminRegistrationMembersResponse } from "@workspace/api-zod";

test("document filenames preserve formats and international names without unsafe paths or headers", () => {
  const name = formatDocumentDownloadName({ purpose: "student_id", participantName: "José / 李明\r\n",
    institution: "Campus: A\\B", contentType: "image/png" });
  assert.equal(name, "KTM - José 李明 - Campus A B.png");
  const header = attachmentDisposition(name);
  assert.match(header, /^attachment; filename="/);
  assert.doesNotMatch(header, /[\r\n]/);
  assert.equal(decodeURIComponent(header.split("filename*=UTF-8''")[1]), name);
  for (const [type, ext] of [["image/jpeg", ".jpg"], ["image/webp", ".webp"], ["application/pdf", ".pdf"]]) {
    assert.ok(formatDocumentDownloadName({ purpose: "payment_proof", teamName: "Team Blue", institution: "Campus A", contentType: type }).endsWith(ext));
  }
  const long = formatDocumentDownloadName({ purpose: "student_id", participantName: "李".repeat(160), institution: "校".repeat(200), contentType: "application/pdf" });
  assert.ok(Buffer.byteLength(long, "utf8") < 240);
  assert.equal(formatDocumentDownloadName({ purpose: "payment_proof", teamName: "Team Blue", contentType: "application/pdf" }),
    "Payment Proof - Team Blue - Campus not provided.pdf");
});

test("organizer corrections and substitutions preserve ownership, payment and per-person IDs", { timeout: 90_000 }, async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "treasure-team-edit-"));
  process.env.PRIVATE_STORAGE_ROOT = temporary;
  setTestRegistrationClosed(true);
  await postgres.exec(await readFile(path.resolve("../../dist/idwebhost/schema.sql"), "utf8"));
  await postgres.exec(`CREATE FUNCTION public.pg_advisory_xact_lock(bigint) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;`);
  const accountId = randomUUID(), id = randomUUID(), otherId = randomUUID();
  const ownerId = `participant:${accountId}`;
  await db.insert(accounts).values({ id: accountId, username: "synthetic-edit-team", email: "edit@example.invalid", passwordHash: await hashPassword("Synthetic-participant-password-2026") });
  for (const teamId of [id, otherId]) {
    await db.insert(registrations).values({ id: teamId, ownerId, referenceCode: `TR26-${teamId.slice(0, 8)}`,
      submissionKey: randomUUID(), teamName: "Synthetic Before", institution: "Synthetic Campus", contactEmail: "edit@example.invalid", contactPhone: "+6200000000" });
    await db.insert(members).values([{ registrationId: teamId, position: 0, fullName: "Original Leader" },
      { registrationId: teamId, position: 1, fullName: "Original Member", institution: "Old personal institution" }]);
  }
  const pdf = Buffer.from("%PDF-1.4\nSynthetic student ID fixture\n%%EOF");
  const oldId = randomUUID(), paymentId = randomUUID(), memberId = randomUUID();
  for (const [uploadId, purpose, memberPosition] of [[oldId, "student_id", null], [memberId, "student_id", 1], [paymentId, "payment_proof", null]] as const) {
    await new LocalFile(`private/registration-documents/${uploadId}`).save(pdf, "application/pdf");
    await db.insert(uploads).values({ id: uploadId, ownerId, submissionKey: randomUUID(), purpose,
      memberPosition, registrationId: id, objectPath: `/objects/registration-documents/${uploadId}`,
      fileName: `${uploadId}.pdf`, contentType: "application/pdf", fileSize: pdf.length });
  }
  await db.update(registrations).set({ studentIdUploadId: oldId, paymentUploadId: paymentId }).where(eq(registrations.id, id));
  await db.insert(notifications).values({ registrationId: id, status: "sent", attempts: 1 });
  const [original] = await db.select().from(registrations).where(eq(registrations.id, id));
  const beforeEmail = await db.select().from(notifications);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const request = (route: string, cookie = "", body?: unknown, method = body ? "POST" : "GET", origin = "https://synthetic.example.invalid") =>
    fetch(base + route, { method, headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const cookieOf = (response: Response) => (response.headers.get("set-cookie") || "").split(";")[0];
  try {
    const adminLogin = await request("/api/organizer-auth/signin", "", { username: "synthetic-organizer", password: "Synthetic-organizer-password-2026" });
    assert.equal(adminLogin.status, 200);
    const admin = cookieOf(adminLogin);
    const participant = cookieOf(await request("/api/participant-auth/signin", "", { identifier: "synthetic-edit-team", password: "Synthetic-participant-password-2026" }));
    const downloadName = (response: Response) => decodeURIComponent((response.headers.get("content-disposition") || "").split("filename*=UTF-8''")[1] || "");
    const adminDocument = (uploadId: string) => `/api/admin/registrations/${id}/documents/${uploadId}`;
    const initialId = await request(adminDocument(oldId), admin);
    assert.equal(initialId.status, 200);
    assert.equal(downloadName(initialId), "KTM - Original Leader - Synthetic Campus.pdf", "Legacy leader ID must use the leader's name");
    assert.equal(downloadName(await request(adminDocument(memberId), admin)), "KTM - Original Member - Old personal institution.pdf");
    const initialPayment = await request(adminDocument(paymentId), admin);
    assert.equal(downloadName(initialPayment), "Payment Proof - Synthetic Before - Synthetic Campus.pdf");
    assert.match(initialPayment.headers.get("cache-control") || "", /private.*no-store/);
    const denied = await request(adminDocument(oldId), participant);
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get("content-disposition"), null);
    const endpoint = `/api/admin/registrations/${id}/members`;
    const body = { revision: 0, submissionKey: randomUUID(), teamName: "Synthetic Corrected",
      confirmed: true, members: [{ position: 0, fullName: "Corrected Leader", action: "correction" },
        { position: 1, fullName: "Original Member", action: "correction" }] };
    assert.equal((await request(endpoint, "", body, "PATCH")).status, 401);
    assert.equal((await request(endpoint, participant, body, "PATCH")).status, 401);
    assert.equal((await request(endpoint, admin, body, "PATCH", "https://evil.example.invalid")).status, 403);
    assert.equal((await request(endpoint, admin, { ...body, confirmed: false }, "PATCH")).status, 400);
    let response = await request(endpoint, admin, body, "PATCH");
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(UpdateAdminRegistrationMembersResponse.parse(await response.json()).revision, 1);
    assert.equal((await request(endpoint, admin, body, "PATCH")).status, 200, "Retry a lost correction response");
    assert.equal((await db.select().from(uploads).where(eq(uploads.id, oldId)))[0].registrationId, id);
    assert.equal(downloadName(await request(adminDocument(oldId), admin)), "KTM - Corrected Leader - Synthetic Campus.pdf");
    const replacement = { ...body, revision: 1, submissionKey: randomUUID(), members: [
      { position: 0, fullName: "New Leader", action: "replacement", studentIdUploadId: "" },
      { position: 1, fullName: "Original Member", action: "correction" },
    ] };
    assert.equal((await request(endpoint, admin, replacement, "PATCH")).status, 400);
    const upload = async (teamId: string, position: number, key: string, bytes = pdf) => {
      const prepared = await request(`/api/admin/registrations/${teamId}/member-uploads`, admin,
        { submissionKey: key, memberPosition: position, name: "replacement.pdf", size: bytes.length, contentType: "application/pdf" });
      assert.equal(prepared.status, 200, await prepared.clone().text());
      const payload = RequestAdminMemberUploadResponse.parse(await prepared.json());
      const target = new URL(payload.uploadURL);
      const put = await fetch(base + target.pathname + target.search, { method: "PUT", headers: {
        Origin: "https://synthetic.example.invalid", Cookie: admin, "Content-Type": "application/pdf",
      }, body: bytes });
      assert.equal(put.status, 200, await put.text());
      return payload.uploadId as string;
    };
    const wrongTeam = await upload(otherId, 0, replacement.submissionKey);
    replacement.members[0].studentIdUploadId = wrongTeam;
    assert.equal((await request(endpoint, admin, replacement, "PATCH")).status, 400);
    const wrongPosition = await upload(id, 1, replacement.submissionKey);
    replacement.members[0].studentIdUploadId = wrongPosition;
    assert.equal((await request(endpoint, admin, replacement, "PATCH")).status, 400);
    const wrongSession = await upload(id, 0, randomUUID());
    replacement.members[0].studentIdUploadId = wrongSession;
    assert.equal((await request(endpoint, admin, replacement, "PATCH")).status, 400);
    const invalid = await upload(id, 0, replacement.submissionKey, Buffer.from("Not really a valid PDF document"));
    replacement.members[0].studentIdUploadId = invalid;
    assert.equal((await request(endpoint, admin, replacement, "PATCH")).status, 400);
    const newId = await upload(id, 0, replacement.submissionKey);
    replacement.members[0].studentIdUploadId = newId;
    response = await request(endpoint, admin, replacement, "PATCH");
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(UpdateAdminRegistrationMembersResponse.parse(await response.json()).revision, 2);
    assert.equal((await request(endpoint, admin, replacement, "PATCH")).status, 200);
    assert.equal((await request(endpoint, admin, { ...body, teamName: "Stale edit" }, "PATCH")).status, 409);
    const detail = GetAdminRegistrationResponse.parse(await (await request(`/api/admin/registrations/${id}`, admin)).json());
    assert.equal(detail.revision, 2);
    assert.equal(detail.members[0].fullName, "New Leader");
    assert.ok(!detail.documents.some((doc: { id: string }) => doc.id === oldId));
    assert.ok(detail.documents.some(doc => doc.id === newId && doc.memberName === "New Leader"));
    const [archived] = await db.select().from(uploads).where(eq(uploads.id, oldId));
    assert.equal(archived.registrationId, null);
    assert.equal(archived.completionRegistrationId, id);
    assert.deepEqual((await new LocalFile(`private/registration-documents/${oldId}`).download())[0], pdf);
    const participantView = ListParticipantRegistrationsResponse.parse(await (await request("/api/participant-registrations", participant)).json());
    const mine = participantView.items.find((team: { id: string }) => team.id === id);
    assert.equal(mine?.members[0].fullName, "New Leader");
    const ownId = await request(mine!.members[0].studentIdUrl!, participant);
    assert.equal(ownId.status, 200, "New file is readable by team owner");
    assert.equal(downloadName(ownId), "KTM - New Leader - Synthetic Campus.pdf");
    assert.equal(downloadName(await request(adminDocument(newId), admin)), downloadName(ownId));
    const ownPayment = await request(mine!.paymentProofUrl!, participant);
    assert.equal(downloadName(ownPayment), "Payment Proof - Synthetic Corrected - Synthetic Campus.pdf");
    assert.equal(downloadName(await request(adminDocument(paymentId), admin)), downloadName(ownPayment));
    const [storedDocument] = await db.select().from(uploads).where(eq(uploads.id, newId));
    assert.equal(storedDocument.fileName, "replacement.pdf", "Download naming must not rename stored files");
    const [saved] = await db.select().from(registrations).where(eq(registrations.id, id));
    assert.equal(saved.detailsRevision, 2, "Retries must not advance revision");
    assert.equal(saved.studentIdUploadId, newId);
    assert.deepEqual({ ...saved, teamName: original.teamName, detailsRevision: original.detailsRevision, studentIdUploadId: original.studentIdUploadId }, original);
    assert.deepEqual(await db.select().from(notifications), beforeEmail, "No registration email requeued");
    assert.equal((await db.select().from(sync).where(eq(sync.registrationId, id)))[0].revision, 2);
    assert.equal((await request("/api/participant-auth/signup", "", {})).status, 410, "New intake remains closed");
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await postgres.close();
    await rm(temporary, { recursive: true, force: true });
  }
});
