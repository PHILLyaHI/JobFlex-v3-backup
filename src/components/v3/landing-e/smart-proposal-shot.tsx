"use client";

/* ============================================================
   SMART PROPOSAL — prompt, lift, write
   ============================================================
   The sequence is the showcase's original (2026-08-24): the scope prompt
   alone on the stage, then it lifts into a header bar and the estimate lines
   write themselves underneath, and the rail slides in with the split.

   Parameterised on 2026-09-07 so the same sequence can play any trade: the
   markup and the timing are fixed here, the words and the numbers come from
   a SmartScenario (smart-scenarios.ts). The showcase passes the kitchen; the
   trade heroes pass their own.

   2026-09-26 (owner): "when I click on Smart the whole white page appears".
   The stage no longer starts as an empty white slab: it is the app's paper
   ground with the proposal sheet already on it — ruled, numbered rows and a
   ghost of the rail — and the lines write INTO those rows. The prompt types
   slowly, sits for a beat once typed, and only then lifts; the lines follow
   one at a time and the total lands last. Every mark is derived from the
   prompt's length (smartTimeline), so it can never lift mid-typing. */

import type { SmartScenario } from "./smart-scenarios";
import {
  AppFrame,
  EASE,
  HAIR,
  Prompt,
  Rail,
  READ_HOLD,
  SKY,
  STAGE,
  Stat,
  TYPE_BEAT,
  TYPE_LEAD,
  TYPE_MS,
  TotalPlate,
  typedAt,
  useCompact,
  usePhases,
  useReduced,
  useTyped,
} from "./showcase-kit";

/** The drafting paper the proposal sheet lies on. */
const PAPER = "#f2f0eb";
/** One written line every LINE_MS once the sheet starts filling. */
const LINE_MS = 420;
const LINE_LEAD = 150;
/** Ghost bar widths for the unwritten line names — varied, like text. */
const GHOST_W = ["62%", "48%", "70%", "40%", "56%"];

/** The Smart sequence's clock, from the prompt it types. marks: lift, write,
 *  rail. `done` is when the total has finished counting; `slide` adds the
 *  reading hold — the showcase times the slide (and its bar) from it. */
export function smartTimeline(scenario: SmartScenario) {
  const lift = typedAt(scenario.typedPrompt.length) + TYPE_BEAT;
  const write = lift + 650;
  const rail = write + LINE_LEAD + scenario.lines.length * LINE_MS;
  const done = rail + 1400;
  return { marks: [lift, write, rail], done, slide: done + READ_HOLD };
}

