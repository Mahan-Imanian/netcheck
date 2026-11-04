import { describe, expect, it } from "vitest";
import defaults from "../../config/thresholds.json";
import type { Baseline } from "../bindings/Baseline";
import type { Hop } from "../bindings/Hop";
import type { PingStats } from "../bindings/PingStats";
import type { RegionInfo } from "../bindings/RegionInfo";
import type { RegionResult } from "../bindings/RegionResult";
import type { RouteResult } from "../bindings/RouteResult";
import type { Thresholds } from "../bindings/Thresholds";
import { playWindows } from "./history";
import { sortRegions } from "./regions";
import { explainRoute } from "./routeText";
import { reduce } from "./store";
import { computeVerdict, type VerdictInput } from "./verdict";

const t = defaults as Thresholds;

function stats(avg: number, opts: { loss?: number; jitter?: number } = {}): PingStats {
  const lost = Math.round(((opts.loss ?? 0) * 20) / 100);
  const samples: Array<number | null> = Array.from({ length: 20 }, (_, i) => (i < lost ? null : avg));
  return { sent: 20, received: 20 - lost, lossPct: opts.loss ?? 0, min: avg, avg, p95: avg, max: avg, jitter: opts.jitter ?? 1, samples };
}

function region(code: string, avg: number | null, grade: RegionResult["grade"], opts: { loss?: number; jitter?: number; blocked?: boolean } = {}): RegionResult {
  return {
    code,
    target: "192.0.2.1",
    status: avg == null ? "NoReply" : "Measured",
    estimated: opts.blocked ?? false,
    block: opts.blocked ? { state: "blocked", rule: "r", group: "g", blocksIcmp: true } : { state: "open" },
    stats: avg == null ? null : stats(avg, opts),
    grade,
    normalMs: null,
  };
}

const infos: Record<string, RegionInfo> = Object.fromEntries(
  [
    ["vie", "Vienna"],
    ["fra", "Frankfurt"],
    ["dxb", "Dubai"],
  ].map(([code, city]) => [code, { code: code!, city: city!, desc: city!, lonLat: [0, 0], relayCount: 1, block: { state: "open" } } satisfies RegionInfo]),
);

const okBaseline: Baseline = { gatewayIp: "192.168.1.1", gateway: stats(1), internetIp: "1.1.1.1", internet: stats(68) };

function input(results: RegionResult[], over: Partial<VerdictInput> = {}): VerdictInput {
  return { preferred: "vie", infos, results, baseline: okBaseline, route: null, offline: false, finished: true, thresholds: t, ...over };
}

describe("verdict", () => {
  it("says good to play when the preferred region is clean", () => {
    const v = computeVerdict(input([region("vie", 82, "Good"), region("fra", 87, "Good")]));
    expect(v.kind).toBe("clean");
    expect(v.line).toBe("Good to play — Vienna 82 ms, 0% loss.");
  });

  it("points to a clean alternative when the preferred region is unstable", () => {
    const v = computeVerdict(input([region("vie", 82, "Playable", { loss: 5 }), region("fra", 87, "Good")]));
    expect(v.kind).toBe("unstable");
    expect(v.line).toBe("Vienna is unstable right now — Frankfurt is 5 ms behind and clean.");
    expect(v.alternative?.code).toBe("fra");
  });

  it("blames the ISP when the baseline and most regions are degraded", () => {
    const congested: Baseline = { ...okBaseline, internet: stats(140, { loss: 10 }) };
    const v = computeVerdict(
      input([region("vie", 150, "Bad", { loss: 10 }), region("fra", 160, "Bad", { loss: 5 }), region("dxb", 120, "Playable", { loss: 5 })], { baseline: congested }),
    );
    expect(v.kind).toBe("isp");
    expect(v.line).toContain("congested at your ISP");
  });

  it("blames Wi-Fi when the router itself is slow", () => {
    const v = computeVerdict(input([region("vie", 120, "Playable")], { baseline: { ...okBaseline, gateway: stats(38, { loss: 10 }) } }));
    expect(v.kind).toBe("wifi");
  });

  it("reports offline and every-region-blocked", () => {
    expect(computeVerdict(input([], { offline: true })).kind).toBe("offline");
    const blocked = computeVerdict(input([region("vie", 83, "Good", { blocked: true }), region("fra", 88, "Good", { blocked: true })]));
    expect(blocked.kind).toBe("allBlocked");
  });

  it("marks estimated numbers", () => {
    const v = computeVerdict(input([region("vie", 83, "Good", { blocked: true }), region("fra", 88, "Good")]));
    expect(v.line).toContain("(estimated)");
  });
});

