import { motion } from "motion/react";
import type { PingStats } from "../bindings/PingStats";
import { ms } from "../lib/format";

export function Histogram({ stats, color, bins = 24, className = "h-[72px]" }: { stats: PingStats; color: string; bins?: number; className?: string }) {
  const got = stats.samples.filter((s): s is number => s != null);
  if (got.length === 0) return null;
  const lo = Math.floor(Math.min(...got));
  const hi = Math.ceil(Math.max(...got));
  const width = Math.max(1, (hi - lo) / bins);
  const counts = Array.from({ length: bins }, () => 0);
  for (const v of got) {
    const i = Math.min(bins - 1, Math.floor((v - lo) / width));
    counts[i] = (counts[i] ?? 0) + 1;
  }
  const peak = Math.max(...counts, 1);
  return (
    <div>
      <div className={`flex items-end gap-[3px] ${className}`}>
        {counts.map((c, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-t-[2px]"
            style={{ background: c ? color : "var(--nc-s4)", opacity: c ? 0.35 + (0.65 * c) / peak : 1 }}
            initial={{ height: 0 }}
            animate={{ height: `${Math.max(4, (c / peak) * 100)}%` }}
            transition={{ delay: i * 0.008, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            title={`${(lo + i * width).toFixed(0)}–${(lo + (i + 1) * width).toFixed(0)} ms: ${c}`}
          />
        ))}
      </div>
      <div className="num mt-1 flex justify-between text-[10.5px] text-text-3">
        <span>{lo} ms</span>
        <span>p95 {ms(stats.p95)}</span>
        <span>{hi} ms</span>
      </div>
    </div>
  );
}
