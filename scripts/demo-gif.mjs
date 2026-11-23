// Records docs/assets/demo.gif from the demo backend: a full check from the first
// ping to the verdict, slowed a little so the scan is easy to follow. Needs ffmpeg on PATH.
// Usage: node scripts/demo-gif.mjs [http://127.0.0.1:1420]
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demoPage, launch, root, sleep } from "./cdp.mjs";

const width = 1200;
const height = 760;
const fps = 15;
const seconds = 16;
const dir = join(tmpdir(), "nc-gif-frames");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const page = demoPage(process.argv[2]);
const browser = await launch(9335);
const captured = [];
try {
  await browser.viewport(width, height);
  await browser.open("about:blank");
  await sleep(500);
  browser.on("Page.screencastFrame", ({ data, sessionId, metadata }) => {
    captured.push({ t: metadata.timestamp, data });
    void browser.send("Page.screencastFrameAck", { sessionId });
  });
  await browser.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: width, maxHeight: height });
  await browser.send("Page.navigate", { url: `${page}?scenario=unstable&speed=0.6` });
  await sleep((seconds + 1.5) * 1000);
  await browser.send("Page.stopScreencast");
} finally {
  browser.close();
}

// Screencast frames arrive only when something changes; resample them to a steady frame rate.
const frames = captured.filter((f) => f.data.length > 2000);
// Skip the blank first moment while the page loads.
const t0 = frames[0].t + 1.2;
let k = 0;
for (let i = 0; i < fps * seconds; i++) {
  const at = t0 + i / fps;
  while (k + 1 < frames.length && frames[k + 1].t <= at) k++;
  writeFileSync(join(dir, `${String(i).padStart(4, "0")}.jpg`), Buffer.from(frames[k].data, "base64"));
}

const out = join(root, "docs", "assets", "demo.gif");
const filter = `scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", join(dir, "%04d.jpg"), "-vf", filter, "-loop", "0", out], { stdio: "inherit" });
console.log(`demo.gif -> docs/assets/demo.gif (${frames.length} source frames)`);
