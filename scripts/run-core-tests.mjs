import { build } from "esbuild";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const testDir = "tests";
const outDir = ".tmp-tests";
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const tests = readdirSync(testDir)
  .filter((file) => file.endsWith(".test.ts"))
  .map((file) => join(testDir, file));

if (tests.length === 0) {
  console.error("No tests found under tests/*.test.ts");
  process.exit(1);
}

const outputs = [];
for (const entryPoint of tests) {
  const output = join(outDir, `${basename(entryPoint, ".test.ts")}.mjs`);
  outputs.push(output);
  await build({
    entryPoints: [entryPoint],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "esm",
    sourcemap: "inline",
    logLevel: "silent",
    external: ["node:*"],
  });
}

const result = spawnSync(process.execPath, ["--test", ...outputs], { stdio: "inherit" });
process.exit(result.status ?? 1);
