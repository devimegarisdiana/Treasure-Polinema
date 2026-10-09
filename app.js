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
process.env.MIGRATION_READ_ONLY ||= "true";

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
    const { Client } = require("pg");
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
      if (tables.rows.length === 0) {
        await client.query(await fs.readFile(path.join(__dirname, "schema.sql"), "utf8"));
      } else {
        const required = ["participant_accounts", "organizer_accounts", "team_registrations", "registration_uploads"];
        if (!required.every(name => tables.rows.some(row => row.tablename === name))) {
          throw new Error("Database is not empty and its schema is incomplete. Initialization refused.");
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { await client.end(); }
  }
  if (process.env.IMPORT_BACKUP_FILE) {
    if (process.env.NOTIFICATION_WORKER_ENABLED !== "false" || process.env.MIGRATION_READ_ONLY !== "true") {
      throw new Error("Keep email delivery disabled and registration paused during restoration.");
    }
    const { restoreBackup } = await import("./tools/data-migration.mjs");
    await restoreBackup(process.env.IMPORT_BACKUP_FILE);
  }
  await import("./server/index.mjs");
}

start().catch(error => {
  // Never print database connection strings, private records, or provider keys.
  const safe = /^Missing required setting: [A-Z_]+$/.test(error?.message || "") ||
    /^(SESSION_SECRET must|PUBLIC_APP_ORIGIN must|PRIVATE_STORAGE_ROOT must|Database is not empty|Keep email delivery disabled)/.test(error?.message || "");
  console.error(safe ? error.message : "TREASURE startup failed. Check the database, private storage, and migration settings.");
  process.exitCode = 1;
});
