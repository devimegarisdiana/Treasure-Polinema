# TREASURE — IDwebhost deployment

This distribution serves the complete website and `/api` from one Node.js app.
It uses PostgreSQL, native participant/organizer login, and private files on the
hosting disk. Replit login, the Replit storage sidecar, and the Replit connector
proxy are not used on the external host.

**The code package has no participant records, credential hashes, or private
documents. Never put a database dump or a data backup in GitHub.**

## 1. Obtain the code through GitHub

The `idwebhost-source` branch contains the portable source code; `idwebhost`
contains the already-built standalone application. The original `main` branch
is kept separate from this migration package.

Open the repository's **Code** tab, select branch **idwebhost**, then choose
**Code → Download ZIP**. Extract it and move the contents of the downloaded
folder (not its enclosing folder) into the Node application root, e.g.
`/home/CPANEL_USER/treasure-app`. `app.js` and `package.json` must be directly
inside that root.

Do not copy the original monorepo into cPanel's “Run NPM Install”. That repo uses
pnpm; this built distribution has a standalone `package.json` compatible with npm.
The GitHub branch contains code only. It has no private backup or database data.
For optional future build automation, an example workflow is provided in the
source branch at `deploy/idwebhost/github-actions.example.yml`; enabling it
requires GitHub workflow permissions and is not needed for this built package.

In **Setup Node.js App** use Node 22, **Production**, the application root above,
`treasure-polinema.com` with no extra URL path, and startup file **app.js**.
Run **NPM Install**. Preserve cPanel-generated files and the Node environment.
Do not run NPM Install from a different directory.

## 2. Configure the external app securely

Enter these in the application's cPanel environment settings, not in chat or Git:

| Setting | Value / purpose |
| --- | --- |
| `DATABASE_URL` | `postgresql://DB_USER:ENCODED_PASSWORD@DB_HOST:5432/DB_NAME` |
| `PUBLIC_APP_ORIGIN` | `https://treasure-polinema.com` |
| `PRIVATE_STORAGE_ROOT` | `/home/CPANEL_USER/treasure-private` — outside this app and `public_html` |
| `SESSION_SECRET` | At least 32 characters; use the source value when decrypting its backup |
| `TREASURE_ORGANIZER_USERNAME` | Organizer username |
| `TREASURE_ORGANIZER_PASSWORD` | Organizer password, 12–128 characters |
| `INITIALIZE_EMPTY_DATABASE` | `true` for the new, empty destination |
| `MIGRATION_READ_ONLY` | `true` until the import is checked |
| `NOTIFICATION_WORKER_ENABLED` | `false` during migration |
| `REGISTRATION_NOTIFICATION_EMAIL` | Organizer notification recipient |
| `REGISTRATION_EMAIL_FROM` | `TREASURE 2026 <admin@treasure-polinema.com>` |
| `RESEND_API_KEY` | Valid Resend key, with this sending domain verified |

Use the database hostname and port supplied by IDwebhost; do not assume a remote
connection is allowed. URL-encode the database password when constructing
`DATABASE_URL` (e.g. `@` → `%40`, `#` → `%23`). The app uses the provider's
PostgreSQL database, not MySQL. New account, registration, document and notification
IDs are generated securely by Node.js using `crypto.randomUUID()`. The database
does not need `pgcrypto` or `gen_random_uuid()`. Existing IDs are preserved during
restore. Direct SQL imports must supply their original IDs rather than expecting
a database-generated UUID default.

New private documents are written to the private folder on IDwebhost. Back up
that folder together with PostgreSQL. Updating the code package must not replace
the private folder. User-facing file URLs remain protected API URLs, never
direct disk URLs.

## 3. Prepare the private data backup

Inventory **both** the published and development source databases. The source
with real registrations must be included, even if the published database is empty.
Historical Replit profiles have no native passwords: preserve their records,
but do not invent passwords or silently link accounts by email.

