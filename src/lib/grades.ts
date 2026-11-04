import type { LucideIcon } from "lucide-react";
import { ChevronsUp, Check, Minus, X, ShieldBan, CircleOff } from "lucide-react";
import type { Grade } from "../bindings/Grade";
import type { RegionResult } from "../bindings/RegionResult";

export type Tone = "excellent" | "good" | "playable" | "bad" | "blocked" | "muted";

export interface ToneMeta {
  label: string;
  icon: LucideIcon;
  color: string;
}

export const TONES: Record<Tone, ToneMeta> = {
  excellent: { label: "Excellent", icon: ChevronsUp, color: "var(--nc-excellent)" },
  good: { label: "Good", icon: Check, color: "var(--nc-good)" },
  playable: { label: "Playable", icon: Minus, color: "var(--nc-playable)" },
  bad: { label: "Bad", icon: X, color: "var(--nc-bad)" },
  blocked: { label: "Blocked", icon: ShieldBan, color: "var(--nc-blocked)" },
  muted: { label: "No reply", icon: CircleOff, color: "var(--nc-muted)" },
};

export function gradeTone(g: Grade | null | undefined): Tone {
  switch (g) {
    case "Excellent":
      return "excellent";
    case "Good":
      return "good";
    case "Playable":
      return "playable";
    case "Bad":
      return "bad";
    default:
      return "muted";
  }
}

export function resultTone(r: RegionResult | undefined): Tone {
  if (!r) return "muted";
  if (r.status === "NoReply") return r.block.state === "blocked" ? "blocked" : "muted";
  return gradeTone(r.grade);
}

export const GRADE_RANK: Record<Grade, number> = { Excellent: 0, Good: 1, Playable: 2, Bad: 3 };
