import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import express, { type Request } from "express";
import pino from "pino";
import { eq } from "drizzle-orm";
import { ListAdminRegistrationsResponse, GetAdminRegistrationResponse } from "@workspace/api-zod";
import type { AdminRegistrationList, AdminRegistrationDetail } from "@workspace/api-zod";
import adminRouter from "../src/routes/admin";
import {
  db, postgres, initializeDatabase, statements,
  teamRegistrationsTable as registrations,
  teamRegistrationMembersTable as members,
  registrationNotificationsTable as notifications,
  registrationUploadsTable as uploads,
} from "./fixtures/database";
import { externalCalls, notificationSetup } from "./fixtures/services";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const instant = "2026-01-01T12:00:00.000Z";
const nextAttempt = "2026-01-02T12:00:00.000Z";
const statuses = ["sent", "pending", "processing", "failed", "not_requested"] as const;
const counts = [3, 2, 1, 4, 0];
const captainNames = [
  "Synthetic Captain %_\\ Alpha", "Synthetic Captain Beta",
  "Synthetic Captain Gamma", "Synthetic Captain Delta", "Synthetic Team 5",
];
const summaryKeys = [
  "id", "referenceCode", "teamName", "captainName", "institution", "countryOfOrigin",
  "competition", "memberCount", "createdAt", "notificationStatus",
].sort();

// These sessions exist only inside this test's HTTP server. No real OIDC session
// middleware, development auth endpoint, or actual organizer identity is used.
const sessions = new Map([
  ["organizer-test-session", { id: "test-organizer", email: "  ORGANIZER@example.invalid  " }],
  ["participant-test-session", { id: "test-participant", email: "participant@example.invalid" }],
  ["email-less-test-session", { id: "test-no-email", email: null }],
]);
let server: Server;
let base: string;

before(async () => {
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.DATABASE_URL, undefined);
  assert.equal(process.env.TREASURE_ADMIN_EMAILS, "organizer@example.invalid");
  await initializeDatabase();
  // 21 rows exercise real pagination. All data and contacts are synthetic.
  for (let n = 1; n <= 21; n++) {
    await db.insert(registrations).values({
      id: id(n), submissionKey: id(100 + n), referenceCode: `TEST-${n}`,
      teamName: `Synthetic Team ${n}`, contactEmail: `team${n}@example.invalid`,
      contactPhone: "synthetic-phone", alternativePhone: n === 1 ? "synthetic-alt" : null,
      institution: n <= 4 ? `Synthetic Institute ${n}` : null,
      facultyDepartment: n === 1 ? "Synthetic Faculty" : null,
      countryOfOrigin: n <= 4 ? "Synthetic Country" : null,
      competition: n <= 4 ? "business_simulation" : null,
      hasEdugateTraining: n === 1 ? false : null,
      createdAt: new Date(Date.parse(instant) - n * 60_000),
    });
  }
  for (let n = 1; n <= 4; n++) {
    // Reverse insertion proves captain selection is by position, not serial ID.
    for (let position = counts[n - 1]; position >= 1; position--) {
      await db.insert(members).values({
        registrationId: id(n), position,
        fullName: position === 1 ? captainNames[n - 1] : `Synthetic Member ${n}-${position}`,
      });
    }
    await db.insert(notifications).values({
      registrationId: id(n), status: statuses[n - 1] as "sent" | "pending" | "processing" | "failed",
      attempts: n,
      nextAttemptAt: new Date(nextAttempt),
      sentAt: n === 1 ? new Date(instant) : null,
      lastError: n === 4 ? "Synthetic delivery failure" : null,
    });
  }
  for (const [offset, purpose] of ["student_id", "payment_proof"].entries()) {
    await db.insert(uploads).values({
      id: id(300 + offset), ownerId: "test-owner", submissionKey: id(101),
      registrationId: id(1), purpose: purpose as "student_id" | "payment_proof",
      objectPath: `/test-only/${purpose}`, fileName: `${purpose}.pdf`,
      contentType: "application/pdf", fileSize: 1234 + offset,
    });
  }
  const app = express();
  const logger = pino({ enabled: false });
  app.use((req, _res, next) => {
    const session = sessions.get(req.get("authorization")?.replace(/^Bearer /, "") ?? "");
    if (session) req.user = { ...session, firstName: null, lastName: null, profileImageUrl: null };
    req.isAuthenticated = function (this: Request) { return this.user != null; } as typeof req.isAuthenticated;
    req.log = logger;
    next();
  });
  app.use("/api", adminRouter);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  try {
    if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    assert.equal(externalCalls, 0, "No email or storage operation may run.");
  } finally {
    await postgres.close(); // Discards only this process's in-memory test database.
  }
});

