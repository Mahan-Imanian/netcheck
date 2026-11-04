import { TONES, type Tone } from "../lib/grades";

export function GradePill({ tone, size = "sm", label }: { tone: Tone; size?: "sm" | "lg"; label?: string }) {
  const meta = TONES[tone];
  const Icon = meta.icon;
  const lg = size === "lg";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap ${lg ? "h-7 px-3 text-[13px]" : "h-[22px] px-2 text-[11.5px]"}`}
      style={{
        color: meta.color,
        background: `color-mix(in srgb, ${meta.color} 13%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${meta.color} 26%, transparent)`,
      }}
    >
      <Icon size={lg ? 15 : 13} strokeWidth={2.25} aria-hidden />
      {label ?? meta.label}
    </span>
  );
}
