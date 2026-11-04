import { motion } from "motion/react";
import { ArrowRight, CloudOff } from "lucide-react";
import { useMemo } from "react";
import { CountUp } from "../components/CountUp";
import { Flag } from "../components/Flag";
import { Gauge } from "../components/Gauge";
import { GradePill } from "../components/GradePill";
import { Histogram } from "../components/Histogram";
import { LaunchButton } from "../components/LaunchButton";
import { RouteChain, RouteChainSkeleton } from "../components/RouteChain";
import { Skeleton } from "../components/Skeleton";
import { Sparkline } from "../components/Sparkline";
import { Tag } from "../components/Tag";
import { WorldMap } from "../components/WorldMap";
import { age, ms, pct } from "../lib/format";
import { resultTone, TONES } from "../lib/grades";
import { playScore } from "../lib/regions";
import { explainRoute } from "../lib/routeText";
import { useApp } from "../lib/store";
import { computeVerdict } from "../lib/verdict";
import { FirewallWarning } from "./States";

function Stat({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-1 whitespace-nowrap">
        <span className="display text-[34px] leading-none font-bold [@media(max-height:700px)]:text-[28px]" style={{ color: tone }}>
          {value}
        </span>
        {unit && <span className="display text-[14px] font-semibold tracking-[0.06em] text-text-3 uppercase">{unit}</span>}
      </div>
      <div className="hud-label mt-1.5 truncate">{label}</div>
    </div>
  );
}

function useVerdict() {
  const preferred = useApp((s) => s.preferred);
  const infos = useApp((s) => s.infos);
  const results = useApp((s) => s.results);
  const baseline = useApp((s) => s.baseline);
  const route = useApp((s) => s.route);
  const offline = useApp((s) => s.offline);
  const phase = useApp((s) => s.phase);
  const thresholds = useApp((s) => s.settings?.thresholds);
  return useMemo(
    () =>
      thresholds
        ? computeVerdict({
            preferred,
            infos,
            results: Object.values(results),
            baseline,
            route,
            offline,
            finished: phase === "done",
            thresholds,
          })
        : null,
    [preferred, infos, results, baseline, route, offline, phase, thresholds],
  );
}

