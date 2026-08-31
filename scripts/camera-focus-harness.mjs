/**
 * Node harness for scripts/camera-focus.test.mjs — transpiles
 * core/CameraTween.ts with the project's TypeScript compiler and rewires its
 * `three` import to the real three.module.js from node_modules (Vector3 math
 * is environment-free). The solarSystemData import is type-only and stripped.
 * Same pattern as body-identity-harness.mjs; no extra deps.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const threeUrl = "file://" + path.join(root, "node_modules/three/build/three.module.js");

const source = readFileSync(path.join(root, "src/core/CameraTween.ts"), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const url =
  "data:text/javascript;base64," +
  Buffer.from(outputText.replace(/from\s+"three"/g, `from "${threeUrl}"`)).toString("base64");

export const camera = await import(url);
export const { Vector3 } = await import(threeUrl);
