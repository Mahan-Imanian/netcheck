// Captures the README screenshots from the demo backend with headless Chrome, or Edge if Chrome is missing.
// Usage: node scripts/screenshots.mjs [http://127.0.0.1:1420]
// Without a URL it builds the demo to a temp folder and loads it from disk.
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "docs", "screenshots");
const chrome = join(process.env.ProgramFiles ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe");
const edge = join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe");
const exe = existsSync(chrome) ? chrome : edge;
const port = 9333;

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

let page = process.argv[2] ? `${process.argv[2].replace(/\/$/, "")}/` : null;
if (!page) {
  const dist = join(tmpdir(), "nc-demo-dist");
  execSync(`pnpm exec vite build --mode demo --base ./ --outDir "${dist}" --emptyOutDir`, { cwd: root, stdio: "ignore" });
  page = pathToFileURL(join(dist, "index.html")).href;
}

const profile = join(tmpdir(), "nc-edge-cdp");
rmSync(profile, { recursive: true, force: true });
mkdirSync(profile, { recursive: true });
const browser = spawn(exe, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--allow-file-access-from-files", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const tab = list.find((t) => t.type === "page");
      if (tab) return tab.webSocketDebuggerUrl;
    } catch {
      /* the browser is still starting */
    }
    await sleep(200);
  }
  throw new Error("The browser didn't open a debugging port");
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let nextId = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });

try {
  await send("Page.enable");
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  for (const [name, query, width, height, wait = 9000] of shots) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: "about:blank" });
    await send("Page.navigate", { url: `${page}?${query}` });
    await sleep(wait);
    const { data } = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height, scale: 1 } });
    writeFileSync(join(out, `${name}.png`), Buffer.from(data, "base64"));
    console.log(`${name} -> docs/screenshots/${name}.png`);
  }
} finally {
  ws.close();
  browser.kill();
}
