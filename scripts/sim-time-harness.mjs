/**
 * Node harness for scripts/sim-time.test.mjs — transpiles the PURE math
 * modules (Kepler.ts, simMath.ts, SimulationClock.ts) with the project's own
 * TypeScript compiler and imports them as ESM data modules. These three have
 * no three.js / DOM dependencies, so they load and run directly under Node
 * (same approach as overlay-state-harness.mjs). No extra test-only deps.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const here = path.dirname(fileURLToPath(import.meta.url));

function loadTs(rel) {
  const source = readFileSync(path.join(here, "..", rel), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const url = "data:text/javascript;base64," + Buffer.from(outputText).toString("base64");
  return import(url);
}

export const kepler = await loadTs("src/core/Kepler.ts");
export const simMath = await loadTs("src/core/simMath.ts");
export const clockMod = await loadTs("src/core/SimulationClock.ts");
