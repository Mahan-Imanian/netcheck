import type { Baseline } from "../bindings/Baseline";
import type { RegionInfo } from "../bindings/RegionInfo";
import type { RegionResult } from "../bindings/RegionResult";
import type { RouteResult } from "../bindings/RouteResult";
import type { Thresholds } from "../bindings/Thresholds";
import type { T } from "../i18n";
import { ms, pct } from "./format";
import type { Tone } from "./grades";
import { bestRegion, isClean } from "./regions";

export type VerdictKind =
  | "measuring"
  | "offline"
  | "wifi"
  | "isp"
  | "allBlocked"
  | "icmpBlocked"
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
  /** Concrete actions, most useful first. Empty when nothing needs doing. */
  steps: string[];
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

export function computeVerdict(input: VerdictInput, t: T): Verdict {
  const { results, baseline, thresholds: th } = input;
  const pref = results.find((r) => r.code === input.preferred);
  const city = cityOf(input, input.preferred);
  const measured = results.filter((r) => r.stats?.avg != null);
  const cleanAlt = bestRegion(results.filter((r) => r.code !== input.preferred && isClean(r) && r.block.state !== "blocked"));
  const v = (kind: VerdictKind, tone: Tone, headline: string, line: string, steps: string[] = [], alternative = cleanAlt): Verdict => ({
    kind,
    tone,
    headline,
    line,
    steps,
    alternative,
  });
  const wifiSteps = [t("v.wifi.s1"), t("v.wifi.s2"), t("v.wifi.s3")];

  if (input.offline) {
    return v("offline", "bad", t("v.offline.h"), t("v.offline.l"), [t("v.offline.s1"), t("v.offline.s2"), t("v.offline.s3")], undefined);
  }

  const gw = baseline?.gateway;
  if (gw && gw.avg != null && (gw.avg > 20 || gw.lossPct > th.problemHop.lossPct)) {
    return v("wifi", "bad", t("v.wifi.h"), t("v.wifi.l", { ms: ms(gw.avg), loss: pct(gw.lossPct) }), wifiSteps);
  }
  if (input.route?.diagnosis.finding?.segment === "Local") {
    return v("wifi", "bad", t("v.wifi.h"), t("v.wifi.route.l"), wifiSteps);
  }

  if (!pref && !input.finished) {
    return v("measuring", "muted", t("v.measuring.h"), t("v.measuring.l", { city }));
  }

  const net = baseline?.internet;
  const internetBad = net != null && (net.avg == null || net.lossPct > th.problemHop.lossPct || (net.jitter ?? 0) > th.playable.jitterMs);
  const share = measured.length ? measured.filter((r) => degraded(r, th)).length / measured.length : 0;
  if (input.finished && internetBad && share >= 0.7) {
    return v("isp", "bad", t("v.isp.h"), t("v.isp.l"), [t("v.isp.s1"), t("v.isp.s2"), t("v.isp.s3")]);
  }

  if (results.length > 0 && results.every((r) => r.block.state === "blocked")) {
    const best = bestRegion(results);
    const closest = best ? ` ${t("v.blocked.closest", { city: cityOf(input, best.code), ms: ms(best.stats?.avg) })}` : "";
    return v("allBlocked", "blocked", t("v.blocked.h"), `${t("v.blocked.l")}${closest}`, [t("v.blocked.s1"), t("v.blocked.s2")], undefined);
  }

  // The relay list arrived over HTTPS, so silence from every region means ping itself is being dropped.
  if (input.finished && results.length > 0 && measured.length === 0) {
    return v("icmpBlocked", "bad", t("v.icmp.h"), t("v.icmp.l"), [t("v.icmp.s1"), t("v.icmp.s2"), t("v.icmp.s3")], undefined);
  }

  if (!pref) {
    return v("measuring", "muted", t("v.measuring.h"), t("v.waiting.l", { city }));
  }

  const est = pref.estimated ? ` ${t("v.estimated")}` : "";
  if (pref.stats?.avg == null) {
    const alt = cleanAlt ?? bestRegion(results, { excludeBlocked: true });
    const altCity = alt ? cityOf(input, alt.code) : "";
    return v(
      "noReply",
      "bad",
      t("v.noReply.h", { city }),
      alt ? t("v.noReply.l", { city, alt: altCity, ms: ms(alt.stats?.avg) }) : t("v.noReply.none", { city }),
      alt ? [t("v.noReply.s1", { alt: altCity }), t("v.noReply.s2")] : [t("v.noReply.s2")],
      alt,
    );
  }

  const s = pref.stats;
  const avg = s.avg ?? 0;
  if (isClean(pref)) {
    return v(
      "clean",
      pref.grade === "Excellent" ? "excellent" : "good",
      t("v.clean.h"),
      `${t("v.clean.l", { city, ms: ms(avg), loss: pct(s.lossPct), jitter: ms(s.jitter, 1) })}${est}`,
    );
  }

  const unstable = s.lossPct > 0 || (s.jitter ?? 0) > th.good.jitterMs;
  const tone: Tone = pref.grade === "Bad" ? "bad" : "playable";
  const problem = unstable
    ? s.lossPct > 0
      ? t("v.unstable.loss", { city, loss: pct(s.lossPct) })
      : t("v.unstable.jitter", { city, jitter: ms(s.jitter, 1) })
    : t("v.slow.l", { city, ms: ms(avg) });

  if (cleanAlt?.stats?.avg != null) {
    const diff = cleanAlt.stats.avg - avg;
    const alt = cityOf(input, cleanAlt.code);
    const rel =
      Math.abs(diff) < 1 ? t("v.alt.same", { alt }) : diff > 0 ? t("v.alt.slower", { alt, d: ms(diff) }) : t("v.alt.faster", { alt, d: ms(-diff) });
    return v(
      unstable ? "unstable" : "slow",
      tone,
      unstable ? t("v.unstable.h", { city }) : t("v.slow.h", { city }),
      `${problem}${est} ${rel}`,
      [t("v.alt.s1", { alt }), unstable ? t("v.unstable.s2") : t("v.slow.s2", { alt })],
    );
  }

  const usual = pref.normalMs != null && avg - pref.normalMs > th.problemHop.jumpMs ? pref.normalMs : null;
  const line =
    usual != null
      ? t("v.rough.usual", { city, ms: ms(avg), loss: pct(s.lossPct), usual: ms(usual) })
      : t("v.rough.l", { city, ms: ms(avg), loss: pct(s.lossPct) });
  return v("rough", tone, t("v.rough.h"), `${line}${est}`, [t("v.rough.s1"), t("v.rough.s2")], undefined);
}
