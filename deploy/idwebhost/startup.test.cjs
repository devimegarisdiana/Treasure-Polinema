const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8")
  .replace("start().catch(error => {", "globalThis.finished = start().catch(error => {");
const privateMarker = "SYNTHETIC_PRIVATE_VALUE_DO_NOT_LOG";

async function failure({ code, stage = "connect", settings = {} }) {
  const output = [];
  const error = Object.assign(new Error(privateMarker), {
    code, detail: privateMarker, query: privateMarker, stack: privateMarker,
  });
  const context = {
    __dirname: "/synthetic/app",
    URL,
    process: { env: {
      DATABASE_URL: `postgresql://synthetic:${privateMarker}@example.invalid/synthetic`,
      PRIVATE_STORAGE_ROOT: "/synthetic/private",
      SESSION_SECRET: privateMarker.repeat(2),
      PUBLIC_APP_ORIGIN: "https://example.invalid",
      TREASURE_ORGANIZER_USERNAME: "synthetic",
      TREASURE_ORGANIZER_PASSWORD: privateMarker,
      INITIALIZE_EMPTY_DATABASE: "true",
      ...settings,
    } },
    console: { error: message => output.push(message) },
    require(name) {
      if (name === "node:path") return path;
      if (name === "node:fs/promises") return { readFile: async () => "CREATE TABLE synthetic();" };
      if (name === "pg") return { Client: class {
        async connect() { if (stage === "connect") throw error; }
        async query(sql) {
          if (sql === "ROLLBACK") return {};
          if (sql.startsWith("SELECT")) return { rows: [] };
          if (sql.startsWith("CREATE")) throw error;
          return {};
        }
        async end() {}
      } };
      throw new Error("Unexpected synthetic dependency");
    },
  };
  vm.runInNewContext(source, context);
  await context.finished;
  assert.equal(context.process.exitCode, 1);
  assert.equal(output.length, 1);
  assert.ok(!output[0].includes(privateMarker), "Private diagnostics must never be logged");
  return output[0];
}

test("Database auth, missing database, and network failures expose only safe codes", async () => {
  for (const code of ["28P01", "3D000", "ECONNREFUSED", "ERR_INVALID_URL"]) {
    assert.match(await failure({ code }), new RegExp(`stage=database-connect; code=${code}`));
  }
});

test("Schema permission and missing UUID function failures identify the schema stage", async () => {
  for (const code of ["42501", "42883"]) {
    assert.match(await failure({ code, stage: "schema" }), new RegExp(`stage=schema-create; code=${code}`));
  }
});

test("Unknown error codes and arbitrary messages are redacted", async () => {
  assert.match(await failure({ code: privateMarker }), /code=UNKNOWN/);
});

test("Missing configuration identifies only the missing setting", async () => {
  const message = await failure({ settings: { DATABASE_URL: "" } });
  assert.match(message, /stage=configuration; code=UNKNOWN/);
  assert.match(message, /Missing required setting: DATABASE_URL/);
});
