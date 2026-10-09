import { ReplitConnectors } from "@replit/connectors-sdk";

interface RegistrationEmail {
  from: string; to: string[]; subject: string; text: string; html: string;
}

export async function sendRegistrationEmail(body: RegistrationEmail, idempotencyKey: string): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json", "Idempotency-Key": idempotencyKey,
  };
  if (process.env.EMAIL_TRANSPORT === "direct-resend") {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("Email notification requires a Resend API key on the external host.");
    return fetch("https://api.resend.com/emails", {
      method: "POST", headers: { ...headers, Authorization: `Bearer ${key}` },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
    });
  }
  return new ReplitConnectors().proxy("resend", "/emails", { method: "POST", headers, body });
}
