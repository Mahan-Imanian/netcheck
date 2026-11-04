import { motion, useReducedMotion } from "motion/react";
import { Info, TriangleAlert, CheckCircle2 } from "lucide-react";
import { useMemo } from "react";
import type { Segment } from "../bindings/Segment";
import { RouteChain, RouteChainSkeleton } from "../components/RouteChain";
import { Skeleton } from "../components/Skeleton";
import { Tag } from "../components/Tag";
import { ms, pct } from "../lib/format";
import { bestRegion, isClean } from "../lib/regions";
import { explainRoute, SEGMENT_LABEL } from "../lib/routeText";
import { useApp } from "../lib/store";

const SEG_ORDER: Segment[] = ["Local", "Isp", "International", "Valve"];

export function RouteScreen() {
  const reduce = useReducedMotion();
  const route = useApp((s) => s.route);
  const info = useApp((s) => s.infos[s.preferred]);
  const infos = useApp((s) => s.infos);
  const results = useApp((s) => s.results);
  const preferred = useApp((s) => s.preferred);
  const phase = useApp((s) => s.phase);

  const alt = useMemo(() => bestRegion(Object.values(results).filter((r) => r.code !== preferred && isClean(r) && r.block.state !== "blocked")), [results, preferred]);
  const text = route ? explainRoute(route, alt?.stats?.avg != null ? { city: infos[alt.code]?.city ?? alt.code, avg: alt.stats.avg } : null) : null;
  const finding = route?.diagnosis.finding ?? null;
  const Icon = finding ? TriangleAlert : route?.noRoute ? Info : CheckCircle2;
  const tone = finding || route?.noRoute ? "var(--nc-bad)" : "var(--nc-good)";
  let prevAvg = 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <section className="panel relative shrink-0 overflow-hidden" aria-label="Route">
        <div className="grid-texture pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <div className="relative px-5 pt-4">
          <div className="flex items-center gap-2">
            <span className="eyebrow">Route to {info?.city ?? preferred.toUpperCase()}</span>
            {route && <span className="num text-[11px] text-text-3">{route.target}</span>}
            {route?.estimated && <Tag kind="estimated" />}
            <span className="flex-1" />
            <div className="flex gap-4 text-[11px] text-text-3 max-[1100px]:hidden">
              {SEG_ORDER.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className={`size-1.5 rounded-full ${finding?.segment === s ? "bg-bad" : "bg-accent/60"}`} />
                  {SEGMENT_LABEL[s]} <span className="num">{route?.hops.filter((h) => h.segment === s).length ?? 0}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="scrollbar-thin relative overflow-x-auto px-5 pt-5 pb-5 [mask-image:linear-gradient(90deg,transparent,black_20px,black_calc(100%-20px),transparent)]">
          <div className="min-w-max">{route ? <RouteChain route={route} /> : <RouteChainSkeleton />}</div>
        </div>
        {text ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative flex gap-3 border-t border-line px-5 py-4"
            style={{ background: finding ? "linear-gradient(90deg, color-mix(in srgb, var(--nc-bad) 9%, transparent), transparent 70%)" : undefined }}
          >
            <Icon size={18} className="mt-0.5 shrink-0" style={{ color: tone }} />
            <div className="max-w-[820px]">
              <div className="text-[14px] font-semibold" style={{ color: tone }}>
                {text.title}
              </div>
              <p className="mt-1 text-[13.5px] text-pretty text-text">{text.body}</p>
              {text.advice && <p className="mt-1.5 text-[12.5px] text-text-2">{text.advice}</p>}
            </div>
          </motion.div>
        ) : (
          <div className="relative space-y-2 border-t border-line px-5 py-4" aria-hidden>
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="h-3 w-[70%]" />
          </div>
        )}
      </section>

      <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Hops">
        <div className="grid grid-cols-[48px_minmax(140px,1.2fr)_120px_repeat(4,minmax(56px,0.5fr))] gap-3 border-b border-line bg-s1 px-5 py-2">
          {["Hop", "Address", "Section", "Avg", "Δ", "Jitter", "Loss"].map((h, i) => (
            <span key={h} className={`eyebrow ${i >= 3 ? "text-right" : ""}`}>
              {h}
            </span>
          ))}
        </div>
        <ol className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          {route
            ? route.hops.map((h) => {
                const avg = h.stats?.avg ?? null;
                const delta = avg != null ? avg - prevAvg : null;
                if (avg != null) prevAvg = avg;
                const problem = finding?.ttl === h.ttl;
                return (
                  <li
                    key={h.ttl}
                    className={`grid grid-cols-[48px_minmax(140px,1.2fr)_120px_repeat(4,minmax(56px,0.5fr))] items-center gap-3 border-b border-line px-5 py-2 ${problem ? "bg-bad/10" : ""}`}
                    style={problem ? { boxShadow: "inset 2px 0 0 var(--nc-bad)" } : undefined}
                  >
                    <span className="num text-[12px] text-text-3">{String(h.ttl).padStart(2, "0")}</span>
                    <span className={`num truncate text-[12.5px] ${h.addr ? "text-text" : "text-text-3"}`}>
                      {h.addr ?? "* * *  no reply"}
                      {h.isDestination && <span className="ml-2 font-sans text-[10.5px] text-accent uppercase">relay</span>}
                    </span>
                    <span className="text-[12px] text-text-2">{SEGMENT_LABEL[h.segment]}</span>
                    <span className={`num text-right text-[13px] font-semibold ${problem ? "text-bad" : ""}`}>{ms(avg)}</span>
                    <span className={`num text-right text-[12px] ${delta != null && delta > 25 ? "text-playable" : "text-text-3"}`}>
                      {delta == null ? "—" : `${delta >= 0 ? "+" : ""}${ms(delta)}`}
                    </span>
                    <span className="num text-right text-[12px] text-text-2">{ms(h.stats?.jitter, 1)}</span>
                    <span className={`num text-right text-[12px] ${(h.stats?.lossPct ?? 0) > 0 ? "text-bad" : "text-text-2"}`}>
                      {h.stats ? `${pct(h.stats.lossPct)}%` : "—"}
                    </span>
                  </li>
                );
              })
            : Array.from({ length: phase === "done" ? 0 : 8 }, (_, i) => (
                <li key={i} className="grid grid-cols-[48px_minmax(140px,1.2fr)_120px_repeat(4,minmax(56px,0.5fr))] items-center gap-3 border-b border-line px-5 py-[11px]" aria-hidden>
                  <Skeleton className="h-3 w-5" />
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-16" />
                  {Array.from({ length: 4 }, (_, j) => (
                    <Skeleton key={j} className="ml-auto h-3 w-8" />
                  ))}
                </li>
              ))}
        </ol>
        {phase === "done" && !route && <p className="px-5 py-6 text-[13px] text-text-2">Your region has no relay that could be traced this time.</p>}
      </section>
    </div>
  );
}
