import { motion, useReducedMotion } from "motion/react";
import { Globe2, Laptop, Router, Server, Building2, type LucideIcon } from "lucide-react";
import { Fragment } from "react";
import type { Hop } from "../bindings/Hop";
import type { RouteResult } from "../bindings/RouteResult";
import type { Segment } from "../bindings/Segment";
import { ms } from "../lib/format";
import { SEGMENT_LABEL } from "../lib/routeText";

const SEG_ICON: Record<Segment | "You", LucideIcon> = {
  You: Laptop,
  Local: Router,
  Isp: Building2,
  International: Globe2,
  Valve: Server,
};
const ORDER: Array<Segment> = ["Local", "Isp", "International", "Valve"];

interface Node {
  key: string;
  label: string;
  sub: string;
  icon: LucideIcon;
  avg: number | null;
  loss: number | null;
  problem: boolean;
  silent: boolean;
  segment: Segment | "You";
}

function severity(delta: number | null, problem: boolean): { color: string; width: number } {
  if (problem) return { color: "var(--nc-bad)", width: 6 };
  if (delta == null) return { color: "var(--nc-line-2)", width: 1.5 };
  return { color: "var(--nc-accent)", width: Math.min(8, Math.max(1.5, 1.5 + delta / 12)) };
}

const avg = (h: Hop) => h.stats?.avg ?? null;

function compactNodes(route: RouteResult): Node[] {
  const problemTtl = route.diagnosis.finding?.ttl;
  const problemSeg = route.diagnosis.finding?.segment;
  const nodes: Node[] = [{ key: "you", label: "You", sub: "this PC", icon: SEG_ICON.You, avg: 0, loss: 0, problem: false, silent: false, segment: "You" }];
  for (const seg of ORDER) {
    const hops = route.hops.filter((h) => h.segment === seg);
    const answering = hops.filter((h) => avg(h) != null);
    const last = answering[answering.length - 1];
    const problemHop = problemSeg === seg ? hops.find((h) => h.ttl === problemTtl) : undefined;
    const shown = problemHop ?? last;
    nodes.push({
      key: seg,
      label: SEGMENT_LABEL[seg],
      sub: hops.length ? `${hops.length} hop${hops.length === 1 ? "" : "s"}` : "—",
      icon: SEG_ICON[seg],
      avg: shown ? avg(shown) : null,
      loss: shown?.stats?.lossPct ?? null,
      problem: problemSeg === seg,
      silent: answering.length === 0,
      segment: seg,
    });
  }
  return nodes;
}

function fullNodes(route: RouteResult): Node[] {
  const problemTtl = route.diagnosis.finding?.ttl;
  return [
    { key: "you", label: "You", sub: "this PC", icon: SEG_ICON.You, avg: 0, loss: 0, problem: false, silent: false, segment: "You" },
    ...route.hops.map((h) => ({
      key: `ttl${h.ttl}`,
      label: h.addr ?? "no reply",
      sub: `hop ${h.ttl}`,
      icon: SEG_ICON[h.segment],
      avg: avg(h),
      loss: h.stats?.lossPct ?? null,
      problem: h.ttl === problemTtl,
      silent: avg(h) == null,
      segment: h.segment,
    })),
  ];
}

