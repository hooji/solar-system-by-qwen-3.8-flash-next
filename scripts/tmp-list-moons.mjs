// Enumerate every parent-local satellite from the real data module (verification aid).
import { data } from "./orbit-shape-harness.mjs";
const S = data.SOLAR_SYSTEM;
const moons = S.filter((b) => b.type === "moon");
console.log(`total moons in data: ${moons.length}`);
for (const b of moons) {
  const rp = b.semiMajorAxis * (1 - b.eccentricity);
  const ra = b.semiMajorAxis * (1 + b.eccentricity);
  console.log(
    [b.id, "parent=" + (b.parentId ?? "?"), "a=" + b.semiMajorAxis, "e=" + b.eccentricity, "i=" + (b.inclinationDeg ?? 0), "rp=" + rp.toFixed(1), "ra=" + ra.toFixed(1)].join(" "),
  );
}
