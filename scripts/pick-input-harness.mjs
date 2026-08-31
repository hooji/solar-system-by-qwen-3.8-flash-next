/**
 * Node harness for scripts/pick-input.test.mjs — transpiles the two pure
 * picking modules (core/pickCoords.ts, core/pointerGesture.ts) with the
 * project's own TypeScript compiler and imports them via data URIs.
 * Both are three-free / DOM-free (same pattern as body-identity-harness).
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

export const pickCoords = await import(transpile("src/core/pickCoords.ts"));
export const gesture = await import(transpile("src/core/pointerGesture.ts"));
