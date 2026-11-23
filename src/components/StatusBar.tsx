import { CloudOff, Database, Router, ShieldAlert, Globe2, FlaskConical } from "lucide-react";
import { useEffect, useState } from "react";
import { intlTag, useLocale, useT } from "../i18n";
import { age, ms } from "../lib/format";
import { useApp } from "../lib/store";

function Sep() {
  return <span className="h-3 w-px bg-line-2" aria-hidden />;
}

function Profile({ label, on, active }: { label: string; on: boolean; active: boolean }) {
  const t = useT();
  return (
    <span
      className={`inline-flex items-center gap-1 ${active ? "text-text-2" : "text-text-3"}`}
      title={`${t(on ? "sb.fwOn" : "sb.fwOff", { profile: label })}${active ? t("sb.fwCurrent") : ""}`}
    >
      <span className={`size-1.5 ${on ? "bg-good" : "bg-bad"}`} aria-hidden />
      <span className={active ? "underline decoration-line-2 underline-offset-[3px]" : ""}>{label}</span>
    </span>
  );
}

export function StatusBar() {
  const t = useT();
  const locale = useLocale();
  const relays = useApp((s) => s.relays);
  const refreshError = useApp((s) => s.relayRefreshError);
  const firewall = useApp((s) => s.firewall);
  const baseline = useApp((s) => s.baseline);
  const demo = useApp((s) => s.backend?.demo ?? false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const cached = relays?.source === "Cache";
  const unreachable = cached && (relays?.liveError != null || refreshError != null);
  const p = firewall?.profiles;

  return (
    <footer className="flex h-8 shrink-0 items-center gap-3 overflow-hidden px-5 text-[11px] whitespace-nowrap text-text-3">
      {relays ? (
        <span className={`inline-flex items-center gap-1.5 ${unreachable ? "text-playable" : ""}`} title={relays.liveError ?? refreshError ?? undefined}>
          {unreachable ? <CloudOff size={12} /> : <Database size={12} />}
          {unreachable ? t("sb.relaysDown") : cached ? t("sb.relaysCached") : t("sb.relaysLive")}
          <span className="num">{cached ? age(relays.fetchedAtMs, now, intlTag(locale), t("sb.justNow")) : t("sb.justNow")}</span>
        </span>
      ) : (
        <span>{t("sb.relaysNone")}</span>
      )}
      <Sep />
      {p ? (
        <span className="inline-flex items-center gap-2">
          {t("sb.firewall")}
          <Profile label={t("fw.domain")} on={p.domain} active={(p.active & 1) !== 0} />
          <Profile label={t("fw.private")} on={p.private} active={(p.active & 2) !== 0} />
          <Profile label={t("fw.public")} on={p.public} active={(p.active & 4) !== 0} />
        </span>
      ) : (
        <span title={firewall?.error ?? undefined}>{firewall ? t("sb.fwUnreadable") : t("sb.fwNone")}</span>
      )}
      {firewall?.warnInactive && (
        <span className="inline-flex items-center gap-1 text-playable">
          <ShieldAlert size={12} /> {t("sb.fwWarn")}
        </span>
      )}
      <Sep />
      <span className="inline-flex items-center gap-1.5 max-[1100px]:hidden" title={t("sb.gateway")}>
        <Router size={12} />
        <span className="num">{baseline?.gatewayIp ?? t("sb.router")}</span>
        {baseline?.gateway && <span className="num text-text-2">{ms(baseline.gateway.avg)} ms</span>}
      </span>
      <span className="inline-flex items-center gap-1.5" title={t("sb.baseline")}>
        <Globe2 size={12} />
        <span className="num">1.1.1.1</span>
        <span className="num text-text-2">{baseline?.internet ? `${ms(baseline.internet.avg)} ms` : "—"}</span>
      </span>
      <span className="flex-1" />
      {demo && (
        <span className="chamfer-sm display inline-flex items-center gap-1 bg-playable/15 px-2 py-px text-[12px] font-bold tracking-[0.08em] text-playable uppercase">
          <FlaskConical size={11} /> {t("sb.demo")}
        </span>
      )}
      <span className="num" dir="ltr">
        v{__APP_VERSION__}
      </span>
    </footer>
  );
}
