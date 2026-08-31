/**
 * Node harness for scripts/info-format.test.mjs — transpiles the PURE
 * display-format module (ui/format.ts, no DOM/three/data imports) with the
 * project's own TypeScript compiler and imports it via a data-URI (same
 * pattern as body-identity-harness.mjs). Also transpiles the dataset so the
 * tests can sweep every real body through the formatters. No extra deps.
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

export const format = await import(transpile("src/ui/format.ts"));
export const data = await import(transpile("src/data/solarSystemData.ts"));
