/**
 * DEV-ONLY demo backend. Compiled in only when VITE_NETCHECK_DEMO=1; the
 * shipped build never imports this file. Everything here is synthetic:
 * city coordinates are public geography, every IP is from the RFC 5737
 * documentation ranges, and the latencies are invented for each scenario.
 */
import type { Backend } from "../lib/backend";
import type { Baseline } from "../bindings/Baseline";
import type { BlockState } from "../bindings/BlockState";
import type { CheckEvent } from "../bindings/CheckEvent";
import type { FirewallSummary } from "../bindings/FirewallSummary";
import type { Grade } from "../bindings/Grade";
import type { HistoryCell } from "../bindings/HistoryCell";
import type { Hop } from "../bindings/Hop";
import type { PingStats } from "../bindings/PingStats";
import type { RegionInfo } from "../bindings/RegionInfo";
import type { RegionResult } from "../bindings/RegionResult";
import type { RouteResult } from "../bindings/RouteResult";
import type { Segment } from "../bindings/Segment";
import type { Settings } from "../bindings/Settings";
import type { Thresholds } from "../bindings/Thresholds";
import defaults from "../../config/thresholds.json";

type Scenario = "normal" | "unstable" | "congested" | "wifi" | "offline" | "blocked" | "allblocked" | "firewalloff" | "cache" | "norelays" | "longroute";

const POPS: Array<[code: string, city: string, lon: number, lat: number, rtt: number]> = [
  ["dxb", "Dubai", 55.27, 25.2, 46], ["bom", "Mumbai", 72.88, 19.08, 72], ["vie", "Vienna", 16.37, 48.21, 82],
  ["waw", "Warsaw", 21.01, 52.23, 84], ["fra", "Frankfurt", 8.68, 50.11, 87], ["maa", "Chennai", 80.27, 13.08, 88],
  ["ams", "Amsterdam", 4.9, 52.37, 92], ["par", "Paris", 2.35, 48.86, 95], ["sto", "Stockholm", 18.07, 59.33, 96],
  ["lhr", "London", -0.13, 51.51, 98], ["hel", "Helsinki", 24.94, 60.17, 101], ["mad", "Madrid", -3.7, 40.42, 112],
  ["sgp", "Singapore", 103.82, 1.35, 138], ["hkg", "Hong Kong", 114.17, 22.32, 165], ["can", "Guangzhou", 113.26, 23.13, 172],
  ["iad", "Sterling", -77.43, 39.01, 178], ["sha", "Shanghai", 121.47, 31.23, 182], ["ctu", "Chengdu", 104.07, 30.57, 190],
  ["ord", "Chicago", -87.63, 41.88, 192], ["atl", "Atlanta", -84.39, 33.75, 195], ["tsn", "Tianjin", 117.2, 39.13, 195],
  ["jnb", "Johannesburg", 28.05, -26.2, 205], ["dfw", "Dallas", -96.8, 32.78, 210], ["seo", "Seoul", 126.98, 37.57, 215],
  ["tyo", "Tokyo", 139.69, 35.69, 225], ["sea", "Seattle", -122.33, 47.61, 240], ["lax", "Los Angeles", -118.24, 34.05, 245],
  ["eat", "Moses Lake", -119.28, 47.13, 248], ["gru", "Sao Paulo", -46.63, -23.55, 262], ["syd", "Sydney", 151.21, -33.87, 268],
  ["lim", "Lima", -77.04, -12.05, 280], ["eze", "Buenos Aires", -58.38, -34.6, 285], ["scl", "Santiago", -70.67, -33.45, 295],
];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function statsOf(samples: Array<number | null>): PingStats {
  const got = samples.filter((s): s is number => s != null);
  const sorted = [...got].sort((a, b) => a - b);
  const avg = got.length ? got.reduce((a, b) => a + b, 0) / got.length : null;
  const jitter = got.length > 1 ? got.slice(1).reduce((a, v, i) => a + Math.abs(v - (got[i] ?? v)), 0) / (got.length - 1) : got.length ? 0 : null;
  const rank = Math.max(1, Math.ceil(0.95 * sorted.length));
  return {
    sent: samples.length,
    received: got.length,
    lossPct: samples.length ? ((samples.length - got.length) * 100) / samples.length : 100,
    min: sorted[0] ?? null,
    avg,
    p95: sorted[rank - 1] ?? null,
    max: sorted[sorted.length - 1] ?? null,
    jitter,
    samples,
  };
}