function hop(ttl: number, addr: string, avg: number, segment: Hop["segment"], lost = 0): Hop {
  const s = stats(avg);
  return { ttl, addr, segment, isDestination: segment === "Valve", normalMs: null, stats: { ...s, sent: 6, received: 6 - lost, lossPct: (lost * 100) / 6 } };
}

describe("route explanation", () => {
  it("matches the brief's international-link sentence", () => {
    const route: RouteResult = {
      region: "vie",
      target: "155.133.0.10",
      estimated: false,
      noRoute: false,
      hops: [hop(1, "192.168.1.1", 1, "Local"), hop(2, "10.20.0.1", 2, "Isp"), hop(3, "198.51.100.17", 69, "International"), hop(4, "85.132.90.233", 134, "International", 2), hop(5, "155.133.0.10", 140, "Valve", 2)],
      diagnosis: {
        reachedDestination: true,
        finding: { segment: "International", ttl: 4, addr: "85.132.90.233", kind: "LatencyAndLoss", prevAvg: 69, avg: 134, lost: 2, sent: 6 },
      },
    };
    const e = explainRoute(route, { city: "Frankfurt", avg: 87 });
    expect(e.body).toBe(
      "Your router and ISP are fine (1 ms, 2 ms). The jump happens at 85.132.90.233, your ISP's international link: 69 → 134 ms with 2/6 lost. This is usually peak-hour congestion and nothing on your PC can fix it.",
    );
    expect(e.advice).toBe("Try again later, or play on Frankfurt (87 ms, clean).");
  });
});

describe("history", () => {
  it("finds the best and worst hour across days", () => {
    const cells = [
      { day: "2026-11-01", hour: 11, avgMs: 82, lossPct: 0, samples: 1 },
      { day: "2026-11-02", hour: 11, avgMs: 83, lossPct: 0, samples: 1 },
      { day: "2026-11-01", hour: 21, avgMs: 150, lossPct: 8, samples: 1 },
      { day: "2026-11-02", hour: 21, avgMs: 160, lossPct: 6, samples: 1 },
      { day: "2026-11-02", hour: 3, avgMs: 60, lossPct: 0, samples: 1 },
    ];
    const w = playWindows(cells);
    expect(w?.best.hour).toBe(11);
    expect(w?.worst.hour).toBe(21);
    expect(playWindows(cells.slice(0, 2))).toBeNull();
  });
});

describe("sorting and events", () => {
  it("sorts by average with unmeasured regions last", () => {
    const list = Object.values(infos);
    const results = { vie: region("vie", 82, "Good"), fra: region("fra", 60, "Good") };
    expect(sortRegions(list, results, "avg").map((i) => i.code)).toEqual(["fra", "vie", "dxb"]);
  });

  it("folds check events into state", () => {
    const base = {
      phase: "relays" as const, startedAtMs: null, finishedAtMs: null, preferred: "vie", relays: null, relayRefreshError: null, firewall: null,
      infos: {}, order: [], results: {}, arrival: [], baseline: null, route: null, offline: false, failure: null,
    };
    const r = region("vie", 82, "Good");
    const next = { ...base, ...reduce(base, { kind: "region", result: r }) };
    expect(next.arrival).toEqual(["vie"]);
    expect(reduce(next, { kind: "finished", checkId: 3, finishedAtMs: 5, offline: true })).toMatchObject({ phase: "done", offline: true });
  });
});
