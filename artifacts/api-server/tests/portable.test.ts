import assert from "node:assert/strict";
import { test } from "node:test";
import { createCipheriv, createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, symlink, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { postgres } from "./fixtures/portableDatabase";
import { LocalFile, createLocalUploadUrl, validLocalUploadSignature } from "../src/lib/localObjectStorage";
import { restoreBackup } from "../src/tools/idwebhostMigration";
import app from "../src/app";
import { advisoryLockKey } from "../src/lib/advisoryLock";
import { processRegistrationSpreadsheetSync } from "../src/lib/registrationSpreadsheetSync";

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const headers = { Origin: "https://synthetic.example.invalid", "Content-Type": "application/json" };
const nativeUsername = "# Synthetic campus participant / 2026 " + "a".repeat(260);

test("advisory lock keys are stable signed 64-bit values without database hashing", () => {
  const keys = Array.from({ length: 100 }, (_, index) => advisoryLockKey(`synthetic-${index}`));
  assert.equal(advisoryLockKey("synthetic-0"), keys[0]);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.some(key => BigInt(key) < 0n));
  assert.ok(keys.some(key => BigInt(key) >= 0n));
  for (const key of keys) {
    assert.match(key, /^-?\d+$/);
    assert.ok(BigInt(key) >= -(2n ** 63n) && BigInt(key) < 2n ** 63n);
  }
});

