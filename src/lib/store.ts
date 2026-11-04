import { create } from "zustand";
import type { Baseline } from "../bindings/Baseline";
import type { CheckEvent } from "../bindings/CheckEvent";
import type { FirewallSummary } from "../bindings/FirewallSummary";
import type { HistoryCell } from "../bindings/HistoryCell";
import type { RegionInfo } from "../bindings/RegionInfo";
import type { RegionResult } from "../bindings/RegionResult";
import type { RelayMeta } from "../bindings/RelayMeta";
import type { RouteResult } from "../bindings/RouteResult";
import type { Settings } from "../bindings/Settings";
import type { Backend } from "./backend";
import { bestRegion } from "./regions";

export type Phase = "boot" | "relays" | "checking" | "done" | "failed";
export type Tab = "verdict" | "regions" | "map" | "route" | "history" | "settings";

export interface Failure {
  message: string;
  offline: boolean;
}

interface CheckState {
  phase: Phase;
  startedAtMs: number | null;
  finishedAtMs: number | null;
  preferred: string;
  auto: boolean;
  relays: RelayMeta | null;
  relayRefreshError: string | null;
  firewall: FirewallSummary | null;
  infos: Record<string, RegionInfo>;
  order: string[];
  results: Record<string, RegionResult>;
  arrival: string[];
  baseline: Baseline | null;
  route: RouteResult | null;
  offline: boolean;
  failure: Failure | null;
}

interface AppState extends CheckState {
  backend: Backend | null;
  settings: Settings | null;
  history: HistoryCell[];
  tab: Tab;
  selected: string | null;
  setBackend(b: Backend): void;
  setTab(t: Tab): void;
  select(code: string | null): void;
  startCheck(): Promise<void>;
  saveSettings(s: Settings): Promise<void>;
  loadHistory(): Promise<void>;
}

const emptyCheck = (preferred: string): CheckState => ({
  phase: "relays",
  startedAtMs: null,
  finishedAtMs: null,
  preferred,
  auto: preferred === "auto",
  relays: null,
  relayRefreshError: null,
  firewall: null,
  infos: {},
  order: [],
  results: {},
  arrival: [],
  baseline: null,
  route: null,
  offline: false,
  failure: null,
});

let runId = 0;

export function reduce(state: CheckState, e: CheckEvent): Partial<CheckState> {
  switch (e.kind) {
    case "started":
      return {
        phase: "checking",
        startedAtMs: e.startedAtMs,
        preferred: e.preferred,
        auto: e.preferred === "auto",
        relays: e.relays,
        firewall: e.firewall,
        infos: Object.fromEntries(e.regions.map((r) => [r.code, r])),
        order: e.regions.map((r) => r.code),
      };
    case "region": {
      const results = { ...state.results, [e.result.code]: e.result };
      const fastest = state.auto ? bestRegion(Object.values(results), { excludeBlocked: true })?.code : undefined;
      return { results, arrival: [...state.arrival, e.result.code], ...(fastest ? { preferred: fastest } : {}) };
    }
    case "baseline":
      return { baseline: e.baseline };
    case "route":
      return { route: e.route, ...(state.auto ? { preferred: e.route.region } : {}) };
    case "relayRefresh":
      return e.ok && state.relays
        ? { relays: { ...state.relays, source: "Live", fetchedAtMs: e.fetchedAtMs, liveError: null }, relayRefreshError: null }
        : { relayRefreshError: e.error };
    case "finished":
      return { phase: "done", finishedAtMs: e.finishedAtMs, offline: e.offline };
    case "failed":
      return { phase: "failed", failure: { message: e.message, offline: e.offline }, offline: e.offline };
  }
}

export const useApp = create<AppState>((set, get) => ({
  ...emptyCheck("vie"),
  phase: "boot",
  backend: null,
  settings: null,
  history: [],
  tab: "verdict",
  selected: null,
  setBackend: (backend) => set({ backend }),
  setTab: (tab) => set({ tab }),
  select: (selected) => set({ selected }),

  startCheck: async () => {
    const { backend, settings } = get();
    if (!backend) return;
    const id = ++runId;
    set({ ...emptyCheck(settings?.preferredRegion ?? get().preferred) });
    try {
      await backend.runCheck((event) => {
        if (id !== runId) return;
        set((s) => reduce(s, event));
      });
    } catch (err) {
      if (id === runId) set({ phase: "failed", failure: { message: String(err), offline: false } });
    }
    if (id === runId) void get().loadHistory();
  },

  saveSettings: async (s) => {
    const { backend } = get();
    if (!backend) return;
    const saved = await backend.saveSettings(s);
    const regionChanged = saved.preferredRegion !== get().settings?.preferredRegion;
    set({ settings: saved });
    if (regionChanged) void get().loadHistory();
  },

  loadHistory: async () => {
    const { backend, settings } = get();
    if (!backend || !settings) return;
    const code = settings.preferredRegion === "auto" ? get().preferred : settings.preferredRegion;
    if (code === "auto") return;
    set({ history: await backend.history(code, 14) });
  },
}));
