import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = fileURLToPath(new URL("../", import.meta.url));
const dbRequire = createRequire(join(root, "../../lib/db/package.json"));
const temporary = await mkdtemp(join(root, "tmp-admin-test-"));
const verifyRegression = process.argv.includes("--verify-sql-regression");

async function run(mutate = false) {
  const outfile = join(temporary, "admin.test.cjs");
  const result = await build({
    absWorkingDir: root,
    entryPoints: ["tests/admin.test.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    plugins: [{
      name: "isolated-organizer-fixtures",
      setup(build) {
        build.onResolve({ filter: /^@workspace\/db$/ }, () => ({
          path: join(root, "tests/fixtures/database.ts"),
        }));
        build.onResolve({ filter: /^@workspace\/db\/schema$/ }, () => ({
          path: join(root, "../../lib/db/src/schema/index.ts"),
        }));
        // Keep pnpm's library-only dependencies resolvable from the temp bundle.
        build.onResolve({ filter: /^(?:zod(?:\/v4)?|drizzle-zod)$/ }, ({ path }) => ({
          path: dbRequire.resolve(path), external: true,
        }));
        build.onResolve({ filter: /^@workspace\/api-zod$/ }, () => ({
          path: join(root, "../../lib/api-zod/src/index.ts"),
        }));
        build.onResolve({ filter: /^(?:\.\.\/lib\/registrationNotifications|\.\/storage)$/ }, () => ({
          path: join(root, "tests/fixtures/services.ts"),
        }));
        if (mutate) build.onLoad({ filter: /src\/routes\/admin\.ts$/ }, async ({ path }) => ({
          contents: (await readFile(path, "utf8")).replaceAll('"team_registrations"."id"', '"id"'),
          loader: "ts",
        }));
      },
    }],
    metafile: true,
  });
  // Fail closed if a future import bypasses the isolation aliases.
  const inputs = Object.keys(result.metafile.inputs);
  if (inputs.some((path) => /(?:lib\/db\/src\/index|src\/lib\/(?:auth|objectStorage|registrationNotifications)|src\/routes\/storage)\.ts$/.test(path))) {
    throw new Error("A production DB, session, or external service entered the test bundle.");
  }
  const args = ["--test"];
  if (mutate) args.push("--test-name-pattern=correlated projections");
  args.push(outfile);
  return spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    // No production environment, DB connection, credentials, or organizer emails.
    env: { PATH: process.env.PATH, NODE_ENV: "test", TREASURE_ADMIN_EMAILS: "organizer@example.invalid" },
    timeout: 120_000,
  });
}

try {
  const normal = await run();
  if (normal.error) throw normal.error;
  process.exitCode = normal.status ?? 1;
  if (process.exitCode === 0 && verifyRegression) {
    console.log("\nNegative control: intentionally remove outer SQL qualification (failure expected).");
    const mutated = await run(true);
    if (mutated.error) throw mutated.error;
    if (mutated.status !== 1) throw new Error("Negative control did not fail as expected.");
    console.log("Confirmed: the regression check rejects the original SQL qualification bug.");
  }
} finally {
  // Only this invocation's temporary bundle; the database exists solely in memory.
  await rm(temporary, { recursive: true, force: true });
}
