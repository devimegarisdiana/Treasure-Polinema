/* Passenger/cPanel startup file. This package deliberately does not use pnpm. */
const path = require("node:path");
const fs = require("node:fs/promises");

Object.assign(process.env, {
  NODE_ENV: "production",
  RUNTIME_HOST: "cpanel",
  STORAGE_BACKEND: "local",
  AUTH_REPLIT_ENABLED: "false",
  EMAIL_TRANSPORT: "direct-resend",
  STATIC_SITE_DIR: path.join(__dirname, "public"),
});
process.env.PORT ||= "3000"; // Passenger normally intercepts listen(); also accepts PORT=passenger.
process.env.NOTIFICATION_WORKER_ENABLED ||= "false";
process.env.GOOGLE_SHEETS_SYNC_ENABLED ||= "false";
process.env.MIGRATION_READ_ONLY ||= "true";

let startupStage = "configuration";
const diagnosticCodes = new Set([
  "28P01", "28000", "3D000", "42501", "42883", "42P01", "42703", "42704",
  "42P07", "23505", "53300", "57P03", "08001", "08003", "08004", "08006",
  "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT",
  "EACCES", "EPERM", "ENOENT", "ERR_INVALID_URL", "MODULE_NOT_FOUND",
  "ERR_MODULE_NOT_FOUND", "ERR_DLOPEN_FAILED",
]);

async function start() {
  for (const name of ["DATABASE_URL", "PRIVATE_STORAGE_ROOT", "SESSION_SECRET", "PUBLIC_APP_ORIGIN",
    "TREASURE_ORGANIZER_USERNAME", "TREASURE_ORGANIZER_PASSWORD"]) {
    if (!process.env[name]) throw new Error(`Missing required setting: ${name}`);
  }
  if (process.env.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  const origin = new URL(process.env.PUBLIC_APP_ORIGIN);
  if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.username || origin.password || origin.search || origin.hash) {
    throw new Error("PUBLIC_APP_ORIGIN must be an HTTPS origin without a path.");
  }
  process.env.PUBLIC_APP_ORIGIN = origin.origin;
  const root = path.resolve(process.env.PRIVATE_STORAGE_ROOT);
  if (!path.isAbsolute(process.env.PRIVATE_STORAGE_ROOT) || root === "/" || root.startsWith(`${__dirname}/`) ||
      root === __dirname || root.split(path.sep).includes("public_html")) {
    throw new Error("PRIVATE_STORAGE_ROOT must be outside the application and public_html.");
  }

  if (process.env.INITIALIZE_EMPTY_DATABASE === "true") {
    startupStage = "database-client";
    const { Client } = require("pg");
    startupStage = "database-connect";
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      startupStage = "schema-check";
      await client.query("BEGIN");
      const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
      if (tables.rows.length === 0) {
        startupStage = "schema-create";
        await client.query(await fs.readFile(path.join(__dirname, "schema.sql"), "utf8"));
      } else {
        const required = ["participant_accounts", "organizer_accounts", "team_registrations", "registration_uploads"];
        if (!required.every(name => tables.rows.some(row => row.tablename === name))) {
          throw new Error("Database is not empty and its schema is incomplete. Initialization refused.");
        }
      }
      startupStage = "schema-commit";
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { await client.end(); }
  }
  // Non-destructive upgrade for existing hosting accounts: preserve values,
  // ownership and uniqueness while removing the old 30-character limit.
  {
    startupStage = "username-schema";
    const { Client } = require("pg");
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const column = await client.query(
        "SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'participant_accounts' AND column_name = 'username'"
      );
      if (column.rows[0]?.data_type === "character varying") {
        await client.query("SET lock_timeout = '10s'");
        await client.query("ALTER TABLE public.participant_accounts ALTER COLUMN username TYPE text");
      }
    } finally { await client.end(); }
  }
  {
    startupStage = "spreadsheet-schema";
    const { Client } = require("pg");
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.registration_spreadsheet_sync (
          id uuid PRIMARY KEY,
          registration_id uuid NOT NULL UNIQUE REFERENCES public.team_registrations(id) ON DELETE CASCADE,
          status text NOT NULL DEFAULT 'pending',
          attempts integer NOT NULL DEFAULT 0,
          next_attempt_at timestamptz NOT NULL DEFAULT now(),
          locked_at timestamptz,
          synced_at timestamptz,
          last_error text,
          created_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT registration_spreadsheet_sync_status_check
            CHECK (status IN ('pending', 'processing', 'sent', 'failed'))
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS registration_spreadsheet_sync_due_idx
        ON public.registration_spreadsheet_sync (status, next_attempt_at, created_at)
      `);
    } finally { await client.end(); }
  }
  if (process.env.IMPORT_BACKUP_FILE) {
    startupStage = "backup-restore";
    if (process.env.NOTIFICATION_WORKER_ENABLED !== "false" || process.env.MIGRATION_READ_ONLY !== "true") {
      throw new Error("Keep email delivery disabled and registration paused during restoration.");
    }
    const { restoreBackup } = await import("./tools/data-migration.mjs");
    await restoreBackup(process.env.IMPORT_BACKUP_FILE);
  }
  startupStage = "server-load";
  await import("./server/index.mjs");
}

function authorizationHint(error) {
  // Match internally, but output only fixed labels, never matched text.
  if (error?.code !== "28000" && error?.code !== "28P01") return "NONE";
  const text = typeof error.message === "string" ? error.message : "";
  if (/no pg_hba\.conf entry/i.test(text)) {
    if (/SSL off|no encryption/i.test(text)) return "PG_HBA_DENIED_WITHOUT_SSL";
    if (/SSL on|SSL encryption/i.test(text)) return "PG_HBA_DENIED_WITH_SSL";
    return "PG_HBA_DENIED";
  }
  if (/is not permitted to log in/i.test(text)) return "ROLE_LOGIN_DISABLED";
  if (/role .*does not exist/i.test(text)) return "ROLE_NOT_FOUND";
  if (/password authentication failed/i.test(text)) return "PASSWORD_AUTH_FAILED";
  if (/no password supplied|password is required/i.test(text)) return "PASSWORD_REQUIRED";
  if (/SSL.*required|requires?.*SSL/i.test(text)) return "SSL_REQUIRED";
  return "AUTHORIZATION_REJECTED";
}

start().catch(error => {
  // Never print database connection strings, private records, or provider keys.
  const safe = /^Missing required setting: [A-Z_]+$/.test(error?.message || "") ||
    /^(SESSION_SECRET must|PUBLIC_APP_ORIGIN must|PRIVATE_STORAGE_ROOT must|Database is not empty|Keep email delivery disabled)/.test(error?.message || "");
  const code = diagnosticCodes.has(error?.code) ? error.code : "UNKNOWN";
  const message = safe ? error.message : "Check the database, private storage, and migration settings.";
  // Only fixed stages, allowlisted codes, and our safe configuration errors are logged.
  // Never print an arbitrary message, stack, detail, query, URL, or environment value.
  const hint = authorizationHint(error);
  console.error(`TREASURE startup failed [stage=${startupStage}; code=${code}; hint=${hint}]. ${message}`);
  process.exitCode = 1;
});
