import { Router, type IRouter } from "express";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import {
  db, teamRegistrationsTable as registrations, teamRegistrationMembersTable as members,
  registrationUploadsTable as uploads, registrationNotificationsTable as notifications,
} from "@workspace/db";
import {
  GetAdminAccessResponse, ListAdminRegistrationsQueryParams, ListAdminRegistrationsResponse,
  GetAdminRegistrationParams, GetAdminRegistrationResponse, RetryRegistrationEmailParams,
  DownloadAdminRegistrationDocumentParams, RetryRegistrationEmailResponse,
  BackfillRegistrationSpreadsheetResponse,
} from "@workspace/api-zod";
import { isTreasureAdmin } from "../lib/adminAccess";
import { notificationSetup, processRegistrationNotifications } from "../lib/registrationNotifications";
import { registrationStorage, streamFile } from "./storage";
import { sameSiteRequest } from "../lib/participantAuth";
import { queueExistingRegistrationSpreadsheets } from "../lib/registrationSpreadsheetBackfill";
import { processRegistrationSpreadsheetSync } from "../lib/registrationSpreadsheetSync";

const router: IRouter = Router();

router.use("/admin", (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (!sameSiteRequest(req)) { res.status(403).json({ error: "This action must be performed from the organizer dashboard." }); return; }
  next();
});

router.get("/admin/access", (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (!req.organizer) { res.status(401).json({ error: "Please sign in." }); return; }
  res.json(GetAdminAccessResponse.parse({ isAdmin: isTreasureAdmin(req) }));
});

router.use("/admin", (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (!req.organizer) { res.status(401).json({ error: "Please sign in." }); return; }
  if (!isTreasureAdmin(req)) { res.status(403).json({ error: "This dashboard is restricted to authorized organizers." }); return; }
  next();
});

router.post("/admin/spreadsheet-sync/backfill", async (req, res) => {
  if (process.env.RUNTIME_HOST !== "cpanel") {
    res.status(503).json({ error: "Queue existing registrations from the live IDwebhost organizer dashboard, not the Replit preview." });
    return;
  }
  try {
    const result = await queueExistingRegistrationSpreadsheets();
    res.status(202).json(BackfillRegistrationSpreadsheetResponse.parse(result));
    void processRegistrationSpreadsheetSync();
  } catch {
    req.log.error("Unable to queue existing registrations for Google Sheets");
    res.status(500).json({ error: "Registrations could not be queued. It is safe to try again." });
  }
});

const projection = {
  id: registrations.id,
  referenceCode: registrations.referenceCode,
  teamName: registrations.teamName,
  institution: registrations.institution,
  countryOfOrigin: registrations.countryOfOrigin,
  competition: registrations.competition,
  createdAt: registrations.createdAt,
  // Explicit qualification prevents Drizzle's single-table selection optimization
  // from resolving the outer UUID against a subquery's own integer "id".
  captainName: sql<string>`COALESCE((SELECT full_name FROM team_registration_members WHERE registration_id = "team_registrations"."id" ORDER BY position LIMIT 1), ${registrations.teamName})`,
  memberCount: sql<number>`(SELECT count(*)::integer FROM team_registration_members WHERE registration_id = "team_registrations"."id")`,
  notificationStatus: sql<string>`COALESCE((SELECT status FROM registration_notifications WHERE registration_id = "team_registrations"."id"), 'not_requested')`,
};

