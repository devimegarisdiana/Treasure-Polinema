let closed = false;
export const registrationClosedMessage = "Registration closed on 10 November 2026. Existing participants can sign in to complete their team name and student IDs.";
export function isRegistrationClosed() { return closed; }
export function setTestRegistrationClosed(value: boolean) { closed = value; }
