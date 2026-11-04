import { CloudOff, Database, Router, ShieldAlert, Globe2, FlaskConical } from "lucide-react";
import { useEffect, useState } from "react";
import { age, ms } from "../lib/format";
import { useApp } from "../lib/store";

function Sep() {
  return <span className="h-3 w-px bg-line-2" aria-hidden />;
}

function Profile({ label, on, active }: { label: string; on: boolean; active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 ${active ? "text-text-2" : "text-text-3"}`}
      title={`${label} profile: firewall ${on ? "on" : "off"}${active ? " (current network)" : ""}`}
    >
      <span className={`size-1.5 rounded-full ${on ? "bg-good" : "bg-bad"}`} />
      <span className={active ? "underline decoration-line-2 underline-offset-[3px]" : ""}>{label}</span>
    </span>
  );
}

export function StatusBar() {
  const relays = useApp((s) => s.relays);
  const refreshError = useApp((s) => s.relayRefreshError);
  const firewall = useApp((s) => s.firewall);
  const baseline = useApp((s) => s.baseline);
  const demo = useApp((s) => s.backend?.demo ?? false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const cached = relays?.source === "Cache";
  const unreachable = cached && (relays?.liveError != null || refreshError != null);
  const p = firewall?.profiles;

  return (
    <footer className="flex h-8 shrink-0 items-center gap-3 overflow-hidden px-5 text-[11px] whitespace-nowrap text-text-3">
      {relays ? (
        <span className={`inline-flex items-center gap-1.5 ${unreachable ? "text-playable" : ""}`} title={relays.liveError ?? refreshError ?? undefined}>
          {unreachable ? <CloudOff size={12} /> : <Database size={12} />}
          {unreachable ? "Valve API unreachable · cached list from " : cached ? "Relay list from " : "Relay list · live · "}
          <span className="num">{cached ? age(relays.fetchedAtMs, now) : "just now"}</span>
        </span>
      ) : (
        <span>Relay list —</span>
      )}
      <Sep />
      {p ? (
        <span className="inline-flex items-center gap-2">
          Firewall
          <Profile label="Domain" on={p.domain} active={(p.active & 1) !== 0} />
          <Profile label="Private" on={p.private} active={(p.active & 2) !== 0} />
          <Profile label="Public" on={p.public} active={(p.active & 4) !== 0} />
        </span>
      ) : (
        <span title={firewall?.error ?? undefined}>Firewall {firewall ? "unreadable" : "—"}</span>
      )}
      {firewall?.warnInactive && (
        <span className="inline-flex items-center gap-1 text-playable">
          <ShieldAlert size={12} /> Block rule does nothing while the firewall is off
        </span>
      )}
      <Sep />
      <span className="inline-flex items-center gap-1.5 max-[1100px]:hidden" title="Your default gateway">
        <Router size={12} />
        <span className="num">{baseline?.gatewayIp ?? "router —"}</span>
        {baseline?.gateway && <span className="num text-text-2">{ms(baseline.gateway.avg)} ms</span>}
      </span>
      <span className="inline-flex items-center gap-1.5" title="Baseline: is the whole internet slow?">
        <Globe2 size={12} />
        <span className="num">1.1.1.1</span>
        <span className="num text-text-2">{baseline?.internet ? `${ms(baseline.internet.avg)} ms` : "—"}</span>
      </span>
      <span className="flex-1" />
      {demo && (
        <span className="inline-flex items-center gap-1 rounded-full bg-playable/15 px-2 py-px font-semibold text-playable">
          <FlaskConical size={11} /> Dev demo data
        </span>
      )}
      <span className="num">v{__APP_VERSION__}</span>
    </footer>
  );
}
