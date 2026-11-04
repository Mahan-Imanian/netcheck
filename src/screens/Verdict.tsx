import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, CloudOff } from "lucide-react";
import { useMemo } from "react";
import { CountUp } from "../components/CountUp";
import { Flag } from "../components/Flag";
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
      <div className="eyebrow">{label}</div>
      <div className="num mt-1 text-[19px] leading-none font-semibold tracking-[-0.02em]" style={{ color: tone }}>
        {value}
        {unit && <span className="ml-0.5 text-[11px] font-normal text-text-3">{unit}</span>}
      </div>
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
  const reduce = useReducedMotion();
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

  return (
    <section className="panel flex min-h-0 flex-col overflow-hidden" aria-label="Verdict">
      <div
        className="pointer-events-none absolute inset-0 transition-[background] duration-500"
        style={{
          background: `radial-gradient(120% 70% at 0% 0%, color-mix(in srgb, ${color} 13%, transparent), transparent 60%), radial-gradient(80% 60% at 100% 100%, var(--nc-wash-2), transparent 70%)`,
        }}
        aria-hidden
      />
      <div className="grid-texture pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(180deg,black,transparent_70%)]" aria-hidden />

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-6 pt-5 [@media(max-height:700px)]:pt-4">
        <div className="flex items-center gap-2">
          <span className="eyebrow">Your region</span>
          <span className="flex-1" />
          {result?.block.state === "blocked" && <Tag kind="blocked" />}
          {result?.estimated && <Tag kind="estimated" />}
          {result?.block.state === "inactive" && <Tag kind="inactive" />}
        </div>

        <div className="mt-2.5 flex items-center gap-2.5">
          <Flag code={preferred} size={22} />
          {info ? (
            <h1 className="text-[22px] leading-none font-semibold tracking-[-0.02em]">{info.city}</h1>
          ) : (
            <Skeleton className="h-[22px] w-28" />
          )}
          <span className="num text-[12px] text-text-3">{preferred.toUpperCase()}</span>
          {result?.target && <span className="num ml-auto text-[11px] text-text-3 max-[1100px]:hidden">{result.target}</span>}
        </div>

        <div className="mt-3 flex items-end gap-4">
          {s?.avg != null ? (
            <motion.div
              className="num flex items-baseline leading-[0.82] font-semibold"
              style={{ color }}
              animate={done && !reduce ? { textShadow: [`0 0 0px transparent`, `0 0 42px color-mix(in srgb, ${color} 70%, transparent)`, `0 0 24px color-mix(in srgb, ${color} 40%, transparent)`] } : undefined}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="text-[clamp(64px,15vh,136px)] tracking-[-0.06em]" style={{ opacity: done ? 1 : 0.82 }}>
                <CountUp value={s.avg} duration={0.6} />
              </span>
              <span className="ml-2 text-[22px] font-medium tracking-normal text-text-3">ms</span>
            </motion.div>
          ) : result ? (
            <div className="num text-[clamp(64px,15vh,136px)] leading-[0.82] font-semibold tracking-[-0.06em] text-muted">—</div>
          ) : (
            <Skeleton className="h-[clamp(54px,12.5vh,112px)] w-[230px]" />
          )}
          <div className="pb-1.5">{result ? <GradePill tone={tone} size="lg" /> : <Skeleton className="h-7 w-24 rounded-full" />}</div>
        </div>
        <div className="mt-2 text-[11.5px] text-text-3">
          {s
            ? `average of ${s.received}/${s.sent} replies${result?.normalMs != null ? ` · usually ${ms(result.normalMs)} ms` : ""}${result?.estimated ? " · estimated from a neighbouring address" : ""}`
            : " "}
        </div>

        <div className="mt-4 grid grid-cols-4 gap-3 border-y border-line py-3.5 [@media(max-height:700px)]:mt-3 [@media(max-height:700px)]:py-2.5">
          {s ? (
            <>
              <Stat label="Loss" value={pct(s.lossPct)} unit="%" tone={s.lossPct > 0 ? "var(--nc-bad)" : undefined} />
              <Stat label="Jitter" value={ms(s.jitter, 1)} unit="ms" />
              <Stat label="p95" value={ms(s.p95)} unit="ms" />
              <Stat label="Min–max" value={`${ms(s.min)}–${ms(s.max)}`} />
            </>
          ) : (
            Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-2.5 w-10" />
                <Skeleton className="h-[19px] w-14" />
              </div>
            ))
          )}
        </div>

        <div className="mt-3 flex min-h-10 flex-1 flex-col">
          <div className="flex justify-between text-[10.5px] text-text-3">
            <span className="eyebrow">Every ping</span>
            {s && <span className="num">{s.samples.length} × 100 ms</span>}
          </div>
          <div className="mt-1.5 max-h-[170px] min-h-8 flex-1">
            {s ? <Sparkline samples={s.samples} width={520} height={60} color={color} fluid /> : <Skeleton className="size-full opacity-50" />}
          </div>
          {s?.avg != null && (
            <div className="mt-5 hidden [@media(min-height:900px)]:block">
              <div className="eyebrow mb-2">Distribution</div>
              <Histogram stats={s} color={color} bins={32} className="h-[90px]" />
            </div>
          )}
        </div>

        <motion.div
          key={verdict?.kind ?? "none"}
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 flex items-start gap-3 [@media(max-height:700px)]:mt-3"
          aria-live="polite"
        >
          <span
            className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full"
            style={{ color: vTone.color, background: `color-mix(in srgb, ${vTone.color} 14%, transparent)` }}
          >
            <VIcon size={15} strokeWidth={2.4} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: vTone.color }}>
              {verdict?.headline ?? "Measuring"}
            </div>
            <p className="mt-0.5 text-[15px] leading-snug text-pretty text-text">{verdict?.line ?? "Pinging every Valve region…"}</p>
          </div>
        </motion.div>

        {alt?.stats?.avg != null && altInfo && done && (
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className="well mt-3 flex items-center gap-2.5 px-3 py-2 [@media(max-height:700px)]:hidden"
          >
            <span className="eyebrow">Best right now</span>
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
            <CloudOff size={12} /> Valve's API didn't answer — using the relay list from {age(cacheNote, Date.now())}.
          </p>
        )}
        <div className="h-4 shrink-0" />
      </div>

      <div className="relative border-t border-line bg-s1/60 px-6 py-4 [@media(max-height:700px)]:py-3">
        <LaunchButton disabled={!done} />
        <p className="mt-2 text-center text-[11px] text-text-3 [@media(max-height:700px)]:hidden">{done ? "Opens CS2 through Steam" : "Available when the check finishes"}</p>
      </div>
    </section>
  );
}

