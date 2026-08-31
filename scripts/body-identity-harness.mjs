/**
 * Node harness for scripts/body-identity.test.mjs — transpiles
 * core/bodyIdentity.ts AND its data dependency with the project's own
 * TypeScript compiler, rewires the relative import to the transpiled data
 * module (data-URI), and imports the result. bodyIdentity is pure (no
 * three.js / DOM), so it runs directly under Node (same pattern as
 * overlay-state-harness.mjs / sim-time-harness.mjs). No extra deps.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const here = path.dirname(fileURLToPath(import.meta.url));

function transpile(rel) {
  const source = readFileSync(path.join(here, "..", rel), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return "data:text/javascript;base64," + Buffer.from(outputText).toString("base64");
}

const dataUrl = transpile("src/data/solarSystemData.ts");
// Re-encode with the data import rewired to the transpiled data module.
const identitySrc = transpile("src/core/bodyIdentity.ts");
const url =
  "data:text/javascript;base64," +
  Buffer.from(
    Buffer.from(identitySrc.split(",")[1], "base64").toString("utf8").replace(
      /from\s+"\.\.\/data\/solarSystemData"/g,
      `from "${dataUrl}"`,
    ),
  ).toString("base64");

export const identity = await import(url);
export const data = await import(dataUrl);
