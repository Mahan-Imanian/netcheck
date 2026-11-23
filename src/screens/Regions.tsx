import { AnimatePresence, LayoutGroup, motion } from "motion/react";
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
import { useT, type MessageKey } from "../i18n";
import { useApp } from "../lib/store";
import { FirewallWarning } from "./States";

const COLS = "grid-cols-[minmax(170px,1.5fr)_minmax(96px,1fr)_repeat(4,minmax(44px,0.42fr))_minmax(52px,0.48fr)_minmax(44px,0.42fr)_104px_92px_20px]";

const HEAD: Array<{ key: SortKey | null; label: MessageKey | null; align?: "end" }> = [
  { key: "city", label: "regions.col.region" },
  { key: null, label: "regions.col.last" },
  { key: "min", label: "regions.col.min", align: "end" },
  { key: "avg", label: "regions.col.avg", align: "end" },
  { key: "p95", label: "regions.col.p95", align: "end" },
  { key: "max", label: "regions.col.max", align: "end" },
  { key: "jitter", label: "regions.col.jitter", align: "end" },
  { key: "loss", label: "regions.col.loss", align: "end" },
  { key: null, label: "regions.col.grade" },
  { key: null, label: null },
  { key: null, label: null },
];

function Distribution({ stats, color }: { stats: PingStats; color: string }) {
  const t = useT();
  return (
    <div className="grid grid-cols-[1.4fr_1fr] gap-6 px-4 pt-1 pb-4" dir="ltr">
      <div>
        <div className="eyebrow mb-2">{t("regions.dist")}</div>
        <Histogram stats={stats} color={color} />
      </div>
      <div>
        <div className="eyebrow mb-2">{t("regions.order")}</div>
        <div className="grid grid-cols-10 gap-1">
          {stats.samples.map((s, i) => (
            <div
              key={i}
              className={`num grid h-[30px] place-items-center rounded-xs text-[11px] ${s == null ? "text-bad" : "text-text"}`}
              style={{ background: s == null ? "color-mix(in srgb, var(--nc-bad) 14%, transparent)" : "var(--nc-s3)" }}
              title={t("regions.ping", { n: i + 1 })}
            >
              {s == null ? t("regions.lost") : s.toFixed(0)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ info, result, best, preferred, open, onToggle }: { info: RegionInfo; result: RegionResult | undefined; best: boolean; preferred: boolean; open: boolean; onToggle(): void }) {
  const t = useT();
  const s = result?.stats;
  const tone = resultTone(result);
  const color = TONES[tone].color;
  const num = (v: number | null | undefined, d = 0) => (result ? <CountUp value={v ?? null} digits={d} duration={0.4} /> : <Skeleton className="ms-auto h-3 w-7" />);

  return (
    <motion.li
      layout={"position"}
      transition={{ type: "spring", stiffness: 380, damping: 38 }}
      className={`border-b border-line ${open ? "bg-s2" : ""}`}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!s?.avg}
        aria-expanded={open}
        className={`grid w-full ${COLS} items-center gap-3 px-4 py-[7px] text-start transition-colors duration-150 enabled:hover:bg-s3/70`}
        style={best ? { boxShadow: "inset calc(2px * var(--nc-flip)) 0 0 var(--nc-excellent)" } : preferred ? { boxShadow: "inset calc(2px * var(--nc-flip)) 0 0 var(--nc-text-3)" } : undefined}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Flag code={info.code} />
          <span className="truncate text-[13px] font-medium">{info.city}</span>
          <span className="num text-[11px] text-text-3">{info.code.toUpperCase()}</span>
          {preferred && <span className="text-[10px] font-semibold tracking-wide text-text-3 uppercase">{t("regions.yours")}</span>}
        </span>
        <span className="h-6" dir="ltr">{s ? <Sparkline samples={s.samples} width={110} height={24} color={color} /> : result ? null : <Skeleton className="mt-1.5 h-3 w-24 opacity-60" />}</span>
        <span className="num text-end text-[12.5px] text-text-2">{num(s?.min)}</span>
        <span className="num text-end text-[14px] font-semibold" style={{ color: s?.avg != null ? color : undefined }}>
          {num(s?.avg)}
        </span>
        <span className="num text-end text-[12.5px] text-text-2">{num(s?.p95)}</span>
        <span className="num text-end text-[12.5px] text-text-2">{num(s?.max)}</span>
        <span className="num text-end text-[12.5px] text-text-2">{num(s?.jitter, 1)}</span>
        <span className={`num text-end text-[12.5px] ${s && s.lossPct > 0 ? "font-semibold text-bad" : "text-text-2"}`}>
          {result ? `${pct(s?.lossPct ?? 100)}%` : <Skeleton className="ms-auto h-3 w-7" />}
        </span>
        <span>{result ? <GradePill quiet tone={tone} label={result.status === "NoReply" ? t("tone.muted") : undefined} /> : <Skeleton className="h-4 w-[74px]" />}</span>
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
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {result?.estimated && (
              <p className="max-w-[90ch] px-4 pt-1 text-[11.5px] text-pretty text-text-3">{t("regions.estimated", { target: result.target ?? "" })}</p>
            )}
            <Distribution stats={s} color={color} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export function RegionsScreen() {
  const t = useT();
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
          <span className="font-semibold text-blocked">{t("regions.allBlocked.h")}</span>
          <span className="text-text-2">{t("regions.allBlocked.b")}</span>
        </div>
      )}
      <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden" aria-label={t("regions.label")}>
        <div className="flex items-center gap-4 px-4 pt-3 pb-2.5">
          <h2 className="hud-title">{t("regions.title")}</h2>
          <div className="num flex items-center gap-3 text-[11.5px] text-text-3">
            <span>
              {t("regions.count")} <span className="text-text">{list.length}</span>
            </span>
            <span>
              {t("regions.measured")} <span className="text-text">{counts.measured}</span>
            </span>
            {counts.blocked > 0 && (
              <span className="text-blocked">
                {t("regions.blockedCount")} <span>{counts.blocked}</span>
              </span>
            )}
            {counts.silent > 0 && (
              <span>
                {t("regions.silent")} {counts.silent}
              </span>
            )}
          </div>
        </div>
        <div className={`grid ${COLS} gap-3 border-y border-line bg-s1 px-4 py-2`}>
          {HEAD.map((h, i) => {
            const label = h.label ? t(h.label) : "";
            return h.key ? (
              <button
                key={i}
                type="button"
                onClick={() => h.key && setSort(h.key)}
                aria-pressed={sort === h.key}
                aria-label={sort === h.key ? t("regions.sorted", { col: label }) : t("regions.sortBy", { col: label })}
                className={`eyebrow flex items-center gap-1 ${h.align === "end" ? "justify-end" : ""} ${sort === h.key ? "text-accent" : ""} hover:text-text-2`}
              >
                {label}
                {sort === h.key && <ChevronDown size={11} strokeWidth={2.5} aria-hidden />}
              </button>
            ) : (
              <span key={i} aria-hidden={!label || undefined} className={`eyebrow flex items-center ${h.align === "end" ? "justify-end" : ""}`}>
                {label}
              </span>
            );
          })}
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
                    <Skeleton key={j} className="ms-auto h-3 w-7" />
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
