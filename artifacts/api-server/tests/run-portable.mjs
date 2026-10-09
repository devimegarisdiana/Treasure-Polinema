import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(root, "tmp-admin-test-portable-"));
const dbRequire = createRequire(join(root, "../../lib/db/package.json"));
try {
  const outfile = join(temporary, "portable.test.cjs");
  const bundle = await build({
    absWorkingDir: root, entryPoints: ["tests/portable.test.ts"], outfile,
    bundle: true, platform: "node", format: "cjs", packages: "external", metafile: true,
    // The migration CLI guard is intentionally inactive inside the test bundle.
    define: { "import.meta.url": '"file:///isolated-test-module"' },
    plugins: [{
      name: "isolated-portable-fixtures",
      setup(builder) {
        builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: join(root, "tests/fixtures/portableDatabase.ts") }));
        builder.onResolve({ filter: /^@workspace\/db\/schema$/ }, () => ({ path: join(root, "../../lib/db/src/schema/index.ts") }));
        builder.onResolve({ filter: /^@workspace\/api-zod$/ }, () => ({ path: join(root, "../../lib/api-zod/src/index.ts") }));
        builder.onResolve({ filter: /^(?:zod(?:\/v4)?|drizzle-zod)$/ }, ({ path }) => ({ path: dbRequire.resolve(path), external: true }));
      },
    }],
  });
  if (Object.keys(bundle.metafile.inputs).some(name => name.endsWith("lib/db/src/index.ts"))) {
    throw new Error("The real database entered the isolated test bundle.");
  }
  const result = spawnSync(process.execPath, ["--test", outfile], {
    cwd: root, stdio: "inherit", timeout: 120_000,
    env: {
      PATH: process.env.PATH, NODE_ENV: "production", RUNTIME_HOST: "cpanel", STORAGE_BACKEND: "local",
      STATIC_SITE_DIR: resolve(root, "../../dist/idwebhost/public"),
      AUTH_REPLIT_ENABLED: "false", EMAIL_TRANSPORT: "direct-resend",
      NOTIFICATION_WORKER_ENABLED: "false", MIGRATION_READ_ONLY: "false",
      PUBLIC_APP_ORIGIN: "https://synthetic.example.invalid",
      SESSION_SECRET: "synthetic-session-secret-for-isolated-test-only",
      TREASURE_ORGANIZER_USERNAME: "synthetic-organizer",
      TREASURE_ORGANIZER_PASSWORD: "Synthetic-organizer-password-2026",
    },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { await rm(temporary, { recursive: true, force: true }); }
