const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "google-sheets-sync.gs"), "utf8");

function harness(initialRows = []) {
  const rows = initialRows.map(row => [...row]);
  const state = { mutations: 0, files: 0, folders: 0, access: "PRIVATE" };
  const properties = new Map([["TREASURE_SYNC_TOKEN", "synthetic-token"], ["TREASURE_SPREADSHEET_ID", "synthetic-sheet"]]);
  const cell = (r, c) => rows[r - 1]?.[c - 1] ?? "";
  const set = (r, c, value) => {
    state.mutations++;
    if (!rows[r - 1]) rows[r - 1] = [];
    rows[r - 1][c - 1] = value;
  };
  const sheet = {
    getLastRow: () => rows.length,
    appendRow(row) { state.mutations++; rows.push([...row]); },
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(r + i, c + j))),
        getValue: () => cell(r, c),
        setValues(values) { values.forEach((row, i) => row.forEach((value, j) => set(r + i, c + j, value))); return this; },
        setValue(value) { set(r, c, value); return this; },
        setRichTextValue(value) { set(r, c, value); return this; },
        setWrap() { return this; },
        createTextFinder(text) {
          return { matchEntireCell() { return this; }, findNext() {
            const index = rows.findIndex((row, i) => i >= r - 1 && i < r - 1 + nr && row[c - 1] === text);
            return index < 0 ? null : { getRow: () => index + 1 };
          } };
        },
      };
    },
  };
  function iterator(items) { let index = 0; return { hasNext: () => index < items.length, next: () => items[index++] }; }
  function folder(id) {
    const folders = new Map(), files = new Map();
    return {
      getId: () => id, getSharingAccess: () => state.access, setSharing: () => {},
      getFoldersByName: name => iterator(folders.has(name) ? [folders.get(name)] : []),
      createFolder(name) { state.folders++; const child = folder(`folder-${state.folders}`); folders.set(name, child); return child; },
      getFilesByName: name => iterator(files.has(name) ? [files.get(name)] : []),
      createFile(blob) {
        state.files++;
        const file = { getId: () => `file-${state.files}`, getSharingAccess: () => state.access };
        files.set(blob.name, file); return file;
      },
    };
  }
  const root = folder("root");
  const context = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties.get(key), setProperty: (key, value) => properties.set(key, value),
    }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }), newRichTextValue() {
      return { text: "", links: [], setText(text) { this.text = text; return this; },
        setLinkUrl(...link) { this.links.push(link); return this; }, build() { return { text: this.text, links: this.links }; } };
    } },
    DriveApp: { Access: { PRIVATE: "PRIVATE" }, Permission: { VIEW: "VIEW" },
      createFolder() { state.folders++; return root; }, getFolderById: () => root },
    Utilities: { base64Decode: value => [...Buffer.from(value, "base64")], newBlob: (bytes, type, name) => ({ bytes, type, name }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: content => ({ setMimeType: () => content }) },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const send = body => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(body) } }));
  return { rows, state, send };
}
const registration = {
  referenceCode: "TR26-ABCDEF123456", teamName: "=HYPERLINK(\"bad\")", memberNames: ["Synthetic member"],
  competition: "business_simulation", institution: "Synthetic campus", submittedAt: "2026-11-01T00:00:00Z",
  contactEmail: "synthetic@example.invalid", contactPhone: "+62000000001", alternativePhone: "@bad",
};

test("Apps Script rejects unauthorized metadata and document requests before any mutation", () => {
  const h = harness();
  for (const token of [undefined, "", "wrong"]) {
    assert.equal(h.send({ token, registration }).ok, false);
    assert.equal(h.send({ token, action: "upload_document", document: {} }).ok, false);
  }
  assert.equal(h.state.mutations, 0);
  assert.equal(h.state.files, 0);
  assert.equal(h.state.folders, 0);
});

test("Apps Script updates the same reference row, escapes formulas and rejects stale revisions", () => {
  const h = harness();
  assert.equal(h.send({ token: "synthetic-token", registration: { ...registration, revision: 1 } }).ok, true);
  assert.equal(h.rows.length, 2);
  assert.ok(h.rows[1][1].startsWith("'="));
  assert.ok(h.rows[1][7].startsWith("'+"));
  assert.equal(h.send({ token: "synthetic-token", registration: { ...registration, teamName: "Confirmed team", revision: 2 } }).ok, true);
  h.send({ token: "synthetic-token", registration: { ...registration, teamName: "Old team", revision: 1 } });
  assert.equal(h.rows.length, 2);
  assert.equal(h.rows[1][1], "Confirmed team");
  assert.equal(h.rows[1][11], 2);
});

test("Apps Script refuses unrelated spreadsheet headers without overwriting them", () => {
  const h = harness([["Unrelated records"]]);
  assert.equal(h.send({ token: "synthetic-token", registration }).ok, false);
  assert.deepEqual(h.rows, [["Unrelated records"]]);
});

test("private Drive upload retries reuse one file and never enable public sharing", () => {
  const h = harness();
  const body = { token: "synthetic-token", action: "upload_document", referenceCode: registration.referenceCode,
    document: { uploadId: "10000000-0000-4000-8000-000000000001", fileName: "synthetic.pdf",
      contentType: "application/pdf", size: 4, base64: Buffer.from("%PDF").toString("base64") } };
  const first = h.send(body);
  assert.equal(first.ok, true);
  assert.deepEqual(h.send(body), first);
  assert.equal(h.state.files, 1);
  assert.equal(first.url, "https://drive.google.com/file/d/file-1/view");
  h.state.access = "ANYONE_WITH_LINK";
  assert.equal(h.send(body).ok, false);
  assert.equal(h.state.files, 1);
});

test("each student and payment proof receives its own private rich-text link", () => {
  const h = harness();
  const linked = { ...registration, revision: 3, documentsSynced: true, studentIds: [
    { name: "Synthetic leader", url: "https://drive.google.com/file/d/leader/view" },
    { name: "Synthetic member", url: "https://drive.google.com/file/d/member/view" },
  ], paymentProofUrl: "https://drive.google.com/file/d/payment/view" };
  assert.equal(h.send({ token: "synthetic-token", registration: linked }).ok, true);
  assert.equal(h.rows[1][9].links.length, 2);
  assert.equal(h.rows[1][9].links[1][2], linked.studentIds[1].url);
  assert.equal(h.rows[1][10].links[0][0], linked.paymentProofUrl);
  const links = h.rows[1][9];
  h.send({ token: "synthetic-token", registration: { ...registration, teamName: "Name updated", revision: 4 } });
  assert.deepEqual(h.rows[1][9], links, "metadata-only updates preserve existing private links");
  assert.equal(h.send({ token: "synthetic-token", registration: { ...linked, paymentProofUrl: "javascript:alert(1)" } }).ok, false);
});
