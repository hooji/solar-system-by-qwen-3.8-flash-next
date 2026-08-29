// Scratch probe: Kepler solver residual sweep at extreme eccentricity.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const src = readFileSync(new URL("../src/core/Kepler.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const url = "data:text/javascript;base64," + Buffer.from(outputText).toString("base64");
const { solveKepler, ellipsePlanePosition } = await import(url);

for (const e of [0, 0.252, 0.9, 0.969, 0.999]) {
  let worst = 0;
  for (let i = 0; i < 20000; i++) {
    const M = (i / 20000) * Math.PI * 2;
    const E = solveKepler(M, e);
    const resid = Math.abs(((M - (E - e * Math.sin(E))) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
    worst = Math.max(worst, resid);
  }
  console.log(`e=${e} worst residual=${worst.toExponential(2)}`);
}
// r-range sanity: Pluto
const a = 39.6, pe = 0.252;
let rmin = Infinity, rmax = 0;
for (let i = 0; i < 100000; i++) {
  const { r } = ellipsePlanePosition((i / 100000) * 90560, 90560, a, pe, 0);
  rmin = Math.min(rmin, r); rmax = Math.max(rmax, r);
}
console.log(`pluto rmin=${rmin.toFixed(3)} (expect ${(a * (1 - pe)).toFixed(3)}) rmax=${rmax.toFixed(3)} (expect ${(a * (1 + pe)).toFixed(3)})`);