function gradeOf(s: PingStats, t: Thresholds): Grade | null {
  const avg = s.avg;
  if (avg == null) return null;
  const fits = (l: { avgMs: number; jitterMs: number; lossPct: number }) => avg <= l.avgMs && (s.jitter ?? 0) <= l.jitterMs && s.lossPct <= l.lossPct;
  return fits(t.excellent) ? "Excellent" : fits(t.good) ? "Good" : fits(t.playable) ? "Playable" : "Bad";
}

function series(rand: () => number, base: number, spread: number, lost: number, count: number): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < count; i++) {
    const n = (rand() + rand() + rand() - 1.5) * spread;
    out.push(Math.max(1, Math.round(base + n + (rand() < 0.06 ? spread * 2.5 : 0))));
  }
  const idx = [...out.keys()].sort(() => rand() - 0.5).slice(0, lost);
  for (const i of idx) out[i] = null;
  return out;
}

interface Shape {
  rtt: number;
  spread: number;
  lost: number;
}

function shapeFor(scenario: Scenario, code: string, base: number, rand: () => number): Shape {
  const far = base > 200;
  const normal: Shape = { rtt: base, spread: far ? 4 : 2.2, lost: far && rand() < 0.25 ? 1 : 0 };
  switch (scenario) {
    case "unstable":
      if (code === "vie") return { rtt: 94, spread: 26, lost: 2 };
      if (code === "waw") return { rtt: 99, spread: 14, lost: 1 };
      return normal;
    case "congested":
      return { rtt: base + 45 + rand() * 50, spread: 12 + rand() * 12, lost: 1 + Math.floor(rand() * 3) };
    case "wifi":
      return { rtt: base + 36, spread: 14, lost: 2 };
    default:
      return normal;
  }
}

const relayIp = (i: number, k: number) => `${k === 0 ? "198.51.100" : "203.0.113"}.${20 + i * 3 + k}`;

function blockFor(scenario: Scenario, code: string): BlockState {
  if (scenario === "allblocked") return { state: "blocked", rule: "CS2 block all", group: "CS2 Vienna Only", blocksIcmp: true };
  if (scenario === "blocked" && code !== "vie") return { state: "blocked", rule: `CS2 block ${code}`, group: "CS2 Vienna Only", blocksIcmp: true };
  if (scenario === "firewalloff" && code !== "vie") return { state: "inactive", rule: `CS2 block ${code}`, group: "CS2 Vienna Only" };
  return { state: "open" };
}

function firewallFor(scenario: Scenario): FirewallSummary {
  const blocking = scenario === "blocked" || scenario === "allblocked" || scenario === "firewalloff";
  return {
    readable: true,
    error: null,
    profiles: { domain: scenario !== "firewalloff", private: scenario !== "firewalloff", public: true, active: 2 },
    blockRuleCount: blocking ? 32 : 0,
    groups: blocking ? ["CS2 Vienna Only"] : [],
    warnInactive: scenario === "firewalloff",
  };
}

