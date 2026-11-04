import { motion } from "motion/react";
import type { Thresholds } from "../bindings/Thresholds";
import { CountUp } from "./CountUp";

const SWEEP = 260;
const START = 140;
const C = 100;
const SEGMENTS = 44;

function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function segment(i: number, inner: number, outer: number): string {
  const step = SWEEP / SEGMENTS;
  const a0 = START + i * step + step * 0.16;
  const a1 = START + (i + 1) * step - step * 0.16;
  const [x0, y0] = polar(outer, a0);
  const [x1, y1] = polar(outer, a1);
  const [x2, y2] = polar(inner, a1);
  const [x3, y3] = polar(inner, a0);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}L${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}L${x3.toFixed(2)} ${y3.toFixed(2)}Z`;
}

interface Props {
  value: number | null | undefined;
  color: string;
  thresholds: Thresholds | undefined;
  settled: boolean;
  max?: number;
}

export function Gauge({ value, color, thresholds, settled, max = 200 }: Props) {
  const lit = value == null ? 0 : Math.max(1, Math.round((Math.min(value, max) / max) * SEGMENTS));
  const bandColor = (v: number) =>
    !thresholds ? "var(--nc-text-3)" : v <= thresholds.excellent.avgMs ? "var(--nc-excellent)" : v <= thresholds.good.avgMs ? "var(--nc-good)" : v <= thresholds.playable.avgMs ? "var(--nc-playable)" : "var(--nc-bad)";

  return (
    <div className="relative aspect-square h-full max-h-full">
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const v = ((i + 0.5) / SEGMENTS) * max;
          return <path key={`b${i}`} d={segment(i, 95, 98)} fill={bandColor(v)} opacity={0.5} />;
        })}

        {Array.from({ length: SEGMENTS }, (_, i) => {
          const on = i < lit;
          const head = i === lit - 1;
          return (
            <motion.path
              key={i}
              d={segment(i, 70, 88)}
              initial={false}
              animate={{ fill: on ? color : "var(--nc-s4)", opacity: on ? (head ? 1 : 0.55 + (i / Math.max(lit, 1)) * 0.4) : 1 }}
              transition={{ duration: 0.18, delay: on ? i * 0.018 : (SEGMENTS - i) * 0.006 }}
            />
          );
        })}

        {[0, 50, 100, 150, 200].map((v) => {
          const [x, y] = polar(110, START + (v / max) * SWEEP);
          return (
            <text key={v} x={x} y={y} fill="var(--nc-text-3)" fontSize={9} textAnchor="middle" dominantBaseline="middle" className="display" fontWeight={600} letterSpacing="0.05em">
              {v}
            </text>
          );
        })}
        <circle cx={C} cy={C} r={60} fill="none" stroke="var(--nc-line)" strokeWidth={1} />
      </svg>

      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center pt-[5%]">
          <motion.div
            key={settled ? "settled" : "live"}
            className="display leading-[0.85] font-bold"
            initial={settled ? { scale: 1.06 } : false}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 18 }}
            style={{ fontSize: "clamp(58px, 11.5vh, 118px)", color: value == null ? "var(--nc-text-3)" : color }}
          >
            {value == null ? "--" : <CountUp value={value} duration={0.7} />}
          </motion.div>
          <div className="hud-label mt-1.5">ms average</div>
        </div>
      </div>
    </div>
  );
}
