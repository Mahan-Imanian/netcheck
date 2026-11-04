import { motion, useReducedMotion } from "motion/react";
import { Clock3, Moon } from "lucide-react";
import { useMemo, useState } from "react";
import type { HistoryCell } from "../bindings/HistoryCell";
import type { Thresholds } from "../bindings/Thresholds";
import { Flag } from "../components/Flag";
import { hourLabel, ms, pct } from "../lib/format";
import { lastDays, playWindows } from "../lib/history";
import { useApp } from "../lib/store";

function cellColor(c: HistoryCell, t: Thresholds): string {
  const v = c.avgMs;
  if (v <= t.excellent.avgMs && c.lossPct <= t.excellent.lossPct) return "var(--nc-excellent)";
  if (v <= t.good.avgMs && c.lossPct <= t.good.lossPct) return "var(--nc-good)";
  if (v <= t.playable.avgMs && c.lossPct <= t.playable.lossPct) return "var(--nc-playable)";
  return "var(--nc-bad)";
}

function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).toLocaleDateString([], { weekday: "short", day: "numeric" });
}

export function HistoryScreen() {
  const reduce = useReducedMotion();
  const cells = useApp((s) => s.history);
  const preferred = useApp((s) => s.preferred);
  const info = useApp((s) => s.infos[s.preferred]);
  const t = useApp((s) => s.settings?.thresholds);
  const [hover, setHover] = useState<HistoryCell | null>(null);

  const days = useMemo(() => lastDays(14, new Date()), []);
  const byKey = useMemo(() => new Map(cells.map((c) => [`${c.day}:${c.hour}`, c])), [cells]);
  const windows = useMemo(() => playWindows(cells), [cells]);
  const checks = cells.reduce((n, c) => n + c.samples, 0);
  const city = info?.city ?? preferred.toUpperCase();

  return (
    <div className="grid h-full min-h-0 grid-cols-[1fr_260px] gap-3 p-3">
      <section className="panel flex min-h-0 flex-col p-5" aria-label="History heatmap">
        <div className="flex items-baseline gap-2.5">
          <Flag code={preferred} size={18} />
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{city} by hour</h2>
          <span className="text-[12px] text-text-3">average ping, last 14 days</span>
          <span className="flex-1" />
          <span className="num text-[11.5px] text-text-3">{checks} checks</span>
        </div>

        <div className="mt-4 grid min-h-0 flex-1 grid-cols-[64px_1fr] grid-rows-[1fr_auto] gap-x-2">
          <div className="grid grid-rows-[repeat(14,minmax(0,1fr))] gap-[3px]">
            {days.map((d) => (
              <span key={d} className="flex items-center justify-end text-[10.5px] text-text-3">
                {dayLabel(d)}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] grid-rows-[repeat(14,minmax(0,1fr))] gap-[3px]" onMouseLeave={() => setHover(null)}>
            {days.flatMap((d, row) =>
              Array.from({ length: 24 }, (_, h) => {
                const c = byKey.get(`${d}:${h}`);
                const color = c && t ? cellColor(c, t) : null;
                return (
                  <motion.button
                    type="button"
                    key={`${d}:${h}`}
                    onMouseEnter={() => setHover(c ?? null)}
                    onFocus={() => setHover(c ?? null)}
                    aria-label={c ? `${dayLabel(d)} ${hourLabel(h)}: ${ms(c.avgMs)} ms` : `${dayLabel(d)} ${hourLabel(h)}: no check`}
                    initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: reduce ? 0 : (row * 24 + h) * 0.0012, duration: 0.25 }}
                    className={`min-h-0 rounded-[3px] ${c ? "hover:ring-1 hover:ring-text" : ""}`}
                    style={
                      color
                        ? { background: color, opacity: 0.85, boxShadow: `0 0 8px -2px ${color}` }
                        : { background: "repeating-linear-gradient(135deg, var(--nc-s3) 0 2px, transparent 2px 5px)" }
                    }
                  />
                );
              }),
            )}
          </div>
          <span />
          <div className="num mt-1.5 grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px] text-[10px] text-text-3">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="text-center">
                {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-3 flex h-5 items-center gap-4 text-[11.5px] text-text-3">
          {hover ? (
            <span className="num text-text-2">
              {dayLabel(hover.day)} · {hourLabel(hover.hour)} — <span className="font-semibold text-text">{ms(hover.avgMs)} ms</span> avg, {pct(hover.lossPct)}% loss,{" "}
              {hover.samples} check{hover.samples === 1 ? "" : "s"}
            </span>
          ) : (
            <span>Hover a cell for details. Hatched cells are hours with no check — Netcheck only measures while it's open.</span>
          )}
        </div>
      </section>

      <aside className="flex min-h-0 flex-col gap-3">
        {windows ? (
          <>
            <section className="panel relative overflow-hidden p-4" aria-label="Best time to play">
              <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(100% 80% at 0% 0%, color-mix(in srgb, var(--nc-good) 14%, transparent), transparent 70%)" }} aria-hidden />
              <div className="relative">
                <div className="flex items-center gap-1.5 text-good">
                  <Clock3 size={14} strokeWidth={2.2} />
                  <span className="eyebrow !text-good">Best time to play</span>
                </div>
                <div className="num mt-2 text-[34px] leading-none font-semibold tracking-[-0.04em]">{hourLabel(windows.best.hour)}</div>
                <p className="mt-2 text-[12.5px] text-text-2">
                  {city} averages <span className="num font-semibold text-text">{ms(windows.best.avg)} ms</span> around this hour, across {windows.best.days} days.
                </p>
              </div>
            </section>
            <section className="panel p-4" aria-label="Worst time to play">
              <div className="flex items-center gap-1.5 text-bad">
                <Moon size={14} strokeWidth={2.2} />
                <span className="eyebrow !text-bad">Worst hour</span>
              </div>
              <div className="num mt-2 text-[26px] leading-none font-semibold tracking-[-0.04em]">{hourLabel(windows.worst.hour)}</div>
              <p className="mt-2 text-[12.5px] text-text-2">
                <span className="num font-semibold text-text">{ms(windows.worst.avg)} ms</span> typical — {ms(windows.worst.avg - windows.best.avg)} ms worse than your best hour.
              </p>
            </section>
          </>
        ) : (
          <section className="panel p-4" aria-label="Not enough history">
            <div className="eyebrow">Best time to play</div>
            <p className="mt-2 text-[13px] text-text">Not enough history yet.</p>
            <p className="mt-1 text-[12.5px] text-text-2">
              Netcheck needs checks at a few different hours, on at least two days, before it can say when {city} is at its best. Every check you run adds to
              this.
            </p>
          </section>
        )}
        <section className="panel p-4 text-[11.5px] text-text-3" aria-label="Legend">
          <div className="eyebrow mb-2">Legend</div>
          {t &&
            (
              [
                ["var(--nc-excellent)", `≤ ${t.excellent.avgMs} ms`],
                ["var(--nc-good)", `≤ ${t.good.avgMs} ms`],
                ["var(--nc-playable)", `≤ ${t.playable.avgMs} ms`],
                ["var(--nc-bad)", `> ${t.playable.avgMs} ms or lossy`],
              ] as const
            ).map(([c, l]) => (
              <div key={l} className="num flex items-center gap-2 py-0.5">
                <span className="size-2.5 rounded-[2px]" style={{ background: c }} />
                {l}
              </div>
            ))}
          <p className="mt-2">History is kept for 30 days on this PC only.</p>
        </section>
      </aside>
    </div>
  );
}