function routeFor(scenario: Scenario, target: string, rand: () => number): RouteResult {
  type H = [addr: string | null, ms: number, lost: number, seg: Segment, spread?: number];
  const base: H[] = [
    ["192.168.1.1", 1, 0, "Local"],
    ["10.20.0.1", 2, 0, "Isp"],
    ["10.20.64.9", 4, 0, "Isp"],
    ["198.51.100.233", 69, 0, "International"],
    ["198.51.100.241", 72, 0, "International"],
    [null, 0, 6, "International"],
    ["203.0.113.66", 78, 0, "International"],
    [target, 82, 0, "Valve"],
  ];
  let hops: H[] = base;
  if (scenario === "unstable" || scenario === "congested") {
    hops = [
      ["192.168.1.1", 1, 0, "Local"],
      ["10.20.0.1", 2, 0, "Isp"],
      ["10.20.64.9", 4, 0, "Isp"],
      ["198.51.100.17", 69, 0, "International"],
      ["198.51.100.233", 134, 2, "International", 22],
      [null, 0, 6, "International"],
      ["203.0.113.66", 137, 2, "International", 20],
      [target, scenario === "unstable" ? 94 + 44 : 141, 2, "Valve", 24],
    ];
  }
  if (scenario === "wifi") hops = base.map(([a, m, l, s]) => [a, m + 36, l + (s === "Local" ? 1 : 0), s, 14] as H);
  if (scenario === "longroute") {
    hops = [
      ["192.168.1.1", 1, 0, "Local"],
      ["10.20.0.1", 2, 0, "Isp"],
      ["10.20.64.9", 3, 0, "Isp"],
      ["100.72.0.4", 5, 0, "Isp"],
      ["198.51.100.17", 31, 0, "International"],
      [null, 0, 6, "International"],
      ["198.51.100.90", 47, 0, "International"],
      ["198.51.100.101", 58, 0, "International"],
      [null, 0, 6, "International"],
      ["203.0.113.12", 66, 0, "International"],
      ["203.0.113.30", 71, 0, "International"],
      ["203.0.113.47", 74, 0, "International"],
      ["203.0.113.58", 76, 0, "International"],
      ["203.0.113.66", 79, 0, "International"],
      [target, 82, 0, "Valve"],
    ];
  }
  const out: Hop[] = hops.map(([addr, avg, lost, segment, spread], i) => ({
    ttl: i + 1,
    addr,
    stats: addr ? statsOf(series(rand, avg, spread ?? Math.max(0.6, avg * 0.02), lost, 6)) : null,
    segment,
    isDestination: addr === target,
    normalMs: null,
  }));
  const problemIdx = scenario === "unstable" || scenario === "congested" ? 4 : scenario === "wifi" ? 0 : -1;
  const problem = out[problemIdx];
  const prev = out[problemIdx - 1];
  return {
    region: "vie",
    target,
    estimated: false,
    hops: out,
    noRoute: false,
    diagnosis: {
      reachedDestination: true,
      finding: problem
        ? {
            segment: problem.segment,
            ttl: problem.ttl,
            addr: problem.addr,
            kind: (problem.stats?.received ?? 0) < (problem.stats?.sent ?? 0) ? "LatencyAndLoss" : "Latency",
            prevAvg: prev?.stats?.avg ?? 0,
            avg: problem.stats?.avg ?? null,
            lost: (problem.stats?.sent ?? 0) - (problem.stats?.received ?? 0),
            sent: problem.stats?.sent ?? 0,
          }
        : null,
    },
  };
}

