import type { LucideIcon } from "lucide-react";
import { FlaskConical, ShieldBan, ShieldOff } from "lucide-react";

const KINDS: Record<"blocked" | "estimated" | "inactive", { icon: LucideIcon; label: string; color: string; title: string }> = {
  blocked: {
    icon: ShieldBan,
    label: "Blocked",
    color: "var(--nc-blocked)",
    title: "Blocked by your firewall: every relay in this region is in an enabled block rule.",
  },
  estimated: {
    icon: FlaskConical,
    label: "Estimated",
    color: "var(--nc-text-2)",
    title: "Measured on an unblocked neighbouring address in the same /24, not the relay itself.",
  },
  inactive: {
    icon: ShieldOff,
    label: "Rule off",
    color: "var(--nc-playable)",
    title: "A block rule covers this region, but the firewall is off for your current network, so it does nothing.",
  },
};

export function Tag({ kind }: { kind: keyof typeof KINDS }) {
  const k = KINDS[kind];
  const Icon = k.icon;
  return (
    <span
      title={k.title}
      className="chamfer-sm display inline-flex h-6 items-center gap-1 pr-2.5 pl-2 text-[12.5px] font-bold tracking-[0.1em] whitespace-nowrap uppercase"
      style={{ color: k.color, background: `color-mix(in srgb, ${k.color} 13%, transparent)` }}
    >
      <Icon size={11} strokeWidth={2.25} aria-hidden />
      {k.label}
    </span>
  );
}
