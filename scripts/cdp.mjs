// Drives headless Chrome (or Edge if Chrome is missing) over the DevTools protocol,
// for the screenshot, GIF and social preview scripts.
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Builds the demo to a temp folder and returns its index.html URL, unless a dev server URL is given. */
export function demoPage(base) {
  if (base) return `${base.replace(/\/$/, "")}/`;
  const dist = join(tmpdir(), "nc-demo-dist");
  execSync(`pnpm exec vite build --mode demo --base ./ --outDir "${dist}" --emptyOutDir`, { cwd: root, stdio: "ignore" });
  return pathToFileURL(join(dist, "index.html")).href;
}

export async function launch(port = 9333) {
  const chrome = join(process.env.ProgramFiles ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe");
  const edge = join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe");
  const profile = join(tmpdir(), `nc-cdp-${port}`);
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  const browser = spawn(existsSync(chrome) ? chrome : edge, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--allow-file-access-from-files", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });

  let wsUrl;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    try {
      wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json()).webSocketDebuggerUrl;
    } catch {
      /* the browser is still starting */
    }
    if (!wsUrl) await sleep(200);
  }
  if (!wsUrl) throw new Error("The browser didn't open a debugging port");

  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method) {
      listeners.get(msg.method)?.(msg.params);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });
  await send("Page.enable");
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });

  return {
    send,
    on: (method, fn) => listeners.set(method, fn),
    async viewport(width, height, scale = 1) {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
    },
    async open(url) {
      await send("Page.navigate", { url: "about:blank" });
      await send("Page.navigate", { url });
    },
    async png(width, height) {
      const { data } = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height, scale: 1 } });
      return Buffer.from(data, "base64");
    },
    close() {
      ws.close();
      browser.kill();
    },
  };
}
