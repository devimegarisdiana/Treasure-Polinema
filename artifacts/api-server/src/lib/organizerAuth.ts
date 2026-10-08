import { randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Request, Response } from "express";
import { db, organizerAccountsTable as accounts, organizerSessionsTable as sessions } from "@workspace/db";
import { cookieOptions, hashPassword, tokenHash, verifyPassword } from "./participantAuth";

export interface OrganizerIdentity { id: string; username: string }
export const ORGANIZER_COOKIE = "treasure_organizer_session";
const SESSION_TTL = 8 * 60 * 60_000;
type Account = typeof accounts.$inferSelect;
export class OrganizerSetupError extends Error {}
let configuredAccount: Promise<Account> | undefined;

// Runtime-only secret use: never return or log credentials. Changing either secret
// and restarting revokes the previous credential's authority, including on replicas.
export function organizerAccount(): Promise<Account> {
  if (!configuredAccount) {
    configuredAccount = initializeAccount().catch((error) => {
      configuredAccount = undefined;
      throw error;
    });
  }
  return configuredAccount;
}

async function initializeAccount(): Promise<Account> {
  const username = process.env.TREASURE_ORGANIZER_USERNAME?.trim().toLowerCase();
  const password = process.env.TREASURE_ORGANIZER_PASSWORD;
  if (!username || username.length > 100) throw new OrganizerSetupError("Set an organizer username of 1–100 characters in the secure settings.");
  if (!password || password.length < 12 || password.length > 128) {
    throw new OrganizerSetupError("Set an organizer password of 12–128 characters in the secure settings.");
  }
  const [existing] = await db.select().from(accounts).where(eq(accounts.username, username)).limit(1);
  // Avoid rehashing and invalidating sessions on ordinary process restarts.
  if (existing && await verifyPassword(password, existing.passwordHash)) return existing;
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    await tx.insert(accounts).values({ username, passwordHash }).onConflictDoNothing();
    const [account] = await tx.select().from(accounts).where(eq(accounts.username, username)).for("update").limit(1);
    if (!account) throw new Error("Organizer setup unavailable.");
    if (!await verifyPassword(password, account.passwordHash)) {
      await tx.delete(sessions).where(eq(sessions.accountId, account.id));
      const [updated] = await tx.update(accounts).set({ passwordHash })
        .where(eq(accounts.id, account.id)).returning();
      return updated;
    }
    return account;
  });
}

export function organizerToken(req: Request): string | null {
  const token: unknown = req.cookies?.[ORGANIZER_COOKIE];
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export function clearOrganizerCookie(req: Request, res: Response) {
  res.clearCookie(ORGANIZER_COOKIE, cookieOptions(req));
}
export function setOrganizerCookie(req: Request, res: Response, token: string) {
  res.cookie(ORGANIZER_COOKIE, token, { ...cookieOptions(req), maxAge: SESSION_TTL });
}

export async function loadOrganizer(req: Request): Promise<OrganizerIdentity | null> {
  const token = organizerToken(req);
  if (!token) return null;
  const account = await organizerAccount();
  const [session] = await db.select({ id: accounts.id, username: accounts.username })
    .from(sessions).innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .where(and(
      eq(sessions.tokenHash, tokenHash(token)),
      eq(sessions.accountId, account.id),
      eq(accounts.passwordHash, account.passwordHash),
      gt(sessions.expiresAt, new Date()),
    )).limit(1);
  return session ? { id: `organizer:${session.id}`, username: session.username } : null;
}

export async function createOrganizerSession(req: Request, account: Account): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await db.transaction(async (tx) => {
    const [current] = await tx.select({ hash: accounts.passwordHash }).from(accounts)
      .where(eq(accounts.id, account.id)).for("update").limit(1);
    if (current?.hash !== account.passwordHash) throw new Error("Organizer credentials changed. Restart required.");
    const oldToken = organizerToken(req);
    if (oldToken) await tx.delete(sessions).where(eq(sessions.tokenHash, tokenHash(oldToken)));
    await tx.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    await tx.insert(sessions).values({
      tokenHash: tokenHash(token), accountId: account.id, expiresAt: new Date(Date.now() + SESSION_TTL),
    });
  });
  return token;
}
