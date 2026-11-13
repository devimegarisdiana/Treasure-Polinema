import { build } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
const root = process.cwd();
const dbRequire = createRequire(path.resolve(root, "../../lib/db/package.json"));
const result = await build({
  absWorkingDir: root, entryPoints: ["tests/browser-team-editing-server.ts"],
  outfile: "dist/browser-team-editing.mjs", bundle: true, platform: "node", format: "esm", packages: "external",
  metafile: true,
  banner: { js: "import { createRequire as __cr } from 'node:module'; globalThis.require = __cr(import.meta.url);" },
  plugins: [{ name: "isolated-browser-fixtures", setup(builder) {
    builder.onResolve({ filter: /registrationPolicy$/ }, () => ({ path: path.join(root, "tests/fixtures/registrationPolicy.ts") }));
    builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: path.join(root, "tests/fixtures/portableDatabase.ts") }));
    builder.onResolve({ filter: /^@workspace\/db\/schema$/ }, () => ({ path: path.resolve(root, "../../lib/db/src/schema/index.ts") }));
    builder.onResolve({ filter: /^@workspace\/api-zod$/ }, () => ({ path: path.resolve(root, "../../lib/api-zod/src/index.ts") }));
    builder.onResolve({ filter: /^(?:zod(?:\/v4)?|drizzle-zod)$/ }, ({ path: name }) => ({ path: dbRequire.resolve(name), external: true }));
  } }],
});
if (Object.keys(result.metafile.inputs).some(name => name.endsWith("lib/db/src/index.ts"))) {
  throw new Error("The real database entered the isolated browser bundle.");
}