router.get("/admin/registrations", async (req, res) => {
  const parsed = ListAdminRegistrationsQueryParams.safeParse(req.query);
  if (!parsed.success || parsed.data.page > 100_000) {
    res.status(400).json({ error: "Invalid page or search." }); return;
  }
  const { page, search } = parsed.data;
  const pageSize = 20;
  const term = search?.trim();
  const pattern = `%${term?.replace(/[\\%_]/g, "\\$&") ?? ""}%`;
  const where = term ? sql`(
    ${registrations.referenceCode} ILIKE ${pattern} OR ${registrations.teamName} ILIKE ${pattern}
    OR ${registrations.institution} ILIKE ${pattern}
    OR EXISTS (SELECT 1 FROM team_registration_members WHERE registration_id = "team_registrations"."id" AND full_name ILIKE ${pattern})
  )` : undefined;
  try {
    const [items, [total]] = await Promise.all([
      db.select(projection).from(registrations).where(where)
        .orderBy(desc(registrations.createdAt), desc(registrations.id)).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(*)::integer` }).from(registrations).where(where),
    ]);
    res.json(ListAdminRegistrationsResponse.parse({
      items: items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
      total: total.count, page, pageSize, notificationSetup: notificationSetup(),
    }));
  } catch {
    req.log.error("Unable to list registrations for the organizer dashboard");
    res.status(500).json({ error: "Registrations could not be loaded. Please retry." });
  }
});

router.get("/admin/registrations/:id", async (req, res) => {
  const parsed = GetAdminRegistrationParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid registration reference." }); return; }
  try {
    const id = parsed.data.id;
    const [registration] = await db.select(projection).from(registrations).where(eq(registrations.id, id)).limit(1);
    if (!registration) { res.status(404).json({ error: "Registration not found." }); return; }
    const [[contact], team, documents, [notification]] = await Promise.all([
      db.select({
        email: registrations.contactEmail, phone: registrations.contactPhone,
        alternativePhone: registrations.alternativePhone, facultyDepartment: registrations.facultyDepartment,
        hasEdugateTraining: registrations.hasEdugateTraining,
      }).from(registrations).where(eq(registrations.id, id)).limit(1),
      db.select({ position: members.position, fullName: members.fullName }).from(members)
        .where(eq(members.registrationId, id)).orderBy(members.position),
      db.select().from(uploads).where(eq(uploads.registrationId, id)),
      db.select().from(notifications).where(eq(notifications.registrationId, id)).limit(1),
    ]);
    res.json(GetAdminRegistrationResponse.parse({
      registration: { ...registration, createdAt: registration.createdAt.toISOString() },
      contact, members: team,
      documents: documents.map((document) => ({
        id: document.id, purpose: document.purpose, fileName: document.fileName,
        contentType: document.contentType, size: document.fileSize,
        url: `/api/admin/registrations/${id}/documents/${document.id}`,
      })),
      notification: {
        status: notification?.status ?? "not_requested", attempts: notification?.attempts ?? 0,
        sentAt: notification?.sentAt?.toISOString() ?? null, lastError: notification?.lastError ?? null,
        nextAttemptAt: notification && notification.status !== "sent" ? notification.nextAttemptAt.toISOString() : null,
      },
    }));
  } catch {
    req.log.error("Unable to load a private registration detail");
    res.status(500).json({ error: "Registration details could not be loaded. Please retry." });
  }
});

router.post("/admin/registrations/:id/retry-email", async (req, res) => {
  const parsed = RetryRegistrationEmailParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid registration reference." }); return; }
  try {
    const id = parsed.data.id;
    const [registration] = await db.select({ id: registrations.id }).from(registrations).where(eq(registrations.id, id)).limit(1);
    if (!registration) { res.status(404).json({ error: "Registration not found." }); return; }
    const [job] = await db.insert(notifications).values({ registrationId: id })
      .onConflictDoUpdate({
        target: notifications.registrationId,
        set: { status: "pending", nextAttemptAt: new Date(), lastError: null, lockedAt: null },
        setWhere: and(ne(notifications.status, "sent"), ne(notifications.status, "processing"), ne(notifications.status, "pending")),
      }).returning({ status: notifications.status });
    if (!job) { res.status(409).json({ error: "This notification is already sent or being processed." }); return; }
    res.status(202).json(RetryRegistrationEmailResponse.parse({ status: job.status }));
    void processRegistrationNotifications();
  } catch {
    req.log.error("Unable to queue a registration notification retry");
    res.status(500).json({ error: "The email could not be queued. Please retry." });
  }
});

router.get("/admin/registrations/:id/documents/:uploadId", async (req, res) => {
  const parsed = DownloadAdminRegistrationDocumentParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid document reference." }); return; }
  try {
    const [document] = await db.select().from(uploads).where(and(
      eq(uploads.id, parsed.data.uploadId), eq(uploads.registrationId, parsed.data.id),
    )).limit(1);
    if (!document) { res.status(404).json({ error: "Document not found." }); return; }
    const file = await registrationStorage.getObjectEntityFile(document.objectPath);
    await streamFile(await registrationStorage.downloadObject(file, 0), res, true);
  } catch {
    res.status(404).json({ error: "Document not found." });
  }
});

export default router;
