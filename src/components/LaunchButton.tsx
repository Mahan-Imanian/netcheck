import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { useApp } from "../lib/store";

type Stage = "idle" | "asking" | "launching" | "launched" | "error";

export function LaunchButton({ disabled }: { disabled?: boolean }) {
  const t = useT();
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
    stage === "launching" ? t("launch.opening") : stage === "launched" ? t("launch.starting") : t("launch.label");

  return (
    <div className="relative">
      <motion.button
        type="button"
        onClick={onPress}
        disabled={disabled || stage === "launching" || stage === "launched" || !settings}
        whileTap={{ y: 1 }}
        transition={{ type: "spring", stiffness: 900, damping: 40 }}
        className="chamfer group relative flex h-[54px] w-full items-stretch overflow-hidden bg-accent text-accent-ink transition-[background,filter] duration-150 hover:bg-accent-2 disabled:bg-s4 disabled:text-text-3"
      >
        <span className="flex w-[54px] shrink-0 items-center justify-center border-e border-black/15 group-disabled:border-line-2">
          <Play size={15} strokeWidth={2.5} fill="currentColor" className="translate-x-px" aria-hidden />
        </span>
        <span className="display flex flex-1 items-center ps-5 text-[20px] font-bold tracking-[0.12em] uppercase">{label}</span>
        <span className="flex items-center gap-0.5 pe-5 rtl:-scale-x-100" aria-hidden>
          {[0, 1, 2].map((i) => (
            <ChevronRight
              key={i}
              size={17}
              strokeWidth={3}
              className="-ms-2.5 first:ms-0 group-disabled:opacity-30"
              style={disabled ? undefined : { animation: `chevron-run 1.4s ${i * 0.14}s var(--ease-out-quint) infinite` }}
            />
          ))}
        </span>
        <span className="pointer-events-none absolute inset-y-0 left-0 w-full bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-0 group-hover:opacity-100 group-hover:[animation:scan_0.7s_var(--ease-out-quint)]" aria-hidden />
      </motion.button>
      {stage === "error" && <p className="mt-2 text-[12px] text-bad">{t("launch.error", { error: error ?? "" })}</p>}

      <AnimatePresence>
        {stage === "asking" && (
          <motion.div
            role="dialog"
            aria-label={t("launch.ask.label")}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: "spring", stiffness: 500, damping: 34 }}
            className="panel absolute inset-x-0 bottom-[calc(100%+10px)] z-20 p-3.5"
            onKeyDown={(e) => e.key === "Escape" && setStage("idle")}
          >
            <p className="text-[13px] font-semibold">{t("launch.ask.title")}</p>
            <p className="mt-0.5 text-[12px] text-text-2">{t("launch.ask.body")}</p>
            <div className="mt-3 flex gap-2">
              <button
                ref={closeBtn}
                type="button"
                onClick={() => void answer(true)}
                className="display h-9 flex-1 bg-accent text-[14px] font-semibold tracking-[0.08em] uppercase text-accent-ink transition-[filter] duration-150 hover:brightness-110 active:brightness-95"
              >
                {t("launch.ask.close")}
              </button>
              <button
                type="button"
                onClick={() => void answer(false)}
                className="display h-9 flex-1 border border-line-2 text-[14px] font-semibold tracking-[0.08em] uppercase text-text transition-colors duration-150 hover:bg-s4"
              >
                {t("launch.ask.keep")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
