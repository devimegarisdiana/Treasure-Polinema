// Build-time replacements, never wired into the application or its auth routes.
export function notificationSetup() {
  return { recipient: null, sender: null, note: "Synthetic test: delivery disabled." };
}

export let externalCalls = 0;
function forbidden(): never {
  externalCalls++;
  throw new Error("External email/storage is forbidden in organizer regression tests.");
}
export const processRegistrationNotifications = forbidden;
export const registrationStorage = {
  getObjectEntityFile: forbidden,
  downloadObject: forbidden,
};
export const streamFile = forbidden;
