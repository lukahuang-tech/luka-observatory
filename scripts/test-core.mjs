import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
await mkdir("work", { recursive: true });
await build({
  entryPoints: ["tests/core.test.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "work/core-test.mjs",
});
const r = spawnSync(process.execPath, ["--test", "work/core-test.mjs"], {
  stdio: "inherit",
});
process.exit(r.status || 0);
