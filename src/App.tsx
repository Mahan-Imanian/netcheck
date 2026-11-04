import { AnimatePresence, motion, MotionConfig, useReducedMotion } from "motion/react";
import { useEffect } from "react";
import { StatusBar } from "./components/StatusBar";
import { TitleBar } from "./components/TitleBar";
import { loadBackend } from "./lib/backend";
import { useApp, type Tab } from "./lib/store";
import { HistoryScreen } from "./screens/HistoryScreen";
import { MapScreen } from "./screens/MapScreen";
import { RegionsScreen } from "./screens/Regions";
import { RouteScreen } from "./screens/RouteScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { NoRelayListScreen, OfflineScreen } from "./screens/States";
import { VerdictScreen } from "./screens/Verdict";

const SCREENS: Record<Tab, () => React.JSX.Element | null> = {
  verdict: VerdictScreen,
  regions: RegionsScreen,
  map: MapScreen,
  route: RouteScreen,
  history: HistoryScreen,
  settings: SettingsScreen,
};

function useTheme() {
  const theme = useApp((s) => s.settings?.theme ?? "system");
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const resolved = theme === "system" ? (media.matches ? "light" : "dark") : theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

function useBoot() {
  useEffect(() => {
    let alive = true;
    void (async () => {
      const backend = await loadBackend();
      if (!alive) return;
      const settings = await backend.getSettings();
      useApp.setState({ backend, settings, preferred: settings.preferredRegion });
      void useApp.getState().startCheck();
      void useApp.getState().loadHistory();
    })();
    return () => {
      alive = false;
    };
  }, []);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "r" || e.key === "R") {
        const { phase, startCheck } = useApp.getState();
        if (phase === "done" || phase === "failed") void startCheck();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function Content() {
  const reduce = useReducedMotion();
  const tab = useApp((s) => s.tab);
  const failure = useApp((s) => s.failure);
  const offline = useApp((s) => s.offline);
  const hasRegions = useApp((s) => s.order.length > 0);

  let key: string = tab;
  let Screen = SCREENS[tab];
  if (tab !== "settings" && tab !== "history") {
    if (offline) {
      key = "offline";
      Screen = OfflineScreen;
    } else if (failure && !hasRegions) {
      key = "no-relays";
      Screen = () => <NoRelayListScreen message={failure.message} />;
    }
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.main
        key={key}
        className="min-h-0 flex-1"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      >
        <Screen />
      </motion.main>
    </AnimatePresence>
  );
}

export function App() {
  useBoot();
  useTheme();
  useShortcuts();
  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-full flex-col bg-bg">
        <TitleBar />
        <Content />
        <StatusBar />
      </div>
    </MotionConfig>
  );
}
