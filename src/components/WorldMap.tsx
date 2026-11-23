import { AnimatePresence, motion, useAnimationFrame, useReducedMotion } from "motion/react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import land from "../assets/land-dots.json";
import type { RegionInfo } from "../bindings/RegionInfo";
import type { RegionResult } from "../bindings/RegionResult";
import { isRtl, useLocale, useT } from "../i18n";
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

/** One full turn of the scanner, in ms. Results wait for the beam to reach them. */
const PERIOD = 2600;
/** Width of the beam's fading tail, in degrees. */
const TAIL = 64;
const RANGE = 1150;

const LAND_PATH = land.dots.map(([lon, lat]) => `M${px(lon ?? 0).toFixed(1)} ${py(lat ?? 0).toFixed(1)}h0`).join("");

const LandDots = memo(function LandDots({ stroke, width = 2.5 }: { stroke: string; width?: number }) {
  return <path d={LAND_PATH} stroke={stroke} strokeWidth={width} strokeLinecap="round" fill="none" />;
});

const Graticule = memo(function Graticule() {
  const lines: React.ReactNode[] = [];
  for (let lon = -150; lon <= 150; lon += 30) lines.push(<line key={`lo${lon}`} x1={px(lon)} x2={px(lon)} y1={0} y2={H} />);
  for (let lat = -30; lat <= 60; lat += 30) {
    lines.push(<line key={`la${lat}`} x1={0} x2={W} y1={py(lat)} y2={py(lat)} strokeDasharray={lat === 0 ? "2 4" : undefined} />);
  }
  return (
    <g stroke="var(--nc-line)" strokeWidth={0.6}>
      {lines}
    </g>
  );
});

