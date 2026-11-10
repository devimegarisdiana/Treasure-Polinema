# Closed registration and returning-participant update

## Official guidebook and next agenda

The homepage includes the technical meeting on Friday, 13 November 2026.
No meeting time or joining URL has been announced in the supplied information.

The official PDF is approximately 12.3 MB and is excluded from Git history.
When installing from GitHub, separately upload the original supplied PDF through
cPanel File Manager as:

`~/treasure-app/public/documents/treasure-2026-official-guidebook.pdf`

Create the `documents` directory if needed. This is the public official
guidebook, **not** the private KTM/payment folder. Do not change the privacy of
participant documents. The preview/build package includes the PDF locally;
the GitHub code branch does not include its large binary.

Registration ended on **10 November 2026**. New participant accounts and new team
registrations are rejected by the server, independent of server/browser clocks.
Existing native accounts can still sign in at `/register`.

## What participants can do

- See only registrations owned by the account they signed in with.
- Enter a team name and upload a separate KTM for every member whose ID is missing.
- Open their existing KTM/payment files through the authenticated hosting routes.
- Save the existing registration; its reference, roster and payment proof remain.

Existing files cannot be replaced through this completion form. It does not add
members or new registrations. No registration email is sent again. A failed
Google delivery does not undo saved participant data.

## 1. Install the complete code package

Keep the registered Application root `~/treasure-app`; keep the separate
`~/treasure-github` clone on branch `idwebhost`. Do not change the CloudLinux
Application root and do not replace its Node environment.

Pull the latest code in the clone first. Stop the application briefly in cPanel,
back up the existing code outside the website, and copy these package files into
the registered root together:

`app.js`, `package.json`, `schema.sql`, `server/`, `public/`, `tools/`,
`README.md`, `COMPLETION-UPDATE.md`, `google-sheets-sync.gs`.

Do not delete or replace `.htaccess`, `node_modules`, private document folders,
configuration files, or cPanel environment settings. Dependencies are unchanged.
Start the application again and refresh the browser.

Startup adds completion and synchronization columns without deleting rows.
**Do not import Replit data, restore an old database, reset tables, or run the
data-migration tool for this update.**

The portal and closed-intake behavior work before private Drive is enabled.
Existing Google Sheets metadata sync can continue during setup.

## 2. Update the existing Apps Script

Use the Google account that owns the current spreadsheet/Apps Script deployment.

1. Replace its script code with this package's `google-sheets-sync.gs`.
2. Preserve the existing Script Properties: `TREASURE_SYNC_TOKEN`,
   `TREASURE_SPREADSHEET_ID`, and optional `TREASURE_SHEET_NAME`.
   Never post their values or screenshots of these settings in chat.
3. In the editor, select **setupPrivateDrive**, click **Run**, and authorize the
   requested spreadsheet/Drive access for that account.
4. The script creates a restricted folder named
   **TREASURE 2026 — Private participant documents**, unless
   `TREASURE_DRIVE_FOLDER_ID` already points to a restricted folder.
   That folder ID is saved automatically in Script Properties.
5. In Google Drive, share this folder only with the specific organizer Google
   accounts that need document access. Keep General access **Restricted**.
   Do not select "Anyone with the link"; public folders/files are refused.
   Keep the spreadsheet restricted as well.
6. Use **Deploy → Manage deployments → Edit → New version → Deploy** on the
   existing web app. Keep its existing `/exec` URL and execute-as-owner setting.
   The existing webhook uses its shared secret; the code checks authorization
   before reading or modifying Sheets or Drive.

Updating script text alone does not update an already-deployed web app.
Do not point the hosting worker at the editor's `/dev` test URL.

## 3. Enable private document synchronization on hosting

Only after the new Apps Script deployment has been authorized, add this
non-secret flag in cPanel's application settings:

`GOOGLE_DRIVE_SYNC_ENABLED=true`

Keep the existing `GOOGLE_SHEETS_SYNC_ENABLED=true`, webhook URL and shared secret.
Restart the application to load the new flag. Do not copy development flags
or environment files from Replit.

An explicit document-refresh action or a participant completion queues private
document copying. The old metadata-only backfill action stays metadata-only.
Original hosting files remain private and are not deleted after copying.

## 4. Populate links for existing spreadsheet rows

On the **live IDwebhost organizer dashboard**, use **Refresh private documents**
and confirm its explanation. This queues existing registrations from that
hosting database; it does not import source/dummy data.

The worker uploads each document separately into its team's reference folder.
Retries reuse each document's upload ID instead of creating another copy.
The same reference row in Google Sheets is updated rather than appended again.
New columns are:

- **Student ID documents (private Drive)**: one named link per participant,
  with "Not uploaded" where a file is absent.
- **Payment proof (private Drive)**.
- **Sync revision**: prevents late requests from overwriting newer team data.

The initial nine columns are preserved. If columns 10–12 already contain other
data, the script refuses to overwrite them; resolve the header conflict first.
No public sharing is enabled. A spreadsheet reader must also have permission to
open the Drive folder/files. Participant password hashes, sessions and
credentials are never sent.

**Queued is not delivered.** The worker retries failures automatically with
backoff. Until Drive permissions and the deployment are correct, hosting data
and original files stay intact; the new links may not be available yet.