async function request<T = unknown>(path: string, session: string | null = "organizer-test-session", headers: Record<string, string> = {}, method = "GET") {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(session ? { authorization: `Bearer ${session}` } : {}), ...headers },
  });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return { status: response.status, body: await response.json() as T };
}

function assertSummary(item: object, n: number) {
  assert.deepEqual(Object.keys(item).sort(), summaryKeys);
  assert.deepEqual(item, {
    id: id(n), referenceCode: `TEST-${n}`, teamName: `Synthetic Team ${n}`,
    captainName: captainNames[n - 1] ?? `Synthetic Team ${n}`,
    institution: n <= 4 ? `Synthetic Institute ${n}` : null,
    countryOfOrigin: n <= 4 ? "Synthetic Country" : null,
    competition: n <= 4 ? "business_simulation" : null,
    memberCount: counts[n - 1] ?? 0,
    createdAt: new Date(Date.parse(instant) - n * 60_000).toISOString(),
    notificationStatus: statuses[n - 1] ?? "not_requested",
  });
}

test("PostgreSQL rejects UUID/integer comparisons rather than silently matching", async () => {
  await assert.rejects(
    postgres.query('SELECT * FROM team_registration_members WHERE registration_id = id'),
    /operator does not exist: uuid = integer/,
  );
});

test("correlated projections: list returns correct captains, integer counts, statuses and generated contract", async () => {
  const response = await request<AdminRegistrationList>("/admin/registrations");
  assert.equal(response.status, 200);
  assert(ListAdminRegistrationsResponse.safeParse(response.body).success);
  assert.deepEqual(Object.keys(response.body).sort(), ["items", "notificationSetup", "page", "pageSize", "total"]);
  assert.equal(response.body.total, 21);
  assert.equal(response.body.page, 1);
  assert.equal(response.body.pageSize, 20);
  assert.deepEqual(response.body.notificationSetup, notificationSetup());
  assert.equal(response.body.items.length, 20);
  response.body.items.forEach((item, i) => assertSummary(item, i + 1));
  const page2 = await request<AdminRegistrationList>("/admin/registrations?page=2");
  assert.equal(page2.status, 200);
  assert(ListAdminRegistrationsResponse.safeParse(page2.body).success);
  assert.equal(page2.body.total, 21);
  assert.equal(page2.body.page, 2);
  assert.equal(page2.body.items.length, 1);
  assertSummary(page2.body.items[0], 21);
  const page3 = await request<AdminRegistrationList>("/admin/registrations?page=3");
  assert.equal(page3.status, 200);
  assert.equal(page3.body.total, 21);
  assert.deepEqual(page3.body.items, []);
  const select = statements.find((query) => query.includes("COALESCE((SELECT full_name"));
  assert(select);
  assert.match(select, /registration_id = "team_registrations"\."id"/);
});

test("correlated projections: details preserve contacts, ordered members, documents and all notification states", async () => {
  for (let n = 1; n <= 5; n++) {
    const response = await request<AdminRegistrationDetail>(`/admin/registrations/${id(n)}`);
    assert.equal(response.status, 200);
    assert(GetAdminRegistrationResponse.safeParse(response.body).success);
    assert.deepEqual(Object.keys(response.body).sort(), ["contact", "documents", "members", "notification", "registration"]);
    assertSummary(response.body.registration, n);
    assert.deepEqual(response.body.contact, {
      email: `team${n}@example.invalid`, phone: "synthetic-phone",
      alternativePhone: n === 1 ? "synthetic-alt" : null,
      facultyDepartment: n === 1 ? "Synthetic Faculty" : null,
      hasEdugateTraining: n === 1 ? false : null,
    });
    assert.deepEqual(response.body.members, Array.from({ length: counts[n - 1] }, (_, i) => ({
      position: i + 1, fullName: i === 0 ? captainNames[n - 1] : `Synthetic Member ${n}-${i + 1}`,
    })));
    assert.deepEqual(response.body.notification, {
      status: statuses[n - 1], attempts: n === 5 ? 0 : n,
      sentAt: n === 1 ? instant : null,
      lastError: n === 4 ? "Synthetic delivery failure" : null,
      nextAttemptAt: n === 1 || n === 5 ? null : nextAttempt,
    });
    if (n !== 1) assert.deepEqual(response.body.documents, []);
    else {
      assert.deepEqual(response.body.documents.sort((a: { purpose: string }, b: { purpose: string }) => a.purpose.localeCompare(b.purpose)),
        ["payment_proof", "student_id"].map((purpose) => {
          const offset = purpose === "student_id" ? 0 : 1;
          return {
            id: id(300 + offset), purpose, fileName: `${purpose}.pdf`,
            contentType: "application/pdf", size: 1234 + offset,
            url: `/api/admin/registrations/${id(1)}/documents/${id(300 + offset)}`,
          };
        }));
    }
  }
});

