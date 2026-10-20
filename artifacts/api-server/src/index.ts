import app from "./app";
import { logger } from "./lib/logger";
import { startRegistrationNotificationWorker } from "./lib/registrationNotifications";
import { startRegistrationSpreadsheetSyncWorker } from "./lib/registrationSpreadsheetSync";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = rawPort === "passenger" && process.env.RUNTIME_HOST === "cpanel" ? "passenger" : Number(rawPort);

if (typeof port === "number" && (!Number.isInteger(port) || port <= 0 || port > 65535)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  if (process.env.NOTIFICATION_WORKER_ENABLED !== "false") startRegistrationNotificationWorker();
  if (process.env.GOOGLE_SHEETS_SYNC_ENABLED === "true") startRegistrationSpreadsheetSyncWorker();
});
