// Captures the README screenshots from the demo backend.
// Usage: node scripts/screenshots.mjs [http://127.0.0.1:1420]
// Without a URL it builds the demo to a temp folder and loads it from disk.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { demoPage, launch, root, sleep } from "./cdp.mjs";

const shots = [
  ["unstable", "scenario=unstable", 1200, 760],
  ["verdict-done", "scenario=normal", 1200, 760],
  ["light", "scenario=normal&theme=light", 1200, 760],
  ["small-verdict", "scenario=normal", 960, 620],
  ["big-verdict", "scenario=unstable", 1920, 1080],
  ["regions", "scenario=unstable&tab=regions", 1200, 760],
  ["map-sweep", "scenario=unstable&tab=map", 1200, 760, 3200],
  ["route", "scenario=unstable&tab=route", 1200, 760],
  ["history", "scenario=normal&tab=history", 1200, 760],
  ["blocked", "scenario=blocked", 1200, 760],
  ["firewalloff", "scenario=firewalloff", 1200, 760],
  ["offline", "scenario=offline", 1200, 760],
  ["update", "scenario=normal&update=1", 1200, 760],
  ["settings", "scenario=normal&tab=settings", 1200, 760],
  ["persian", "scenario=unstable&lang=fa", 1200, 760],
];

const page = demoPage(process.argv[2]);
const browser = await launch();
try {
  for (const [name, query, width, height, wait = 9000] of shots) {
    await browser.viewport(width, height);
    await browser.open(`${page}?${query}`);
    await sleep(wait);
    writeFileSync(join(root, "docs", "screenshots", `${name}.png`), await browser.png(width, height));
    console.log(`${name} -> docs/screenshots/${name}.png`);
  }
} finally {
  browser.close();
}
