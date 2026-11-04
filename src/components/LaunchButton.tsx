import { AnimatePresence, motion } from "motion/react";
import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/store";

type Stage = "idle" | "asking" | "launching" | "launched" | "error";

export function LaunchButton({ disabled }: { disabled?: boolean }) {
  const backend = useApp((s) => s.backend);
  const settings = useApp((s) => s.settings);
  const saveSettings = useApp((s) => s.saveSettings);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (stage === "asking") closeBtn.current?.focus();
  }, [stage]);

  const launch = async (closeAfter: boolean) => {
    if (!backend) return;
    setStage("launching");
    try {
      await backend.launchCs2();
      setStage("launched");
      if (closeAfter) window.setTimeout(() => void backend.quit(), 1200);
    } catch (e) {
      setError(String(e));
      setStage("error");
    }
  };

  const onPress = () => {
    if (!settings) return;
    if (settings.closeAfterLaunch == null) setStage("asking");
    else void launch(settings.closeAfterLaunch);
  };

  const answer = async (close: boolean) => {
    if (settings) await saveSettings({ ...settings, closeAfterLaunch: close });
    void launch(close);
  };

  const label =
    stage === "launching" ? "Opening Steam…" : stage === "launched" ? (settings?.closeAfterLaunch ? "Starting CS2, closing Netcheck" : "CS2 is starting") : "Launch CS2";

  return (
    <div className="relative">
      <motion.button
        type="button"
        onClick={onPress}
        disabled={disabled || stage === "launching" || stage === "launched" || !settings}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.975, y: 0 }}
        transition={{ type: "spring", stiffness: 600, damping: 30 }}
        className="group relative flex h-[52px] w-full items-center justify-center gap-2.5 overflow-hidden rounded-full text-[15px] font-semibold tracking-[-0.01em] text-accent-ink disabled:opacity-55 disabled:saturate-50"
        style={{
          background: "linear-gradient(100deg, var(--nc-accent) 0%, color-mix(in srgb, var(--nc-accent) 45%, var(--nc-accent-2)) 60%, var(--nc-accent-2) 100%)",
          boxShadow:
            "inset 0 1px 0 rgb(255 255 255 / 0.5), inset 0 -1px 0 rgb(0 0 0 / 0.15), 0 14px 36px -12px color-mix(in srgb, var(--nc-accent) calc(var(--nc-glow) * 110%), transparent), 0 6px 24px -10px color-mix(in srgb, var(--nc-accent-2) calc(var(--nc-glow) * 90%), transparent)",
        }}
      >
        {!disabled && <span className="sheen pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent" aria-hidden />}
        <span className="relative grid size-7 place-items-center rounded-full bg-black/15 transition-transform duration-300 group-hover:scale-110">
          <Play size={13} strokeWidth={2.5} fill="currentColor" className="translate-x-px" aria-hidden />
        </span>
        <span className="relative">{label}</span>
      </motion.button>
      {stage === "error" && <p className="mt-2 text-[12px] text-bad">Couldn't open Steam: {error}</p>}

      <AnimatePresence>
        {stage === "asking" && (
          <motion.div
            role="dialog"
            aria-label="After CS2 starts"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: "spring", stiffness: 500, damping: 34 }}
            className="panel absolute inset-x-0 bottom-[calc(100%+10px)] z-20 p-3.5"
            style={{ background: "var(--nc-s3)" }}
            onKeyDown={(e) => e.key === "Escape" && setStage("idle")}
          >
            <p className="text-[13px] font-semibold">Close Netcheck once CS2 starts?</p>
            <p className="mt-0.5 text-[12px] text-text-2">It isn't needed while you play. You can change this later in Settings.</p>
            <div className="mt-3 flex gap-2">
              <button
                ref={closeBtn}
                type="button"
                onClick={() => void answer(true)}
                className="h-8 flex-1 rounded-full bg-accent text-[12.5px] font-semibold text-accent-ink transition-[filter] duration-150 hover:brightness-110 active:brightness-95"
              >
                Close it
              </button>
              <button
                type="button"
                onClick={() => void answer(false)}
                className="h-8 flex-1 rounded-full border border-line-2 text-[12.5px] font-medium text-text transition-colors duration-150 hover:bg-s4"
              >
                Keep it open
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
