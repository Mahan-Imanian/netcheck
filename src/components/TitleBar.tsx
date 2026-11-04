import { motion } from "motion/react";
import { Copy, Minus, RotateCw, Settings2, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { clock } from "../lib/format";
import { useApp, type Tab } from "../lib/store";
import { Logo } from "./Logo";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "verdict", label: "Verdict" },
  { id: "regions", label: "Regions" },
  { id: "map", label: "Map" },
  { id: "route", label: "Route" },
  { id: "history", label: "History" },
];

function CheckStatus() {
  const phase = useApp((s) => s.phase);
  const total = useApp((s) => s.order.length);
  const done = useApp((s) => s.arrival.length);
  const finishedAt = useApp((s) => s.finishedAtMs);
  const checking = phase === "boot" || phase === "relays" || phase === "checking";

  return (
    <div className="flex items-center gap-2 text-[12px] text-text-2" aria-live="polite">
      <span className="relative grid size-2 place-items-center">
        <span
          className={`size-2 rounded-full ${checking ? "live-dot bg-accent" : phase === "failed" ? "bg-bad" : "bg-good"}`}
          style={{ boxShadow: checking ? "0 0 10px var(--nc-accent)" : undefined }}
        />
      </span>
      {phase === "checking" && total > 0 ? (
        <span>
          <span className="num text-text">{String(done).padStart(String(total).length, "0")}</span>
          <span className="num text-text-3"> / {total}</span>
          <span className="max-[1080px]:hidden"> regions</span>
        </span>
      ) : checking ? (
        <span>Loading relay list</span>
      ) : finishedAt ? (
        <span>
          <span className="max-[1080px]:hidden">Checked </span>
          <span className="num text-text">{clock(finishedAt)}</span>
        </span>
      ) : (
        <span>Check stopped</span>
      )}
    </div>
  );
}

function WindowButton({ onClick, label, danger, children }: { onClick: () => void; label: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-10 w-[46px] place-items-center text-text-2 transition-colors duration-150 ${danger ? "hover:bg-[#e81123] hover:text-white active:bg-[#c50f1f]" : "hover:bg-s4 hover:text-text active:bg-s3"}`}
    >
      {children}
    </button>
  );
}

export function TitleBar() {
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const backend = useApp((s) => s.backend);
  const startCheck = useApp((s) => s.startCheck);
  const phase = useApp((s) => s.phase);
  const [maximized, setMaximized] = useState(false);
  const checking = phase === "relays" || phase === "checking";

  useEffect(() => {
    if (!backend) return;
    let off: (() => void) | undefined;
    const sync = () => void backend.window.isMaximized().then(setMaximized);
    sync();
    void backend.window.onResized(sync).then((f) => (off = f));
    return () => off?.();
  }, [backend]);

  return (
    <header data-tauri-drag-region className="relative z-30 flex h-10 shrink-0 items-center border-b border-line bg-s1/80 pl-3.5 backdrop-blur-sm">
      <div data-tauri-drag-region className="flex items-center gap-2 pr-5">
        <Logo size={18} />
        <span data-tauri-drag-region className="text-[13px] font-semibold tracking-[-0.01em]">
          Netcheck
        </span>
      </div>

      <nav className="flex h-full items-stretch" aria-label="Screens">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`relative px-3 text-[12.5px] font-medium transition-colors duration-150 ${tab === t.id ? "text-text" : "text-text-3 hover:text-text-2"}`}
          >
            {t.label}
            {tab === t.id && (
              <motion.span
                layoutId="tab-underline"
                className="absolute inset-x-2.5 -bottom-px h-[2px] rounded-full bg-accent"
                style={{ boxShadow: "0 0 12px var(--nc-accent)" }}
                transition={{ type: "spring", stiffness: 520, damping: 40 }}
              />
            )}
          </button>
        ))}
      </nav>

      <div data-tauri-drag-region className="h-full flex-1" />

      <div className="flex items-center gap-3 pr-2">
        <CheckStatus />
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={() => void startCheck()}
          disabled={checking}
          title="Re-check (R)"
          className="group flex h-7 items-center gap-1.5 rounded-md border border-line-2 bg-s3 px-2.5 text-[12px] font-medium text-text shadow-[inset_0_1px_0_var(--nc-hi)] transition-colors duration-150 hover:border-accent/50 hover:bg-s4 disabled:opacity-50"
        >
          <RotateCw size={13} strokeWidth={2.25} className={`transition-transform duration-300 group-hover:rotate-90 ${checking ? "animate-spin [animation-duration:1.4s]" : ""}`} aria-hidden />
          <span className="max-[1020px]:hidden">Re-check</span>
          <kbd className="num rounded-xs border border-line-2 px-1 text-[10px] text-text-3">R</kbd>
        </motion.button>
        <button
          type="button"
          onClick={() => setTab("settings")}
          aria-label="Settings"
          title="Settings"
          className={`grid size-7 place-items-center rounded-md transition-colors duration-150 hover:bg-s4 ${tab === "settings" ? "text-accent" : "text-text-2"}`}
        >
          <Settings2 size={15} strokeWidth={2} />
        </button>
      </div>

      <div className="flex h-full items-stretch border-l border-line">
        <WindowButton label="Minimize" onClick={() => void backend?.window.minimize()}>
          <Minus size={15} strokeWidth={1.5} />
        </WindowButton>
        <WindowButton label={maximized ? "Restore" : "Maximize"} onClick={() => void backend?.window.toggleMaximize()}>
          {maximized ? <Copy size={12} strokeWidth={1.5} className="-scale-x-100" /> : <Square size={11.5} strokeWidth={1.5} />}
        </WindowButton>
        <WindowButton label="Close" danger onClick={() => void backend?.window.close()}>
          <X size={16} strokeWidth={1.5} />
        </WindowButton>
      </div>
    </header>
  );
}
