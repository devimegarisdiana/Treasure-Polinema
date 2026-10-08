import type { NextFunction, Request, Response } from "express";
import { clearOrganizerCookie, loadOrganizer, ORGANIZER_COOKIE, type OrganizerIdentity } from "../lib/organizerAuth";

declare global {
  namespace Express {
    interface Request { organizer?: OrganizerIdentity }
  }
}

export async function organizerMiddleware(req: Request, res: Response, next: NextFunction) {
  // Revocation must still work if organizer provisioning temporarily fails.
  if (req.path === "/signout") { next(); return; }
  if (!req.cookies?.[ORGANIZER_COOKIE]) { next(); return; }
  try {
    req.organizer = await loadOrganizer(req) ?? undefined;
    if (!req.organizer) clearOrganizerCookie(req, res);
    next();
  } catch {
    req.log.error("Organizer session could not be verified");
    res.status(503).json({ error: "Organizer sign-in is temporarily unavailable. Please retry shortly." });
  }
}
