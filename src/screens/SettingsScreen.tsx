import { motion } from "motion/react";
import { Check, ChevronDown, Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import defaults from "../../config/thresholds.json";
import type { GradeLimit } from "../bindings/GradeLimit";
import type { Settings } from "../bindings/Settings";
import type { Theme } from "../bindings/Theme";
import type { Thresholds } from "../bindings/Thresholds";
import { useApp } from "../lib/store";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(180px,240px)_1fr] items-start gap-6 border-b border-line py-4 last:border-b-0">
      <div>
        <div className="text-[13px] font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] text-text-3">{hint}</div>}
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
          className={`display relative h-7 px-3.5 text-[13.5px] font-semibold tracking-[0.08em] uppercase transition-colors duration-150 ${value === o.value ? "text-text" : "text-text-3 hover:text-text-2"}`}
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

function NumberField({ value, onChange, min, max, step = 1, unit, label }: { value: number; onChange(v: number): void; min: number; max: number; step?: number; unit: string; label: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (raw: string) => {
    const n = Number(raw);
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
    else setText(String(value));
  };
  return (
    <label className="well flex h-8 w-[104px] items-center pr-2 focus-within:border-accent/60">
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

const GRADES: Array<{ key: "excellent" | "good" | "playable"; label: string; color: string }> = [
  { key: "excellent", label: "Excellent", color: "var(--nc-excellent)" },
  { key: "good", label: "Good", color: "var(--nc-good)" },
  { key: "playable", label: "Playable", color: "var(--nc-playable)" },
];

export function SettingsScreen() {
  const settings = useApp((s) => s.settings);
  const saveSettings = useApp((s) => s.saveSettings);
  const infos = useApp((s) => s.infos);
  const [draft, setDraft] = useState<Settings | null>(settings);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(settings), [settings]);

  const regions = useMemo(() => Object.values(infos).sort((a, b) => a.city.localeCompare(b.city)), [infos]);
  if (!draft) return null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const set = (patch: Partial<Settings>) => {
    setSaved(false);
    setDraft({ ...draft, ...patch });
  };
  const setLimit = (grade: "excellent" | "good" | "playable", patch: Partial<GradeLimit>) =>
    set({ thresholds: { ...draft.thresholds, [grade]: { ...draft.thresholds[grade], ...patch } } });
  const preferredKnown = regions.some((r) => r.code === draft.preferredRegion);
  const closeValue = draft.closeAfterLaunch == null ? "ask" : draft.closeAfterLaunch ? "close" : "keep";

  return (
    <div className="flex h-full min-h-0 flex-col px-4 pt-1 pb-3">
      <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Settings">
        <div className="flex items-center gap-3 border-b border-line px-6 py-3.5">
          <h2 className="hud-title">Settings</h2>
          <span className="text-[11.5px] text-text-3">Saved on this PC. Changes apply from the next check.</span>
          <span className="flex-1" />
          {saved && !dirty && (
            <span className="inline-flex items-center gap-1 text-[12px] text-good">
              <Check size={13} /> Saved
            </span>
          )}
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            disabled={!dirty}
            onClick={() => void saveSettings(draft).then(() => setSaved(true))}
            className="chamfer-sm display h-8 bg-accent px-4 text-[14px] font-bold tracking-[0.08em] text-accent-ink uppercase transition-[filter,opacity] duration-150 hover:brightness-110 disabled:opacity-40"
          >
            Save changes
          </motion.button>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6">
          <Row label="Your region" hint="The hero readout, the route trace and the history all follow this region.">
            <div className="relative w-[280px]">
              <select
                value={draft.preferredRegion}
                onChange={(e) => set({ preferredRegion: e.target.value })}
                className="well h-8 w-full appearance-none pr-8 pl-3 text-[13px] text-text outline-none focus:border-accent/60"
              >
                {!preferredKnown && <option value={draft.preferredRegion}>{draft.preferredRegion.toUpperCase()}</option>}
                {regions.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.city} ({r.code.toUpperCase()})
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-text-3" />
            </div>
          </Row>
          <Row label="Pings per region" hint="Sent 100 ms apart. More pings give steadier numbers but a longer check.">
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Fewer pings" onClick={() => set({ pingCount: Math.max(10, draft.pingCount - 5) })} className="well grid size-8 place-items-center text-text-2 hover:text-text">
                <Minus size={14} />
              </button>
              <span className="num w-10 text-center text-[16px] font-semibold">{draft.pingCount}</span>
              <button type="button" aria-label="More pings" onClick={() => set({ pingCount: Math.min(100, draft.pingCount + 5) })} className="well grid size-8 place-items-center text-text-2 hover:text-text">
                <Plus size={14} />
              </button>
              <span className="num ml-2 text-[11.5px] text-text-3">≈ {Math.ceil((draft.pingCount * 0.1 + 0.4) * 3)} s per check</span>
            </div>
          </Row>
          <Row label="Grade thresholds" hint="A region gets the best grade whose every limit it meets. Anything worse than Playable is Bad.">
            <div className="space-y-2">
              <div className="grid grid-cols-[100px_repeat(3,104px)] gap-3 text-[11px] text-text-3">
                <span />
                <span>Average</span>
                <span>Jitter</span>
                <span>Loss</span>
              </div>
              {GRADES.map((g) => (
                <div key={g.key} className="grid grid-cols-[100px_repeat(3,104px)] items-center gap-3">
                  <span className="inline-flex items-center gap-2 text-[12.5px]" style={{ color: g.color }}>
                    <span className="size-2 rounded-full" style={{ background: g.color }} />
                    {g.label}
                  </span>
                  <NumberField label={`${g.label} average`} value={draft.thresholds[g.key].avgMs} onChange={(v) => setLimit(g.key, { avgMs: v })} min={1} max={500} unit="ms" />
                  <NumberField label={`${g.label} jitter`} value={draft.thresholds[g.key].jitterMs} onChange={(v) => setLimit(g.key, { jitterMs: v })} min={0} max={200} unit="ms" />
                  <NumberField label={`${g.label} loss`} value={draft.thresholds[g.key].lossPct} onChange={(v) => setLimit(g.key, { lossPct: v })} min={0} max={100} step={0.5} unit="%" />
                </div>
              ))}
              <div className="grid grid-cols-[100px_repeat(3,104px)] items-center gap-3 pt-2">
                <span className="text-[12.5px] text-text-2">Problem hop</span>
                <NumberField
                  label="Problem hop jump"
                  value={draft.thresholds.problemHop.jumpMs}
                  onChange={(v) => set({ thresholds: { ...draft.thresholds, problemHop: { ...draft.thresholds.problemHop, jumpMs: v } } })}
                  min={5}
                  max={200}
                  unit="ms"
                />
                <span />
                <NumberField
                  label="Problem hop loss"
                  value={draft.thresholds.problemHop.lossPct}
                  onChange={(v) => set({ thresholds: { ...draft.thresholds, problemHop: { ...draft.thresholds.problemHop, lossPct: v } } })}
                  min={0}
                  max={100}
                  unit="%"
                />
              </div>
              <button type="button" onClick={() => set({ thresholds: defaults as Thresholds })} className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-text-2 hover:text-accent">
                <RotateCcw size={12} /> Reset to defaults
              </button>
            </div>
          </Row>
          <Row label="After launching CS2" hint="Netcheck isn't needed while you play.">
            <Segmented
              label="close"
              value={closeValue}
              onChange={(v) => set({ closeAfterLaunch: v === "ask" ? null : v === "close" })}
              options={[
                { value: "close", label: "Close Netcheck" },
                { value: "keep", label: "Keep it open" },
                { value: "ask", label: "Ask me" },
              ]}
            />
          </Row>
          <Row label="Theme">
            <Segmented<Theme>
              label="theme"
              value={draft.theme}
              onChange={(theme) => set({ theme })}
              options={[
                { value: "system", label: "System" },
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
              ]}
            />
          </Row>
          <Row label="Map origin" hint="Where arcs on the map start. Auto uses the location of your lowest-ping region.">
            <div className="flex items-center gap-3">
              <Segmented
                label="origin"
                value={draft.homeLonLat ? "custom" : "auto"}
                onChange={(v) => set({ homeLonLat: v === "auto" ? null : (draft.homeLonLat ?? [0, 0]) })}
                options={[
                  { value: "auto", label: "Auto" },
                  { value: "custom", label: "Custom" },
                ]}
              />
              {draft.homeLonLat && (
                <>
                  <NumberField label="Latitude" value={draft.homeLonLat[1]} onChange={(lat) => set({ homeLonLat: [draft.homeLonLat?.[0] ?? 0, lat] })} min={-56} max={78} step={0.5} unit="lat" />
                  <NumberField label="Longitude" value={draft.homeLonLat[0]} onChange={(lon) => set({ homeLonLat: [lon, draft.homeLonLat?.[1] ?? 0] })} min={-180} max={180} step={0.5} unit="lon" />
                </>
              )}
            </div>
          </Row>
        </div>
      </section>
    </div>
  );
}
