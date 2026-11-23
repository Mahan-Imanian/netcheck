import type { Hop } from "../bindings/Hop";
import type { RouteResult } from "../bindings/RouteResult";
import type { Segment } from "../bindings/Segment";
import type { T } from "../i18n";
import { ms } from "./format";

export const segmentLabel = (t: T, seg: Segment) => t(`seg.${seg}`);

const avg = (h: Hop | undefined) => h?.stats?.avg ?? null;

function lastAnswering(hops: Hop[], seg: Segment, beforeTtl: number): Hop | undefined {
  return [...hops].reverse().find((h) => h.segment === seg && h.ttl < beforeTtl && avg(h) != null);
}

export interface RouteExplanation {
  title: string;
  body: string;
  advice: string | null;
}

export function explainRoute(route: RouteResult, alternative: { city: string; avg: number } | null, t: T): RouteExplanation {
  const { finding, reachedDestination } = route.diagnosis;
  const hops = route.hops;
  const router = hops.find((h) => h.segment === "Local" && avg(h) != null);
  const answered = hops.filter((h) => avg(h) != null).length;

  if (route.noRoute) {
    return { title: t("r.noRoute.t"), body: t("r.noRoute.b"), advice: t("r.noRoute.a") };
  }

  if (!finding) {
    return reachedDestination
      ? { title: t("r.clean.t"), body: t("r.clean.b", { answered, hops: hops.length }), advice: null }
      : { title: t("r.partial.t"), body: t("r.partial.b"), advice: null };
  }

  const lost = finding.lost > 0 ? t("r.lost", { lost: finding.lost, sent: finding.sent }) : "";
  const at = finding.addr ?? t("seg.hop", { n: finding.ttl });
  const jump = `${ms(finding.prevAvg)} → ${ms(finding.avg)} ms${lost}`;
  const alt = alternative ? { city: alternative.city, ms: ms(alternative.avg) } : null;

  switch (finding.segment) {
    case "Local":
      return { title: t("r.local.t"), body: t("r.local.b", { ms: ms(finding.avg), lost }), advice: t("r.local.a") };
    case "Isp": {
      const fine = router ? `${t("r.isp.fine", { ms: ms(avg(router)) })} ` : "";
      return { title: t("r.isp.t"), body: `${fine}${t("r.isp.b", { at, jump })}`, advice: t("r.isp.a") };
    }
    case "International": {
      const isp = lastAnswering(hops, "Isp", finding.ttl);
      const list = [router, isp].filter((h): h is Hop => h != null).map((h) => `${ms(avg(h))} ms`);
      const fine = list.length ? `${t("r.intl.fine", { list: list.join(t("list.sep")) })} ` : "";
      return {
        title: t("r.intl.t"),
        body: `${fine}${t("r.intl.b", { at, jump })}`,
        advice: alt ? t("r.intl.a.alt", alt) : t("r.intl.a"),
      };
    }
    case "Valve":
      return { title: t("r.valve.t"), body: t("r.valve.b", { at, jump }), advice: alt ? t("r.valve.a.alt", alt) : t("r.valve.a") };
  }
}
