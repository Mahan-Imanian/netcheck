import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";
import type { PingStats } from "../bindings/PingStats";
import type { RegionInfo } from "../bindings/RegionInfo";
import type { RegionResult } from "../bindings/RegionResult";
import { CountUp } from "../components/CountUp";
import { Flag } from "../components/Flag";
import { GradePill } from "../components/GradePill";
import { Histogram } from "../components/Histogram";
import { Skeleton } from "../components/Skeleton";
import { Sparkline } from "../components/Sparkline";
import { Tag } from "../components/Tag";
import { pct } from "../lib/format";
import { resultTone, TONES } from "../lib/grades";
import { bestRegion, sortRegions, type SortKey } from "../lib/regions";
import { useApp } from "../lib/store";
import { FirewallWarning } from "./States";

const COLS = "grid-cols-[minmax(170px,1.5fr)_minmax(96px,1fr)_repeat(4,minmax(44px,0.42fr))_minmax(52px,0.48fr)_minmax(44px,0.42fr)_104px_92px_20px]";

const HEAD: Array<{ key: SortKey | null; label: string; align?: "right" }> = [
  { key: "city", label: "Region" },
  { key: null, label: "Last 20" },
  { key: "min", label: "Min", align: "right" },
  { key: "avg", label: "Avg", align: "right" },
  { key: "p95", label: "p95", align: "right" },
  { key: "max", label: "Max", align: "right" },
  { key: "jitter", label: "Jitter", align: "right" },
  { key: "loss", label: "Loss", align: "right" },
  { key: null, label: "Grade" },
  { key: null, label: "" },
  { key: null, label: "" },
];