function demoHistory(scenario: Scenario): HistoryCell[] {
  if (scenario === "cache" || scenario === "norelays") return [];
  const rand = rng(7);
  const cells: HistoryCell[] = [];
  const now = new Date();
  for (let d = 13; d >= 0; d--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const hours = [10, 13, 15, 17, 19, 20, 21, 22, 23].filter(() => rand() < 0.55);
    for (const hour of hours) {
      const peak = hour >= 20 && hour <= 23 ? 30 + rand() * 75 : hour >= 18 ? 8 + rand() * 20 : rand() * 4;
      cells.push({ day, hour, avgMs: 81 + peak + rand() * 3, lossPct: peak > 50 ? Math.round(rand() * 10) : 0, samples: 1 + Math.floor(rand() * 2) });
    }
  }
  return cells;
}

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export function createDemoBackend(params: URLSearchParams): Backend {
  const scenario = (params.get("scenario") ?? "normal") as Scenario;
  const speed = Number(params.get("speed") ?? "1") || 1;
  let settings: Settings = {
    preferredRegion: "vie",
    pingCount: 20,
    thresholds: defaults as Thresholds,
    closeAfterLaunch: null,
    theme: (params.get("theme") as Settings["theme"] | null) ?? "dark",
    homeLonLat: null,
  };
  let run = 0;

  const runCheck = async (emit: (e: CheckEvent) => void) => {
    const id = ++run;
    const alive = () => id === run;
    const t = (ms: number) => wait(ms / speed);
    const rand = rng(scenario.length * 97 + 3);
    const now = Date.now();

    await t(scenario === "cache" ? 900 : 380);
    if (!alive()) return;
    if (scenario === "norelays" || scenario === "offline") {
      if (scenario === "offline") {
        const infos: RegionInfo[] = POPS.map(([code, city, lon, lat], i) => ({ code, city, desc: city, lonLat: [lon, lat], relayCount: 2 + (i % 2), block: { state: "open" } }));
        emit({ kind: "started", startedAtMs: now, preferred: "vie", relays: { source: "Cache", fetchedAtMs: now - 3 * 3600_000, liveError: "error sending request" }, firewall: firewallFor("normal"), regions: infos });
        for (const info of infos) {
          await t(25);
          emit({ kind: "region", result: { code: info.code, target: null, status: "NoReply", estimated: false, block: info.block, stats: null, grade: null, normalMs: null } });
        }
        emit({ kind: "baseline", baseline: { gatewayIp: null, gateway: null, internetIp: "1.1.1.1", internet: statsOf(Array(10).fill(null)) } });
        emit({ kind: "finished", checkId: null, finishedAtMs: Date.now(), offline: true });
        return;
      }
      emit({ kind: "failed", message: "Valve's relay list could not be fetched: error sending request for url (https://api.steampowered.com/ISteamApps/GetSDRConfig/v1/?appid=730): operation timed out", offline: false, hasCache: false });
      return;
    }

    const infos: RegionInfo[] = POPS.map(([code, city, lon, lat], i) => ({ code, city, desc: city, lonLat: [lon, lat], relayCount: 2 + (i % 2), block: blockFor(scenario, code) }));
    infos.sort((a, b) => Number(b.code === settings.preferredRegion) - Number(a.code === settings.preferredRegion));
    const cached = scenario === "cache";
    emit({
      kind: "started",
      startedAtMs: now,
      preferred: settings.preferredRegion,
      relays: { source: cached ? "Cache" : "Live", fetchedAtMs: cached ? now - 3 * 86_400_000 : now, liveError: cached ? "Valve answered with HTTP 503" : null },
      firewall: firewallFor(scenario),
      regions: infos,
    });

    const plan = infos.map((info, i) => {
      const pop = POPS.find((p) => p[0] === info.code);
      const shape = shapeFor(scenario, info.code, pop?.[4] ?? 100, rand);
      const blocked = info.block.state === "blocked";
      const samples = series(rand, shape.rtt + (blocked ? 1 : 0), shape.spread, shape.lost, settings.pingCount);
      const stats = statsOf(samples);
      const result: RegionResult = {
        code: info.code,
        target: blocked ? relayIp(i, 0).replace(/\.(\d+)$/, (_, n: string) => `.${Number(n) - 1}`) : relayIp(i, 0),
        status: "Measured",
        estimated: blocked,
        block: info.block,
        stats,
        grade: gradeOf(stats, settings.thresholds),
        normalMs: info.code === "vie" ? 82 : null,
      };
      return { result, duration: 160 + (settings.pingCount - 1) * 100 + shape.rtt };
    });

    const lanes = Array.from({ length: 16 }, () => 0);
    const schedule = plan.map((p) => {
      const lane = lanes.indexOf(Math.min(...lanes));
      const at = (lanes[lane] ?? 0) + p.duration;
      lanes[lane] = at;
      return { at, result: p.result };
    });
    const vie = plan.find((p) => p.result.code === settings.preferredRegion);
    const events: Array<{ at: number; e: CheckEvent }> = schedule.map(({ at, result }) => ({ at, e: { kind: "region", result } }));
    const gateway = scenario === "wifi" ? statsOf(series(rand, 38, 14, 1, 10)) : statsOf(series(rand, 1, 0.4, 0, 10));
    const internet =
      scenario === "congested" ? statsOf(series(rand, 140, 26, 1, 10)) : scenario === "wifi" ? statsOf(series(rand, 104, 14, 1, 10)) : statsOf(series(rand, 68, 1.6, 0, 10));
    const baseline: Baseline = { gatewayIp: "192.168.1.1", gateway, internetIp: "1.1.1.1", internet };
    const last = Math.max(...schedule.map((s) => s.at));
    events.push({ at: 1250, e: { kind: "baseline", baseline } });
    if (vie?.result.target) events.push({ at: last + 40, e: { kind: "route", route: routeFor(scenario, vie.result.target, rand) } });
    events.sort((a, b) => a.at - b.at);

    let clock = 0;
    for (const { at, e } of events) {
      await t(at - clock);
      clock = at;
      if (!alive()) return;
      emit(e);
    }
    await t(120);
    if (alive()) emit({ kind: "finished", checkId: 1, finishedAtMs: Date.now(), offline: false });
  };

  return {
    demo: true,
    getSettings: async () => settings,
    saveSettings: async (s) => {
      settings = { ...s, pingCount: Math.min(100, Math.max(10, s.pingCount)) };
      return settings;
    },
    runCheck,
    cancelCheck: async () => {
      run++;
    },
    history: async () => demoHistory(scenario),
    launchCs2: async () => wait(500),
    quit: async () => {
      document.body.dataset.demoQuit = "1";
    },
    window: {
      minimize: async () => {},
      toggleMaximize: async () => {},
      close: async () => {},
      isMaximized: async () => false,
      onResized: async () => () => {},
    },
  };
}
