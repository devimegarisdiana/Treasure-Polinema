import { Readable } from "node:stream";
import { Router, type IRouter, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, registrationUploadsTable } from "@workspace/db";
import { RequestUploadUrlBody, RequestUploadUrlResponse } from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";
import { registrationOwner, sameSiteRequest } from "../lib/participantAuth";

export const registrationStorage = new ObjectStorageService();
const router: IRouter = Router();

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
