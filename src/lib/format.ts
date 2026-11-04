export function ms(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

export function pct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v === 0 ? "0" : v < 10 ? v.toFixed(1) : v.toFixed(0);
}

export function age(fromMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function clock(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}
