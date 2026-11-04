import { Channel, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { CheckEvent } from "../bindings/CheckEvent";
import type { HistoryCell } from "../bindings/HistoryCell";
import type { Settings } from "../bindings/Settings";
import type { UpdateInfo } from "../bindings/UpdateInfo";
import type { Backend } from "./backend";

interface Commands {
  get_settings: { args: Record<string, never>; result: Settings };
  save_settings: { args: { settings: Settings }; result: Settings };
  run_check: { args: { onEvent: Channel<CheckEvent> }; result: null };
  cancel_check: { args: Record<string, never>; result: null };
  history: { args: { code: string; days: number }; result: HistoryCell[] };
  launch_cs2: { args: Record<string, never>; result: null };
  check_update: { args: Record<string, never>; result: UpdateInfo | null };
  install_update: { args: { onProgress: Channel<[number, number]> }; result: null };
  open_release_page: { args: Record<string, never>; result: null };
  quit: { args: Record<string, never>; result: null };
}

function call<K extends keyof Commands>(cmd: K, args: Commands[K]["args"]): Promise<Commands[K]["result"]> {
  return invoke<Commands[K]["result"]>(cmd, args);
}

export function createTauriBackend(): Backend {
  const win = getCurrentWindow();
  return {
    demo: false,
    getSettings: () => call("get_settings", {}),
    saveSettings: (settings) => call("save_settings", { settings }),
    runCheck: async (onEvent) => {
      const channel = new Channel<CheckEvent>();
      channel.onmessage = onEvent;
      await call("run_check", { onEvent: channel });
    },
    cancelCheck: async () => {
      await call("cancel_check", {});
    },
    history: (code, days) => call("history", { code, days }),
    launchCs2: async () => {
      await call("launch_cs2", {});
    },
    checkUpdate: () => call("check_update", {}),
    installUpdate: async (onProgress) => {
      const channel = new Channel<[number, number]>();
      channel.onmessage = ([done, total]) => onProgress(done, total);
      await call("install_update", { onProgress: channel });
    },
    openReleasePage: async () => {
      await call("open_release_page", {});
    },
    quit: async () => {
      await call("quit", {});
    },
    window: {
      show: () => win.show(),
      minimize: () => win.minimize(),
      toggleMaximize: () => win.toggleMaximize(),
      close: () => win.close(),
      isMaximized: () => win.isMaximized(),
      onResized: (cb) => win.onResized(() => cb()),
    },
  };
}
