import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const api = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(api, "../..");
const output = path.join(root, "dist/idwebhost");
await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "tools"), { recursive: true });
execFileSync("pnpm", ["--filter", "@workspace/treasure-event", "run", "build"], {
  cwd: root, stdio: "inherit", env: { ...process.env, NODE_ENV: "production", BASE_PATH: "/", PORT: "3000" },
});
execFileSync(process.execPath, ["build.mjs"], {
  cwd: api, stdio: "inherit", env: { ...process.env, BUILD_OUTPUT_DIR: path.join(output, "server") },
});
await build({
  entryPoints: [path.join(api, "src/tools/idwebhostMigration.ts")],
  outfile: path.join(output, "tools/data-migration.mjs"), bundle: true, platform: "node", format: "esm",
  external: ["@google-cloud/*", "pg-native"],
  banner: { js: "import { createRequire as __cr } from 'node:module'; globalThis.require = __cr(import.meta.url);" },
});
// On Replit the source-side export runs beside the API's installed dependencies.
await mkdir(path.join(api, "dist"), { recursive: true });
await cp(path.join(output, "tools/data-migration.mjs"), path.join(api, "dist/data-migration.mjs"));
const ddl = execFileSync("pnpm", ["--filter", "@workspace/db", "exec", "drizzle-kit", "export",
  "--dialect", "postgresql", "--schema", "./src/schema/index.ts"], { cwd: root, encoding: "utf8" });
if (!ddl.trim().startsWith("CREATE TABLE")) throw new Error("The schema export did not contain valid SQL.");
await writeFile(path.join(output, "schema.sql"), ddl);
await cp(path.join(root, "artifacts/treasure-event/dist/public"), path.join(output, "public"), { recursive: true });
await cp(path.join(root, "deploy/idwebhost/app.js"), path.join(output, "app.js"));
await cp(path.join(root, "deploy/idwebhost/README.md"), path.join(output, "README.md"));
await cp(path.join(root, "deploy/idwebhost/google-sheets-sync.gs"), path.join(output, "google-sheets-sync.gs"));
const apiPackage = JSON.parse(await readFile(path.join(api, "package.json"), "utf8"));
const dbPackage = JSON.parse(await readFile(path.join(root, "lib/db/package.json"), "utf8"));
await writeFile(path.join(output, "package.json"), JSON.stringify({
  name: "treasure-idwebhost", version: "1.0.0", private: true,
  engines: { node: ">=22" }, scripts: { start: "node app.js" },
  dependencies: { "@google-cloud/storage": apiPackage.dependencies["@google-cloud/storage"], pg: dbPackage.dependencies.pg },
}, null, 2));
// The deployment package contains built code and public artwork only, not workspace uploads.
execFileSync("tar", ["-czf", path.join(root, "dist/treasure-idwebhost.tar.gz"), "-C", output, "."], { stdio: "inherit" });
console.log("Built dist/idwebhost and dist/treasure-idwebhost.tar.gz (code only; no private participant data).");
