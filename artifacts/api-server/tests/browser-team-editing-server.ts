// Isolated browser-test server. Never imported by application entry points.
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db, postgres, participantAccountsTable as accounts, teamRegistrationsTable as registrations,
  teamRegistrationMembersTable as members, registrationUploadsTable as uploads } from "./fixtures/portableDatabase";
import { hashPassword } from "../src/lib/participantAuth";
import { LocalFile } from "../src/lib/localObjectStorage";
import { setTestRegistrationClosed } from "./fixtures/registrationPolicy";

const temporary = await mkdtemp(path.join(tmpdir(), "treasure-browser-isolated-"));
Object.assign(process.env, {
  NODE_ENV: "production", RUNTIME_HOST: "cpanel", STORAGE_BACKEND: "local",
  PRIVATE_STORAGE_ROOT: temporary, STATIC_SITE_DIR: path.resolve("../../dist/idwebhost/public"),
  AUTH_REPLIT_ENABLED: "false", NOTIFICATION_WORKER_ENABLED: "false",
  GOOGLE_SHEETS_SYNC_ENABLED: "false", GOOGLE_DRIVE_SYNC_ENABLED: "false", MIGRATION_READ_ONLY: "false",
  SESSION_SECRET: "synthetic-isolated-browser-session-secret-not-for-production",
  TREASURE_ORGANIZER_USERNAME: "synthetic-browser-organizer",
  TREASURE_ORGANIZER_PASSWORD: "Synthetic-browser-organizer-password-2026",
});
// PUBLIC_APP_ORIGIN is the preview's non-secret origin. No production secrets
// are read by this harness; synthetic credentials are local to this process.
setTestRegistrationClosed(true);
await postgres.exec(await readFile(path.resolve("../../dist/idwebhost/schema.sql"), "utf8"));
await postgres.exec(`CREATE FUNCTION public.pg_advisory_xact_lock(bigint) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;`);
const accountId = randomUUID(), registrationId = randomUUID(), ownerId = `participant:${accountId}`;
await db.insert(accounts).values({ id: accountId, username: "synthetic-browser-participant",
  email: "browser@example.invalid", passwordHash: await hashPassword("Synthetic-browser-participant-password-2026") });
await db.insert(registrations).values({ id: registrationId, ownerId, referenceCode: "TR26-BROWSER-ISOLATED",
  submissionKey: randomUUID(), teamName: "Synthetic Browser Isolated", contactEmail: "browser@example.invalid", contactPhone: "+620000000000" });
await db.insert(members).values([{ registrationId, position: 0, fullName: "Synthetic Leader" },
  { registrationId, position: 1, fullName: "Synthetic Member" }]);
const pdf = Buffer.from("%PDF-1.4\nSynthetic browser student ID\n%%EOF");
for (const [purpose, position] of [["student_id", 0], ["student_id", 1], ["payment_proof", null]] as const) {
  const uploadId = randomUUID();
  await new LocalFile(`private/registration-documents/${uploadId}`).save(pdf, "application/pdf");
  await db.insert(uploads).values({ id: uploadId, ownerId, submissionKey: randomUUID(), purpose,
    memberPosition: position, registrationId, objectPath: `/objects/registration-documents/${uploadId}`,
    fileName: purpose === "payment_proof" ? "synthetic-payment.pdf" : `synthetic-original-${position}.pdf`,
    contentType: "application/pdf", fileSize: pdf.length });
}
const { default: app } = await import("../src/app");
const server = app.listen(4510, "0.0.0.0");
await once(server, "listening");
console.log("ISOLATED_BROWSER_READY", JSON.stringify({ port: 4510, registrationId, teamName: "Synthetic Browser Isolated" }));
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => {
  server.close(async () => { await postgres.close(); await rm(temporary, { recursive: true, force: true }); process.exit(0); });
});
