const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function fixture(initialRows = []) {
  const rows = initialRows.map(row => row.slice());
  let locks = 0;
  const sheet = {
    getLastRow: () => rows.length,
    appendRow: row => rows.push(row),
    getRange: (startRow, _column, count) => ({
      getValues: () => rows.slice(startRow - 1, startRow - 1 + count),
      setValues: values => { rows[startRow - 1] = values[0]; },
      createTextFinder: text => ({
        matchEntireCell() { return this; },
        findNext: () => {
          const index = rows.findIndex((row, index) => index >= startRow - 1 && row[0] === text);
          return index < 0 ? null : { getRow: () => index + 1 };
        },
      }),
    }),
  };
  const context = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: name => ({
        TREASURE_SYNC_TOKEN: "synthetic-test-token",
        TREASURE_SPREADSHEET_ID: "synthetic-sheet-id",
        TREASURE_SHEET_NAME: "Registrations",
      })[name],
    }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) },
    LockService: { getScriptLock: () => ({
      waitLock: () => { locks++; },
      releaseLock: () => { locks--; },
    }) },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: text => ({ text, setMimeType() { return this; } }),
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "google-sheets-sync.gs"), "utf8"), context);
  const send = (token = "synthetic-test-token", changes = {}) => JSON.parse(context.doPost({
    postData: { contents: JSON.stringify({ token, registration: {
      referenceCode: "TR26-ABCDEF123456",
      teamName: "=HYPERLINK(\"https://example.invalid\")",
      competition: "business_simulation",
      institution: "Synthetic campus",
      submittedAt: "2026-10-20T00:00:00.000Z",
      memberNames: ["Synthetic member"],
      contactEmail: "synthetic@example.invalid",
      contactPhone: "+620000000001",
      alternativePhone: "",
      ...changes,
    } }) },
  }).text);
  return { rows, send, get locks() { return locks; } };
}

test("Apps Script checks the secret and does not mutate unauthorized requests", () => {
  const data = fixture();
  assert.deepEqual(data.send("wrong-secret"), { ok: false });
  assert.equal(data.rows.length, 0);
  assert.equal(data.locks, 0);
});

test("Apps Script uses a single reference row and escapes spreadsheet formulas", () => {
  const data = fixture();
  assert.deepEqual(data.send(), { ok: true });
  assert.equal(data.rows.length, 2);
  assert.ok(data.rows[1][1].startsWith("'="));
  assert.ok(data.rows[1][7].startsWith("'+"));
  assert.deepEqual(data.send("synthetic-test-token", { teamName: "Updated team" }), { ok: true });
  assert.equal(data.rows.length, 2);
  assert.equal(data.rows[1][1], "Updated team");
  assert.equal(data.locks, 0);
});

test("Apps Script refuses an existing tab with unrelated headers", () => {
  const data = fixture([["Unrelated content"]]);
  assert.deepEqual(data.send(), { ok: false });
  assert.deepEqual(data.rows, [["Unrelated content"]]);
  assert.equal(data.locks, 0);
});
