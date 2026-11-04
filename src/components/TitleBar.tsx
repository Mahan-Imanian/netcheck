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
    <div className="flex items-center gap-2 text-[12px] whitespace-nowrap text-text-2" aria-live="polite">
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
          <span className="max-[1280px]:hidden"> regions</span>
        </span>
      ) : checking ? (
        <span>Loading relay list</span>
      ) : finishedAt ? (
        <span>
          <span className="max-[1280px]:hidden">Checked </span>
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
      className={`grid h-12 w-[46px] place-items-center text-text-2 transition-colors duration-150 ${danger ? "hover:bg-[#e81123] hover:text-white active:bg-[#c50f1f]" : "hover:bg-s4/70 hover:text-text active:bg-s3"}`}
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
    <header data-tauri-drag-region className="relative z-30 grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center pl-4">
      <div data-tauri-drag-region className="flex items-center gap-2.5">
        <Logo size={20} />
        <span data-tauri-drag-region className="text-[14px] font-semibold tracking-[-0.02em]">
          Netcheck
        </span>
      </div>

      <nav
        className="flex h-8 items-center gap-0.5 rounded-full p-[3px]"
        style={{ background: "var(--nc-glass)", boxShadow: "inset 0 0 0 1px var(--nc-line-2), inset 0 1px 0 var(--nc-hi)" }}
        aria-label="Screens"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`relative h-full rounded-full px-3.5 text-[12.5px] font-medium transition-colors duration-200 ${tab === t.id ? "text-text" : "text-text-3 hover:text-text-2"}`}
          >
            {tab === t.id && (
              <motion.span
                layoutId="tab-pill"
                className="absolute inset-0 rounded-full"
                style={{
                  background: "linear-gradient(180deg, var(--nc-s4), var(--nc-s3))",
                  boxShadow: "inset 0 1px 0 var(--nc-hi), inset 0 0 0 1px var(--nc-line-2), 0 4px 14px -6px color-mix(in srgb, var(--nc-accent) 50%, transparent)",
                }}
                transition={{ type: "spring", stiffness: 480, damping: 38 }}
              />
            )}
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </nav>

      <div data-tauri-drag-region className="flex h-full items-center justify-end">
        <div className="flex items-center gap-2.5 pr-2">
          <CheckStatus />
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => void startCheck()}
            disabled={checking}
            title="Re-check (R)"
            className="btn-ghost group whitespace-nowrap"
          >
            <RotateCw size={13} strokeWidth={2.25} className={`transition-transform duration-300 group-hover:rotate-90 ${checking ? "animate-spin [animation-duration:1.4s]" : ""}`} aria-hidden />
            <span className="max-[1100px]:hidden">Re-check</span>
            <kbd className="num rounded-[5px] px-1 text-[10px] text-text-3 shadow-[inset_0_0_0_1px_var(--nc-line-2)]">R</kbd>
          </motion.button>
          <button
            type="button"
            onClick={() => setTab("settings")}
            aria-label="Settings"
            aria-current={tab === "settings" ? "page" : undefined}
            title="Settings"
            className={`grid size-[30px] place-items-center rounded-full transition-colors duration-150 hover:bg-s4 ${tab === "settings" ? "bg-s4 text-accent" : "text-text-2"}`}
          >
            <Settings2 size={15} strokeWidth={2} />
          </button>
        </div>
        <div className="flex h-full items-stretch">
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
      </div>
    </header>
  );
}