function RouteCard() {
  const route = useApp((s) => s.route);
  const info = useApp((s) => s.infos[s.preferred]);
  const setTab = useApp((s) => s.setTab);
  const infos = useApp((s) => s.infos);
  const verdict = useVerdict();
  const alt = verdict?.alternative;
  const explanation = route
    ? explainRoute(route, alt?.stats?.avg != null ? { city: infos[alt.code]?.city ?? alt.code, avg: alt.stats.avg } : null)
    : null;
  const bad = route?.diagnosis.finding != null;

  return (
    <section className="panel shrink-0 px-4 pt-3 pb-3.5" aria-label="Route summary">
      <div className="flex items-center gap-2">
        <span className="eyebrow">Route to {info?.city ?? "your region"}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setTab("route")}
          className="group inline-flex items-center gap-1 text-[11.5px] font-medium text-text-2 transition-colors duration-150 hover:text-accent"
        >
          All hops <ArrowRight size={12} className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
      </div>
      <p className={`mt-1 truncate text-[13px] font-medium ${bad ? "text-bad" : "text-text"}`}>
        {explanation ? explanation.title : <Skeleton className="mt-1 h-3.5 w-52" />}
      </p>
      <div className="mt-3">{route ? <RouteChain route={route} compact /> : <RouteChainSkeleton compact />}</div>
    </section>
  );
}

function Fastest() {
  const reduce = useReducedMotion();
  const results = useApp((s) => s.results);
  const infos = useApp((s) => s.infos);
  const phase = useApp((s) => s.phase);
  const preferred = useApp((s) => s.preferred);
  const blockedCount = Object.values(results).filter((r) => r.block.state === "blocked").length;
  const top = useMemo(
    () => Object.values(results).filter((r) => r.stats?.avg != null && r.block.state !== "blocked").sort((a, b) => playScore(a) - playScore(b)).slice(0, 6),
    [results],
  );
  return (
    <section className="panel shrink-0 px-4 pt-3 pb-2.5" aria-label="Fastest regions">
      <div className="eyebrow">Fastest {phase === "done" ? "right now" : "so far"}</div>
      <ol className="mt-2 grid grid-flow-col grid-cols-2 grid-rows-3 gap-x-5">
        {Array.from({ length: 6 }, (_, i) => {
          const r = top[i];
          if (!r && phase === "done") return <li key={`e${i}`} aria-hidden />;
          if (!r) {
            return (
              <li key={`s${i}`} className="flex h-[27px] items-center gap-2.5 border-b border-line">
                <Skeleton className="h-2.5 w-3" />
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="ml-auto h-2.5 w-8" />
              </li>
            );
          }
          const tone = resultTone(r);
          const Icon = TONES[tone].icon;
          return (
            <motion.li
              key={r.code}
              layout={reduce ? false : "position"}
              transition={{ type: "spring", stiffness: 400, damping: 36 }}
              className="flex h-[27px] items-center gap-2.5 border-b border-line text-[12.5px]"
            >
              <span className="num w-3 text-[10.5px] text-text-3">{i + 1}</span>
              <Flag code={r.code} size={15} />
              <span className={`truncate ${r.code === preferred ? "font-semibold" : ""}`}>{infos[r.code]?.city}</span>
              <span className="ml-auto inline-flex items-center gap-1.5">
                <Icon size={12} strokeWidth={2.5} style={{ color: TONES[tone].color }} aria-label={TONES[tone].label} />
                <span className="num w-7 text-right font-semibold" style={{ color: TONES[tone].color }}>
                  <CountUp value={r.stats?.avg ?? null} />
                </span>
              </span>
            </motion.li>
          );
        })}
      </ol>
      {phase === "done" && top.length < 6 && (
        <p className="-mt-[54px] pl-[50%] text-[11.5px] leading-snug text-text-3">
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
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <FirewallWarning />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(410px,0.9fr)_1.1fr] gap-3">
        <Hero />
        <div className="flex min-h-0 flex-col gap-3">
          <section className="panel relative flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Live map">
            <div className="grid-texture pointer-events-none absolute inset-0" aria-hidden />
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(70% 80% at 50% 45%, var(--nc-wash-1), transparent 70%)" }}
              aria-hidden
            />
            <div className="relative flex items-center gap-3 px-4 pt-3">
              <span className="eyebrow">{checking ? "Sweeping Valve regions" : "Every Valve region"}</span>
              {checking && total > 0 && (
                <span className="num text-[11px] text-accent">
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