test("search covers reference, team, institution and every member with escaped literal patterns", async () => {
  for (const [term, expected] of [
    ["TEST-4", [4]], ["Synthetic Team 5", [5]], ["synthetic institute 2", [2]],
    ["captain gamma", [3]], ["Synthetic Member 1-3", [1]],
    ["%_\\", [1]], ["_", [1]], ["\\", [1]], ["no matching fixture", []],
  ] as const) {
    const response = await request<AdminRegistrationList>(`/admin/registrations?search=${encodeURIComponent(term)}`);
    assert.equal(response.status, 200);
    assert(ListAdminRegistrationsResponse.safeParse(response.body).success);
    assert.equal(response.body.total, expected.length, term);
    assert.deepEqual(response.body.items.map((row: { id: string }) => row.id), expected.map(id), term);
  }
  const whitespace = await request<AdminRegistrationList>("/admin/registrations?search=%20%20");
  assert.equal(whitespace.status, 200);
  assert.equal(whitespace.body.total, 21);
});

test("invalid pagination/search/UUID return 400 and missing registrations return 404", async () => {
  for (const query of ["page=0", "page=-1", "page=1.5", "page=abc", "page=100001", `search=${"x".repeat(121)}`]) {
    const response = await request(`/admin/registrations?${query}`);
    assert.equal(response.status, 400, query);
    assert.deepEqual(response.body, { error: "Invalid page or search." });
  }
  const invalid = await request("/admin/registrations/not-a-uuid");
  assert.equal(invalid.status, 400);
  assert.deepEqual(invalid.body, { error: "Invalid registration reference." });
  const missing = await request(`/admin/registrations/${id(999)}`);
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: "Registration not found." });
});

test("unauthenticated 401 and non-organizer 403 never query or expose private registration data", async () => {
  for (const session of [null, "unknown-session", "participant-test-session", "email-less-test-session"]) {
    const authenticated = session === "participant-test-session" || session === "email-less-test-session";
    for (const [path, method] of [
      ["/admin/registrations?email=organizer@example.invalid", "GET"],
      [`/admin/registrations/${id(1)}`, "GET"],
      ["/admin/registrations/not-a-uuid", "GET"],
      [`/admin/registrations/${id(1)}/documents/${id(300)}`, "GET"],
      [`/admin/registrations/${id(1)}/retry-email`, "POST"],
    ]) {
      const beforeQueries = statements.length;
      const response = await request(path, session, { "x-user-email": "organizer@example.invalid" }, method);
      assert.equal(response.status, authenticated ? 403 : 401);
      assert.deepEqual(response.body, { error: authenticated
        ? "This dashboard is restricted to authorized organizers." : "Please sign in." });
      assert.equal(statements.length, beforeQueries, "Access must be denied before querying private data.");
    }
  }
});

test("organizer access honors session identity and rejects cross-origin private reads", async () => {
  assert.deepEqual((await request("/admin/access")).body, { isAdmin: true });
  const participant = await request("/admin/access", "participant-test-session");
  assert.equal(participant.status, 200);
  assert.deepEqual(participant.body, { isAdmin: false });
  const anonymous = await request("/admin/access", null);
  assert.equal(anonymous.status, 401);
  assert.deepEqual(anonymous.body, { error: "Please sign in." });
  const crossOriginHeaders: Record<string, string>[] = [{ origin: "https://outside.example.invalid" }, { "sec-fetch-site": "cross-site" }, { origin: "not-a-url" }];
  for (const headers of crossOriginHeaders) {
    const beforeQueries = statements.length;
    const denied = await request("/admin/registrations", "organizer-test-session", headers);
    assert.equal(denied.status, 403);
    assert.deepEqual(denied.body, { error: "This action must be performed from the organizer dashboard." });
    assert.equal(statements.length, beforeQueries);
  }
  const sameOrigin = await request("/admin/registrations", "organizer-test-session", { origin: new URL(base).origin });
  assert.equal(sameOrigin.status, 200);
});

test("read-only organizer checks do not modify seeded registrations or notification jobs", async () => {
  const rows = await db.select().from(registrations);
  assert.equal(rows.length, 21);
  const jobs = await db.select().from(notifications);
  assert.equal(jobs.length, 4);
  for (let n = 1; n <= 4; n++) {
    const [job] = await db.select().from(notifications).where(eq(notifications.registrationId, id(n)));
    assert.equal(job.status, statuses[n - 1]);
    assert.equal(job.attempts, n);
  }
  assert.equal(externalCalls, 0);
});
