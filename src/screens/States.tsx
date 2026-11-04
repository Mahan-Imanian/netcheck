import { motion, useReducedMotion } from "motion/react";
import { CloudOff, Laptop, RotateCw, Router, ShieldAlert, WifiOff, Globe2 } from "lucide-react";
import { useApp } from "../lib/store";

export function FirewallWarning() {
  const fw = useApp((s) => s.firewall);
  if (!fw?.warnInactive) return null;
  const p = fw.profiles;
  const names = p ? (["Domain", "Private", "Public"] as const).filter((_, i) => (p.active & (1 << i)) !== 0) : [];
  return (
    <div role="status" className="flex shrink-0 items-start gap-3 rounded-md border border-playable/30 bg-playable/10 px-4 py-2.5">
      <ShieldAlert size={16} className="mt-0.5 shrink-0 text-playable" aria-hidden />
      <p className="text-[12.5px] text-text">
        <span className="font-semibold text-playable">Your region block does nothing right now. </span>
        {fw.groups.length ? `Rules in “${fw.groups.join("”, “")}” block` : "A firewall rule blocks"} Valve relays, but Windows Firewall is off for
        your current network{names.length ? ` (${names.join(", ")})` : ""}. The block only works once the firewall is turned on.
      </p>
    </div>
  );
}

function ReCheck() {
  const startCheck = useApp((s) => s.startCheck);
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={() => void startCheck()}
      className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-[13px] font-semibold text-accent-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.4)] transition-[filter] duration-150 hover:brightness-110"
    >
      <RotateCw size={14} strokeWidth={2.4} /> Re-check
      <kbd className="num rounded-xs border border-black/20 px-1 text-[10px] opacity-70">R</kbd>
    </motion.button>
  );
}

function BrokenChain({ cutAfter }: { cutAfter: number }) {
  const reduce = useReducedMotion();
  const nodes = [
    { icon: Laptop, label: "This PC" },
    { icon: Router, label: "Router" },
    { icon: Globe2, label: "Internet" },
  ];
  return (
    <div className="flex items-start">
      {nodes.map((n, i) => {
        const Icon = n.icon;
        const dead = i > cutAfter;
        return (
          <div key={n.label} className="flex items-start">
            {i > 0 && (
              <div className="relative mt-[22px] w-24">
                <div className={`border-t-2 ${dead ? "border-dashed border-line-2" : "border-accent/70"}`} />
                {i === cutAfter + 1 && (
                  <motion.span
                    initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="absolute top-1/2 left-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-bg text-bad ring-1 ring-bad/50"
                    style={{ boxShadow: "0 0 18px color-mix(in srgb, var(--nc-bad) 50%, transparent)" }}
                  >
                    <span className="text-[13px] leading-none font-bold">×</span>
                  </motion.span>
                )}
              </div>
            )}
            <div className="flex w-16 flex-col items-center gap-1.5">
              <span className={`grid size-11 place-items-center rounded-full border ${dead ? "border-dashed border-line-2 text-text-3" : "border-accent/40 bg-accent/10 text-accent"}`}>
                <Icon size={18} strokeWidth={1.9} />
              </span>
              <span className={`text-[11.5px] ${dead ? "text-text-3" : "text-text-2"}`}>{n.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function OfflineScreen() {
  return (
    <div className="grid h-full place-items-center p-6">
      <section className="panel relative w-full max-w-[640px] overflow-hidden px-10 py-9" aria-label="Offline">
        <div className="grid-texture pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(90% 70% at 50% 0%, color-mix(in srgb, var(--nc-bad) 10%, transparent), transparent 70%)" }}
          aria-hidden
        />
        <div className="relative">
          <div className="flex items-center gap-2 text-bad">
            <WifiOff size={16} strokeWidth={2.2} />
            <span className="text-[12px] font-semibold tracking-[0.11em] uppercase">No connection</span>
          </div>
          <h1 className="mt-3 text-[30px] leading-tight font-semibold tracking-[-0.025em]">You're offline</h1>
          <p className="mt-2 max-w-[460px] text-[14px] text-text-2">
            Nothing answers, not your router and not the internet. Netcheck didn't save this check to your history.
          </p>
          <div className="mt-7">
            <BrokenChain cutAfter={0} />
          </div>
          <ol className="mt-7 space-y-1.5 text-[13px] text-text-2">
            {["Check that Wi-Fi is connected, or that the cable is plugged in.", "If other devices are offline too, restart your router.", "Then re-check. It takes about six seconds."].map((t, i) => (
              <li key={t} className="flex gap-3">
                <span className="num text-text-3">{String(i + 1).padStart(2, "0")}</span>
                {t}
              </li>
            ))}
          </ol>
          <div className="mt-7">
            <ReCheck />
          </div>
        </div>
      </section>
    </div>
  );
}

export function NoRelayListScreen({ message }: { message: string }) {
  return (
    <div className="grid h-full place-items-center p-6">
      <section className="panel relative w-full max-w-[640px] overflow-hidden px-10 py-9" aria-label="Relay list unavailable">
        <div className="grid-texture pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-2 text-playable">
            <CloudOff size={16} strokeWidth={2.2} />
            <span className="text-[12px] font-semibold tracking-[0.11em] uppercase">Valve API unreachable</span>
          </div>
          <h1 className="mt-3 text-[30px] leading-tight font-semibold tracking-[-0.025em]">Can't get Valve's relay list</h1>
          <p className="mt-2 max-w-[480px] text-[14px] text-text-2">
            Netcheck needs Valve's list of relay addresses once. After the first success it keeps a copy and works even when Valve's API is
            unreachable. Your connection is up, but <span className="num text-text">api.steampowered.com</span> didn't answer.
          </p>
          <p className="num mt-4 rounded-sm border border-line bg-s1 px-3 py-2 text-[11.5px] break-words text-text-3">{message}</p>
          <div className="mt-7">
            <ReCheck />
          </div>
        </div>
      </section>
    </div>
  );
}
