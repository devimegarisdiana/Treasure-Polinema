function doPost(e) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const expectedToken = properties.getProperty("TREASURE_SYNC_TOKEN");
    const spreadsheetId = properties.getProperty("TREASURE_SPREADSHEET_ID");
    const sheetName = properties.getProperty("TREASURE_SHEET_NAME") || "Registrations";
    if (!expectedToken || !spreadsheetId) return output_({ ok: false });

    const body = JSON.parse(e.postData.contents);
    if (!body || !constantTimeEquals_(String(body.token || ""), expectedToken)) {
      return output_({ ok: false });
    }
    const item = body.registration;
    if (!item || !/^TR26-[A-Z0-9]{12}$/.test(String(item.referenceCode || "")) ||
        !Array.isArray(item.memberNames)) return output_({ ok: false });

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
      if (!sheet) return output_({ ok: false });
      const headers = [
        "Reference", "Team name", "Competition", "Institution", "Submitted at (UTC)",
        "Member names", "Team contact email", "Team contact phone", "Alternative phone",
      ];
      if (sheet.getLastRow() === 0) sheet.appendRow(headers);
      const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
      if (headers.some(function (header, index) { return currentHeaders[index] !== header; })) {
        return output_({ ok: false });
      }
      const lastRow = sheet.getLastRow();
      const match = lastRow > 1
        ? sheet.getRange(2, 1, lastRow - 1, 1).createTextFinder(item.referenceCode)
            .matchEntireCell(true).findNext()
        : null;
      const row = [
        item.referenceCode,
        safeCell_(item.teamName),
        safeCell_(item.competition || ""),
        safeCell_(item.institution || ""),
        safeCell_(item.submittedAt),
        safeCell_(item.memberNames.join(" | ")),
        safeCell_(item.contactEmail),
        safeCell_(item.contactPhone),
        safeCell_(item.alternativePhone || ""),
      ];
      if (match) sheet.getRange(match.getRow(), 1, 1, row.length).setValues([row]);
      else sheet.appendRow(row);
      return output_({ ok: true });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return output_({ ok: false });
  }
}

function safeCell_(value) {
  const text = String(value == null ? "" : value);
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? "'" + text : text;
}

function constantTimeEquals_(actual, expected) {
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index++) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

function output_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
