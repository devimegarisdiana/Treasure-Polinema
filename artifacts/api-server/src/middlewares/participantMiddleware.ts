import type { Request, Response, NextFunction } from "express";
import { clearParticipantCookie, loadParticipant, PARTICIPANT_COOKIE, type ParticipantIdentity } from "../lib/participantAuth";

declare global {
  namespace Express {
    interface Request { participant?: ParticipantIdentity }
  }
}

export async function participantMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.cookies?.[PARTICIPANT_COOKIE]) { next(); return; }
  try {
    req.participant = await loadParticipant(req) ?? undefined;
    if (!req.participant) clearParticipantCookie(req, res);
    if (req.participant?.mustChangePassword && /^\/api\/(?:participant-registrations|registrations|storage)(?:\/|$)/.test(req.path)) {
      res.setHeader("Cache-Control", "private, no-store");
      res.status(403).json({ error: "Change your temporary password before accessing registration data.", code: "PASSWORD_CHANGE_REQUIRED" });
      return;
    }
    next();
  } catch {
    req.log.error("Participant session could not be verified");
    res.status(503).json({ error: "Your session could not be verified. Please retry shortly." });
  }
}
