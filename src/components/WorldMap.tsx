import { AnimatePresence, motion } from "motion/react";
import { memo, useEffect, useMemo, useState } from "react";
import land from "../assets/land-dots.json";
import type { RegionInfo } from "../bindings/RegionInfo";
import type { RegionResult } from "../bindings/RegionResult";
import { ms, pct } from "../lib/format";
import { resultTone, TONES, type Tone } from "../lib/grades";
import { bestRegion } from "../lib/regions";
import { useApp } from "../lib/store";
import { Flag } from "./Flag";
import { GradePill } from "./GradePill";
import { Tag } from "./Tag";

const W = 1000;
const H = (W * (land.latMax - land.latMin)) / 360;
const px = (lon: number) => ((lon + 180) / 360) * W;
const py = (lat: number) => ((land.latMax - lat) / 360) * W;
const HOME_KEY = "nc.home";
const FALLBACK_HOME: [number, number] = [20, 30];

const LandDots = memo(function LandDots() {
  const d = useMemo(() => land.dots.map(([lon, lat]) => `M${px(lon ?? 0).toFixed(1)} ${py(lat ?? 0).toFixed(1)}h0`).join(""), []);
  return <path d={d} stroke="var(--nc-land)" strokeWidth={2.5} strokeLinecap="round" fill="none" />;
});

const Graticule = memo(function Graticule() {
  const lines: React.ReactNode[] = [];
  for (let lon = -150; lon <= 150; lon += 30) {
    lines.push(<line key={`lo${lon}`} x1={px(lon)} x2={px(lon)} y1={0} y2={H} />);
  }
  for (let lat = -30; lat <= 60; lat += 30) {
    lines.push(<line key={`la${lat}`} x1={0} x2={W} y1={py(lat)} y2={py(lat)} strokeDasharray={lat === 0 ? "2 4" : undefined} />);
  }
  return (
    <g stroke="var(--nc-line)" strokeWidth={0.6}>
      {lines}
    </g>
  );
});

