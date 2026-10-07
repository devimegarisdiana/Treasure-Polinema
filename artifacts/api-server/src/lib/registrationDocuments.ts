import { randomUUID } from "node:crypto";
import type { registrationUploadsTable } from "@workspace/db";
import type { File } from "@google-cloud/storage";
import { ObjectNotFoundError, ObjectStorageService } from "./objectStorage";
import { setObjectAclPolicy } from "./objectAcl";

const storage = new ObjectStorageService();
export class RegistrationDocumentError extends Error {}

function validSignature(type: string, data: Buffer): boolean {
  if (type === "application/pdf") return data.subarray(0, 5).toString() === "%PDF-";
  if (type === "image/jpeg") return data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (type === "image/png") return data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return type === "image/webp" && data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP";
}

export interface FrozenDocument {
  objectPath: string;
  file: File;
  source: File;
}

export async function freezeDocument(
  upload: typeof registrationUploadsTable.$inferSelect,
): Promise<FrozenDocument> {
  let source: File;
  try {
    source = await storage.getObjectEntityFile(upload.objectPath);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      throw new RegistrationDocumentError("Unggahan dokumen belum selesai. Pilih dan unggah kembali file.");
    }
    throw error;
  }
  const [metadata] = await source.getMetadata();
  // Validate a specific generation, not a file that an active PUT URL can replace.
  const pinned = source.bucket.file(source.name, { generation: metadata.generation });
  const [signature] = await pinned.download({ start: 0, end: 11 });
  if (
    Number(metadata.size) !== upload.fileSize ||
    metadata.contentType !== upload.contentType ||
    !validSignature(upload.contentType, signature)
  ) {
    throw new RegistrationDocumentError("Dokumen tidak sesuai format atau ukuran unggahan. Unggah kembali JPG, PNG, WebP, atau PDF yang valid.");
  }
  const id = randomUUID();
  const prefix = storage.getPrivateObjectDir().split("/").filter(Boolean).slice(1).join("/");
  const destination = source.bucket.file(`${prefix}/registration-documents/${id}`);
  try {
    await pinned.copy(destination);
    await setObjectAclPolicy(destination, { owner: upload.ownerId, visibility: "private" });
  } catch (error) {
    await destination.delete({ ignoreNotFound: true }).catch(() => {});
    throw error;
  }
  return { objectPath: `/objects/registration-documents/${id}`, file: destination, source };
}
