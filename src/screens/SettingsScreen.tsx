import { motion } from "motion/react";
import { Check, ChevronDown, Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import defaults from "../../config/thresholds.json";
import type { GradeLimit } from "../bindings/GradeLimit";
import type { Settings } from "../bindings/Settings";
import type { Theme } from "../bindings/Theme";
import type { Thresholds } from "../bindings/Thresholds";
import { LOCALES, resolveLocale, useT, type MessageKey } from "../i18n";
import { useApp } from "../lib/store";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(180px,260px)_1fr] items-start gap-6 border-b border-line py-4 last:border-b-0">
      <div>
        <div className="text-[13px] font-medium">{label}</div>
        {hint && <div className="mt-0.5 max-w-[42ch] text-[11.5px] leading-snug text-pretty text-text-3">{hint}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange(v: T): void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="well inline-flex p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`display relative h-7 px-3.5 text-[13.5px] font-semibold tracking-[0.08em] whitespace-nowrap uppercase transition-colors duration-150 ${value === o.value ? "text-text" : "text-text-3 hover:text-text-2"}`}
        >
          {value === o.value && (
            <motion.span layoutId={`seg-${label}`} className="absolute inset-0 bg-s4 shadow-[inset_0_1px_0_var(--nc-hi),inset_0_0_0_1px_var(--nc-line-2)]" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function Select({ label, value, onChange, children, width = 280 }: { label: string; value: string; onChange(v: string): void; children: React.ReactNode; width?: number }) {
  return (
    <div className="relative" style={{ width }}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="well h-8 w-full appearance-none ps-3 pe-8 text-[13px] text-text outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--nc-line-3)]"
      >
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-text-3" />
    </div>
  );
}

function NumberField({ value, onChange, min, max, step = 1, unit, label }: { value: number; onChange(v: number): void; min: number; max: number; step?: number; unit: string; label: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (raw: string) => {
    const n = Number(raw);
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
    else setText(String(value));
  };
  return (
    <label className="well flex h-8 w-[104px] items-center pe-2" dir="ltr">
      <span className="sr-only">{label}</span>
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
          if (e.key === "ArrowUp") onChange(Math.min(max, value + step));
          if (e.key === "ArrowDown") onChange(Math.max(min, value - step));
        }}
        className="num w-full min-w-0 bg-transparent px-2.5 text-right text-[13px] outline-none"
      />
      <span className="text-[11px] text-text-3">{unit}</span>
    </label>
  );
}

const GRADES: Array<{ key: "excellent" | "good" | "playable"; label: MessageKey; color: string }> = [
  { key: "excellent", label: "tone.excellent", color: "var(--nc-excellent)" },
  { key: "good", label: "tone.good", color: "var(--nc-good)" },
  { key: "playable", label: "tone.playable", color: "var(--nc-playable)" },
];

export function SettingsScreen() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const saveSettings = useApp((s) => s.saveSettings);
  const infos = useApp((s) => s.infos);
  const [draft, setDraft] = useState<Settings | null>(settings);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(settings), [settings]);

  const regions = useMemo(() => Object.values(infos).sort((a, b) => a.city.localeCompare(b.city)), [infos]);
  if (!draft || !settings) return null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const set = (patch: Partial<Settings>) => {
    setSaved(false);
    setDraft({ ...draft, ...patch });
  };
  const setLimit = (grade: "excellent" | "good" | "playable", patch: Partial<GradeLimit>) =>
    set({ thresholds: { ...draft.thresholds, [grade]: { ...draft.thresholds[grade], ...patch } } });
  const preferredKnown = draft.preferredRegion === "auto" || regions.some((r) => r.code === draft.preferredRegion);
  const closeValue = draft.closeAfterLaunch == null ? "ask" : draft.closeAfterLaunch ? "close" : "keep";
  // Language applies at once so the rest of this screen can be read in it.
  const setLanguage = (language: string) => {
    const unsaved = draft;
    void saveSettings({ ...settings, language }).then(() => setDraft({ ...unsaved, language }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col px-4 pt-1 pb-3">
      <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden" aria-label={t("settings.label")}>
        <div className="flex items-center gap-3 border-b border-line px-6 py-3.5">
          <h2 className="hud-title">{t("settings.title")}</h2>
          <span className="truncate text-[11.5px] text-text-3">{t("settings.sub")}</span>
          <span className="flex-1" />
          {saved && !dirty && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-good">
              <Check size={13} /> {t("settings.saved")}
            </span>
          )}
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            disabled={!dirty}
            onClick={() => void saveSettings(draft).then(() => setSaved(true))}
            className="chamfer-sm display h-8 shrink-0 bg-accent px-4 text-[14px] font-bold tracking-[0.08em] text-accent-ink uppercase transition-[filter,opacity] duration-150 hover:brightness-110 disabled:opacity-40"
          >
            {t("settings.save")}
          </motion.button>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6">
          <Row label={t("settings.language")} hint={t("settings.language.hint")}>
            <Select label={t("settings.language")} value={resolveLocale(draft.language)} onChange={setLanguage} width={240}>
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code} lang={l.code} dir={l.rtl ? "rtl" : "ltr"}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Row>
          <Row label={t("settings.region")} hint={t("settings.region.hint")}>
            <Select label={t("settings.region")} value={draft.preferredRegion} onChange={(preferredRegion) => set({ preferredRegion })}>
              <option value="auto">{t("settings.region.auto")}</option>
              {!preferredKnown && <option value={draft.preferredRegion}>{draft.preferredRegion.toUpperCase()}</option>}
              {regions.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.city} ({r.code.toUpperCase()})
                </option>
              ))}
            </Select>
          </Row>
          <Row label={t("settings.pings")} hint={t("settings.pings.hint")}>
            <div className="flex items-center gap-2">
              <button type="button" aria-label={t("settings.pings.fewer")} onClick={() => set({ pingCount: Math.max(10, draft.pingCount - 5) })} className="well grid size-8 place-items-center text-text-2 hover:text-text">
                <Minus size={14} />
              </button>
              <span className="num w-10 text-center text-[16px] font-semibold">{draft.pingCount}</span>
              <button type="button" aria-label={t("settings.pings.more")} onClick={() => set({ pingCount: Math.min(100, draft.pingCount + 5) })} className="well grid size-8 place-items-center text-text-2 hover:text-text">
                <Plus size={14} />
              </button>
              <span className="ms-2 text-[11.5px] text-text-3">{t("settings.pings.time", { s: Math.ceil((draft.pingCount * 0.1 + 0.4) * 3) })}</span>
            </div>
          </Row>
          <Row label={t("settings.grades")} hint={t("settings.grades.hint")}>
            <div className="space-y-2">
              <div className="grid grid-cols-[110px_repeat(3,104px)] gap-3 text-[11px] text-text-3">
                <span />
                <span>{t("settings.grades.avg")}</span>
                <span>{t("settings.grades.jitter")}</span>
                <span>{t("settings.grades.loss")}</span>
              </div>
              {GRADES.map((g) => {
                const name = t(g.label);
                return (
                  <div key={g.key} className="grid grid-cols-[110px_repeat(3,104px)] items-center gap-3">
                    <span className="inline-flex items-center gap-2 text-[12.5px]" style={{ color: g.color }}>
                      <span className="size-2 rounded-full" style={{ background: g.color }} />
                      {name}
                    </span>
                    <NumberField label={t("settings.grades.field", { grade: name, field: t("settings.grades.avg") })} value={draft.thresholds[g.key].avgMs} onChange={(v) => setLimit(g.key, { avgMs: v })} min={1} max={500} unit="ms" />
                    <NumberField label={t("settings.grades.field", { grade: name, field: t("settings.grades.jitter") })} value={draft.thresholds[g.key].jitterMs} onChange={(v) => setLimit(g.key, { jitterMs: v })} min={0} max={200} unit="ms" />
                    <NumberField label={t("settings.grades.field", { grade: name, field: t("settings.grades.loss") })} value={draft.thresholds[g.key].lossPct} onChange={(v) => setLimit(g.key, { lossPct: v })} min={0} max={100} step={0.5} unit="%" />
                  </div>
                );
              })}
              <div className="grid grid-cols-[110px_repeat(3,104px)] items-center gap-3 pt-2">
                <span className="text-[12.5px] text-text-2">{t("settings.grades.problem")}</span>
                <NumberField
                  label={t("settings.grades.problemJump")}
                  value={draft.thresholds.problemHop.jumpMs}
                  onChange={(v) => set({ thresholds: { ...draft.thresholds, problemHop: { ...draft.thresholds.problemHop, jumpMs: v } } })}
                  min={5}
                  max={200}
                  unit="ms"
                />
                <span />
                <NumberField
                  label={t("settings.grades.problemLoss")}
                  value={draft.thresholds.problemHop.lossPct}
                  onChange={(v) => set({ thresholds: { ...draft.thresholds, problemHop: { ...draft.thresholds.problemHop, lossPct: v } } })}
                  min={0}
                  max={100}
                  unit="%"
                />
              </div>
              <button type="button" onClick={() => set({ thresholds: defaults as Thresholds })} className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-text-2 hover:text-text">
                <RotateCcw size={12} /> {t("settings.grades.reset")}
              </button>
            </div>
          </Row>
          <Row label={t("settings.after")} hint={t("settings.after.hint")}>
            <Segmented
              label="close"
              value={closeValue}
              onChange={(v) => set({ closeAfterLaunch: v === "ask" ? null : v === "close" })}
              options={[
                { value: "close", label: t("settings.after.close") },
                { value: "keep", label: t("settings.after.keep") },
                { value: "ask", label: t("settings.after.ask") },
              ]}
            />
          </Row>
          <Row label={t("settings.theme")}>
            <Segmented<Theme>
              label="theme"
              value={draft.theme}
              onChange={(theme) => set({ theme })}
              options={[
                { value: "system", label: t("settings.theme.system") },
                { value: "dark", label: t("settings.theme.dark") },
                { value: "light", label: t("settings.theme.light") },
              ]}
            />
          </Row>
          <Row label={t("settings.updates")} hint={t("settings.updates.hint")}>
            <Segmented
              label="updates"
              value={draft.checkUpdates ? "on" : "off"}
              onChange={(v) => set({ checkUpdates: v === "on" })}
              options={[
                { value: "on", label: t("settings.updates.on") },
                { value: "off", label: t("settings.updates.off") },
              ]}
            />
          </Row>
          <Row label={t("settings.origin")} hint={t("settings.origin.hint")}>
            <div className="flex items-center gap-3">
              <Segmented
                label="origin"
                value={draft.homeLonLat ? "custom" : "auto"}
                onChange={(v) => set({ homeLonLat: v === "auto" ? null : (draft.homeLonLat ?? [0, 0]) })}
                options={[
                  { value: "auto", label: t("settings.origin.auto") },
                  { value: "custom", label: t("settings.origin.custom") },
                ]}
              />
              {draft.homeLonLat && (
                <>
                  <NumberField label={t("settings.origin.lat")} value={draft.homeLonLat[1]} onChange={(lat) => set({ homeLonLat: [draft.homeLonLat?.[0] ?? 0, lat] })} min={-56} max={78} step={0.5} unit="lat" />
                  <NumberField label={t("settings.origin.lon")} value={draft.homeLonLat[0]} onChange={(lon) => set({ homeLonLat: [lon, draft.homeLonLat?.[1] ?? 0] })} min={-180} max={180} step={0.5} unit="lon" />
                </>
              )}
            </div>
          </Row>
        </div>
      </section>
    </div>
  );
}
