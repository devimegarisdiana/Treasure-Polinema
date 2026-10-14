import { advisoryLockKey } from "../lib/advisoryLock";
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { pool } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { LocalFile, localStorageEnabled } from "../lib/localObjectStorage";

const TABLES = ["users", "participant_accounts", "organizer_accounts", "team_registrations",
  "team_registration_members", "registration_uploads", "registration_notifications"] as const;
type TableName = typeof TABLES[number];
type Row = Record<string, unknown>;
interface DocumentBackup {
  objectPath: string; contentType: string; size: number; sha256: string; bytes: string; ownerId: string;
}
interface Backup {
  version: 1; createdAt: string; source: "development" | "production"; tables: Record<TableName, Row[]>; documents: DocumentBackup[];
  additionalLegacyProfiles?: Row[];
}
const MAGIC = Buffer.from("TREASURE-BACKUP-1\n");
const MAX_BACKUP_BYTES = 256 * 1024 * 1024;
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("Migration requires a SESSION_SECRET of at least 32 characters.");
  return value;
}
function encrypt(backup: Backup): Buffer {
  const salt = randomBytes(16), iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(secret(), salt, 32), iv);
  const plaintext = Buffer.from(JSON.stringify(backup));
  if (plaintext.length > MAX_BACKUP_BYTES) throw new Error("Backup exceeds the supported size.");
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), data]);
}
function decrypt(data: Buffer): Backup {
  if (!data.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Unrecognized encrypted backup.");
  let offset = MAGIC.length;
  const salt = data.subarray(offset, offset += 16), iv = data.subarray(offset, offset += 12), tag = data.subarray(offset, offset += 16);
  const decipher = createDecipheriv("aes-256-gcm", scryptSync(secret(), salt, 32), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data.subarray(offset)), decipher.final()]).toString()) as Backup;
}
function countSummary(backup: Backup) {
  return Object.fromEntries([...TABLES.map(name => [name, backup.tables[name].length]), ["documents", backup.documents.length],
    ["additional_legacy_profiles", backup.additionalLegacyProfiles?.length || 0]]);
}

export async function exportBackup(output: string, extraProfilesFile?: string): Promise<void> {
  if (localStorageEnabled()) throw new Error("Export the original data inside Replit, not from the destination.");
  const absolute = path.resolve(output);
  const ignored = path.resolve(process.cwd(), "../../tmp");
  if (!absolute.startsWith(`${ignored}/`) || !absolute.endsWith(".treasure-backup")) {
    throw new Error("Write encrypted backups only under the ignored workspace tmp directory.");
  }
  const client = await pool.connect();
  const backup: Backup = {
    version: 1, createdAt: new Date().toISOString(),
    source: process.env.MIGRATION_SOURCE === "production" ? "production" : "development",
    tables: Object.fromEntries(TABLES.map(name => [name, []])) as unknown as Record<TableName, Row[]>,
    documents: [],
  };
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    for (const table of TABLES) {
      const present = await client.query("SELECT to_regclass($1) AS relation", [`public.${table}`]);
      if (!present.rows[0].relation) continue; // Older source releases have no organizer_accounts.
      const where = table === "registration_uploads" ? " WHERE registration_id IS NOT NULL" : "";
      backup.tables[table] = (await client.query(`SELECT * FROM "${table}"${where} ORDER BY id`)).rows as Row[];
    }
    if (extraProfilesFile) {
      // Different source environments can contain conflicting versions of the
      // same identity. Preserve the other source verbatim, without merging by email.
      const extra = JSON.parse(await readFile(extraProfilesFile, "utf8")) as Row[];
      if (!Array.isArray(extra)) throw new Error("Invalid additional legacy profile.");
      const identities = new Set<string>();
      for (const row of extra) {
        if (typeof row.id !== "string" || (row.email !== null && typeof row.email !== "string") || identities.has(row.id)) {
          throw new Error("Invalid additional legacy profile.");
        }
        identities.add(row.id);
      }
      backup.additionalLegacyProfiles = extra;
    }
    const storage = new ObjectStorageService();
    for (const upload of backup.tables.registration_uploads) {
      const objectPath = String(upload.object_path);
      if (!/^\/objects\/registration-documents\/[a-f0-9-]{36}$/.test(objectPath)) {
        throw new Error("A registered document is not frozen. Resolve it before exporting.");
      }
      const file = await storage.getObjectEntityFile(objectPath);
      const [metadata] = await file.getMetadata();
      const [bytes] = await file.download();
      if (bytes.length !== upload.file_size || metadata.contentType !== upload.content_type || bytes.length > 10 * 1024 * 1024) {
        throw new Error("A source document does not match its database record.");
      }
      backup.documents.push({
        objectPath, contentType: String(upload.content_type), size: bytes.length,
        sha256: digest(bytes), bytes: bytes.toString("base64"), ownerId: String(upload.owner_id),
      });
    }
    await client.query("COMMIT");
    await mkdir(path.dirname(absolute), { recursive: true, mode: 0o700 });
    await writeFile(absolute, encrypt(backup), { flag: "wx", mode: 0o600 });
    process.stdout.write(`Encrypted backup created. Counts only: ${JSON.stringify(countSummary(backup))}\n`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); await pool.end(); }
}

