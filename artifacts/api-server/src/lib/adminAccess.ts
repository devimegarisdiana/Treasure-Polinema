import type { Request } from "express";

export function isTreasureAdmin(req: Request): boolean {
  if (!req.isAuthenticated()) return false;
  const email = req.user.email?.trim().toLowerCase();
  if (!email) return false;
  // Identity comes from the validated Replit OIDC session, never request input.
  const allowed = (process.env.TREASURE_ADMIN_EMAILS ?? "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email);
}