function Distribution({ stats, color }: { stats: PingStats; color: string }) {
  return (
    <div className="grid grid-cols-[1.4fr_1fr] gap-6 px-4 pt-1 pb-4">
      <div>
        <div className="eyebrow mb-2">RTT distribution</div>
        <Histogram stats={stats} color={color} />
      </div>
      <div>
        <div className="eyebrow mb-2">Every ping, in order</div>
        <div className="grid grid-cols-10 gap-1">
          {stats.samples.map((s, i) => (
            <div
              key={i}
              className={`num grid h-[30px] place-items-center rounded-xs text-[11px] ${s == null ? "text-bad" : "text-text"}`}
              style={{ background: s == null ? "color-mix(in srgb, var(--nc-bad) 14%, transparent)" : "var(--nc-s3)" }}
              title={`ping ${i + 1}`}
            >
              {s == null ? "lost" : s.toFixed(0)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ info, result, best, preferred, open, onToggle }: { info: RegionInfo; result: RegionResult | undefined; best: boolean; preferred: boolean; open: boolean; onToggle(): void }) {
  const reduce = useReducedMotion();
  const s = result?.stats;
  const tone = resultTone(result);
  const color = TONES[tone].color;
  const num = (v: number | null | undefined, d = 0) => (result ? <CountUp value={v ?? null} digits={d} duration={0.4} /> : <Skeleton className="ml-auto h-3 w-7" />);

  return (
    <motion.li
      layout={reduce ? false : "position"}
      transition={{ type: "spring", stiffness: 380, damping: 38 }}
      className={`border-b border-line ${open ? "bg-s2" : ""}`}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!s?.avg}
        aria-expanded={open}
        className={`grid w-full ${COLS} items-center gap-3 px-4 py-[7px] text-left transition-colors duration-150 enabled:hover:bg-s3/70`}
        style={best ? { boxShadow: "inset 2px 0 0 var(--nc-excellent)" } : preferred ? { boxShadow: "inset 2px 0 0 var(--nc-text-3)" } : undefined}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Flag code={info.code} />
          <span className="truncate text-[13px] font-medium">{info.city}</span>
          <span className="num text-[11px] text-text-3">{info.code.toUpperCase()}</span>
          {preferred && <span className="text-[10px] font-semibold tracking-wide text-text-3 uppercase">yours</span>}
        </span>
        <span className="h-6">{s ? <Sparkline samples={s.samples} width={110} height={24} color={color} /> : result ? null : <Skeleton className="mt-1.5 h-3 w-24 opacity-60" />}</span>
        <span className="num text-right text-[12.5px] text-text-2">{num(s?.min)}</span>
        <span className="num text-right text-[14px] font-semibold" style={{ color: s?.avg != null ? color : undefined }}>
          {num(s?.avg)}
        </span>
        <span className="num text-right text-[12.5px] text-text-2">{num(s?.p95)}</span>
        <span className="num text-right text-[12.5px] text-text-2">{num(s?.max)}</span>
        <span className="num text-right text-[12.5px] text-text-2">{num(s?.jitter, 1)}</span>
        <span className={`num text-right text-[12.5px] ${s && s.lossPct > 0 ? "font-semibold text-bad" : "text-text-2"}`}>
          {result ? `${pct(s?.lossPct ?? 100)}%` : <Skeleton className="ml-auto h-3 w-7" />}
        </span>
        <span>{result ? <GradePill tone={tone} label={result.status === "NoReply" ? "No reply" : undefined} /> : <Skeleton className="h-[22px] w-[74px] rounded-full" />}</span>
        <span className="flex gap-1">
          {info.block.state === "blocked" && <Tag kind="blocked" />}
          {result?.estimated && info.block.state !== "blocked" && <Tag kind="estimated" />}
          {info.block.state === "inactive" && <Tag kind="inactive" />}
        </span>
        <span className="text-text-3">{s?.avg != null && (open ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && s && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {result?.estimated && (
              <p className="px-4 pt-1 text-[11.5px] text-text-3">
                Every relay here is blocked by your firewall, so this is measured on <span className="num text-text-2">{result.target}</span>, an
                unblocked neighbour in the same /24. Real in-game ping is usually within a few ms.
              </p>
            )}
            <Distribution stats={s} color={color} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export function RegionsScreen() {
  const infos = useApp((s) => s.infos);
  const order = useApp((s) => s.order);
  const results = useApp((s) => s.results);
  const preferred = useApp((s) => s.preferred);
  const phase = useApp((s) => s.phase);
  const [sort, setSort] = useState<SortKey>("avg");
  const [open, setOpen] = useState<string | null>(null);

  const list = useMemo(() => order.map((c) => infos[c]).filter((i): i is RegionInfo => i != null), [order, infos]);
  const sorted = useMemo(() => sortRegions(list, results, sort), [list, results, sort]);
  const best = useMemo(() => bestRegion(Object.values(results), { excludeBlocked: true }), [results]);
  const all = Object.values(results);
  const counts = {
    measured: all.filter((r) => r.status === "Measured").length,
    blocked: list.filter((i) => i.block.state === "blocked").length,
    silent: all.filter((r) => r.status === "NoReply").length,
  };
  const everyBlocked = list.length > 0 && counts.blocked === list.length;
  const skeletonRows = phase === "relays" || (phase === "checking" && list.length === 0);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-4 pt-1 pb-3">
      <FirewallWarning />
      {everyBlocked && (
        <div role="status" className="flex shrink-0 items-center gap-3 rounded-md border border-blocked/30 bg-blocked/10 px-4 py-2.5 text-[12.5px]">
          <span className="font-semibold text-blocked">Every region is blocked by your firewall.</span>
          <span className="text-text-2">CS2 can't connect anywhere until a block rule is disabled. Numbers are estimated from neighbouring addresses.</span>
        </div>
      )}
      <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="All regions">
        <div className="flex items-center gap-4 px-4 pt-3 pb-2.5">
          <h2 className="text-[14px] font-semibold tracking-[-0.01em]">All regions</h2>
          <div className="num flex items-center gap-3 text-[11.5px] text-text-3">
            <span>
              <span className="text-text">{list.length}</span> regions
            </span>
            <span>
              <span className="text-text">{counts.measured}</span> measured
            </span>
            {counts.blocked > 0 && (
              <span className="text-blocked">
                <span>{counts.blocked}</span> blocked
              </span>
            )}
            {counts.silent > 0 && <span>{counts.silent} no reply</span>}
          </div>
        </div>
        <div className={`grid ${COLS} gap-3 border-y border-line bg-s1 px-4 py-2`}>
          {HEAD.map((h, i) => (
            <button
              key={i}
              type="button"
              disabled={!h.key}
              onClick={() => h.key && setSort(h.key)}
              className={`eyebrow flex items-center gap-1 ${h.align === "right" ? "justify-end" : ""} ${h.key && sort === h.key ? "text-accent" : ""} enabled:hover:text-text-2`}
            >
              {h.label}
              {h.key && sort === h.key && <ChevronDown size={11} strokeWidth={2.5} />}
            </button>
          ))}
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          {skeletonRows ? (
            <ul aria-hidden>
              {Array.from({ length: 12 }, (_, i) => (
                <li key={i} className={`grid ${COLS} items-center gap-3 border-b border-line px-4 py-[11px]`}>
                  <span className="flex items-center gap-2.5">
                    <Skeleton className="h-3 w-[18px]" />
                    <Skeleton className="h-3 w-24" />
                  </span>
                  <Skeleton className="h-3 w-24 opacity-60" />
                  {Array.from({ length: 6 }, (_, j) => (
                    <Skeleton key={j} className="ml-auto h-3 w-7" />
                  ))}
                  <Skeleton className="h-[18px] w-[74px] rounded-full" />
                  <span />
                  <span />
                </li>
              ))}
            </ul>
          ) : (
            <LayoutGroup>
              <ul>
                {sorted.map((info) => (
                  <Row
                    key={info.code}
                    info={info}
                    result={results[info.code]}
                    best={best?.code === info.code && phase === "done"}
                    preferred={info.code === preferred}
                    open={open === info.code}
                    onToggle={() => setOpen((o) => (o === info.code ? null : info.code))}
                  />
                ))}
              </ul>
            </LayoutGroup>
          )}
        </div>
      </section>
    </div>
  );
}
