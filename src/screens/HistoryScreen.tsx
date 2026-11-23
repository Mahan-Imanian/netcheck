import { motion } from "motion/react";
import { Clock3, Moon } from "lucide-react";
import { useMemo, useState } from "react";
import type { HistoryCell } from "../bindings/HistoryCell";
import type { Thresholds } from "../bindings/Thresholds";
import { Flag } from "../components/Flag";
import { hourLabel, ms, pct } from "../lib/format";
import { lastDays, playWindows } from "../lib/history";
import { intlTag, useLocale, useT } from "../i18n";
import { useApp } from "../lib/store";

function cellColor(c: HistoryCell, t: Thresholds): string {
  const v = c.avgMs;
  if (v <= t.excellent.avgMs && c.lossPct <= t.excellent.lossPct) return "var(--nc-excellent)";
  if (v <= t.good.avgMs && c.lossPct <= t.good.lossPct) return "var(--nc-good)";
  if (v <= t.playable.avgMs && c.lossPct <= t.playable.lossPct) return "var(--nc-playable)";
  return "var(--nc-bad)";
}

function dayLabel(day: string, locale: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).toLocaleDateString(locale, { weekday: "short", day: "numeric" });
}

export function HistoryScreen() {
  const t = useT();
  const tag = intlTag(useLocale());
  const dayOf = (d: string) => dayLabel(d, tag);
  const cells = useApp((s) => s.history);
  const preferred = useApp((s) => s.preferred);
  const info = useApp((s) => s.infos[s.preferred]);
  const th = useApp((s) => s.settings?.thresholds);
  const [hover, setHover] = useState<HistoryCell | null>(null);

  const days = useMemo(() => lastDays(14, new Date()), []);
  const byKey = useMemo(() => new Map(cells.map((c) => [`${c.day}:${c.hour}`, c])), [cells]);
  const windows = useMemo(() => playWindows(cells), [cells]);
  const checks = cells.reduce((n, c) => n + c.samples, 0);
  const city = info?.city ?? preferred.toUpperCase();

  return (
    <div className="grid h-full min-h-0 grid-cols-[1fr_260px] gap-3 px-4 pt-1 pb-3">
      <section className="panel flex min-h-0 flex-col p-5" aria-label={t("history.label")}>
        <div className="flex items-baseline gap-2.5">
          <Flag code={preferred} size={18} />
          <h2 className="hud-title">{t("history.title", { city })}</h2>
          <span className="text-[12px] text-text-3">{t("history.sub")}</span>
          <span className="flex-1" />
          <span className="tnum text-[11.5px] text-text-3">{t("history.checks", { n: checks })}</span>
        </div>

        <div className="mt-4 grid min-h-0 flex-1 grid-cols-[72px_1fr] grid-rows-[1fr_auto] gap-x-2">
          <div className="grid grid-rows-[repeat(14,minmax(0,1fr))] gap-[3px]">
            {days.map((d) => (
              <span key={d} className="flex items-center justify-end truncate text-[10.5px] text-text-3">
                {dayOf(d)}
              </span>
            ))}
          </div>
          <div dir="ltr" className="grid grid-cols-[repeat(24,minmax(0,1fr))] grid-rows-[repeat(14,minmax(0,1fr))] gap-[3px]" onMouseLeave={() => setHover(null)}>
            {days.flatMap((d, row) =>
              Array.from({ length: 24 }, (_, h) => {
                const c = byKey.get(`${d}:${h}`);
                const color = c && th ? cellColor(c, th) : null;
                return (
                  <motion.button
                    type="button"
                    key={`${d}:${h}`}
                    onMouseEnter={() => setHover(c ?? null)}
                    onFocus={() => setHover(c ?? null)}
                    aria-label={c ? t("history.cell", { day: dayOf(d), hour: hourLabel(h), ms: ms(c.avgMs) }) : t("history.cellEmpty", { day: dayOf(d), hour: hourLabel(h) })}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: (row * 24 + h) * 0.0012, duration: 0.25 }}
                    className={`min-h-0 transition-[box-shadow,transform] duration-150 ${c ? "hover:z-10 hover:scale-110" : ""}`}
                    style={
                      color
                        ? {
                            background: color,
                            boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.18)",
                          }
                        : { background: "color-mix(in srgb, var(--nc-s3) 55%, transparent)" }
                    }
                  />
                );
              }),
            )}
          </div>
          <span />
          <div dir="ltr" className="num mt-1.5 grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px] text-[10px] text-text-3">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="text-center">
                {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-3 flex h-5 items-center gap-4 text-[11.5px] text-text-3">
          {hover ? (
            <span className="tnum text-text-2">
              {t("history.detail", { day: dayOf(hover.day), hour: hourLabel(hover.hour), ms: ms(hover.avgMs), loss: pct(hover.lossPct), n: hover.samples })}
            </span>
          ) : (
            <span className="truncate">{t("history.hint")}</span>
          )}
        </div>
      </section>

      <aside className="flex min-h-0 flex-col gap-3">
        {windows ? (
          <>
            <section className="panel relative overflow-hidden p-4" aria-label={t("history.best")}>
              <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(100% 80% at 0% 0%, color-mix(in srgb, var(--nc-good) var(--nc-hero-wash), transparent), transparent 70%)" }} aria-hidden />
              <div className="relative">
                <div className="flex items-center gap-1.5 text-good">
                  <Clock3 size={14} strokeWidth={2.2} />
                  <span className="eyebrow !text-good">{t("history.best")}</span>
                </div>
                <div className="num mt-2 text-[34px] leading-none font-semibold tracking-[-0.04em]">{hourLabel(windows.best.hour)}</div>
                <p className="mt-2 text-[12.5px] text-pretty text-text-2">{t("history.best.b", { city, ms: ms(windows.best.avg), days: windows.best.days })}</p>
              </div>
            </section>
            <section className="panel p-4" aria-label={t("history.worst")}>
              <div className="flex items-center gap-1.5 text-bad">
                <Moon size={14} strokeWidth={2.2} />
                <span className="eyebrow !text-bad">{t("history.worst")}</span>
              </div>
              <div className="num mt-2 text-[26px] leading-none font-semibold tracking-[-0.04em]">{hourLabel(windows.worst.hour)}</div>
              <p className="mt-2 text-[12.5px] text-pretty text-text-2">{t("history.worst.b", { ms: ms(windows.worst.avg), d: ms(windows.worst.avg - windows.best.avg) })}</p>
            </section>
          </>
        ) : (
          <section className="panel p-4" aria-label={t("history.empty.h")}>
            <div className="eyebrow">{t("history.best")}</div>
            <p className="mt-2 text-[13px] text-text">{t("history.empty.h")}</p>
            <p className="mt-1 text-[12.5px] text-pretty text-text-2">{t("history.empty.b", { city })}</p>
          </section>
        )}
        <section className="panel p-4 text-[11.5px] text-text-3" aria-label={t("history.legend")}>
          <div className="eyebrow mb-2">{t("history.legend")}</div>
          {th &&
            (
              [
                ["var(--nc-excellent)", `≤ ${th.excellent.avgMs} ms`],
                ["var(--nc-good)", `≤ ${th.good.avgMs} ms`],
                ["var(--nc-playable)", `≤ ${th.playable.avgMs} ms`],
                ["var(--nc-bad)", t("history.lossy", { ms: th.playable.avgMs })],
              ] as const
            ).map(([c, l]) => (
              <div key={l} className="num flex items-center gap-2 py-0.5">
                <span className="size-2.5 rounded-[2px]" style={{ background: c }} />
                {l}
              </div>
            ))}
          <p className="mt-2 text-pretty">{t("history.keep")}</p>
        </section>
      </aside>
    </div>
  );
}
