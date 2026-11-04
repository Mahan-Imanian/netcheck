import type { Hop } from "../bindings/Hop";
import type { RouteResult } from "../bindings/RouteResult";
import type { Segment } from "../bindings/Segment";
import { ms } from "./format";

export const SEGMENT_LABEL: Record<Segment, string> = {
  Local: "Router",
  Isp: "ISP",
  International: "International",
  Valve: "Valve",
};

const avg = (h: Hop | undefined) => h?.stats?.avg ?? null;

function lastAnswering(hops: Hop[], seg: Segment, beforeTtl: number): Hop | undefined {
  return [...hops].reverse().find((h) => h.segment === seg && h.ttl < beforeTtl && avg(h) != null);
}

export interface RouteExplanation {
  title: string;
  body: string;
  advice: string | null;
}

export function explainRoute(route: RouteResult, alternative: { city: string; avg: number } | null): RouteExplanation {
  const { finding, reachedDestination } = route.diagnosis;
  const hops = route.hops;
  const router = hops.find((h) => h.segment === "Local" && avg(h) != null);
  const answering = hops.filter((h) => avg(h) != null).length;

  if (route.noRoute) {
    return {
      title: "No route out of this PC",
      body: "Windows has no network path right now, so the route could not be traced.",
      advice: "Check that Wi-Fi is connected or the cable is plugged in, then re-check.",
    };
  }

  if (!finding) {
    return reachedDestination
      ? {
          title: "Clean route",
          body: `${hops.length} hops to Valve, ${answering} answered. No hop adds unusual delay or keeps losing packets.`,
          advice: null,
        }
      : {
          title: "Route traced partway",
          body: "Valve's relay doesn't answer traceroute probes past this point, but nothing before it looks wrong.",
          advice: null,
        };
  }

  const lost = finding.lost > 0 ? ` with ${finding.lost}/${finding.sent} lost` : "";
  const at = finding.addr ?? `hop ${finding.ttl}`;
  const jump = `${ms(finding.prevAvg)} → ${ms(finding.avg)} ms${lost}`;
  const alt = alternative ? `play on ${alternative.city} (${ms(alternative.avg)} ms, clean)` : null;

  switch (finding.segment) {
    case "Local":
      return {
        title: "Your Wi-Fi or router",
        body: `Your router answers in ${ms(finding.avg)} ms${lost}. On a healthy home network this is under 5 ms with no loss.`,
        advice: "Move closer to the router, switch to 5 GHz, or use a cable. Other devices streaming or downloading also cause this.",
      };
    case "Isp": {
      const routerTxt = router ? `Your router is fine (${ms(avg(router))} ms). ` : "";
      return {
        title: "Your ISP",
        body: `${routerTxt}The jump happens at ${at}, inside your ISP's network: ${jump}.`,
        advice: "Restarting your modem sometimes clears this. If it keeps happening, it's your ISP's network, not your PC.",
      };
    }
    case "International": {
      const isp = lastAnswering(hops, "Isp", finding.ttl);
      const fine = [router, isp].filter((h): h is Hop => h != null).map((h) => `${ms(avg(h))} ms`);
      const prefix = fine.length ? `Your router and ISP are fine (${fine.join(", ")}). ` : "";
      return {
        title: "Your ISP's international link",
        body: `${prefix}The jump happens at ${at}, your ISP's international link: ${jump}. This is usually peak-hour congestion and nothing on your PC can fix it.`,
        advice: alt ? `Try again later, or ${alt}.` : "Try again later, when the evening peak is over.",
      };
    }
    case "Valve":
      return {
        title: "Valve's side",
        body: `Everything up to Valve is fine. Only Valve's relay (${at}) is the problem: ${jump}.`,
        advice: alt ? `This is on Valve's end. ${alt}.` : "This is on Valve's end. Try another region.",
      };
  }
}
