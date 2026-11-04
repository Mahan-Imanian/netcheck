import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve("world-atlas/land-50m.json"), "utf8"));
const land = feature(topo, topo.objects.land);

const STEP = 1.8;
const LAT_MAX = 78;
const LAT_MIN = -56;
const dots = [];
let row = 0;
for (let lat = LAT_MAX; lat >= LAT_MIN; lat -= STEP * 0.866, row++) {
  const offset = row % 2 === 0 ? 0 : STEP / 2;
  for (let lon = -180 + offset; lon < 180; lon += STEP) {
    if (geoContains(land, [lon, lat])) dots.push([+lon.toFixed(2), +lat.toFixed(2)]);
  }
}
writeFileSync(
  new URL("../src/assets/land-dots.json", import.meta.url),
  JSON.stringify({ step: STEP, latMax: LAT_MAX, latMin: LAT_MIN, dots }),
);
console.log(`${dots.length} land dots`);
