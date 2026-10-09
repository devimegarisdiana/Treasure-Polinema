import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile, lstat, realpath, unlink, link, rename } from "node:fs/promises";
import path from "node:path";

export const localStorageEnabled = () => process.env.STORAGE_BACKEND === "local";

export function privateStorageRoot(): string {
  const root = process.env.PRIVATE_STORAGE_ROOT;
  if (!root || !path.isAbsolute(root)) throw new Error("Configure an absolute PRIVATE_STORAGE_ROOT outside the website.");
  const resolved = path.resolve(root);
  const site = path.resolve(process.env.STATIC_SITE_DIR || process.cwd());
  if (resolved === "/" || resolved === site || resolved.startsWith(`${site}/`) ||
      resolved.split(path.sep).some(part => part.toLowerCase() === "public_html")) {
    throw new Error("Private documents must be stored outside the public website.");
  }
  return resolved;
}

export function localUploadOrigin(): string {
  const value = process.env.PUBLIC_APP_ORIGIN;
  if (!value) throw new Error("Configure PUBLIC_APP_ORIGIN for local uploads.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("PUBLIC_APP_ORIGIN must be an HTTPS origin without a path.");
  }
  return url.origin;
}

function uploadSignature(id: string, expires: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Configure a SESSION_SECRET of at least 32 characters.");
  return createHmac("sha256", secret).update(`treasure-upload-v1:${id}:${expires}`).digest("hex");
}

export function createLocalUploadUrl(): string {
  const id = randomUUID();
  const expires = String(Math.floor(Date.now() / 1000) + 900);
  return `${localUploadOrigin()}/api/storage/local-uploads/${id}?expires=${expires}&signature=${uploadSignature(id, expires)}`;
}

export function validLocalUploadSignature(id: string, expires: unknown, signature: unknown): boolean {
  if (!/^[a-f0-9-]{36}$/.test(id) || typeof expires !== "string" || !/^\d{10}$/.test(expires) ||
      typeof signature !== "string" || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Number(expires) < now || Number(expires) > now + 900) return false;
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(uploadSignature(id, expires), "hex"));
}

interface LocalMetadata {
  contentType: string;
  size: string;
  generation: string;
  metadata?: Record<string, string>;
}

// Implements just the file operations used by TREASURE, with immutable uploads.
// Data and metadata are never placed under Express's static website directory.
export class LocalFile {
  readonly bucket = localBucket;
  constructor(readonly name: string, private readonly generation?: string | number) {
    if (!/^private\/(uploads|registration-documents)\/[a-f0-9-]{36}$/.test(name)) {
      throw new Error("Invalid private object path.");
    }
  }

  private async filePath(metadata = false, create = false): Promise<string> {
    const root = privateStorageRoot();
    const target = path.join(root, metadata ? ".metadata" : "", `${this.name}${metadata ? ".json" : ""}`);
    if (create) {
      await mkdir(root, { recursive: true, mode: 0o700 });
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    }
    const canonicalRoot = await realpath(root);
    if ((await lstat(root)).isSymbolicLink()) throw new Error("Private storage root cannot be a symbolic link.");
    const canonicalParent = await realpath(path.dirname(target));
    if (!canonicalParent.startsWith(`${canonicalRoot}/`)) throw new Error("Unsafe private storage path.");
    try {
      const stat = await lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Unsafe private storage file.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return target;
  }

  async exists(): Promise<[boolean]> {
    try { await lstat(await this.filePath()); return [true]; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [false];
      throw error;
    }
  }

  async getMetadata(): Promise<[LocalMetadata]> {
    await this.filePath();
    const metadata = JSON.parse(await readFile(await this.filePath(true), "utf8")) as LocalMetadata;
    if (this.generation !== undefined && String(this.generation) !== metadata.generation) {
      throw new Error("Private object generation changed.");
    }
    return [metadata];
  }

  async setMetadata(value: { metadata?: Record<string, string> }): Promise<void> {
    const [metadata] = await this.getMetadata();
    await this.writeMetadata({ ...metadata, ...value });
  }

  private async writeMetadata(metadata: LocalMetadata, createOnly = false) {
    const destination = await this.filePath(true, true);
    const temporary = `${destination}.${randomUUID()}.partial`;
    try {
      await writeFile(temporary, JSON.stringify(metadata), { flag: "wx", mode: 0o600 });
      if (createOnly) await link(temporary, destination);
      else await rename(temporary, destination);
    } finally { await unlink(temporary).catch(() => {}); }
  }

  async save(data: Buffer, contentType: string, customMetadata?: Record<string, string>): Promise<void> {
    const destination = await this.filePath(false, true);
    const temporary = `${destination}.${randomUUID()}.partial`;
    try {
      await writeFile(temporary, data, { flag: "wx", mode: 0o600 });
      // link(), unlike rename(), cannot replace an existing uploaded document.
      await link(temporary, destination);
      const metadata: LocalMetadata = {
        contentType, size: String(data.length), generation: createHash("sha256").update(data).digest("hex"), metadata: customMetadata,
      };
      try {
        await this.writeMetadata(metadata, true);
      } catch (error) {
        await unlink(destination);
        throw error;
      }
    } finally { await unlink(temporary).catch(() => {}); }
  }

  async restoreFromBackup(data: Buffer, contentType: string, owner: string): Promise<void> {
    const policy = { "custom:aclPolicy": JSON.stringify({ owner, visibility: "private" }) };
    if (!(await this.exists())[0]) { await this.save(data, contentType, policy); return; }
    // A process can stop after publishing bytes but before publishing metadata.
    // Recover only when a verified encrypted backup proves the bytes are identical.
    const bytes = await readFile(await this.filePath());
    const generation = createHash("sha256").update(bytes).digest("hex");
    if (generation !== createHash("sha256").update(data).digest("hex")) throw new Error("Destination document conflicts with the backup.");
    let metadata: LocalMetadata | undefined;
    try { [metadata] = await this.getMetadata(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (metadata && (metadata.generation !== generation || metadata.contentType !== contentType || Number(metadata.size) !== bytes.length)) {
      throw new Error("Destination document metadata conflicts with the backup.");
    }
    const acl = metadata?.metadata?.["custom:aclPolicy"];
    if (acl) {
      const parsed = JSON.parse(acl) as { owner?: string; visibility?: string };
      if (parsed.owner !== owner || parsed.visibility !== "private") throw new Error("Destination document permissions conflict with the backup.");
    }
    if (!metadata || !acl) await this.writeMetadata({ contentType, size: String(bytes.length), generation, metadata: policy });
  }

  async download(options?: { start?: number; end?: number }): Promise<[Buffer]> {
    const [metadata] = await this.getMetadata();
    const data = await readFile(await this.filePath());
    if (createHash("sha256").update(data).digest("hex") !== metadata.generation) {
      throw new Error("Private object checksum mismatch.");
    }
    return [options ? data.subarray(options.start ?? 0, options.end === undefined ? undefined : options.end + 1) : data];
  }

  createReadStream() { return createReadStream(path.join(privateStorageRoot(), this.name)); }

  async copy(destination: LocalFile): Promise<void> {
    const [metadata] = await this.getMetadata();
    const [data] = await this.download();
    await destination.save(data, metadata.contentType);
  }

  async delete(options?: { ignoreNotFound?: boolean }): Promise<void> {
    for (const metadata of [false, true]) {
      try { await unlink(await this.filePath(metadata)); }
      catch (error) {
        if (!options?.ignoreNotFound || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}

const localBucket = {
  file(name: string, options?: { generation?: string | number }) {
    return new LocalFile(name, options?.generation);
  },
};