function readHome(): [number, number] | null {
  try {
    const raw = localStorage.getItem(HOME_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number") ? [v[0] as number, v[1] as number] : null;
  } catch {
    return null;
  }
}

function writeHome(v: [number, number]) {
  try {
    localStorage.setItem(HOME_KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable; the estimate is recomputed next check */
  }
}

function useHome(infos: Record<string, RegionInfo>, results: Record<string, RegionResult>): [number, number] {
  const configured = useApp((s) => s.settings?.homeLonLat ?? null);
  const nearest = useMemo(() => {
    let best: [number, number] | null = null;
    let bestAvg = Infinity;
    for (const r of Object.values(results)) {
      const avg = r.stats?.avg;
      const geo = infos[r.code]?.lonLat;
      if (avg != null && geo && !r.estimated && avg < bestAvg) {
        bestAvg = avg;
        best = geo;
      }
    }
    return best;
  }, [infos, results]);
  useEffect(() => {
    if (nearest) writeHome(nearest);
  }, [nearest]);
  return configured ?? nearest ?? readHome() ?? FALLBACK_HOME;
}

function arcPath(a: [number, number], b: [number, number]): string {
  const [x1, y1] = a;
  const [x2, y2] = b;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const lift = Math.min(len * 0.28, 120);
  const nx = -(y2 - y1) / (len || 1);
  const ny = (x2 - x1) / (len || 1);
  const sign = ny > 0 ? -1 : 1;
  return `M${x1.toFixed(1)} ${y1.toFixed(1)}Q${(mx + nx * lift * sign).toFixed(1)} ${(my + ny * lift * sign).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

function Marker({ tone, size }: { tone: Tone | "pending"; size: number }) {
  if (tone === "pending") {
    return <circle r={size * 0.7} fill="none" stroke="var(--nc-text-3)" strokeOpacity={0.5} strokeWidth={1} />;
  }
  const c = TONES[tone].color;
  const r = size;
  switch (tone) {
    case "excellent":
      return (
        <g>
          <circle r={r * 1.7} fill="none" stroke={c} strokeOpacity={0.5} strokeWidth={1} />
          <circle r={r} fill={c} />
        </g>
      );
    case "good":
      return <circle r={r} fill={c} />;
    case "playable":
      return <rect x={-r} y={-r} width={r * 2} height={r * 2} transform="rotate(45)" fill={c} />;
    case "bad":
      return (
        <g stroke={c} strokeWidth={r * 0.8} strokeLinecap="round">
          <line x1={-r} y1={-r} x2={r} y2={r} />
          <line x1={r} y1={-r} x2={-r} y2={r} />
        </g>
      );
    case "blocked":
      return (
        <g stroke={c} strokeWidth={1.4} fill="none">
          <circle r={r * 1.1} />
          <line x1={-r * 0.75} y1={r * 0.75} x2={r * 0.75} y2={-r * 0.75} />
        </g>
      );
    case "muted":
      return <circle r={r * 0.9} fill="none" stroke={c} strokeWidth={1.2} />;
  }
}

function Sweep({ home, progress }: { home: [number, number]; progress: number }) {
  const R = 560;
  const slices = 18;
  const span = 46;
  const ring = 16;
  const circ = 2 * Math.PI * ring;
  const wedge = (from: number, to: number) => {
    const a = (from * Math.PI) / 180;
    const b = (to * Math.PI) / 180;
    return `M0 0L${(R * Math.cos(a)).toFixed(1)} ${(R * Math.sin(a)).toFixed(1)}A${R} ${R} 0 0 0 ${(R * Math.cos(b)).toFixed(1)} ${(R * Math.sin(b)).toFixed(1)}Z`;
  };
  return (
    <g transform={`translate(${home[0]} ${home[1]})`} pointerEvents="none">
      {(
        <g mask="url(#sweep-mask)">
          {Array.from({ length: slices }, (_, i) => (
            <path key={i} d={wedge((-span * i) / slices, (-span * (i + 1)) / slices)} fill="var(--nc-accent)" fillOpacity={0.13 * (1 - i / slices) ** 2} />
          ))}
          <line x1={0} y1={0} x2={R} y2={0} stroke="url(#sweep-edge)" strokeWidth={1.2} />
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="3.2s" repeatCount="indefinite" />
        </g>
      )}
      {[70, 160, 270].map((r) => (
        <circle key={r} r={r} fill="none" stroke="var(--nc-accent)" strokeOpacity={0.1} strokeWidth={0.8} strokeDasharray="1 5" />
      ))}
      <circle r={ring} fill="var(--nc-bg)" fillOpacity={0.6} stroke="var(--nc-line-2)" strokeWidth={2} />
      <circle
        r={ring}
        fill="none"
        stroke="var(--nc-accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={`${circ * progress} ${circ}`}
        transform="rotate(-90)"
        style={{ transition: "stroke-dasharray 300ms var(--ease-out-quint)" }}
      />
    </g>
  );
}

interface Props {
  compact?: boolean;
  selected?: string | null;
  onSelect?: (code: string) => void;
}

export function WorldMap({ compact = false, selected, onSelect }: Props) {
  const infos = useApp((s) => s.infos);
  const results = useApp((s) => s.results);
  const order = useApp((s) => s.order);
  const phase = useApp((s) => s.phase);
  const preferred = useApp((s) => s.preferred);
  const [hover, setHover] = useState<string | null>(null);

  const homeGeo = useHome(infos, results);
  const home: [number, number] = [px(homeGeo[0]), py(homeGeo[1])];
  const checking = phase === "relays" || phase === "checking" || phase === "boot";
  const progress = order.length ? Object.keys(results).length / order.length : 0;
  const best = useMemo(() => bestRegion(Object.values(results), { excludeBlocked: true }), [results]);
  const dot = compact ? 6 : 5;

  const placed = order
    .map((code) => ({ info: infos[code], result: results[code] }))
    .filter((p): p is { info: RegionInfo; result: RegionResult | undefined } => p.info?.lonLat != null);

  const focus = hover ?? selected ?? null;
  const focusInfo = focus ? infos[focus] : undefined;
  const focusResult = focus ? results[focus] : undefined;
  const fx = focusInfo?.lonLat ? px(focusInfo.lonLat[0]) : 0;
  const fy = focusInfo?.lonLat ? py(focusInfo.lonLat[1]) : 0;

  return (
    <div className="relative grid size-full place-items-center [container-type:size]">
      <div className="relative" style={{ aspectRatio: `${W} / ${H}`, width: `min(100cqw, calc(100cqh * ${W / H}))` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full overflow-visible" role="img" aria-label="World map of Valve regions">
          <defs>
            <linearGradient id="sweep-edge" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="var(--nc-accent)" stopOpacity={0.9} />
              <stop offset="1" stopColor="var(--nc-accent)" stopOpacity={0} />
            </linearGradient>
            <radialGradient id="sweep-radial">
              <stop offset="0" stopColor="white" stopOpacity={1} />
              <stop offset="0.35" stopColor="white" stopOpacity={0.6} />
              <stop offset="0.7" stopColor="white" stopOpacity={0.12} />
              <stop offset="1" stopColor="white" stopOpacity={0} />
            </radialGradient>
            <mask id="sweep-mask" maskUnits="userSpaceOnUse" x={-560} y={-560} width={1120} height={1120}>
              <circle r={560} fill="url(#sweep-radial)" />
            </mask>
            <radialGradient id="home-glow">
              <stop offset="0" stopColor="var(--nc-accent)" stopOpacity={0.5} />
              <stop offset="1" stopColor="var(--nc-accent)" stopOpacity={0} />
            </radialGradient>
            <clipPath id="map-clip">
              <rect width={W} height={H} rx={6} />
            </clipPath>
          </defs>

          <g clipPath="url(#map-clip)">
            <Graticule />
            <LandDots />
          </g>
          {checking && <Sweep home={home} progress={progress} />}

          <g fill="none">
            {placed.map(({ info, result }) => {
              if (!result?.stats?.avg || !info.lonLat) return null;
              const to: [number, number] = [px(info.lonLat[0]), py(info.lonLat[1])];
              if (Math.hypot(to[0] - home[0], to[1] - home[1]) < 8) return null;
              const tone = resultTone(result);
              const d = arcPath(home, to);
              const strong = info.code === best?.code || info.code === preferred || info.code === focus;
              return (
                <g key={info.code} stroke={TONES[tone].color}>
                  <motion.path
                    d={d}
                    strokeWidth={strong ? 1.4 : 0.8}
                    strokeOpacity={strong ? 0.75 : 0.28}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  />
                  {strong && <path d={d} strokeWidth={1.6} strokeOpacity={0.9} className="arc-flow" />}
                </g>
              );
            })}
          </g>

          <g>
            <circle cx={home[0]} cy={home[1]} r={22} fill="url(#home-glow)" />
            <circle cx={home[0]} cy={home[1]} r={3.6} fill="var(--nc-text)" stroke="var(--nc-bg)" strokeWidth={1.5} />
          </g>

          {placed.map(({ info, result }) => {
            const [lon, lat] = info.lonLat ?? [0, 0];
            const tone: Tone | "pending" = !result ? "pending" : result.block.state === "blocked" ? "blocked" : resultTone(result);
            const isBest = best?.code === info.code && !checking;
            return (
              <g
                key={info.code}
                transform={`translate(${px(lon)} ${py(lat)})`}
                onMouseEnter={() => setHover(info.code)}
                onMouseLeave={() => setHover((h) => (h === info.code ? null : h))}
                onClick={() => onSelect?.(info.code)}
                className={onSelect ? "cursor-pointer" : undefined}
              >
                <circle r={11} fill="transparent" />
                {isBest && (
                  <circle
                    r={dot * 2}
                    fill="none"
                    stroke="var(--nc-excellent)"
                    strokeWidth={1.2}
                    style={{ transformBox: "fill-box", transformOrigin: "center", animation: "ring-pulse 2.4s var(--ease-out-quint) infinite" }}
                  />
                )}
                {isBest && <circle r={dot * 3.2} fill="url(#home-glow)" />}
                <motion.g
                  key={result ? "on" : "off"}
                  initial={!result ? false : { scale: 2.4, opacity: 0 }}
                  animate={{ scale: info.code === focus ? 1.35 : 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 24 }}
                  style={{ filter: result && tone !== "muted" ? `drop-shadow(0 0 4px ${TONES[tone as Tone].color})` : undefined }}
                >
                  <Marker tone={tone} size={dot} />
                </motion.g>
              </g>
            );
          })}
        </svg>

        {placed.map(({ info, result }) => {
          const isBest = best?.code === info.code && !checking;
          if (!(info.code === preferred || isBest || info.code === focus) || !info.lonLat) return null;
          const tone = result ? (result.block.state === "blocked" ? "blocked" : resultTone(result)) : null;
          return (
            <div
              key={`chip-${info.code}`}
              className="pointer-events-none absolute z-[5] -translate-y-1/2"
              style={{ left: `calc(${(px(info.lonLat[0]) / W) * 100}% + ${dot + 8}px)`, top: `${(py(info.lonLat[1]) / H) * 100}%` }}
            >
              <span
                className="chamfer-sm display inline-flex items-center gap-1.5 px-2 py-[2px] text-[14px] font-bold tracking-[0.06em] whitespace-nowrap"
                style={{ background: "var(--nc-s3)", boxShadow: "inset 0 0 0 1px var(--nc-line-2)" }}
              >
                <span className="text-text">{info.code.toUpperCase()}</span>
                {result?.stats?.avg != null && tone && (
                  <span style={{ color: TONES[tone].color }}>
                    {ms(result.stats.avg)}
                    <span className="ml-0.5 text-[11px] text-text-3">MS</span>
                  </span>
                )}
              </span>
            </div>
          );
        })}

        <AnimatePresence>
          {focus && focusInfo && hover && (
            <motion.div
              key={focus}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="panel pointer-events-none absolute z-10 w-[220px] p-3"
              style={{
                left: `${(fx / W) * 100}%`,
                top: `${(fy / H) * 100}%`,
                transform: `translate(${fx > W * 0.7 ? "calc(-100% - 14px)" : "14px"}, ${fy > H * 0.6 ? "calc(-100% + 8px)" : "-8px"})`,
                background: "var(--nc-s2)",
              }}
            >
              <div className="flex items-center gap-2">
                <Flag code={focusInfo.code} size={16} />
                <span className="truncate text-[12.5px] font-semibold">{focusInfo.city}</span>
                <span className="num ml-auto text-[11px] text-text-3">{focusInfo.code.toUpperCase()}</span>
              </div>
              {focusResult?.stats?.avg != null ? (
                <>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="num text-[26px] leading-none font-semibold tracking-[-0.03em]">{ms(focusResult.stats.avg)}</span>
                    <span className="text-[11px] text-text-3">ms avg</span>
                    <span className="ml-auto">
                      <GradePill tone={resultTone(focusResult)} />
                    </span>
                  </div>
                  <dl className="num mt-2.5 grid grid-cols-3 gap-x-2 text-[11px]">
                    {[
                      ["min", ms(focusResult.stats.min)],
                      ["p95", ms(focusResult.stats.p95)],
                      ["max", ms(focusResult.stats.max)],
                      ["jitter", ms(focusResult.stats.jitter, 1)],
                      ["loss", `${pct(focusResult.stats.lossPct)}%`],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-text-3">{k}</dt>
                        <dd className="text-text">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <p className="mt-2 text-[12px] text-text-2">{focusResult ? "No reply from any relay." : "Waiting for result…"}</p>
              )}
              {(focusResult?.block.state === "blocked" || focusResult?.estimated) && (
                <div className="mt-2 flex gap-1.5">
                  {focusResult.block.state === "blocked" && <Tag kind="blocked" />}
                  {focusResult.estimated && <Tag kind="estimated" />}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