export async function restoreBackup(input: string): Promise<void> {
  if (!localStorageEnabled() || process.env.RUNTIME_HOST !== "cpanel" ||
      process.env.NOTIFICATION_WORKER_ENABLED !== "false" || process.env.MIGRATION_READ_ONLY !== "true") {
    throw new Error("Restore is only allowed on the external host with registration and email paused.");
  }
  if ((await stat(input)).size > MAX_BACKUP_BYTES + 100) throw new Error("Backup exceeds the supported size.");
  const encrypted = await readFile(input);
  const backup = decrypt(encrypted);
  if (backup.version !== 1 || !backup.tables || !Array.isArray(backup.documents)) throw new Error("Invalid migration backup.");
  for (const table of TABLES) if (!Array.isArray(backup.tables[table])) throw new Error("Incomplete backup.");
  const additional = backup.additionalLegacyProfiles || [];
  if (!Array.isArray(additional) || additional.some(row => typeof row.id !== "string") ||
      new Set(additional.map(row => row.id)).size !== additional.length) throw new Error("Invalid legacy profile archive.");
  const additionalSource = backup.source === "development" ? "production" : "development";
  const uploads = backup.tables.registration_uploads;
  if (uploads.length !== backup.documents.length) throw new Error("Incomplete private document backup.");
  for (const document of backup.documents) {
    const row = uploads.find(upload => upload.object_path === document.objectPath);
    const bytes = Buffer.from(document.bytes, "base64");
    if (!row || !/^\/objects\/registration-documents\/[a-f0-9-]{36}$/.test(document.objectPath) ||
        bytes.length > 10 * 1024 * 1024 || bytes.length !== document.size || digest(bytes) !== document.sha256 ||
        row.file_size !== document.size || row.content_type !== document.contentType || row.owner_id !== document.ownerId) {
      throw new Error("Private document verification failed.");
    }
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [advisoryLockKey("treasure-external-import")]);
    await client.query(`CREATE TABLE IF NOT EXISTS treasure_migration_receipts (
      backup_hash varchar(64) PRIMARY KEY, counts jsonb NOT NULL, imported_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS treasure_legacy_profile_archive (
      source text NOT NULL, id text NOT NULL, profile jsonb NOT NULL, PRIMARY KEY (source, id)
    )`);
    const existing = await client.query("SELECT backup_hash FROM treasure_migration_receipts WHERE backup_hash = $1", [digest(encrypted)]);
    if (!existing.rowCount) {
      if (Number((await client.query("SELECT count(*) FROM treasure_legacy_profile_archive")).rows[0].count) !== 0) {
        throw new Error("Destination already contains archived profiles. Import refused.");
      }
      for (const table of TABLES) {
        if (Number((await client.query(`SELECT count(*) FROM "${table}"`)).rows[0].count) !== 0) {
          throw new Error("Destination already contains records. Import refused; no existing records were overwritten.");
        }
      }
    }
    // Safe to resume after a rolled-back SQL import: matching files are reused.
    for (const document of backup.documents) {
      const file = new LocalFile(`private/${document.objectPath.slice("/objects/".length)}`);
      await file.restoreFromBackup(Buffer.from(document.bytes, "base64"), document.contentType, document.ownerId);
    }
    if (!existing.rowCount) {
      for (const table of TABLES) {
        const columns = (await client.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1", [table],
        )).rows.map(row => row.column_name as string);
        for (const row of backup.tables[table]) {
          const names = Object.keys(row);
          if (!names.length || names.some(name => !columns.includes(name) || !/^[a-z_]+$/.test(name))) {
            throw new Error("Backup columns do not match the external schema.");
          }
          await client.query(`INSERT INTO "${table}" (${names.map(name => `"${name}"`).join(",")}) VALUES (${names.map((_, index) => `$${index + 1}`).join(",")})`,
            names.map(name => row[name]));
        }
        const restored = Number((await client.query(`SELECT count(*) FROM "${table}"`)).rows[0].count);
        if (restored !== backup.tables[table].length) throw new Error("Restored row count does not match.");
      }
      // Restore the serial counter without permitting a duplicate member ID.
      for (const row of additional) await client.query(
        "INSERT INTO treasure_legacy_profile_archive (source, id, profile) VALUES ($1, $2, $3::jsonb)",
        [additionalSource, row.id, JSON.stringify(row)],
      );
      await client.query(`SELECT setval(pg_get_serial_sequence('team_registration_members', 'id'),
        COALESCE((SELECT max(id) FROM team_registration_members), 1),
        EXISTS (SELECT 1 FROM team_registration_members))`);
      await client.query("INSERT INTO treasure_migration_receipts (backup_hash, counts) VALUES ($1, $2)",
        [digest(encrypted), JSON.stringify(countSummary(backup))]);
    } else {
      // A restart may not conceal a deleted or modified imported record.
      for (const table of TABLES) for (const row of backup.tables[table]) {
        const result = await client.query(`SELECT * FROM "${table}" WHERE id = $1`, [row.id]);
        if (!result.rowCount || Object.entries(row).some(([key, value]) => {
          const restored = result.rows[0][key];
          return restored instanceof Date ? restored.getTime() !== new Date(String(value)).getTime() : restored !== value;
        })) throw new Error("Previously imported records changed. Remove IMPORT_BACKUP_FILE after checking the migration.");
      }
      for (const row of additional) {
        const record = await client.query(
          "SELECT profile = $3::jsonb AS identical FROM treasure_legacy_profile_archive WHERE source = $1 AND id = $2",
          [additionalSource, row.id, JSON.stringify(row)],
        );
        if (!record.rows[0]?.identical) throw new Error("Previously archived profiles changed.");
      }
    }
    await client.query("COMMIT");
    process.stdout.write(`Backup restored and verified. Counts only: ${JSON.stringify(countSummary(backup))}\n`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, filename, extra] = process.argv.slice(2);
  const work = command === "export" && filename ? exportBackup(filename, extra) :
    command === "restore" && filename ? restoreBackup(filename) :
      Promise.reject(new Error("Usage: data-migration.mjs export|restore FILE [LEGACY_PROFILES_FILE]"));
  work.catch(error => {
    const safeMessages = new Set([
      "Write encrypted backups only under the ignored workspace tmp directory.",
      "A registered document is not frozen. Resolve it before exporting.",
      "A source document does not match its database record.",
      "Legacy profile conflict; resolve before export.",
      "Legacy profile ownership conflict; resolve before export.",
      "Invalid additional legacy profile.",
      "Migration requires a SESSION_SECRET of at least 32 characters.",
      "Backup exceeds the supported size.",
    ]);
    if (safeMessages.has(error?.message)) process.stderr.write(`${error.message}\n`);
    process.stderr.write("Migration stopped. Check the source, encryption key, document completeness, and empty destination. Nothing was deleted from the source.\n");
    process.exitCode = 1;
  });
}