Before the final backup, pause registration writes and notification delivery on
every source instance. With this source version those settings are
`MIGRATION_READ_ONLY=true` and `NOTIFICATION_WORKER_ENABLED=false`, followed by
a restart. Do not change DNS or close the old database yet. If the published
source runs an older build, confirm that its writes and workers are actually
paused too; workspace settings alone do not prove this.

From the original Replit API package, with its original database/storage
configuration and `SESSION_SECRET` still available:

```sh
pnpm --filter @workspace/api-server run build:idwebhost
cd artifacts/api-server
node dist/data-migration.mjs export \
  ../../tmp/treasure-data.treasure-backup
```

The export:
- uses a read-only, repeatable-read source transaction;
- preserves native accounts and password hashes, registrations, members,
  registered documents, historical profiles, and notification history;
- checks registered file sizes and copies their bytes;
- encrypts the entire backup with AES-256-GCM using `SESSION_SECRET`;
- prints counts only, never credentials or participant details;
- excludes active login sessions and unfinished upload drafts (users sign in again);
- fails if a registered document is missing; it does not silently omit it.

If the second source contains additional legacy profiles, an independently
exported private JSON array can be supplied as the optional third argument.
These profiles are preserved verbatim in a separate, source-labelled historical
archive, not merged into authentication accounts. Conflicting versions of an
identity therefore remain intact without changing ownership or granting access.
This archives profiles only, not registrations from a second source.
If both sources contain registrations, stop and prepare an explicit conflict
resolution/import strategy before using this single-source tool.

## 4. Restore without needing Terminal/SSH

Privately download the encrypted `.treasure-backup` file and upload it through
cPanel File Manager to `/home/CPANEL_USER/treasure-data.treasure-backup` —
**outside `public_html` and the application directory**. Use the source
`SESSION_SECRET` in cPanel so it can be decrypted. Keep the backup out of Git.

Before starting the new application, set:

```text
IMPORT_BACKUP_FILE=/home/CPANEL_USER/treasure-data.treasure-backup
INITIALIZE_EMPTY_DATABASE=true
MIGRATION_READ_ONLY=true
NOTIFICATION_WORKER_ENABLED=false
```

Restart the Node application. `app.js` creates the schema only when the target
database has no public tables, then restores and verifies the backup before
starting the web server. It refuses a nonempty, conflicting destination instead
of deleting or overwriting records. If a restore fails, fix the settings; do not
delete either source database. Matching previously copied files can be reused
on retry, and a successful import receipt prevents importing the same data twice.

The backup must be imported **before the first organizer login** because that
login can initialize a new organizer record, making the target nonempty.

If Terminal is available, the equivalent command, inside the standalone package
and its activated Node environment, is:

```sh
node tools/data-migration.mjs restore /home/CPANEL_USER/treasure-data.treasure-backup
```

## 5. Verify before reopening registration

Check application logs for the count-only restore summary. Sign in as organizer,
check the saved registration and every attached document, then sign in with an
existing native participant account and check its registration history.
Verify another participant cannot open the documents. Old Replit-only login
profiles need a separately verified recovery/claim process if they own records;
do not enable registration while those ownership issues remain unresolved.

After confirming the import:
1. Remove `IMPORT_BACKUP_FILE` and set `INITIALIZE_EMPTY_DATABASE=false`.
2. Set `MIGRATION_READ_ONLY=false` and restart.
3. Verify a new registration and its two document uploads.
4. Keep the old writers/workers stopped before enabling the new email worker.
5. Only set `NOTIFICATION_WORKER_ENABLED=true` after the Resend key and sending
   domain work. Existing sent jobs retain their status and provider idempotency key.
6. Keep the original database/files and encrypted backup until migration is
   accepted. Store the decryption secret privately, separately from the backup.

**A successful GitHub build is not a completed data migration.**
Do not declare the domain live until the actual IDwebhost app and restored data
have been checked. A future update repeats only step 1; it must not reimport data.
