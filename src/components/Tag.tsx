import type { LucideIcon } from "lucide-react";
import { FlaskConical, ShieldBan, ShieldOff } from "lucide-react";
import { useT, type MessageKey } from "../i18n";

const KINDS: Record<"blocked" | "estimated" | "inactive", { icon: LucideIcon; label: MessageKey; title: MessageKey; color: string }> = {
  blocked: { icon: ShieldBan, label: "tag.blocked", title: "tag.blocked.title", color: "var(--nc-blocked)" },
  estimated: { icon: FlaskConical, label: "tag.estimated", title: "tag.estimated.title", color: "var(--nc-text-2)" },
  inactive: { icon: ShieldOff, label: "tag.inactive", title: "tag.inactive.title", color: "var(--nc-playable)" },
};

export function Tag({ kind }: { kind: keyof typeof KINDS }) {
  const t = useT();
  const k = KINDS[kind];
  const Icon = k.icon;
  return (
    <span
      title={t(k.title)}
      className="chamfer-sm display inline-flex h-6 items-center gap-1 ps-2 pe-2.5 text-[12.5px] font-bold tracking-[0.1em] whitespace-nowrap uppercase"
      style={{ color: k.color, background: `color-mix(in srgb, ${k.color} 13%, transparent)` }}
    >
      <Icon size={11} strokeWidth={2.25} aria-hidden />
      {t(k.label)}
    </span>
  );
}
