function doPost(e) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const expectedToken = properties.getProperty("TREASURE_SYNC_TOKEN");
    const spreadsheetId = properties.getProperty("TREASURE_SPREADSHEET_ID");
    const sheetName = properties.getProperty("TREASURE_SHEET_NAME") || "Registrations";
    if (!expectedToken || !spreadsheetId) return output_({ ok: false });
    const body = JSON.parse(e.postData.contents);
    if (!body || !constantTimeEquals_(String(body.token || ""), expectedToken)) return output_({ ok: false });
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (body.action === "upload_document") return output_(uploadPrivateDocument_(properties, body));
      return output_(updateRegistrationRow_(spreadsheetId, sheetName, body.registration));
    } finally { lock.releaseLock(); }
  } catch (error) { return output_({ ok: false }); }
}

function uploadPrivateDocument_(properties, body) {
  const document = body.document;
  if (!/^TR26-[A-Z0-9]{12}$/.test(String(body.referenceCode || "")) || !document ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(document.uploadId || "") ||
      ["image/jpeg", "image/png", "image/webp", "application/pdf"].indexOf(document.contentType) < 0 ||
      !Number.isInteger(document.size) || document.size < 1 || document.size > 10485760 ||
      typeof document.base64 !== "string" || document.base64.length > 13981016) return { ok: false };
  const bytes = Utilities.base64Decode(document.base64);
  if (bytes.length !== document.size) return { ok: false };
  const folder = privateDriveFolder_(properties);
  if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) return { ok: false };
  const existingFolders = folder.getFoldersByName(body.referenceCode);
  const teamFolder = existingFolders.hasNext() ? existingFolders.next() : folder.createFolder(body.referenceCode);
  if (teamFolder.getSharingAccess() !== DriveApp.Access.PRIVATE) return { ok: false };
  const name = document.uploadId + "__" + String(document.fileName || "document")
    .replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 150);
  const existingFiles = teamFolder.getFilesByName(name);
  const file = existingFiles.hasNext() ? existingFiles.next()
    : teamFolder.createFile(Utilities.newBlob(bytes, document.contentType, name));
  if (file.getSharingAccess() !== DriveApp.Access.PRIVATE) return { ok: false };
  return { ok: true, fileId: file.getId(), url: "https://drive.google.com/file/d/" + file.getId() + "/view" };
}

// Run once from the Apps Script editor to authorize Drive before enabling the
// hosting worker. This is not an unauthenticated webhook action.
function setupPrivateDrive() {
  privateDriveFolder_(PropertiesService.getScriptProperties());
  return "Private Drive folder ready. Share it only with authorized organizers.";
}

function privateDriveFolder_(properties) {
  const folderId = properties.getProperty("TREASURE_DRIVE_FOLDER_ID");
  let folder;
  if (folderId) folder = DriveApp.getFolderById(folderId);
  else {
    folder = DriveApp.createFolder("TREASURE 2026 — Private participant documents");
    folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
    properties.setProperty("TREASURE_DRIVE_FOLDER_ID", folder.getId());
  }
  // Restricted, individually shared folders are allowed; public/link sharing is not.
  if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error("The document folder must use restricted access.");
  return folder;
}

function updateRegistrationRow_(spreadsheetId, sheetName, item) {
  if (!item || !/^TR26-[A-Z0-9]{12}$/.test(String(item.referenceCode || "")) ||
      !Array.isArray(item.memberNames)) return { ok: false };
  const revision = item.revision == null ? 0 : item.revision;
  if (!Number.isInteger(revision) || revision < 0) return { ok: false };
  if (item.documentsSynced === true && (!Array.isArray(item.studentIds) ||
      item.studentIds.some(function (document) { return !document || (document.url != null && !privateDriveUrl_(document.url)); }) ||
      (item.paymentProofUrl != null && !privateDriveUrl_(item.paymentProofUrl)))) return { ok: false };
  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
  if (!sheet) return { ok: false };
  const headers = [
    "Reference", "Team name", "Competition", "Institution", "Submitted at (UTC)",
    "Member names", "Team contact email", "Team contact phone", "Alternative phone",
  ];
  const extraHeaders = ["Student ID documents (private Drive)", "Payment proof (private Drive)", "Sync revision"];
  if (sheet.getLastRow() === 0) sheet.appendRow(headers.concat(extraHeaders));
  const currentHeaders = sheet.getRange(1, 1, 1, 12).getValues()[0];
  if (headers.some(function (header, index) { return currentHeaders[index] !== header; }) ||
      extraHeaders.some(function (header, index) { return currentHeaders[index + 9] && currentHeaders[index + 9] !== header; })) return { ok: false };
  sheet.getRange(1, 10, 1, 3).setValues([extraHeaders]);
  const lastRow = sheet.getLastRow();
  const match = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1)
    .createTextFinder(item.referenceCode).matchEntireCell(true).findNext() : null;
  const rowNumber = match ? match.getRow() : lastRow + 1;
  if (match && Number(sheet.getRange(rowNumber, 12).getValue() || 0) > revision) return { ok: true };
  const row = [
    item.referenceCode, safeCell_(item.teamName), safeCell_(item.competition || ""),
    safeCell_(item.institution || ""), safeCell_(item.submittedAt), safeCell_(item.memberNames.join(" | ")),
    safeCell_(item.contactEmail), safeCell_(item.contactPhone), safeCell_(item.alternativePhone || ""),
  ];
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  if (item.documentsSynced === true) {
    const labels = item.studentIds.map(function (document) {
      return String(document.name || "Participant") + (document.url ? " — Open student ID" : " — Not uploaded");
    });
    const text = labels.join("\n");
    const rich = SpreadsheetApp.newRichTextValue().setText(text);
    let offset = 0;
    item.studentIds.forEach(function (document, index) {
      if (document.url) rich.setLinkUrl(offset, offset + labels[index].length, document.url);
      offset += labels[index].length + 1;
    });
    sheet.getRange(rowNumber, 10).setRichTextValue(rich.build()).setWrap(true);
    const payment = SpreadsheetApp.newRichTextValue().setText(item.paymentProofUrl ? "Open payment proof" : "Not uploaded");
    if (item.paymentProofUrl) payment.setLinkUrl(item.paymentProofUrl);
    sheet.getRange(rowNumber, 11).setRichTextValue(payment.build());
  }
  sheet.getRange(rowNumber, 12).setValue(revision);
  return { ok: true };
}

function privateDriveUrl_(url) {
  return typeof url === "string" && /^https:\/\/drive\.google\.com\/file\/d\/[A-Za-z0-9_-]+\/view$/.test(url);
}
function safeCell_(value) {
  const text = String(value == null ? "" : value);
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? "'" + text : text;
}
function constantTimeEquals_(actual, expected) {
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index++) difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}
function output_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