function NodeView({ node, compact, index }: { node: Node; compact: boolean; index: number }) {
  const reduce = useReducedMotion();
  const Icon = node.icon;
  const tone = node.problem ? "var(--nc-bad)" : node.silent ? "var(--nc-text-3)" : node.segment === "You" ? "var(--nc-text)" : "var(--nc-accent)";
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : index * 0.035, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={`flex shrink-0 flex-col items-center text-center ${compact ? "w-[68px]" : "w-[104px]"}`}
    >
      <div
        className={`relative grid place-items-center rounded-full border ${compact ? "size-9" : "size-11"} ${node.silent ? "border-dashed" : ""}`}
        style={{
          borderColor: `color-mix(in srgb, ${tone} 45%, transparent)`,
          background: `color-mix(in srgb, ${tone} 9%, var(--nc-s2))`,
          boxShadow: node.problem ? "0 0 22px color-mix(in srgb, var(--nc-bad) 55%, transparent)" : undefined,
        }}
      >
        {node.problem && !reduce && (
          <span className="absolute inset-0 rounded-full border border-bad" style={{ animation: "ring-pulse 1.8s var(--ease-out-quint) infinite" }} />
        )}
        <Icon size={compact ? 15 : 17} strokeWidth={1.9} style={{ color: tone }} aria-hidden />
      </div>
      <div className={`num mt-1.5 leading-none font-semibold ${compact ? "text-[13px]" : "text-[15px]"}`} style={{ color: node.problem ? "var(--nc-bad)" : undefined }}>
        {node.silent ? "—" : `${ms(node.avg)}`}
        {!node.silent && <span className="ml-0.5 text-[10px] font-normal text-text-3">ms</span>}
      </div>
      <div className={`mt-1 max-w-full truncate ${compact ? "text-[11px] text-text-2" : "num text-[10.5px] text-text-2"}`} title={node.label}>
        {node.label}
      </div>
      {!compact && (
        <div className="text-[10px] text-text-3">
          {node.sub}
          {node.loss != null && node.loss > 0 && <span className="text-bad"> · {Math.round(node.loss)}% loss</span>}
        </div>
      )}
    </motion.div>
  );
}

function Link({ from, to, compact }: { from: Node; to: Node; compact: boolean }) {
  const reduce = useReducedMotion();
  const delta = from.avg != null && to.avg != null ? to.avg - from.avg : null;
  const { color, width } = severity(delta, to.problem);
  return (
    <div className={`relative flex flex-1 flex-col items-center justify-start ${compact ? "min-w-5 pt-[17px]" : "min-w-10 pt-[21px]"}`}>
      <motion.div
        className="w-full origin-left rounded-full"
        style={{
          height: width,
          marginTop: -width / 2,
          background: to.silent || from.silent ? `repeating-linear-gradient(90deg, ${color} 0 3px, transparent 3px 7px)` : color,
          boxShadow: to.problem ? "0 0 12px var(--nc-bad)" : `0 0 8px -2px ${color}`,
          opacity: to.problem ? 1 : 0.55,
        }}
        initial={reduce ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      />
      {delta != null && Math.abs(delta) >= 1 && !compact && (
        <span className="num mt-1.5 text-[10px]" style={{ color: to.problem ? "var(--nc-bad)" : "var(--nc-text-3)" }}>
          {delta > 0 ? "+" : ""}
          {ms(delta)}
        </span>
      )}
    </div>
  );
}

export function RouteChain({ route, compact = false }: { route: RouteResult; compact?: boolean }) {
  const nodes = compact ? compactNodes(route) : fullNodes(route);
  return (
    <div className="flex w-full items-start">
      {nodes.map((n, i) => {
        const prev = nodes[i - 1];
        return (
          <Fragment key={n.key}>
            {prev && <Link from={prev} to={n} compact={compact} />}
            <NodeView node={n} compact={compact} index={i} />
          </Fragment>
        );
      })}
    </div>
  );
}

export function RouteChainSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex w-full items-start" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <div className={`flex-1 ${compact ? "min-w-5 pt-[17px]" : "min-w-10 pt-[21px]"}`}>
              <div className="skeleton h-[2px] w-full" />
            </div>
          )}
          <div className={`flex shrink-0 flex-col items-center gap-1.5 ${compact ? "w-[68px]" : "w-[104px]"}`}>
            <div className={`skeleton rounded-full ${compact ? "size-9" : "size-11"}`} />
            <div className="skeleton h-3 w-8" />
            <div className="skeleton h-2.5 w-12" />
          </div>
        </Fragment>
      ))}
    </div>
  );
}