test("portable app preserves native login, ownership, immutable uploads and encrypted restore", { timeout: 90_000 }, async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "treasure-portable-test-"));
  process.env.PRIVATE_STORAGE_ROOT = path.join(temporary, "source-private");
  const ddl = await readFile(path.resolve("../../dist/idwebhost/schema.sql"), "utf8");
  assert.doesNotMatch(ddl, /gen_random_uuid|uuid_generate|CREATE\s+EXTENSION/i,
    "Hosting schema must not require database UUID functions or extensions");
  await postgres.exec(ddl);
  // Make accidental SQL UUID generation fail even if the test engine provides it.
  await postgres.exec(`
    CREATE FUNCTION public.gen_random_uuid() RETURNS uuid LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Database UUID generation is forbidden in this test'; END $$;
    CREATE FUNCTION public.hashtextextended(text, bigint) RETURNS bigint LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'hashtextextended is unavailable on PostgreSQL 10 hosting'; END $$;
    SET search_path TO public, pg_catalog;
  `);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const origin = `http://127.0.0.1:${address.port}`;
  const request = (url: string, options?: RequestInit) => fetch(`${origin}${url}`, options);
  let cookie = "";
  try {
    for (const page of ["/", "/register", "/admin", "/archive/2025"]) {
      const result = await request(page);
      assert.equal(result.status, 200);
      assert.match(result.headers.get("content-type") || "", /text\/html/);
    }
    assert.equal((await request("/api/not-a-real-api")).status, 404);
    assert.equal((await request("/api/login", { redirect: "manual" })).status, 404);
    const tooShort = await request("/api/participant-auth/signup", {
      method: "POST", headers,
      body: JSON.stringify({ username: "12345678901", email: "short@example.invalid", password: "Synthetic-password-2026" }),
    });
    assert.equal(tooShort.status, 400);
    const signup = await request("/api/participant-auth/signup", {
      method: "POST", headers,
      body: JSON.stringify({ username: nativeUsername, email: "synthetic-native@example.invalid", password: "Synthetic-password-2026" }),
    });
    assert.equal(signup.status, 201, await signup.text());
    cookie = (signup.headers.get("set-cookie") || "").split(";")[0];
    assert.match(signup.headers.get("set-cookie") || "", /HttpOnly/i);
    assert.match(signup.headers.get("set-cookie") || "", /Secure/i);
    assert.match(signup.headers.get("set-cookie") || "", /SameSite=Lax/i);
    const owner = (await postgres.query<{ id: string }>("SELECT id FROM participant_accounts")).rows[0].id;
    assert.match(owner, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    const submissionKey = randomUUID();
    const files = [
      { purpose: "student_id", contentType: "image/png", name: "synthetic-student.png", bytes: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH8cAAAAASUVORK5CYII=", "base64") },
      { purpose: "payment_proof", contentType: "application/pdf", name: "synthetic-payment.pdf", bytes: Buffer.from("%PDF-1.4\nSynthetic test only\n%%EOF") },
    ];
    const uploads: string[] = [];
    for (const file of files) {
      const requested = await request("/api/storage/uploads/request-url", {
        method: "POST", headers: { ...headers, Cookie: cookie },
        body: JSON.stringify({ submissionKey, purpose: file.purpose, contentType: file.contentType, name: file.name, size: file.bytes.length }),
      });
      assert.equal(requested.status, 200, await requested.clone().text());
      const result = await requested.json() as { uploadId: string; uploadURL: string };
      uploads.push(result.uploadId);
      const url = new URL(result.uploadURL);
      const uploadPath = `${url.pathname}${url.search}`;
      assert.equal((await request(uploadPath, { method: "PUT", headers: { ...headers, "Content-Type": file.contentType }, body: file.bytes })).status, 401);
      assert.equal((await request(`${url.pathname}?expires=0000000000&signature=${"0".repeat(64)}`,
        { method: "PUT", headers: { ...headers, Cookie: cookie, "Content-Type": file.contentType }, body: file.bytes })).status, 403);
      assert.equal((await request(uploadPath, { method: "PUT", headers: { ...headers, Cookie: cookie, "Content-Type": file.contentType }, body: file.bytes })).status, 200);
      assert.equal((await request(uploadPath, { method: "PUT", headers: { ...headers, Cookie: cookie, "Content-Type": file.contentType }, body: file.bytes })).status, 409);
    }
    const payload = {
      submissionKey, contactEmail: "synthetic-native@example.invalid", contactPhone: "+620000000001",
      alternativePhone: "+620000000002",
      institution: "Synthetic campus", facultyDepartment: "Synthetic department", countryOfOrigin: "Indonesia",
      competition: "business_simulation", hasEdugateTraining: false, consent: true,
      studentIdUploadId: uploads[0], paymentUploadId: uploads[1],
      members: [{ fullName: "Synthetic participant", educationLevel: "undergraduate", feeCategory: "indonesian" }],
    };
    const submitted = await request("/api/registrations/teams", {
      method: "POST", headers: { ...headers, Cookie: cookie }, body: JSON.stringify(payload),
    });
    assert.equal(submitted.status, 201, await submitted.clone().text());
    const receipt = await submitted.json();
    const retried = await request("/api/registrations/teams", {
      method: "POST", headers: { ...headers, Cookie: cookie }, body: JSON.stringify(payload),
    });
    assert.deepEqual(await retried.json(), receipt);
    assert.equal((await postgres.query<{ count: number }>("SELECT count(*)::int AS count FROM team_registrations")).rows[0].count, 1);
    assert.equal((await postgres.query<{ status: string }>("SELECT status FROM registration_notifications")).rows[0].status, "pending");
    assert.equal((await postgres.query<{ status: string }>("SELECT status FROM registration_spreadsheet_sync")).rows[0].status, "pending");
    const oldSheetsEnabled = process.env.GOOGLE_SHEETS_SYNC_ENABLED;
    const oldSheetsUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
    const oldSheetsToken = process.env.GOOGLE_SHEETS_SYNC_TOKEN;
    const originalFetch = globalThis.fetch;
    let sheetRequests = 0;
    let failSheetRequest = true;
    process.env.GOOGLE_SHEETS_SYNC_ENABLED = "true";
    process.env.GOOGLE_SHEETS_WEBHOOK_URL = "https://script.google.com/macros/s/synthetic/exec";
    process.env.GOOGLE_SHEETS_SYNC_TOKEN = "synthetic-secret-not-for-production";
    globalThis.fetch = async (_input, init) => {
      sheetRequests++;
      const sent = JSON.parse(String(init?.body));
      assert.equal(sent.token, "synthetic-secret-not-for-production");
      assert.deepEqual(sent.registration.memberNames, ["Synthetic participant"]);
      assert.equal(sent.registration.contactEmail, "synthetic-native@example.invalid");
      assert.equal(sent.registration.contactPhone, "+620000000001");
      assert.equal(sent.registration.alternativePhone, "+620000000002");
      assert.ok(!JSON.stringify(sent).includes("student_id"));
      assert.ok(!JSON.stringify(sent).includes("payment_proof"));
      assert.ok(!JSON.stringify(sent).includes("passwordHash"));
      const ok = !failSheetRequest;
      failSheetRequest = false;
      return new Response(JSON.stringify({ ok }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    try {
      await processRegistrationSpreadsheetSync();
      assert.equal((await postgres.query<{ status: string }>("SELECT status FROM registration_spreadsheet_sync")).rows[0].status, "failed");
      assert.equal((await postgres.query<{ count: number }>("SELECT count(*)::int AS count FROM team_registrations")).rows[0].count, 1,
        "a spreadsheet failure must not remove a saved registration");
      await postgres.exec("UPDATE registration_spreadsheet_sync SET next_attempt_at = now()");
      await processRegistrationSpreadsheetSync();
      assert.equal((await postgres.query<{ status: string }>("SELECT status FROM registration_spreadsheet_sync")).rows[0].status, "sent");
      await processRegistrationSpreadsheetSync();
      assert.equal(sheetRequests, 2, "a successful retry must not resend an already synced registration");
    } finally {
      globalThis.fetch = originalFetch;
      if (oldSheetsEnabled === undefined) delete process.env.GOOGLE_SHEETS_SYNC_ENABLED;
      else process.env.GOOGLE_SHEETS_SYNC_ENABLED = oldSheetsEnabled;
      if (oldSheetsUrl === undefined) delete process.env.GOOGLE_SHEETS_WEBHOOK_URL;
      else process.env.GOOGLE_SHEETS_WEBHOOK_URL = oldSheetsUrl;
      if (oldSheetsToken === undefined) delete process.env.GOOGLE_SHEETS_SYNC_TOKEN;
      else process.env.GOOGLE_SHEETS_SYNC_TOKEN = oldSheetsToken;
    }

    const registered = (await postgres.query<Record<string, unknown>>("SELECT * FROM registration_uploads ORDER BY purpose DESC")).rows;
    const documents: Array<{ objectPath: string; contentType: string; size: number; ownerId: string; sha256: string; bytes: string }> = [];
    for (const upload of registered) {
      const file = new LocalFile(`private/${String(upload.object_path).slice("/objects/".length)}`);
      const [bytes] = await file.download();
      const expected = files.find(value => value.purpose === upload.purpose)!;
      assert.deepEqual(bytes, expected.bytes);
      const download = await request(`/api/storage${upload.object_path}`, { headers: { Cookie: cookie, Origin: headers.Origin } });
      assert.equal(download.status, 200);
      assert.equal(download.headers.get("cache-control"), "private, no-store");
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), expected.bytes);
      documents.push({ objectPath: String(upload.object_path), contentType: String(upload.content_type), size: bytes.length,
        ownerId: String(upload.owner_id), sha256: hash(bytes), bytes: bytes.toString("base64") });
    }
    const other = await request("/api/participant-auth/signup", {
      method: "POST", headers,
      body: JSON.stringify({ username: "123456789012", email: "synthetic-other@example.invalid", password: "Synthetic-password-2026" }),
    });
    assert.equal(other.status, 201);
    const ambiguous = await request("/api/participant-auth/signup", {
      method: "POST", headers,
      body: JSON.stringify({ username: "synthetic-native@example.invalid", email: "ambiguous@example.invalid", password: "Synthetic-password-2026" }),
    });
    assert.equal(ambiguous.status, 409, "A username must not shadow another participant's email");
    const otherCookie = (other.headers.get("set-cookie") || "").split(";")[0];
    assert.equal((await request(`/api/storage${registered[0].object_path}`, { headers: { Cookie: otherCookie, Origin: headers.Origin } })).status, 404);
    const organizer = await request("/api/organizer-auth/signin", {
      method: "POST", headers, body: JSON.stringify({ username: "synthetic-organizer", password: "Synthetic-organizer-password-2026" }),
    });
    assert.equal(organizer.status, 200, await organizer.clone().text());
    const organizerCookie = (organizer.headers.get("set-cookie") || "").split(";")[0];
    assert.equal((await request("/api/admin/registrations", { headers: { Cookie: organizerCookie } })).status, 200);
    process.env.MIGRATION_READ_ONLY = "true";
    const signin = await request("/api/participant-auth/signin", {
      method: "POST", headers, body: JSON.stringify({ identifier: nativeUsername, password: "Synthetic-password-2026" }),
    });
    assert.equal(signin.status, 200); // Sign-in remains usable while registrations are paused.
    assert.equal((await request("/api/participant-auth/signup", { method: "POST", headers, body: "{}" })).status, 503);

    const tables: Record<string, unknown[]> = {};
    for (const name of ["users", "participant_accounts", "organizer_accounts", "team_registrations",
      "team_registration_members", "registration_uploads", "registration_notifications"]) {
      tables[name] = (await postgres.query(`SELECT * FROM "${name}"`)).rows;
    }
    const historical = { id: "synthetic-historical", email: "old-synthetic@example.invalid", updated_at: new Date().toISOString() };
    const backup = { version: 1, createdAt: new Date().toISOString(), source: "development", tables, documents,
      additionalLegacyProfiles: [historical] };
    const salt = randomBytes(16), iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", scryptSync(process.env.SESSION_SECRET!, salt, 32), iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(backup)), cipher.final()]);
    const archive = Buffer.concat([Buffer.from("TREASURE-BACKUP-1\n"), salt, iv, cipher.getAuthTag(), ciphertext]);
    const backupFile = path.join(temporary, "synthetic.treasure-backup");
    await writeFile(backupFile, archive);
    assert.equal(archive.includes(Buffer.from("synthetic-native@example.invalid")), false);
    await assert.rejects(() => restoreBackup(backupFile)); // Existing target is never overwritten.
    assert.equal((await postgres.query("SELECT * FROM participant_accounts")).rows.length, 2);
    await postgres.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await postgres.exec(await readFile(path.resolve("../../dist/idwebhost/schema.sql"), "utf8"));
    process.env.PRIVATE_STORAGE_ROOT = path.join(temporary, "restored-private");
    await restoreBackup(backupFile);
    await unlink(path.join(process.env.PRIVATE_STORAGE_ROOT, ".metadata/private",
      `${documents[0].objectPath.slice("/objects/".length)}.json`));
    await restoreBackup(backupFile); // Restart is idempotent.
    assert.equal((await postgres.query("SELECT * FROM team_registrations")).rows.length, 1);
    assert.equal((await postgres.query("SELECT * FROM registration_uploads")).rows.length, 2);
    assert.deepEqual((await postgres.query<{ profile: unknown }>("SELECT profile FROM treasure_legacy_profile_archive")).rows[0].profile, historical);
    assert.equal((await postgres.query("SELECT * FROM participant_sessions")).rows.length, 0);
    const restoredSignin = await request("/api/participant-auth/signin", {
      method: "POST", headers, body: JSON.stringify({ identifier: nativeUsername, password: "Synthetic-password-2026" }),
    });
    assert.equal(restoredSignin.status, 200);
    assert.equal((await postgres.query<{ id: string }>("SELECT id FROM participant_accounts WHERE username = $1", [nativeUsername.toLowerCase()])).rows[0].id, owner);
    const tampered = Buffer.from(archive); tampered[tampered.length - 1] ^= 1;
    await writeFile(backupFile, tampered);
    await assert.rejects(() => restoreBackup(backupFile));
    assert.equal((await postgres.query("SELECT * FROM team_registrations")).rows.length, 1);
    const signed = new URL(createLocalUploadUrl());
    assert.equal(validLocalUploadSignature(signed.pathname.split("/").at(-1)!, signed.searchParams.get("expires"), signed.searchParams.get("signature")), true);
    assert.throws(() => new LocalFile("private/registration-documents/../../public"));
    const linked = path.join(temporary, "symlink-root");
    await symlink(process.env.PRIVATE_STORAGE_ROOT, linked);
    process.env.PRIVATE_STORAGE_ROOT = linked;
    await assert.rejects(() => new LocalFile(`private/${documents[0].objectPath.slice("/objects/".length)}`).download());
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await postgres.close();
    await rm(temporary, { recursive: true, force: true });
  }
});
