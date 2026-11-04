import type { CheckEvent } from "../bindings/CheckEvent";
import type { HistoryCell } from "../bindings/HistoryCell";
import type { Settings } from "../bindings/Settings";

export interface WindowControls {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  onResized(cb: () => void): Promise<() => void>;
}

export interface Backend {
  readonly demo: boolean;
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<Settings>;
  runCheck(onEvent: (event: CheckEvent) => void): Promise<void>;
  cancelCheck(): Promise<void>;
  history(code: string, days: number): Promise<HistoryCell[]>;
  launchCs2(): Promise<void>;
  quit(): Promise<void>;
  window: WindowControls;
}

let instance: Backend | null = null;

export async function loadBackend(): Promise<Backend> {
  if (instance) return instance;
  if (import.meta.env.VITE_NETCHECK_DEMO === "1") {
    const { createDemoBackend } = await import("../demo/demoBackend");
    instance = createDemoBackend(new URLSearchParams(window.location.search));
    return instance;
  }
  const { createTauriBackend } = await import("./tauriBackend");
  instance = createTauriBackend();
  return instance;
}
