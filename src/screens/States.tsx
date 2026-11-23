import { motion } from "motion/react";
import { CloudOff, Laptop, RotateCw, Router, ShieldAlert, WifiOff, Globe2 } from "lucide-react";
import { useT } from "../i18n";
import { useApp } from "../lib/store";

export function FirewallWarning() {
  const t = useT();
  const fw = useApp((s) => s.firewall);
  if (!fw?.warnInactive) return null;
  const p = fw.profiles;
  const names = p ? [t("fw.domain"), t("fw.private"), t("fw.public")].filter((_, i) => (p.active & (1 << i)) !== 0) : [];
  const profiles = names.length ? ` (${names.join(t("list.sep"))})` : "";
  return (
    <div role="status" className="flex shrink-0 items-start gap-3 rounded-md border border-playable/30 bg-playable/10 px-4 py-2.5">
      <ShieldAlert size={16} className="mt-0.5 shrink-0 text-playable" aria-hidden />
      <p className="text-[12.5px] text-pretty text-text">
        <span className="font-semibold text-playable">{t("fw.warn.h")} </span>
        {fw.groups.length ? t("fw.warn.groups", { groups: fw.groups.map((g) => `“${g}”`).join(t("list.sep")), profiles }) : t("fw.warn.rule", { profiles })}
      </p>
    </div>
  );
}

function ReCheck() {
  const t = useT();
  const startCheck = useApp((s) => s.startCheck);
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={() => void startCheck()}
      className="chamfer display inline-flex h-10 items-center gap-2 bg-accent px-5 text-[15px] font-bold tracking-[0.1em] text-accent-ink uppercase transition-[filter] duration-150 hover:brightness-110"
    >
      <RotateCw size={14} strokeWidth={2.4} /> {t("recheck.label")}
      <kbd className="num rounded-xs border border-black/20 px-1 text-[10px] opacity-70">R</kbd>
    </motion.button>
  );
}

function BrokenChain({ cutAfter }: { cutAfter: number }) {
  const t = useT();
  const nodes = [
    { icon: Laptop, label: t("offline.pc") },
    { icon: Router, label: t("offline.router") },
    { icon: Globe2, label: t("offline.internet") },
  ];
  return (
    <div className="flex items-start">
      {nodes.map((n, i) => {
        const Icon = n.icon;
        const dead = i > cutAfter;
        return (
          <div key={n.label} className="flex items-start">
            {i > 0 && (
              <div className="relative mt-[22px] w-24">
                <div className={`border-t-2 ${dead ? "border-dashed border-line-2" : "border-accent/70"}`} />
                {i === cutAfter + 1 && (
                  <motion.span
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="absolute top-1/2 left-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-bg text-bad ring-1 ring-bad/50"
                  >
                    <span className="text-[13px] leading-none font-bold">×</span>
                  </motion.span>
                )}
              </div>
            )}
            <div className="flex w-16 flex-col items-center gap-1.5">
              <span className={`grid size-11 place-items-center border ${dead ? "border-dashed border-line-2 text-text-3" : "border-accent/40 bg-accent/10 text-accent"}`}>
                <Icon size={18} strokeWidth={1.9} />
              </span>
              <span className={`text-[11.5px] ${dead ? "text-text-3" : "text-text-2"}`}>{n.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="mt-7 space-y-2 text-[13px] leading-snug text-text-2">
      {items.map((x, i) => (
        <li key={x} className="flex gap-3">
          <span className="num text-text-3">{String(i + 1).padStart(2, "0")}</span>
          <span className="text-pretty">{x}</span>
        </li>
      ))}
    </ol>
  );
}

export function OfflineScreen() {
  const t = useT();
  return (
    <div className="grid h-full place-items-center p-6">
      <section className="panel relative w-full max-w-[640px] overflow-hidden px-10 py-9" aria-label={t("offline.label")}>
        <div className="grid-texture pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(90% 70% at 50% 0%, color-mix(in srgb, var(--nc-bad) 10%, transparent), transparent 70%)" }}
          aria-hidden
        />
        <div className="relative">
          <div className="flex items-center gap-2 text-bad">
            <WifiOff size={16} strokeWidth={2.2} />
            <span className="hud-label text-current">{t("offline.kicker")}</span>
          </div>
          <h1 className="mt-3 text-[30px] leading-tight font-semibold tracking-[-0.025em]">{t("offline.h")}</h1>
          <p className="mt-2 max-w-[56ch] text-[14px] text-pretty text-text-2">{t("offline.b")}</p>
          <div className="mt-7">
            <BrokenChain cutAfter={0} />
          </div>
          <Steps items={[t("v.offline.s1"), t("v.offline.s2"), t("v.offline.s3")]} />
          <div className="mt-7">
            <ReCheck />
          </div>
        </div>
      </section>
    </div>
  );
}

export function NoRelayListScreen({ message }: { message: string }) {
  const t = useT();
  const host = "api.steampowered.com";
  return (
    <div className="grid h-full place-items-center p-6">
      <section className="panel relative w-full max-w-[640px] overflow-hidden px-10 py-9" aria-label={t("relays.label")}>
        <div className="grid-texture pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-2 text-playable">
            <CloudOff size={16} strokeWidth={2.2} />
            <span className="hud-label text-current">{t("relays.kicker")}</span>
          </div>
          <h1 className="mt-3 text-[30px] leading-tight font-semibold tracking-[-0.025em]">{t("relays.h")}</h1>
          <p className="mt-2 max-w-[60ch] text-[14px] text-pretty text-text-2">{t("relays.b", { host })}</p>
          <p className="num mt-4 rounded-sm border border-line bg-s1 px-3 py-2 text-[11.5px] break-words text-text-3" dir="ltr">
            {message}
          </p>
          <Steps items={[t("relays.s1"), t("relays.s2", { host })]} />
          <div className="mt-7">
            <ReCheck />
          </div>
        </div>
      </section>
    </div>
  );
}
