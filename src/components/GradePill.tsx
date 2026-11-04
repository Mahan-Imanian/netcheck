import { TONES, type Tone } from "../lib/grades";

export function GradePill({ tone, size = "sm", label, quiet = false }: { tone: Tone; size?: "sm" | "lg"; label?: string; quiet?: boolean }) {
  const meta = TONES[tone];
  const Icon = meta.icon;
  const lg = size === "lg";
  if (quiet) {
    return (
      <span className="display inline-flex items-center gap-1.5 text-[13.5px] font-semibold tracking-[0.06em] whitespace-nowrap uppercase" style={{ color: meta.color }}>
        <span className="h-3 w-[3px]" style={{ background: meta.color }} aria-hidden />
        {label ?? meta.label}
      </span>
    );
  }
  return (
    <span
      className={`chamfer-sm display inline-flex items-center gap-1.5 font-bold tracking-[0.1em] whitespace-nowrap uppercase ${lg ? "h-8 pr-3.5 pl-2.5 text-[15px]" : "h-6 pr-2.5 pl-2 text-[12.5px]"}`}
      style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 14%, transparent)` }}
    >
      <Icon size={lg ? 15 : 12} strokeWidth={2.75} aria-hidden />
      {label ?? meta.label}
    </span>
  );
}
