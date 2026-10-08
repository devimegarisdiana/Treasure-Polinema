import type { Request } from "express";

export function isTreasureAdmin(req: Request): boolean {
  // Only the designated, server-provisioned native organizer session grants access.
  // Participant emails, participant usernames, and legacy Replit identities do not.
  return !!req.organizer;
}