/** The beam's wedge: a bright leading edge and a tail that fades behind it. */
const Wedge = memo(function Wedge({ fill, edge }: { fill: string; edge?: string }) {
  const slices = 16;
  const wedge = (from: number, to: number) => {
    const a = (from * Math.PI) / 180;
    const b = (to * Math.PI) / 180;
    return `M0 0L${(RANGE * Math.cos(a)).toFixed(1)} ${(RANGE * Math.sin(a)).toFixed(1)}A${RANGE} ${RANGE} 0 0 0 ${(RANGE * Math.cos(b)).toFixed(1)} ${(RANGE * Math.sin(b)).toFixed(1)}Z`;
  };
  return (
    <>
      {Array.from({ length: slices }, (_, i) => (
        <path key={i} d={wedge((-TAIL * i) / slices, (-TAIL * (i + 1)) / slices)} fill={fill} fillOpacity={(1 - i / slices) ** 2.2} />
      ))}
      {edge && <line x1={0} y1={0} x2={RANGE} y2={0} stroke={edge} strokeWidth={1.2} />}
    </>
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

/** The origin stays put while a check runs, so the beam never jumps mid-sweep. */
function useHome(infos: Record<string, RegionInfo>, results: Record<string, RegionResult>, checking: boolean): [number, number] {
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
    if (nearest && !checking) writeHome(nearest);
  }, [nearest, checking]);
  if (configured) return configured;
  if (checking) return readHome() ?? FALLBACK_HOME;
  return nearest ?? readHome() ?? FALLBACK_HOME;
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

const bearing = (from: [number, number], to: [number, number]) => ((Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI + 360) % 360;

/** Grade markers differ by shape as well as colour. A background-coloured halo keeps them legible over land. */
function Marker({ tone, size }: { tone: Tone | "pending"; size: number }) {
  const halo = { stroke: "var(--nc-bg)", strokeWidth: 2, paintOrder: "stroke" as const };
  if (tone === "pending") return <circle r={size * 0.45} fill="var(--nc-text-3)" fillOpacity={0.55} />;
  const c = TONES[tone].color;
  const r = size;
  switch (tone) {
    case "excellent":
      return (
        <g>
          <circle r={r * 1.75} fill="none" stroke={c} strokeOpacity={0.55} strokeWidth={1} />
          <circle r={r} fill={c} {...halo} />
        </g>
      );
    case "good":
      return <circle r={r} fill={c} {...halo} />;
    case "playable":
      return <rect x={-r * 0.85} y={-r * 0.85} width={r * 1.7} height={r * 1.7} transform="rotate(45)" fill={c} {...halo} />;
    case "bad":
      return (
        <g strokeLinecap="square">
          <path d={`M${-r * 0.8} ${-r * 0.8}L${r * 0.8} ${r * 0.8}M${r * 0.8} ${-r * 0.8}L${-r * 0.8} ${r * 0.8}`} stroke="var(--nc-bg)" strokeWidth={r * 0.75 + 2.5} />
          <path d={`M${-r * 0.8} ${-r * 0.8}L${r * 0.8} ${r * 0.8}M${r * 0.8} ${-r * 0.8}L${-r * 0.8} ${r * 0.8}`} stroke={c} strokeWidth={r * 0.75} />
        </g>
      );
    case "blocked":
      return (
        <g stroke={c} strokeWidth={1.4} fill="var(--nc-bg)">
          <circle r={r * 1.05} />
          <line x1={-r * 0.7} y1={r * 0.7} x2={r * 0.7} y2={-r * 0.7} />
        </g>
      );
    case "muted":
      return <circle r={r * 0.85} fill="var(--nc-bg)" stroke={c} strokeWidth={1.3} />;
  }
}

/** Corner brackets that lock onto a region. */
function Brackets({ r, color }: { r: number; color: string }) {
  const k = r * 0.55;
  const d = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]
    .map(([sx = 1, sy = 1]) => `M${sx * r} ${sy * (r - k)}V${sy * r}H${sx * (r - k)}`)
    .join("");
  return (
    <motion.path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={1.4}
      initial={{ opacity: 0, scale: 1.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}

/** Where the scan starts: a reticle with the check's progress around it. */
function Origin({ at, progress, scanning }: { at: [number, number]; progress: number; scanning: boolean }) {
  const ring = 12;
  const circ = 2 * Math.PI * ring;
  return (
    <g style={{ transform: `translate(${at[0]}px, ${at[1]}px)`, transition: "transform 600ms var(--ease-out-quint)" }} pointerEvents="none">
      {[90, 200, 330].map((r) => (
        <circle key={r} r={r} fill="none" stroke="var(--nc-text)" strokeOpacity={scanning ? 0.09 : 0.05} strokeWidth={0.8} strokeDasharray="1 5" />
      ))}
      <circle r={ring} fill="var(--nc-bg)" fillOpacity={0.88} stroke="var(--nc-line-3)" strokeWidth={1} />
      {scanning && (
        <circle
          r={ring}
          fill="none"
          stroke="var(--nc-text)"
          strokeWidth={1.6}
          strokeDasharray={`${circ * progress} ${circ}`}
          transform="rotate(-90)"
          style={{ transition: "stroke-dasharray 300ms var(--ease-out-quint)" }}
        />
      )}
      <g stroke="var(--nc-text-2)" strokeWidth={1.2}>
        {[0, 90, 180, 270].map((a) => (
          <line key={a} x1={ring + 3} x2={ring + 8} transform={`rotate(${a})`} />
        ))}
      </g>
      <rect x={-2.6} y={-2.6} width={5.2} height={5.2} transform="rotate(45)" fill="var(--nc-text)" />
    </g>
  );
}

interface Props {
  compact?: boolean;
  selected?: string | null;
  onSelect?: (code: string) => void;
}

export function WorldMap({ compact = false, selected, onSelect }: Props) {
  const t = useT();
  const textDir = isRtl(useLocale()) ? "rtl" : "ltr";
  const infos = useApp((s) => s.infos);
  const results = useApp((s) => s.results);
  const order = useApp((s) => s.order);
  const phase = useApp((s) => s.phase);
  const preferred = useApp((s) => s.preferred);
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);

  const checking = phase === "relays" || phase === "checking" || phase === "boot";
  const homeGeo = useHome(infos, results, checking);
  const home = useMemo<[number, number]>(() => [px(homeGeo[0]), py(homeGeo[1])], [homeGeo]);
  const progress = order.length ? Object.keys(results).length / order.length : 0;
  const dot = compact ? 6 : 5;

  const placed = useMemo(
    () =>
      order
        .map((code) => ({ info: infos[code], result: results[code] }))
        .filter((p): p is { info: RegionInfo; result: RegionResult | undefined } => p.info?.lonLat != null)
        .map((p) => {
          const at: [number, number] = [px(p.info.lonLat?.[0] ?? 0), py(p.info.lonLat?.[1] ?? 0)];
          return { ...p, at, angle: bearing(home, at) };
        }),
    [order, infos, results, home],
  );

  // Regions already measured when the map mounts show at once; later ones wait for the beam.
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set(Object.keys(results)));
  const revealedRef = useRef(revealed);
  revealedRef.current = revealed;
  useEffect(() => {
    if (Object.keys(results).length === 0 && revealedRef.current.size > 0) setRevealed(new Set());
  }, [results]);
  useEffect(() => {
    if (reduced) setRevealed(new Set(Object.keys(results)));
  }, [reduced, results]);

  const waiting = placed.filter((p) => p.result && !revealed.has(p.info.code));
  const beamOn = !reduced && (checking || waiting.length > 0);

  const beam = useRef<SVGGElement>(null);
  const beamMask = useRef<SVGGElement>(null);
  const clock = useRef<{ start: number | null; angle: number }>({ start: null, angle: 0 });
  const waitingRef = useRef(waiting);
  waitingRef.current = waiting;

  useAnimationFrame((time) => {
    if (!beamOn) {
      clock.current.start = null;
      return;
    }
    const c = clock.current;
    if (c.start == null) c.start = time - (c.angle / 360) * PERIOD;
    const prev = c.angle;
    const angle = (((time - c.start) / PERIOD) * 360) % 360;
    c.angle = angle;
    const transform = `translate(${home[0]} ${home[1]}) rotate(${angle.toFixed(2)})`;
    beam.current?.setAttribute("transform", transform);
    beamMask.current?.setAttribute("transform", transform);

    const swept = (a: number) => (angle >= prev ? a > prev && a <= angle : a > prev || a <= angle);
    const hit = waitingRef.current.filter((p) => swept(p.angle));
    if (hit.length) {
      setRevealed((s) => {
        const next = new Set(s);
        for (const p of hit) next.add(p.info.code);
        return next;
      });
    }
  });

  const shown = (r: RegionResult | undefined, code: string) => (r && revealed.has(code) ? r : undefined);
  const best = useMemo(
    () => bestRegion(Object.values(results).filter((r) => revealed.has(r.code)), { excludeBlocked: true }),
    [results, revealed],
  );

  const focus = hover ?? selected ?? null;
  const focusInfo = focus ? infos[focus] : undefined;
  const focusResult = focus ? shown(results[focus], focus) : undefined;
  const fx = focusInfo?.lonLat ? px(focusInfo.lonLat[0]) : 0;
  const fy = focusInfo?.lonLat ? py(focusInfo.lonLat[1]) : 0;

  return (
    <div className="relative grid size-full place-items-center [container-type:size]" dir="ltr">
      <div className="relative" style={{ aspectRatio: `${W} / ${H}`, width: `min(100cqw, calc(100cqh * ${W / H}))` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full overflow-visible" role="img" aria-label={t("map.aria")}>
          <defs>
            <linearGradient id="beam-edge" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="var(--nc-beam)" stopOpacity={0.95} />
              <stop offset="0.6" stopColor="var(--nc-beam)" stopOpacity={0.35} />
              <stop offset="1" stopColor="var(--nc-beam)" stopOpacity={0} />
            </linearGradient>
            <radialGradient id="beam-falloff">
              <stop offset="0" stopColor="white" stopOpacity={1} />
              <stop offset="0.45" stopColor="white" stopOpacity={0.55} />
              <stop offset="1" stopColor="white" stopOpacity={0} />
            </radialGradient>
            <mask id="beam-range" maskUnits="userSpaceOnUse" x={-RANGE} y={-RANGE} width={RANGE * 2} height={RANGE * 2}>
              <circle r={RANGE} fill="url(#beam-falloff)" />
            </mask>
            <mask id="beam-lit" maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
              <g ref={beamMask} transform={`translate(${home[0]} ${home[1]})`}>
                <g mask="url(#beam-range)">
                  <Wedge fill="white" />
                </g>
              </g>
            </mask>
            <clipPath id="map-clip">
              <rect width={W} height={H} rx={6} />
            </clipPath>
          </defs>

          <g clipPath="url(#map-clip)">
            <Graticule />
            <LandDots stroke="var(--nc-land)" />
            {beamOn && (
              <>
                <g mask="url(#beam-lit)">
                  <LandDots stroke="var(--nc-land-lit)" width={2.9} />
                </g>
                <g ref={beam} transform={`translate(${home[0]} ${home[1]})`} pointerEvents="none">
                  <g mask="url(#beam-range)" opacity={0.5}>
                    <Wedge fill="var(--nc-beam-fill)" edge="url(#beam-edge)" />
                  </g>
                </g>
              </>
            )}
          </g>

          <g fill="none">
            {placed.map(({ info, result, at }) => {
              const r = shown(result, info.code);
              if (!r?.stats?.avg) return null;
              if (Math.hypot(at[0] - home[0], at[1] - home[1]) < 8) return null;
              const tone = resultTone(r);
              const d = arcPath(home, at);
              const strong = info.code === best?.code || info.code === preferred || info.code === focus;
              return (
                <g key={info.code} stroke={TONES[tone].color}>
                  <motion.path
                    d={d}
                    strokeWidth={strong ? 1.4 : 0.8}
                    strokeOpacity={strong ? 0.8 : 0.26}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  />
                  {info.code === preferred && !checking && <path d={d} strokeWidth={1.6} strokeOpacity={0.9} className="arc-flow" />}
                </g>
              );
            })}
          </g>

          <Origin at={home} progress={progress} scanning={checking} />

          {placed.map(({ info, result, at }) => {
            const r = shown(result, info.code);
            const tone: Tone | "pending" = !r ? "pending" : r.block.state === "blocked" ? "blocked" : resultTone(r);
            const isBest = best?.code === info.code && !checking;
            const isFocus = info.code === focus;
            return (
              <g
                key={info.code}
                transform={`translate(${at[0]} ${at[1]})`}
                onMouseEnter={() => setHover(info.code)}
                onMouseLeave={() => setHover((h) => (h === info.code ? null : h))}
                onClick={() => onSelect?.(info.code)}
                className={onSelect ? "cursor-pointer" : undefined}
              >
                <circle r={12} fill="transparent" />
                {r && (
                  <motion.circle
                    key={`ping-${info.code}`}
                    r={dot}
                    fill="none"
                    stroke={tone === "pending" ? "var(--nc-text)" : TONES[tone].color}
                    strokeWidth={1.2}
                    initial={{ scale: 1, opacity: 0.85 }}
                    animate={{ scale: 4.2, opacity: 0 }}
                    transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
                {(isBest || isFocus) && r && <Brackets key={isBest ? "best" : "focus"} r={dot * 2.3} color={isBest ? "var(--nc-excellent)" : "var(--nc-text-2)"} />}
                <motion.g
                  key={r ? "on" : "off"}
                  initial={r ? { scale: 0.2, opacity: 0 } : false}
                  animate={{ scale: isFocus ? 1.3 : 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 520, damping: 26 }}
                >
                  <Marker tone={tone} size={dot} />
                </motion.g>
              </g>
            );
          })}
        </svg>

        {placed.map(({ info, result, at }) => {
          const r = shown(result, info.code);
          const isBest = best?.code === info.code && !checking;
          if (!(info.code === preferred || isBest || info.code === focus) || !r) return null;
          const tone = r.block.state === "blocked" ? "blocked" : resultTone(r);
          return (
            <motion.div
              key={`chip-${info.code}`}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-none absolute z-[5] -translate-y-1/2"
              style={{ left: `calc(${(at[0] / W) * 100}% + ${dot * 2.3 + 6}px)`, top: `${(at[1] / H) * 100}%` }}
            >
              <span className="chamfer-sm display inline-flex items-center gap-1.5 bg-s3 px-2 py-[2px] text-[14px] font-bold tracking-[0.06em] whitespace-nowrap shadow-[inset_0_0_0_1px_var(--nc-line-2)]">
                <span className="text-text">{info.code.toUpperCase()}</span>
                {r.stats?.avg != null && (
                  <span style={{ color: TONES[tone].color }}>
                    {ms(r.stats.avg)}
                    <span className="ms-0.5 text-[11px] text-text-3">MS</span>
                  </span>
                )}
              </span>
            </motion.div>
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
              dir={textDir}
              className="panel pointer-events-none absolute z-10 w-[220px] p-3"
              style={{
                left: `${(fx / W) * 100}%`,
                top: `${(fy / H) * 100}%`,
                transform: `translate(${fx > W * 0.7 ? "calc(-100% - 16px)" : "16px"}, ${fy > H * 0.6 ? "calc(-100% + 8px)" : "-8px"})`,
              }}
            >
              <div className="flex items-center gap-2">
                <Flag code={focusInfo.code} size={16} />
                <span className="truncate text-[12.5px] font-semibold">{focusInfo.city}</span>
                <span className="num ms-auto text-[11px] text-text-3">{focusInfo.code.toUpperCase()}</span>
              </div>
              {focusResult?.stats?.avg != null ? (
                <>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="num text-[26px] leading-none font-semibold tracking-[-0.03em]">{ms(focusResult.stats.avg)}</span>
                    <span className="text-[11px] text-text-3">{t("map.avg")}</span>
                    <span className="ms-auto">
                      <GradePill tone={resultTone(focusResult)} />
                    </span>
                  </div>
                  <dl className="num mt-2.5 grid grid-cols-3 gap-x-2 text-[11px]">
                    {(
                      [
                        [t("map.min"), ms(focusResult.stats.min)],
                        [t("map.p95"), ms(focusResult.stats.p95)],
                        [t("map.max"), ms(focusResult.stats.max)],
                        [t("map.jitter"), ms(focusResult.stats.jitter, 1)],
                        [t("map.loss"), `${pct(focusResult.stats.lossPct)}%`],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-text-3">{k}</dt>
                        <dd className="text-text">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <p className="mt-2 text-[12px] text-text-2">{focusResult ? t("map.noReply") : t("map.waiting")}</p>
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
