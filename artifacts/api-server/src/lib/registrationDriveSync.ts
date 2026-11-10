import { and, eq } from "drizzle-orm";
import { db, registrationUploadsTable as uploads } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";

export async function spreadsheetRequest(payload: object) {
  const endpoint = process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim();
  const token = process.env.GOOGLE_SHEETS_SYNC_TOKEN;
  if (!endpoint || !token) throw new Error("Spreadsheet sync is not configured.");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.hostname !== "script.google.com" || !url.pathname.endsWith("/exec")) {
    throw new Error("Spreadsheet endpoint must be an approved Apps Script URL.");
  }
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, token }), signal: AbortSignal.timeout(60_000),
  });
  const result = await response.json().catch(() => null) as { ok?: boolean; fileId?: string; url?: string } | null;
  if (!response.ok || result?.ok !== true) throw new Error("The spreadsheet or private Drive rejected the update.");
  return result;
}

export async function syncPrivateDriveDocuments(registrationId: string, referenceCode: string) {
  const files = await db.select().from(uploads).where(eq(uploads.registrationId, registrationId));
  const storage = new ObjectStorageService();
  const links: Array<{ uploadId: string; purpose: string; memberPosition: number | null; url: string }> = [];
  for (const document of files) {
    let url = document.driveFileUrl;
    if (!url || !document.driveFileId) {
      const file = await storage.getObjectEntityFile(document.objectPath);
      const [bytes] = await file.download();
      if (bytes.length > 10 * 1024 * 1024 || bytes.length !== document.fileSize) throw new Error("Invalid private document size.");
      const result = await spreadsheetRequest({
        action: "upload_document", referenceCode,
        document: { uploadId: document.id, fileName: document.fileName, contentType: document.contentType,
          size: bytes.length, base64: bytes.toString("base64") },
      });
      if (!result.fileId || !/^[A-Za-z0-9_-]+$/.test(result.fileId) ||
          result.url !== `https://drive.google.com/file/d/${result.fileId}/view`) throw new Error("Invalid private Drive response.");
      url = result.url;
      await db.update(uploads).set({ driveFileId: result.fileId, driveFileUrl: url })
        .where(and(eq(uploads.id, document.id), eq(uploads.registrationId, registrationId)));
    }
    links.push({ uploadId: document.id, purpose: document.purpose, memberPosition: document.memberPosition, url });
  }
  return links;
}
