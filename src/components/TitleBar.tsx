import { motion } from "motion/react";
import { Copy, Minus, Settings2, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { clock } from "../lib/format";
import { intlTag, useLocale, useT, type MessageKey } from "../i18n";
import { useApp, type Tab } from "../lib/store";
import { Logo } from "./Logo";

const TABS: Array<{ id: Tab; key: MessageKey }> = [
  { id: "verdict", key: "nav.verdict" },
  { id: "regions", key: "nav.regions" },
  { id: "map", key: "nav.map" },
  { id: "route", key: "nav.route" },
  { id: "history", key: "nav.history" },
];

function CheckStatus() {
  const t = useT();
  const locale = useLocale();
  const phase = useApp((s) => s.phase);
  const total = useApp((s) => s.order.length);
  const done = useApp((s) => s.arrival.length);
  const finishedAt = useApp((s) => s.finishedAtMs);
  const checking = phase === "boot" || phase === "relays" || phase === "checking";

  return (
    <div className="display flex items-baseline gap-2 text-[13.5px] font-semibold tracking-[0.08em] whitespace-nowrap text-text-3 uppercase" aria-live="polite">
      {phase === "checking" && total > 0 ? (
        <>
          <span className="max-[1180px]:hidden">{t("status.scanning")}</span>
          <span className="num tracking-normal" dir="ltr">
            <span className="text-text">{String(done).padStart(String(total).length, "0")}</span>/{total}
          </span>
        </>
      ) : checking ? (
        <span>{t("status.loading")}</span>
      ) : finishedAt ? (
        <span>{t("status.checked", { time: clock(finishedAt, intlTag(locale)) })}</span>
      ) : (
        <span className="text-bad">{t("status.stopped")}</span>
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
  const t = useT();
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const backend = useApp((s) => s.backend);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!backend) return;
    let off: (() => void) | undefined;
    const sync = () => void backend.window.isMaximized().then(setMaximized);
    sync();
    void backend.window.onResized(sync).then((f) => (off = f));
    return () => off?.();
  }, [backend]);

  const tabClass = (active: boolean) =>
    `display relative flex items-center px-3.5 text-[14.5px] font-semibold tracking-[0.1em] uppercase transition-colors duration-150 ${active ? "text-text" : "text-text-3 hover:text-text-2"}`;
  const bar = <motion.span layoutId="tab-bar" className="absolute inset-x-3.5 -bottom-px h-[2px] bg-accent" transition={{ type: "spring", stiffness: 520, damping: 42 }} />;

  return (
    <header data-tauri-drag-region className="relative z-30 flex h-12 shrink-0 items-stretch border-b border-line ps-4">
      <div data-tauri-drag-region className="flex items-center gap-2.5 pe-6">
        <Logo size={22} />
        <span data-tauri-drag-region className="display text-[19px] leading-none font-bold tracking-[0.14em] uppercase" dir="ltr">
          Netcheck
        </span>
      </div>

      <nav className="flex items-stretch border-s border-line ps-2" aria-label={t("nav.screens")}>
        {TABS.map((x) => (
          <button key={x.id} type="button" onClick={() => setTab(x.id)} aria-current={tab === x.id ? "page" : undefined} className={tabClass(tab === x.id)}>
            {t(x.key)}
            {tab === x.id && bar}
          </button>
        ))}
      </nav>

      <div data-tauri-drag-region className="flex-1" />

      <div data-tauri-drag-region className="flex items-stretch gap-1 pe-1">
        <div data-tauri-drag-region className="flex items-center pe-3">
          <CheckStatus />
        </div>
        <button
          type="button"
          onClick={() => setTab("settings")}
          aria-label={t("nav.settings")}
          aria-current={tab === "settings" ? "page" : undefined}
          title={t("nav.settings")}
          className={`${tabClass(tab === "settings")} !px-3`}
        >
          <Settings2 size={16} strokeWidth={2} aria-hidden />
          {tab === "settings" && <motion.span layoutId="tab-bar" className="absolute inset-x-2 -bottom-px h-[2px] bg-accent" transition={{ type: "spring", stiffness: 520, damping: 42 }} />}
        </button>
      </div>

      <div className="flex h-full items-stretch border-s border-line" dir="ltr">
        <WindowButton label={t("window.minimize")} onClick={() => void backend?.window.minimize()}>
          <Minus size={15} strokeWidth={1.5} />
        </WindowButton>
        <WindowButton label={maximized ? t("window.restore") : t("window.maximize")} onClick={() => void backend?.window.toggleMaximize()}>
          {maximized ? <Copy size={12} strokeWidth={1.5} className="-scale-x-100" /> : <Square size={11.5} strokeWidth={1.5} />}
        </WindowButton>
        <WindowButton label={t("window.close")} danger onClick={() => void backend?.window.close()}>
          <X size={16} strokeWidth={1.5} />
        </WindowButton>
      </div>
    </header>
  );
}
