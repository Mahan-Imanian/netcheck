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
    <div className="display flex items-center gap-2 text-[13.5px] font-semibold tracking-[0.08em] whitespace-nowrap text-text-2 uppercase" aria-live="polite">
      <span className={`size-[7px] ${checking ? "live-dot bg-accent" : phase === "failed" ? "bg-bad" : "bg-good"}`} />
      {phase === "checking" && total > 0 ? (
        <span>
          <span className="text-text">{String(done).padStart(String(total).length, "0")}</span>
          <span className="text-text-3"> / {total}</span>
          <span className="max-[1280px]:hidden"> regions</span>
        </span>
      ) : checking ? (
        <span>Loading relay list</span>
      ) : finishedAt ? (
        <span>
          <span className="max-[1280px]:hidden">Checked </span>
          <span className="text-text">{clock(finishedAt)}</span>
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
    <header data-tauri-drag-region className="relative z-30 flex h-12 shrink-0 items-stretch border-b border-line pl-4">
      <div data-tauri-drag-region className="flex items-center gap-2.5 pr-6">
        <Logo size={22} />
        <span data-tauri-drag-region className="display text-[19px] leading-none font-bold tracking-[0.14em] uppercase">
          Netcheck
        </span>
      </div>

      <nav className="flex items-stretch border-l border-line pl-2" aria-label="Screens">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`display relative px-3.5 text-[14.5px] font-semibold tracking-[0.1em] uppercase transition-colors duration-150 ${tab === t.id ? "text-text" : "text-text-3 hover:text-text-2"}`}
          >
            {t.label}
            {tab === t.id && (
              <motion.span layoutId="tab-bar" className="absolute inset-x-3.5 -bottom-px h-[2px] bg-accent" transition={{ type: "spring", stiffness: 520, damping: 42 }} />
            )}
          </button>
        ))}
      </nav>

      <div data-tauri-drag-region className="flex-1" />

      <div data-tauri-drag-region className="flex h-full items-center justify-end">
        <div className="flex items-center gap-2.5 pr-2">
          <CheckStatus />
          <button type="button" onClick={() => void startCheck()} disabled={checking} title="Re-check (R)" className="btn-ghost group whitespace-nowrap">
            <RotateCw size={13} strokeWidth={2.5} className={`transition-transform duration-300 group-hover:rotate-90 ${checking ? "animate-spin [animation-duration:1.4s]" : ""}`} aria-hidden />
            <span className="max-[1100px]:hidden">Re-check</span>
            <kbd className="num px-1 text-[10px] text-text-3 shadow-[inset_0_0_0_1px_var(--nc-line-2)]">R</kbd>
          </button>
          <button
            type="button"
            onClick={() => setTab("settings")}
            aria-label="Settings"
            aria-current={tab === "settings" ? "page" : undefined}
            title="Settings"
            className={`grid size-[30px] place-items-center shadow-[inset_0_0_0_1px_var(--nc-line-2)] transition-colors duration-150 hover:bg-s4 ${tab === "settings" ? "bg-s4 text-text" : "bg-s3 text-text-2"}`}
          >
            <Settings2 size={15} strokeWidth={2} />
          </button>
        </div>        <div className="flex h-full items-stretch">
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