export function SmartProposalShot({ active, scenario, instant = false }: { active: boolean; scenario: SmartScenario; instant?: boolean }) {
  const compact = useCompact();
  const reduced = useReduced();
  const { marks } = smartTimeline(scenario);
  const phase = usePhases(marks, active, instant);
  const typed = useTyped(scenario.typedPrompt, active, TYPE_MS, instant, TYPE_LEAD);
  // Belt and braces: nothing moves on until the whole prompt is in.
  const typedAll = typed.length >= scenario.typedPrompt.length;
  const lifted = typedAll && phase >= 1;
  const writing = typedAll && phase >= 2;
  const railOn = typedAll && phase >= 3;
  const lines = scenario.lines;
  // Staggers collapse when the shot opens filled (hero on a phone) or under
  // reduced motion — a transition delay would otherwise still hold them back.
  const stagger = instant || reduced ? 0 : 1;

  return (
    <AppFrame path="app.jobflex.com/proposals/new" body={PAPER}>
      <div className="relative">
        <Prompt label="Scope" value={typed} lifted={lifted} attach compact={compact} />
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_260px]">
        <div className={STAGE} style={{ background: PAPER }}>
          {/* the proposal sheet — on the paper from the first frame, its rows
              ruled and numbered, waiting under the prompt. Same wrapper
              padding and max-width as the prompt, so the two edges register. */}
          <div className="absolute inset-x-0 bottom-0 px-3 sm:px-5" style={{ top: compact ? 50 : 74 }}>
            <div className="mx-auto h-full w-full max-w-[640px] border border-b-0 bg-white px-3 pt-3 sm:px-5 sm:pt-4" style={{ borderColor: HAIR }}>
              <div className="relative flex h-[14px] items-center gap-2">
                <span
                  className="text-[9px] font-black uppercase tracking-[0.18em] text-[#6a6a6a]"
                  style={{ opacity: writing ? 1 : 0, transition: "opacity .4s ease" }}
                >
                  Written
                </span>
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-[6px] w-14 -translate-y-1/2 bg-black/[0.07]"
                  style={{ opacity: writing ? 0 : 1, transition: "opacity .3s ease" }}
                />
                <span className="h-px flex-1" style={{ background: HAIR }} />
              </div>
              {lines.map(([name, qty, price], i) => {
                const delay = stagger * (LINE_LEAD + i * LINE_MS);
                return (
                  <div key={name} className="relative border-b border-black/[0.07]">
                    {/* the row before it is written: its number and grey bars */}
                    <div
                      aria-hidden
                      className="absolute inset-0 flex items-center gap-3"
                      style={{ opacity: writing ? 0 : 1, transition: `opacity .3s ease ${delay}ms` }}
                    >
                      <span className="w-4 shrink-0 font-mono text-[10px] text-black/25">{String(i + 1).padStart(2, "0")}</span>
                      <span className="h-[7px] bg-black/[0.07]" style={{ width: GHOST_W[i % GHOST_W.length] }} />
                      <span className="ml-auto hidden h-[7px] w-10 shrink-0 bg-black/[0.05] sm:block" />
                      <span className="ml-auto h-[7px] w-[50px] shrink-0 bg-black/[0.08] sm:ml-0" />
                    </div>
                    {/* the written line, landing in the same row */}
                    <div
                      className="flex items-baseline gap-3 py-2.5"
                      data-written-line={writing ? "on" : "off"}
                      style={{
                        opacity: writing ? 1 : 0,
                        transform: writing ? "none" : "translateY(6px)",
                        transition: `opacity .45s ease ${delay}ms, transform .45s ${EASE} ${delay}ms`,
                      }}
                    >
                      <span className="w-4 shrink-0 font-mono text-[10px] text-[#6a6a6a]">{String(i + 1).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-ink sm:text-[13.5px]">{name}</span>
                      {/* the quantity is the first thing to go when the column
                          is 350px wide — the line and its price are not */}
                      <span className="hidden shrink-0 font-mono text-[10.5px] text-[#6a6a6a] sm:inline">{qty}</span>
                      <span className="w-[62px] shrink-0 text-right font-mono text-[12px] font-bold text-ink sm:w-[68px] sm:text-[13px]">{price}</span>
                    </div>
                  </div>
                );
              })}
              <div
                className="flex items-center gap-2 py-2.5"
                style={{
                  opacity: writing ? 1 : 0,
                  transition: `opacity .45s ease ${stagger * (LINE_LEAD + lines.length * LINE_MS)}ms`,
                }}
              >
                <span className="h-[3px] w-24 rounded-full" style={{ background: SKY, opacity: 0.5 }} />
                <span className="font-mono text-[10px] text-[#6a6a6a]">writing…</span>
              </div>
            </div>
          </div>
        </div>

        {/* the rail's cell: a ghost of the takeoff until the real one lands on it */}
        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-0 border-t border-black/[0.08] p-4 sm:border-l sm:border-t-0"
            style={{ opacity: railOn ? 0 : 1, transition: "opacity .4s ease" }}
          >
            <span className="block h-[6px] w-16 bg-black/[0.08]" />
            <div className="mt-4 space-y-2.5">
              {scenario.rail.map(([k]) => (
                <div key={k} className="flex items-center justify-between gap-3 border-b border-black/[0.06] pb-2.5">
                  <span className="h-[6px] w-20 bg-black/[0.06]" />
                  <span className="h-[7px] w-12 bg-black/[0.08]" />
                </div>
              ))}
            </div>
            <div className="mt-4 h-[58px] rounded-[2px] bg-black/[0.06]" />
          </div>
          <Rail title="Proposal" shown={railOn}>
            {scenario.rail.map(([k, v]) => (
              <Stat key={k} k={k} v={v} />
            ))}
            <TotalPlate total={scenario.total} note={scenario.note} play={railOn} />
          </Rail>
        </div>
        </div>
      </div>
    </AppFrame>
  );
}