function Hero() {
  const preferred = useApp((s) => s.preferred);
  const info = useApp((s) => s.infos[s.preferred]);
  const result = useApp((s) => s.results[s.preferred]);
  const phase = useApp((s) => s.phase);
  const relays = useApp((s) => s.relays);
  const infos = useApp((s) => s.infos);
  const verdict = useVerdict();
  const done = phase === "done";
  const tone = resultTone(result);
  const color = result ? TONES[tone].color : "var(--nc-text)";
  const s = result?.stats;
  const alt = verdict?.alternative;
  const altInfo = alt ? infos[alt.code] : undefined;
  const vTone = verdict ? TONES[verdict.tone] : TONES.muted;
  const VIcon = vTone.icon;
  const cacheNote = relays?.source === "Cache" && relays.liveError ? relays.fetchedAtMs : null;
  const thresholds = useApp((st) => st.settings?.thresholds);

  return (
    <section className="panel flex min-h-0 flex-col overflow-hidden" aria-label="Verdict">
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-[background] duration-700"
        style={{
          background: `radial-gradient(90% 55% at 12% 0%, color-mix(in srgb, ${color} 20%, transparent), transparent 62%), radial-gradient(70% 50% at 100% 100%, var(--nc-wash-2), transparent 70%)`,
        }}
        aria-hidden
      />

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-7 pt-6 [@media(max-height:700px)]:px-6 [@media(max-height:700px)]:pt-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-12 shrink-0 place-items-center overflow-hidden shadow-[0_0_0_1px_var(--nc-line-2)]">
            <Flag code={preferred} size={26} />
          </span>
          <div className="min-w-0">
            {info ? <h1 className="display text-[30px] leading-none font-bold tracking-[0.06em] uppercase">{info.city}</h1> : <Skeleton className="h-[22px] w-28" />}
            <div className="num mt-1 truncate text-[11.5px] text-text-3">
              {preferred.toUpperCase()}
              {result?.target && <span className="max-[1100px]:hidden"> · {result.target}</span>}
            </div>
          </div>
          <span className="flex-1" />
          {result?.block.state === "blocked" && <Tag kind="blocked" />}
          {result?.estimated && <Tag kind="estimated" />}
          {result?.block.state === "inactive" && <Tag kind="inactive" />}
          {result ? <GradePill tone={tone} size="lg" /> : <Skeleton className="h-8 w-24" />}
        </div>

        <div className="mt-4 grid min-h-0 grid-cols-[auto_1fr] items-center gap-7 [@media(max-height:700px)]:mt-2 [@media(max-height:700px)]:gap-5">
          <div className="h-[clamp(156px,26vh,270px)]">
            {result ? (
              <Gauge value={s?.avg} color={color} thresholds={thresholds} settled={done} />
            ) : (
              <div className="grid aspect-square h-full place-items-center">
                <Skeleton className="size-[78%] rounded-full opacity-50" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 [@media(max-height:700px)]:gap-y-3">
              {s ? (
                <>
                  <Stat label="Packet loss" value={pct(s.lossPct)} unit="%" tone={s.lossPct > 0 ? "var(--nc-bad)" : undefined} />
                  <Stat label="Jitter" value={ms(s.jitter, 1)} unit="ms" />
                  <Stat label="Worst 5%" value={ms(s.p95)} unit="ms" />
                  <Stat label="Min to max" value={`${ms(s.min)}-${ms(s.max)}`} unit="ms" />
                </>
              ) : (
                Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-[24px] w-16" />
                    <Skeleton className="h-2.5 w-20" />
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 text-[12px] leading-snug text-text-3 [@media(max-height:700px)]:mt-3">
              {s
                ? `${s.received} of ${s.sent} pings answered${result?.normalMs != null ? `, usually ${ms(result.normalMs)} ms` : ""}${result?.estimated ? ", estimated from a neighbouring address" : ""}`
                : "Waiting for the first pings"}
            </div>
          </div>
        </div>

        <div className="well relative mt-5 flex min-h-24 flex-1 flex-col overflow-hidden px-3.5 pt-2.5 pb-2 [@media(max-height:700px)]:mt-3">
          <div className="grid-texture pointer-events-none absolute inset-0 opacity-80" aria-hidden />
          <div className="relative flex justify-between text-[12px] text-text-3">
            <span className="hud-label text-text-2">Every ping</span>
            {s?.avg != null && <span className="display text-[13.5px] font-semibold tracking-[0.06em] uppercase"><span style={{ color }}>avg {ms(s.avg)} ms</span><span className="text-text-3"> / {s.samples.length} pings</span></span>}
          </div>
          <div className="relative mt-2 max-h-[170px] min-h-8 flex-1">
            {s ? <Sparkline samples={s.samples} width={520} height={60} color={color} fluid area /> : <Skeleton className="size-full opacity-40" />}
          </div>
          {s?.avg != null && (
            <div className="relative mt-4 hidden [@media(min-height:900px)]:block">
              <div className="mb-2 text-[11px] text-text-3">Distribution</div>
              <Histogram stats={s} color={color} bins={32} className="h-[90px]" />
            </div>
          )}
        </div>

        <motion.div
          key={verdict?.kind ?? "none"}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
          className="mt-5 flex items-start gap-3 [@media(max-height:700px)]:mt-3"
          aria-live="polite"
        >
          <span
            className="chamfer-sm mt-0.5 grid size-8 shrink-0 place-items-center"
            style={{ color: vTone.color, background: `color-mix(in srgb, ${vTone.color} 15%, transparent)` }}
          >
            <VIcon size={16} strokeWidth={2.4} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="hud-title" style={{ color: vTone.color }}>
              {verdict?.headline ?? "Measuring"}
            </div>
            <p className="mt-1.5 text-[16px] leading-snug font-medium tracking-[-0.01em] text-pretty text-text">{verdict?.line ?? "Pinging every Valve region"}</p>
          </div>
        </motion.div>

        {alt?.stats?.avg != null && altInfo && done && alt.stats.avg < (s?.avg ?? Infinity) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="well mt-3 flex items-center gap-2.5 px-3.5 py-2.5 [@media(max-height:700px)]:hidden"
          >
            <span className="hud-label">Best right now</span>
            <Flag code={alt.code} size={16} />
            <span className="truncate text-[13px] font-medium">{altInfo.city}</span>
            <span className="num ml-auto text-[14px] font-semibold">
              {ms(alt.stats.avg)}
              <span className="text-[10px] font-normal text-text-3"> ms</span>
            </span>
            <span className="num text-[11px] text-text-3">{pct(alt.stats.lossPct)}% loss</span>
            <GradePill tone={resultTone(alt)} />
          </motion.div>
        )}

        {cacheNote != null && (
          <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-playable">
            <CloudOff size={12} /> Valve's API didn't answer, so this uses the relay list from {age(cacheNote, Date.now())}.
          </p>
        )}
        <div className="h-5 shrink-0" />
      </div>

      <div className="relative px-7 pb-6 [@media(max-height:700px)]:px-6 [@media(max-height:700px)]:pb-4">
        <LaunchButton disabled={!done} />
        <p className="mt-2.5 text-center text-[11.5px] text-text-3 [@media(max-height:700px)]:hidden">{done ? "Opens CS2 through Steam" : "Available when the check finishes"}</p>
      </div>
    </section>
  );
}

function SectionHead({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="hud-title">{title}</h2>
      <span className="flex-1" />
      {children}
    </div>
  );
}

function RouteCard() {
  const route = useApp((s) => s.route);
  const info = useApp((s) => s.infos[s.preferred]);
  const setTab = useApp((s) => s.setTab);
  const infos = useApp((s) => s.infos);
  const verdict = useVerdict();
  const alt = verdict?.alternative;
  const explanation = route ? explainRoute(route, alt?.stats?.avg != null ? { city: infos[alt.code]?.city ?? alt.code, avg: alt.stats.avg } : null) : null;
  const bad = route?.diagnosis.finding != null;

  return (
    <section className="panel shrink-0 px-5 pt-4 pb-4" aria-label="Route summary">
      <SectionHead title={`Route to ${info?.city ?? "your region"}`}>
        <button type="button" onClick={() => setTab("route")} className="display group inline-flex items-center gap-1 text-[13.5px] font-semibold tracking-[0.08em] text-text-2 uppercase transition-colors duration-150 hover:text-text">
          All hops <ArrowRight size={12} className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
      </SectionHead>
      <div className={`mt-1.5 truncate text-[12.5px] ${bad ? "text-bad" : "text-text-2"}`}>{explanation ? explanation.title : <Skeleton className="mt-1 h-3.5 w-52" />}</div>
      <div className="mt-3.5">{route ? <RouteChain route={route} compact /> : <RouteChainSkeleton compact />}</div>
    </section>
  );
}

function Fastest() {
  const results = useApp((s) => s.results);
  const infos = useApp((s) => s.infos);
  const phase = useApp((s) => s.phase);
  const preferred = useApp((s) => s.preferred);
  const blockedCount = Object.values(results).filter((r) => r.block.state === "blocked").length;
  const top = useMemo(
    () =>
      Object.values(results)
        .filter((r) => r.stats?.avg != null && r.block.state !== "blocked")
        .sort((a, b) => playScore(a) - playScore(b))
        .slice(0, 6),
    [results],
  );
  return (
    <section className="panel shrink-0 px-5 pt-4 pb-3" aria-label="Fastest regions">
      <SectionHead title={phase === "done" ? "Fastest right now" : "Fastest so far"} />
      <ol className="mt-2.5 grid grid-flow-col grid-cols-2 grid-rows-3 gap-x-2 gap-y-1">
        {Array.from({ length: 6 }, (_, i) => {
          const r = top[i];
          if (!r && phase === "done") return null;
          if (!r) {
            return (
              <li key={`s${i}`} className="flex h-[30px] items-center gap-2.5 px-2">
                <Skeleton className="h-2.5 w-3" />
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="ml-auto h-2.5 w-8" />
              </li>
            );
          }
          const tone = resultTone(r);
          const Icon = TONES[tone].icon;
          const c = TONES[tone].color;
          return (
            <motion.li
              key={r.code}
              layout={"position"}
              transition={{ type: "spring", stiffness: 400, damping: 36 }}
              className="relative flex h-[30px] items-center gap-2.5 overflow-hidden px-2 text-[12.5px]"
              style={{ background: i === 0 ? `linear-gradient(90deg, color-mix(in srgb, ${c} 12%, transparent), transparent 85%)` : undefined, boxShadow: i === 0 ? `inset 2px 0 0 ${c}` : undefined }}
            >
              <span className="display w-3 text-[14px] font-semibold text-text-3">{i + 1}</span>
              <Flag code={r.code} size={15} />
              <span className={`truncate ${r.code === preferred ? "font-semibold text-text" : "text-text-2"}`}>{infos[r.code]?.city}</span>
              <span className="ml-auto inline-flex items-center gap-1.5">
                <Icon size={12} strokeWidth={2.5} style={{ color: c }} aria-label={TONES[tone].label} />
                <span className="display w-8 text-right text-[18px] font-bold" style={{ color: c }}>
                  <CountUp value={r.stats?.avg ?? null} />
                </span>
              </span>
            </motion.li>
          );
        })}
      </ol>
      {phase === "done" && top.length < 6 && (
        <p className="mt-2 px-2 text-[11.5px] leading-snug text-text-3">
          {blockedCount > 0 ? `${blockedCount} other regions are blocked by your firewall, so CS2 can't use them.` : "No other region answered."}
        </p>
      )}
    </section>
  );
}

function Legend() {
  const items = (["excellent", "good", "playable", "bad", "blocked"] as const).map((t) => TONES[t]);
  return (
    <div className="flex items-center gap-3 text-[11px] text-text-3 max-[1100px]:hidden">
      {items.map((m) => {
        const Icon = m.icon;
        return (
          <span key={m.label} className="inline-flex items-center gap-1">
            <Icon size={11} strokeWidth={2.5} style={{ color: m.color }} aria-hidden />
            {m.label}
          </span>
        );
      })}
    </div>
  );
}

export function VerdictScreen() {
  const phase = useApp((s) => s.phase);
  const total = useApp((s) => s.order.length);
  const done = useApp((s) => s.arrival.length);
  const checking = phase === "checking" || phase === "relays";
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-4 pt-1 pb-3">
      <FirewallWarning />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(420px,0.92fr)_1.08fr] gap-3">
        <Hero />
        <div className="flex min-h-0 flex-col gap-3">
          <section className="panel relative flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Live map">
            <div className="grid-texture pointer-events-none absolute inset-0 rounded-[inherit]" aria-hidden />
            <div className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: "radial-gradient(70% 80% at 50% 45%, var(--nc-wash-1), transparent 70%)" }} aria-hidden />
            <div className="relative flex items-center gap-3 px-5 pt-4">
              <h2 className="hud-title">{checking ? "Sweeping Valve regions" : "Every Valve region"}</h2>
              {checking && total > 0 && (
                <span className="display text-[14px] font-semibold tracking-[0.06em] text-text-2">
                  {done} / {total}
                </span>
              )}
              <span className="flex-1" />
              <Legend />
            </div>
            <div className="relative min-h-0 flex-1 px-3 pb-3">
              <WorldMap compact />
            </div>
          </section>
          <Fastest />
          <RouteCard />
        </div>
      </div>
    </div>
  );
}
