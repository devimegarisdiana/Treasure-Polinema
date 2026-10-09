import { Readable } from "node:stream";
import { Router, raw as rawBody, type IRouter, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, registrationUploadsTable } from "@workspace/db";
import { RequestUploadUrlBody, RequestUploadUrlResponse } from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";
import { registrationOwner, sameSiteRequest } from "../lib/participantAuth";
import { LocalFile, localStorageEnabled, validLocalUploadSignature } from "../lib/localObjectStorage";

export const registrationStorage = new ObjectStorageService();
const router: IRouter = Router();

// Signed upload transport: the frontend uses the existing uploadURL contract.
router.put("/storage/local-uploads/:id", async (req, res, next): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  if (!localStorageEnabled()) { res.sendStatus(404); return; }
  if (!sameSiteRequest(req)) { res.sendStatus(403); return; }
  const ownerId = registrationOwner(req);
  if (!ownerId) { res.status(401).json({ error: "Login required" }); return; }
  try {
    if (!validLocalUploadSignature(String(req.params.id), req.query.expires, req.query.signature)) {
      res.status(403).json({ error: "The upload link expired. Please select the file again." }); return;
    }
    const [upload] = await db.select().from(registrationUploadsTable).where(and(
      eq(registrationUploadsTable.objectPath, `/objects/uploads/${req.params.id}`),
      eq(registrationUploadsTable.ownerId, ownerId),
    )).limit(1);
    if (!upload || upload.registrationId || req.get("content-type") !== upload.contentType) {
      res.status(400).json({ error: "The document does not match this upload." }); return;
    }
    res.locals.upload = upload;
    next();
  } catch {
    req.log.error("Unable to authorize a local document upload");
    res.status(500).json({ error: "The upload could not be authorized." });
  }
}, rawBody({ type: ["application/pdf", "image/jpeg", "image/png", "image/webp"], limit: "10mb" }),
async (req, res): Promise<void> => {
  const upload = res.locals.upload as typeof registrationUploadsTable.$inferSelect;
  if (!Buffer.isBuffer(req.body) || req.body.length !== upload.fileSize) {
    res.status(400).json({ error: "The document size does not match this upload." }); return;
  }
  try {
    await new LocalFile(`private/uploads/${req.params.id}`).save(req.body, upload.contentType);
    res.sendStatus(200);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      res.status(409).json({ error: "This upload has already been used. Please select the file again." }); return;
    }
    req.log.error("Unable to save a private document");
    res.status(500).json({ error: "The document could not be saved. Please try again." });
  }
});

router.post("/storage/uploads/request-url", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  if (!sameSiteRequest(req)) { res.status(403).json({ error: "Please use the TREASURE registration page." }); return; }
  const ownerId = registrationOwner(req);
  if (!ownerId) {
    res.status(401).json({ error: "Please sign in before uploading documents." });
    return;
  }
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Use JPG, PNG, WebP, or PDF files, up to 10 MB per file." });
    return;
  }
  try {
    const data = parsed.data;
    const uploadURL = await registrationStorage.getObjectEntityUploadURL();
    const [upload] = await db.insert(registrationUploadsTable).values({
      ownerId,
      submissionKey: data.submissionKey,
      purpose: data.purpose,
      objectPath: registrationStorage.normalizeObjectEntityPath(uploadURL),
      fileName: data.name,
      contentType: data.contentType,
      fileSize: data.size,
    }).returning({ id: registrationUploadsTable.id });
    res.json(RequestUploadUrlResponse.parse({ uploadId: upload.id, uploadURL }));
  } catch {
    req.log.error("Unable to create registration document upload");
    res.status(500).json({ error: "The upload could not be started. Please try again." });
  }
});

export async function streamFile(response: globalThis.Response, res: Response, privateDocument = false) {
  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (privateDocument) {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", "attachment");
  }
  if (response.body) {
    Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
  } else res.end();
}

router.get("/storage/public-objects/*filePath", async (req, res): Promise<void> => {
  try {
    const raw = req.params.filePath;
    const file = await registrationStorage.searchPublicObject(Array.isArray(raw) ? raw.join("/") : raw);
    if (!file) { res.status(404).json({ error: "File not found" }); return; }
    await streamFile(await registrationStorage.downloadObject(file), res);
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

router.get("/storage/objects/*path", async (req, res): Promise<void> => {
  if (!sameSiteRequest(req)) { res.status(403).json({ error: "Please use the TREASURE registration page." }); return; }
  const ownerId = registrationOwner(req);
  if (!ownerId) { res.status(401).json({ error: "Login required" }); return; }
  const raw = req.params.path;
  const objectPath = `/objects/${Array.isArray(raw) ? raw.join("/") : raw}`;
  const [upload] = await db.select().from(registrationUploadsTable).where(and(
    eq(registrationUploadsTable.objectPath, objectPath),
    eq(registrationUploadsTable.ownerId, ownerId),
  )).limit(1);
  if (!upload) { res.status(404).json({ error: "File not found" }); return; }
  try {
    const file = await registrationStorage.getObjectEntityFile(upload.objectPath);
    const response = await registrationStorage.downloadObject(file, 0);
    // Private documents are never cached or displayed as executable content.
    await streamFile(response, res, true);
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

export default router;
