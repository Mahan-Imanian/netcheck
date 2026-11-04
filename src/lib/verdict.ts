import type { Baseline } from "../bindings/Baseline";
import type { RegionInfo } from "../bindings/RegionInfo";
import type { RegionResult } from "../bindings/RegionResult";
import type { RouteResult } from "../bindings/RouteResult";
import type { Thresholds } from "../bindings/Thresholds";
import { ms, pct } from "./format";
import type { Tone } from "./grades";
import { bestRegion, isClean } from "./regions";

export type VerdictKind =
  | "measuring"
  | "offline"
  | "wifi"
  | "isp"
  | "allBlocked"
  | "noReply"
  | "clean"
  | "unstable"
  | "slow"
  | "rough";

export interface Verdict {
  kind: VerdictKind;
  tone: Tone;
  headline: string;
  line: string;
  alternative: RegionResult | undefined;
}

export interface VerdictInput {
  preferred: string;
  infos: Record<string, RegionInfo>;
  results: RegionResult[];
  baseline: Baseline | null;
  route: RouteResult | null;
  offline: boolean;
  finished: boolean;
  thresholds: Thresholds;
}

const cityOf = (input: VerdictInput, code: string) => input.infos[code]?.city ?? code.toUpperCase();

function degraded(r: RegionResult, t: Thresholds): boolean {
  const s = r.stats;
  if (!s || s.avg == null) return true;
  return s.lossPct > t.good.lossPct || r.grade === "Playable" || r.grade === "Bad";
}

export function computeVerdict(input: VerdictInput): Verdict {
  const { results, baseline, thresholds: t } = input;
  const pref = results.find((r) => r.code === input.preferred);
  const prefCity = cityOf(input, input.preferred);
  const measured = results.filter((r) => r.stats?.avg != null);
  const cleanAlt = bestRegion(
    results.filter((r) => r.code !== input.preferred && isClean(r) && r.block.state !== "blocked"),
  );
  const v = (kind: VerdictKind, tone: Tone, headline: string, line: string, alternative = cleanAlt): Verdict => ({
    kind,
    tone,
    headline,
    line,
    alternative,
  });

  if (input.offline) {
    return v("offline", "bad", "You're offline", "Nothing answers — not your router, not the internet. Check Wi-Fi or the cable.", undefined);
  }

  const gw = baseline?.gateway;
  if (gw && gw.avg != null && (gw.avg > 20 || gw.lossPct > t.problemHop.lossPct)) {
    return v(
      "wifi",
      "bad",
      "Your Wi-Fi is the problem",
      `Your router answers in ${ms(gw.avg)} ms with ${pct(gw.lossPct)}% loss — every region will feel it. Move closer or use a cable.`,
    );
  }
  if (input.route?.diagnosis.finding?.segment === "Local") {
    return v("wifi", "bad", "Your Wi-Fi is the problem", "The first hop — your own router — is slow or dropping packets. Every region will feel it.");
  }

  if (!pref && !input.finished) {
    return v("measuring", "muted", "Measuring", `Pinging ${prefCity} and every other Valve region…`);
  }

  const net = baseline?.internet;
  const internetBad = net != null && (net.avg == null || net.lossPct > t.problemHop.lossPct || (net.jitter ?? 0) > t.playable.jitterMs);
  const share = measured.length ? measured.filter((r) => degraded(r, t)).length / measured.length : 0;
  if (input.finished && internetBad && share >= 0.7) {
    return v(
      "isp",
      "bad",
      "Your ISP is congested",
      "Your internet is congested at your ISP — expect high ping everywhere, including 1.1.1.1.",
    );
  }

  if (results.length > 0 && results.every((r) => r.block.state === "blocked")) {
    const best = bestRegion(results);
    return v(
      "allBlocked",
      "blocked",
      "Every region is blocked",
      `Your firewall blocks every Valve region, so CS2 can't connect. ${best ? `Closest by estimate: ${cityOf(input, best.code)}, ~${ms(best.stats?.avg)} ms.` : ""}`.trim(),
      undefined,
    );
  }

  if (!pref) {
    return v("measuring", "muted", "Measuring", `Waiting for ${prefCity}…`);
  }

  const est = pref.estimated ? " (estimated)" : "";
  if (pref.stats?.avg == null) {
    const alt = cleanAlt ?? bestRegion(results, { excludeBlocked: true });
    return v(
      "noReply",
      "bad",
      `${prefCity} isn't answering`,
      alt ? `${prefCity} isn't answering right now — ${cityOf(input, alt.code)} is best at ${ms(alt.stats?.avg)} ms.` : `${prefCity} isn't answering, and no other region is clean.`,
      alt,
    );
  }

  const s = pref.stats;
  const avg = s.avg ?? 0;
  if (isClean(pref)) {
    return v("clean", pref.grade === "Excellent" ? "excellent" : "good", "Good to play", `Good to play — ${prefCity} ${ms(avg)} ms, ${pct(s.lossPct)}% loss${est}.`);
  }

  const unstable = s.lossPct > 0 || (s.jitter ?? 0) > t.good.jitterMs;
  const tone: Tone = pref.grade === "Bad" ? "bad" : "playable";
  if (cleanAlt?.stats?.avg != null) {
    const diff = cleanAlt.stats.avg - avg;
    const altCity = cityOf(input, cleanAlt.code);
    const rel = Math.abs(diff) < 1 ? "just as fast" : diff > 0 ? `${ms(diff)} ms behind` : `${ms(-diff)} ms faster`;
    return v(
      unstable ? "unstable" : "slow",
      tone,
      unstable ? `${prefCity} is unstable` : `${prefCity} is slow`,
      `${prefCity} is ${unstable ? "unstable" : "slow"} right now${est} — ${altCity} is ${rel} and clean.`,
    );
  }
  const usual = pref.normalMs != null && avg - pref.normalMs > t.problemHop.jumpMs ? ` (usually ${ms(pref.normalMs)} ms)` : "";
  return v(
    "rough",
    tone,
    "Not a good night",
    `${prefCity} is at ${ms(avg)} ms with ${pct(s.lossPct)}% loss${usual}${est}, and no region is clean — expect a rough match.`,
    undefined,
  );
}
