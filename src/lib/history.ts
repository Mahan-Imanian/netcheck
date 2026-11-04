import type { HistoryCell } from "../bindings/HistoryCell";

export interface PlayWindow {
  hour: number;
  avg: number;
  days: number;
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
}

/** Best and worst hour of day by median average, over hours seen on 2+ days. */
export function playWindows(cells: HistoryCell[]): { best: PlayWindow; worst: PlayWindow } | null {
  const byHour = new Map<number, number[]>();
  for (const c of cells) {
    const list = byHour.get(c.hour) ?? [];
    list.push(c.avgMs + c.lossPct * 4);
    byHour.set(c.hour, list);
  }
  const windows: PlayWindow[] = [...byHour.entries()]
    .filter(([, v]) => v.length >= 2)
    .map(([hour, v]) => ({ hour, avg: median(v), days: v.length }));
  if (windows.length < 2) return null;
  const sorted = [...windows].sort((a, b) => a.avg - b.avg);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (!best || !worst || worst.avg - best.avg < 5) return null;
  const rawAvg = (hour: number) => median(cells.filter((c) => c.hour === hour).map((c) => c.avgMs));
  return { best: { ...best, avg: rawAvg(best.hour) }, worst: { ...worst, avg: rawAvg(worst.hour) } };
}

export function lastDays(n: number, now: Date): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}
