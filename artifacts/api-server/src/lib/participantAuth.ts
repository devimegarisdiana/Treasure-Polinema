import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { type Request, type Response } from "express";
import { db, participantAccountsTable as accounts, participantSessionsTable as sessions, participantAuthLimitsTable as limits } from "@workspace/db";

export interface ParticipantIdentity { id: string; username: string; email: string }
export const PARTICIPANT_COOKIE = "treasure_participant_session";
const SESSION_TTL = 7 * 24 * 60 * 60_000;
const KDF = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
let hashing = 0;
let lastCleanup = 0;

export class AuthBusyError extends Error {}
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
export function cookieOptions(req: Request) {
  return {
    httpOnly: true, sameSite: "lax" as const, path: "/",
    secure: req.secure || req.get("x-forwarded-proto")?.split(",")[0] === "https" || process.env.NODE_ENV === "production",
  };
}
export function clearParticipantCookie(req: Request, res: Response) {
  res.clearCookie(PARTICIPANT_COOKIE, cookieOptions(req));
}
export function participantToken(req: Request): string | null {
  const value: unknown = req.cookies?.[PARTICIPANT_COOKIE];
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export function sameSiteRequest(req: Request): boolean {
  if (req.get("sec-fetch-site") === "cross-site") return false;
  const origin = req.get("origin");
  if (!origin) return true;
  try {
    const expected = new URL(process.env.PUBLIC_APP_ORIGIN || `${cookieOptions(req).secure ? "https" : "http"}://${req.get("host")}`);
    return new URL(origin).origin === expected.origin;
  } catch { return false; }
}
export function registrationOwner(req: Request): string | null {
  // Namespaced participant IDs cannot collide with existing Replit identities.
  return req.participant?.id ?? (req.isAuthenticated() ? req.user.id : null);
}

async function derive(password: string, salt: string): Promise<Buffer> {
  if (hashing >= 4) throw new AuthBusyError("Authentication is busy. Please retry shortly.");
  hashing++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 64, KDF, (error, key) => error ? reject(error) : resolve(key));
    });
  } finally { hashing--; }
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt);
  return `scrypt-v1$${salt}$${key.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded?: string): Promise<boolean> {
  // Equal work for a missing account avoids exposing which usernames exist.
  const [version, salt, key] = (encoded ?? `scrypt-v1$${"0".repeat(32)}$${"0".repeat(128)}`).split("$");
  const actual = await derive(password, salt ?? "0".repeat(32));
  if (version !== "scrypt-v1" || !/^[a-f0-9]{128}$/.test(key ?? "")) return false;
  return timingSafeEqual(actual, Buffer.from(key, "hex")) && !!encoded;
}

export async function loadParticipant(req: Request): Promise<ParticipantIdentity | null> {
  const token = participantToken(req);
  if (!token) return null;
  const [row] = await db.select({ id: accounts.id, username: accounts.username, email: accounts.email })
    .from(sessions).innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .where(and(eq(sessions.tokenHash, tokenHash(token)), gt(sessions.expiresAt, new Date()))).limit(1);
  return row ? { ...row, id: `participant:${row.id}` } : null;
}
export function newParticipantSession(accountId: string) {
  const token = randomBytes(32).toString("hex");
  return { token, row: { tokenHash: tokenHash(token), accountId, expiresAt: new Date(Date.now() + SESSION_TTL) } };
}
export function setParticipantCookie(req: Request, res: Response, token: string) {
  res.cookie(PARTICIPANT_COOKIE, token, { ...cookieOptions(req), maxAge: SESSION_TTL });
}

export async function limitAuthentication(req: Request, identifier: string): Promise<boolean> {
  if (Date.now() - lastCleanup > 60 * 60_000) {
    lastCleanup = Date.now();
    await db.delete(limits).where(lt(limits.windowStart, new Date(Date.now() - 24 * 60 * 60_000)));
    await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  }
  // Persistent atomic counters apply across replicas, not just this process.
  for (const [key, maximum] of [
    [`ip:${req.ip ?? req.socket.remoteAddress ?? "unknown"}`, 600],
    [`identity:${identifier.toLowerCase()}`, 10],
  ] as const) {
    const result = await db.execute(sql`
      INSERT INTO participant_auth_limits (key, window_start, count)
      VALUES (${tokenHash(key)}, now(), 1)
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN participant_auth_limits.window_start < now() - interval '15 minutes'
          THEN 1 ELSE participant_auth_limits.count + 1 END,
        window_start = CASE WHEN participant_auth_limits.window_start < now() - interval '15 minutes'
          THEN now() ELSE participant_auth_limits.window_start END
      RETURNING count
    `);
    if (Number(result.rows[0]?.count) > maximum) return false;
  }
  return true;
}
