import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { UpdateInfo } from "../bindings/UpdateInfo";
import { megabytes, parseNotes } from "../lib/releaseNotes";
import { useT } from "../i18n";
import { useApp } from "../lib/store";

type Stage = { kind: "offer" } | { kind: "downloading"; done: number; total: number } | { kind: "installing" } | { kind: "error"; message: string };

function Notes({ markdown }: { markdown: string }) {
  const blocks = parseNotes(markdown);
  if (!blocks.length) return null;
  return (
    <div className="well scrollbar-thin mt-4 max-h-[188px] overflow-y-auto px-4 py-3">
      {blocks.map((b, i) =>
        b.kind === "heading" ? (
          <h3 key={i} className="hud-label mt-3 mb-1.5 first:mt-0">
            {b.text}
          </h3>
        ) : b.kind === "item" ? (
          <p key={i} className="relative mb-1 ps-3.5 text-[12.5px] leading-snug text-text-2">
            <span className="absolute start-0 top-[7px] size-[5px] bg-text-3" aria-hidden />
            {b.text}
          </p>
        ) : (
          <p key={i} className="mb-1 text-[12.5px] leading-snug text-text-2">
            {b.text}
          </p>
        ),
      )}
    </div>
  );
}

export function UpdateDialog() {
  const t = useT();
  const backend = useApp((s) => s.backend);
  const checkUpdates = useApp((s) => s.settings?.checkUpdates);
  const settled = useApp((s) => s.phase === "done" || s.phase === "failed");
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: "offer" });
  const asked = useRef(false);
  const primary = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!backend || !settled || !checkUpdates || asked.current) return;
    asked.current = true;
    backend
      .checkUpdate()
      .then((found) => {
        if (!found) return;
        setUpdate(found);
        setOpen(true);
      })
      .catch(() => {});
  }, [backend, settled, checkUpdates]);

  useEffect(() => {
    if (open) primary.current?.focus();
  }, [open]);

  if (!backend || !update) return null;
  const busy = stage.kind === "downloading" || stage.kind === "installing";
  const msi = update.installer?.name.endsWith(".msi") ?? false;

  const install = async () => {
    setStage({ kind: "downloading", done: 0, total: update.installer?.size ?? 0 });
    try {
      await backend.installUpdate((done, total) => setStage({ kind: "downloading", done, total }));
      setStage({ kind: "installing" });
    } catch (e) {
      setStage({ kind: "error", message: String(e) });
    }
  };

  const openPage = () => {
    void backend.openReleasePage();
    setOpen(false);
  };

  const progress = stage.kind === "downloading" && stage.total > 0 ? Math.min(1, stage.done / stage.total) : stage.kind === "installing" ? 1 : 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-bg/75 px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onKeyDown={(e) => e.key === "Escape" && !busy && setOpen(false)}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-title"
            className="panel w-full max-w-[460px] px-6 pt-5 pb-5"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ type: "spring", stiffness: 520, damping: 36 }}
          >
            <div className="flex items-center gap-3">
              <h2 id="update-title" className="hud-title">
                {t("update.title")}
              </h2>
              <span className="h-px flex-1 bg-line" aria-hidden />
              <span className="eyebrow">Netcheck</span>
            </div>

            <div className="mt-4 flex items-end gap-4">
              <span className="display text-[52px] leading-[0.85] font-bold text-text">{update.version}</span>
              <span className="num pb-1 text-[12px] text-text-3">{t("update.have", { version: update.current })}</span>
            </div>

            <Notes markdown={update.notes} />

            {stage.kind === "downloading" || stage.kind === "installing" ? (
              <div className="mt-5" role="status" aria-live="polite">
                <div className="well h-2 overflow-hidden">
                  <motion.div className="h-full bg-accent" animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.2, ease: "linear" }} />
                </div>
                <p className="mt-2 text-[12px] text-text-2">
                  {stage.kind === "downloading" ? (
                    t("update.downloading", { done: megabytes(stage.done), total: megabytes(stage.total) })
                  ) : msi ? (
                    t("update.installingMsi")
                  ) : (
                    t("update.installing")
                  )}
                </p>
              </div>
            ) : (
              <>
                {stage.kind === "error" && (
                  <p className="mt-4 text-[12px] text-bad" role="alert">
                    {t("update.error", { error: stage.message })}
                  </p>
                )}
                <div className="mt-5 flex gap-2">
                  {update.installer && stage.kind !== "error" ? (
                    <motion.button
                      ref={primary}
                      type="button"
                      whileTap={{ y: 1 }}
                      onClick={() => void install()}
                      className="chamfer-sm display inline-flex h-10 flex-1 items-center justify-center gap-2 bg-accent text-[15px] font-bold tracking-[0.1em] text-accent-ink uppercase transition-[filter] duration-150 hover:brightness-110"
                    >
                      <Download size={15} strokeWidth={2.4} aria-hidden /> {t("update.now")}
                    </motion.button>
                  ) : (
                    <motion.button
                      ref={primary}
                      type="button"
                      whileTap={{ y: 1 }}
                      onClick={openPage}
                      className="chamfer-sm display inline-flex h-10 flex-1 items-center justify-center gap-2 bg-accent text-[15px] font-bold tracking-[0.1em] text-accent-ink uppercase transition-[filter] duration-150 hover:brightness-110"
                    >
                      {t("update.download")} <ArrowUpRight size={15} strokeWidth={2.4} aria-hidden />
                    </motion.button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="display h-10 flex-1 border border-line-2 text-[15px] font-semibold tracking-[0.1em] text-text uppercase transition-colors duration-150 hover:bg-s4"
                  >
                    {t("update.later")}
                  </button>
                </div>
                {update.installer && stage.kind !== "error" && (
                  <button type="button" onClick={openPage} className="mt-3 inline-flex items-center gap-1 text-[12px] text-text-3 hover:text-text">
                    {t("update.page")} <ArrowUpRight size={12} aria-hidden />
                  </button>
                )}
              </>
            )}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
