import { eq } from "drizzle-orm";
import { db, registrationUploadsTable as uploads, teamRegistrationsTable as registrations,
  teamRegistrationMembersTable as members } from "@workspace/db";

const extensions: Record<string, string> = {
  "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf",
};

function filenamePart(value: string | null | undefined, fallback: string) {
  const clean = (value ?? "").normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f<>:"/\\|?*\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "");
  let result = "";
  for (const char of [...(clean || fallback)].slice(0, 70)) {
    if (Buffer.byteLength(result + char, "utf8") > 90) break;
    result += char;
  }
  return result.trim();
}

export function formatDocumentDownloadName(input: {
  purpose: "student_id" | "payment_proof"; participantName?: string | null;
  teamName?: string | null; institution?: string | null; contentType: string;
}) {
  const identity = input.purpose === "student_id"
    ? filenamePart(input.participantName, "Participant not identified")
    : filenamePart(input.teamName, "Unnamed team");
  return `${input.purpose === "student_id" ? "KTM" : "Payment Proof"} - ${identity} - ${filenamePart(input.institution, "Campus not provided")}${extensions[input.contentType] ?? ".bin"}`;
}

export function attachmentDisposition(filename: string) {
  // An ASCII fallback plus RFC 5987 UTF-8 preserves international names without
  // allowing user-controlled quotes, paths or newlines into response headers.
  const safe = filename.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/["\\/]/g, "-");
  const ascii = safe.normalize("NFKD").replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(safe).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function documentDownloadName(document: typeof uploads.$inferSelect) {
  // Resolve the CURRENT association in one snapshot. If a member was replaced
  // after the caller loaded this upload, never label their old KTM with the
  // replacement's name. Original file bytes and stored names stay unchanged.
  return db.transaction(async tx => {
    const [linked] = await tx.select({ registration: registrations, position: uploads.memberPosition })
      .from(uploads).innerJoin(registrations, eq(uploads.registrationId, registrations.id))
      .where(eq(uploads.id, document.id)).limit(1);
    if (!linked) {
      return formatDocumentDownloadName({ purpose: document.purpose, contentType: document.contentType });
    }
    const registration = linked.registration;
    let person: { fullName: string; institution: string | null } | undefined;
    if (document.purpose === "student_id") {
      const people = await tx.select({ position: members.position, fullName: members.fullName, institution: members.institution })
        .from(members).where(eq(members.registrationId, registration.id)).orderBy(members.position);
      if (linked.position !== null) person = people.find(member => member.position === linked.position);
      else if (people.length) {
        const files = await tx.select({ id: uploads.id, purpose: uploads.purpose, position: uploads.memberPosition })
          .from(uploads).where(eq(uploads.registrationId, registration.id));
        const legacy = files.filter(file => file.purpose === "student_id" && file.position === null);
        const leaderHasExplicitId = files.some(file => file.purpose === "student_id" && file.position === people[0].position);
        if (!leaderHasExplicitId && (document.id === registration.studentIdUploadId || legacy.length === 1)) person = people[0];
      }
    }
    return formatDocumentDownloadName({
      purpose: document.purpose, contentType: document.contentType,
      participantName: person?.fullName, teamName: registration.teamName,
      institution: person?.institution?.trim() || registration.institution,
    });
  }, { isolationLevel: "repeatable read" });
}
