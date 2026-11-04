import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

interface Props {
  samples: Array<number | null>;
  width?: number;
  height?: number;
  color: string;
  fluid?: boolean;
}

function useSize(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled]);
  return { ref, size };
}

function Plot({ samples, width, height, color }: { samples: Array<number | null>; width: number; height: number; color: string }) {
  const reduce = useReducedMotion();
  const got = samples.filter((s): s is number => s != null);
  const lo = Math.min(...got) - 2;
  const hi = Math.max(...got, lo + 10);
  const pad = 3;
  const x = (i: number) => (samples.length === 1 ? width / 2 : (i / (samples.length - 1)) * (width - pad * 2) + pad);
  const y = (v: number) => height - pad - ((v - lo) / (hi - lo)) * (height - pad * 2 - 4);

  let d = "";
  let pen = false;
  samples.forEach((s, i) => {
    if (s == null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(s).toFixed(1)}`;
    pen = true;
  });

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block overflow-visible" aria-hidden>
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        initial={reduce ? false : { pathLength: 0, opacity: 0.4 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        style={{ filter: `drop-shadow(0 0 3px color-mix(in srgb, ${color} 45%, transparent))` }}
      />
      {samples.map((s, i) =>
        s == null ? (
          <g key={i} stroke="var(--nc-bad)" strokeWidth={1.4} strokeLinecap="round">
            <line x1={x(i) - 2} y1={height - 5} x2={x(i) + 2} y2={height - 1} />
            <line x1={x(i) + 2} y1={height - 5} x2={x(i) - 2} y2={height - 1} />
          </g>
        ) : null,
      )}
    </svg>
  );
}

export function Sparkline({ samples, width = 120, height = 28, color, fluid = false }: Props) {
  const { ref, size } = useSize(fluid);
  const empty = !samples.some((s) => s != null);
  if (fluid) {
    return (
      <div ref={ref} className="size-full">
        {size && size.w > 0 && !empty && <Plot samples={samples} width={size.w} height={size.h} color={color} />}
      </div>
    );
  }
  return empty ? <svg width={width} height={height} aria-hidden /> : <Plot samples={samples} width={width} height={height} color={color} />;
}
