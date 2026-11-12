import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, postgres, participantAccountsTable as accounts, teamRegistrationsTable as registrations } from "./fixtures/portableDatabase";
import { hashPassword } from "../src/lib/participantAuth";
import app from "../src/app";
import { GetParticipantSessionResponse, GetRegistrationParticipantAccountResponse, ResetRegistrationPasswordResponse } from "@workspace/api-zod";

test("organizer reset is account-scoped, private, expiring and forces a password change", { timeout: 90_000 }, async () => {
  await postgres.exec(await readFile(path.resolve("../../dist/idwebhost/schema.sql"), "utf8"));
  await postgres.exec(`CREATE FUNCTION public.pg_advisory_xact_lock(bigint) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;`);
  const accountA = randomUUID(), accountB = randomUUID(), regA = randomUUID(), regB = randomUUID(), unlinked = randomUUID();
  const original = "Synthetic-original-password-2026";
  const newPassword = "Synthetic-personal-password-2026";
  const passwordHash = await hashPassword(original);
  await db.insert(accounts).values([
    { id: accountA, username: "synthetic-team-alpha", email: "alpha@example.invalid", passwordHash },
    { id: accountB, username: "synthetic-team-bravo", email: "bravo@example.invalid", passwordHash },
  ]);
  for (const [id, ownerId, teamName] of [[regA, `participant:${accountA}`, "Synthetic Alpha"], [regB, `participant:${accountB}`, "Synthetic Bravo"], [unlinked, "historical-replit-id", "Synthetic Historical"]]) {
    await db.insert(registrations).values({ id, ownerId, teamName, referenceCode: `TR26-${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`, submissionKey: randomUUID(), contactEmail: "alpha@example.invalid", contactPhone: "+620000000000" });
  }
  const before = await db.select().from(registrations);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test listener");
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { Origin: "https://synthetic.example.invalid", "Content-Type": "application/json" };
  const cookieOf = (res: Response) => (res.headers.get("set-cookie") || "").split(";")[0];
  const request = (route: string, cookie = "", data?: unknown, origin = headers.Origin) => fetch(base + route, {
    method: data ? "POST" : "GET", headers: { ...headers, Origin: origin, Cookie: cookie },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const sessionBody = async (response: Response) => GetParticipantSessionResponse.parse(await response.json());
  const login = async (username: string, password: string) => {
    const response = await request("/api/participant-auth/signin", "", { identifier: username, password });
    return { response, cookie: cookieOf(response) };
  };
  try {
    const oldA = await login("synthetic-team-alpha", original);
    const oldB = await login("synthetic-team-bravo", original);
    assert.equal(oldA.response.status, 200);
    const organizer = await request("/api/organizer-auth/signin", "", { username: "synthetic-organizer", password: "Synthetic-organizer-password-2026" });
    assert.equal(organizer.status, 200);
    const admin = cookieOf(organizer);
    const endpoint = `/api/admin/registrations/${regA}/reset-password`;
    const confirmation = { accountId: accountA, confirmed: true };
    assert.equal((await request(endpoint, "", confirmation)).status, 401);
    assert.equal((await request(endpoint, oldA.cookie, confirmation)).status, 401);
    assert.equal((await request(endpoint, admin, confirmation, "https://evil.example.invalid")).status, 403);
    assert.equal((await request(endpoint, admin, { accountId: accountB, confirmed: true })).status, 409);
    assert.equal((await request(endpoint, admin, { accountId: accountA, confirmed: false })).status, 400);
    const historical = await request(`/api/admin/registrations/${unlinked}/participant-account`, admin);
    assert.equal(GetRegistrationParticipantAccountResponse.parse(await historical.json()).account, null, "A matching contact email must never recover historical ownership");
    assert.equal((await request(`/api/admin/registrations/${unlinked}/reset-password`, admin, confirmation)).status, 409);
    const reset = await request(endpoint, admin, confirmation);
    assert.equal(reset.status, 200, await reset.clone().text());
    assert.match(reset.headers.get("cache-control") || "", /no-store/);
    const generated = ResetRegistrationPasswordResponse.parse(await reset.json());
    assert.equal(generated.username, "synthetic-team-alpha");
    assert.ok(generated.temporaryPassword.length >= 24);
    assert.ok(new Date(generated.expiresAt).getTime() > Date.now());
    assert.equal((await sessionBody(await request("/api/participant-auth/me", oldA.cookie))).user, null);
    assert.ok((await sessionBody(await request("/api/participant-auth/me", oldB.cookie))).user, "Other accounts stay signed in");
    assert.equal((await login("synthetic-team-alpha", original)).response.status, 401);
    const temporary = await login("synthetic-team-alpha", generated.temporaryPassword);
    assert.equal(temporary.response.status, 200);
    assert.equal((await sessionBody(temporary.response)).user?.mustChangePassword, true);
    assert.equal((await request("/api/participant-registrations", temporary.cookie)).status, 403);
    assert.equal((await request("/api/storage/uploads/request-url", temporary.cookie, {})).status, 403);
    const accountView = GetRegistrationParticipantAccountResponse.parse(await (await request(`/api/admin/registrations/${regA}/participant-account`, admin)).json());
    assert.equal(accountView.account?.mustChangePassword, true);
    assert.doesNotMatch(JSON.stringify(accountView), /passwordHash|temporaryPassword|scrypt-v1/);
    const changeEndpoint = "/api/participant-auth/change-password";
    assert.equal((await request(changeEndpoint, temporary.cookie, { currentPassword: generated.temporaryPassword, newPassword: generated.temporaryPassword })).status, 400);
    assert.equal((await request(changeEndpoint, temporary.cookie, { currentPassword: "incorrect", newPassword })).status, 401);
    const changed = await request(changeEndpoint, temporary.cookie, { currentPassword: generated.temporaryPassword, newPassword });
    assert.equal(changed.status, 200, await changed.clone().text());
    const changedCookie = cookieOf(changed);
    assert.equal((await sessionBody(changed)).user?.mustChangePassword, false);
    assert.equal((await sessionBody(await request("/api/participant-auth/me", temporary.cookie))).user, null);
    assert.equal((await request("/api/participant-registrations", changedCookie)).status, 200);
    assert.equal((await login("synthetic-team-alpha", generated.temporaryPassword)).response.status, 401);
    assert.equal((await login("synthetic-team-alpha", newPassword)).response.status, 200);
    // An expired temporary password cannot create or use a session.
    const again = ResetRegistrationPasswordResponse.parse(await (await request(endpoint, admin, confirmation)).json());
    await db.update(accounts).set({ temporaryPasswordExpiresAt: new Date(Date.now() - 1000) }).where(eq(accounts.id, accountA));
    assert.equal((await login("synthetic-team-alpha", again.temporaryPassword)).response.status, 401);
    assert.deepEqual(await db.select().from(registrations), before, "Reset must not alter team records");
    const [stored] = await db.select().from(accounts).where(eq(accounts.id, accountA));
    assert.ok(stored.passwordHash.startsWith("scrypt-v1$"));
    assert.ok(!stored.passwordHash.includes(again.temporaryPassword));
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await postgres.close();
  }
});
