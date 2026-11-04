import { useMemo } from "react";
import { Flag } from "../components/Flag";
import { GradePill } from "../components/GradePill";
import { Skeleton } from "../components/Skeleton";
import { Sparkline } from "../components/Sparkline";
import { Tag } from "../components/Tag";
import { WorldMap } from "../components/WorldMap";
import { ms, pct } from "../lib/format";
import { resultTone, TONES } from "../lib/grades";
import { bestRegion, playScore } from "../lib/regions";
import { useApp } from "../lib/store";

export function MapScreen() {
  const infos = useApp((s) => s.infos);
  const results = useApp((s) => s.results);
  const selected = useApp((s) => s.selected);
  const select = useApp((s) => s.select);
  const preferred = useApp((s) => s.preferred);
  const phase = useApp((s) => s.phase);

  const best = useMemo(() => bestRegion(Object.values(results), { excludeBlocked: true }), [results]);
  const ladder = useMemo(
    () => Object.values(results).filter((r) => r.stats?.avg != null).sort((a, b) => playScore(a) - playScore(b)).slice(0, 9),
    [results],
  );
  const focus = selected ?? best?.code ?? preferred;
  const info = infos[focus];
  const r = results[focus];
  const s = r?.stats;
  const color = TONES[resultTone(r)].color;

  return (
    <div className="grid h-full min-h-0 grid-cols-[1fr_272px] gap-3 p-3">
      <section className="panel relative min-h-0 overflow-hidden" aria-label="World map">
        <div className="grid-texture pointer-events-none absolute inset-0" aria-hidden />
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 70% at 50% 40%, var(--nc-wash-1), transparent 70%)" }} aria-hidden />
        <div className="pointer-events-none absolute inset-0 opacity-[0.35] [background:repeating-linear-gradient(0deg,transparent_0_3px,var(--nc-grid)_3px_4px)]" aria-hidden />
        <div className="relative size-full p-5">
          <WorldMap selected={focus} onSelect={select} />
        </div>
      </section>

      <aside className="flex min-h-0 flex-col gap-3">
        <section className="panel p-4" aria-label="Selected region">
          <div className="eyebrow">{focus === best?.code ? "Best right now" : focus === preferred ? "Your region" : "Selected"}</div>
          <div className="mt-2 flex items-center gap-2">
            <Flag code={focus} size={20} />
            <span className="truncate text-[16px] font-semibold">{info?.city ?? focus.toUpperCase()}</span>
            <span className="num ml-auto text-[11px] text-text-3">{focus.toUpperCase()}</span>
          </div>
          {s?.avg != null ? (
            <>
              <div className="mt-3 flex items-end gap-2">
                <span className="num glow-text text-[54px] leading-[0.85] font-semibold tracking-[-0.05em]" style={{ color }}>
                  {ms(s.avg)}
                </span>
                <span className="pb-1 text-[13px] text-text-3">ms</span>
                <span className="ml-auto pb-1">
                  <GradePill tone={resultTone(r)} />
                </span>
              </div>
              <div className="mt-3">
                <Sparkline samples={s.samples} width={238} height={34} color={color} />
              </div>
              <dl className="num mt-3 grid grid-cols-3 gap-y-2 text-[11.5px]">
                {[
                  ["min", ms(s.min)],
                  ["p95", ms(s.p95)],
                  ["max", ms(s.max)],
                  ["jitter", ms(s.jitter, 1)],
                  ["loss", `${pct(s.lossPct)}%`],
                  ["replies", `${s.received}/${s.sent}`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-text-3">{k}</dt>
                    <dd className="text-[13px] text-text">{v}</dd>
                  </div>
                ))}
              </dl>
              {(r?.block.state === "blocked" || r?.estimated) && (
                <div className="mt-3 flex gap-1.5">
                  {r.block.state === "blocked" && <Tag kind="blocked" />}
                  {r.estimated && <Tag kind="estimated" />}
                </div>
              )}
            </>
          ) : r ? (
            <p className="mt-3 text-[12.5px] text-text-2">No relay in this region answered.</p>
          ) : (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-[46px] w-32" />
              <Skeleton className="h-8 w-full opacity-60" />
            </div>
          )}
        </section>

        <section className="panel flex min-h-0 flex-1 flex-col p-2" aria-label="Fastest regions">
          <div className="eyebrow px-2 pt-1.5 pb-2">Fastest {phase === "done" ? "" : "so far"}</div>
          <ol className="scrollbar-thin min-h-0 overflow-y-auto">
            {ladder.map((x, i) => (
              <li key={x.code}>
                <button
                  type="button"
                  onClick={() => select(x.code)}
                  className={`flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left transition-colors duration-150 hover:bg-s3 ${x.code === focus ? "bg-s3" : ""}`}
                >
                  <span className="num w-4 text-[10.5px] text-text-3">{i + 1}</span>
                  <Flag code={x.code} size={16} />
                  <span className="truncate text-[12.5px]">{infos[x.code]?.city}</span>
                  <span className="num ml-auto text-[12.5px] font-semibold" style={{ color: TONES[resultTone(x)].color }}>
                    {ms(x.stats?.avg)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}
