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

   2026-09-26 (owner, earlier): the prompt types slowly, sits for a beat once
   typed, and only then lifts; the lines follow one at a time and the total
   lands last. Every mark is derived from the prompt's length
   (smartTimeline), so it can never lift mid-typing. The "white page" that
   flashed up on a tab click was the whole card fading in from transparent —
   gone (lp-est-swap, showcase-pass.css).

   2026-09-26 (owner, later): "an empty white screen behind the zoomed search
   bar, and only after it has searched and moved, the list of materials and
   the Proposal Review." The ruled, numbered placeholder rows and the ghost
   rail that stood behind the field (the paper-sheet pass) are gone: while
   the field is zoomed the card is plain white, and nothing of the written
   list or the review exists until the field has lifted. The rail is the
   grid's own cell again, like the roof's, fence's and video's, so its 2 px
   rule runs the full height of the card — inside a wrapper it only ran as
   tall as its rows and stopped halfway down. */

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
  usePhases,
  useReduced,
  useTyped,
} from "./showcase-kit";

/** One written line every LINE_MS once the list starts filling. */
const LINE_MS = 420;
const LINE_LEAD = 150;

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
    // White card, white stage: all there is while the field is zoomed.
    <AppFrame path="app.jobflex.com/proposals/new">
      <div className="relative">
        <Prompt label="Scope" value={typed} lifted={lifted} attach />
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_260px]">
          <div className={STAGE}>
            {/* The written list, under the lifted field: the same gutters and
                max-width as the field, so the two edges register. Every row
                is laid out from the first frame (nothing reflows as lines
                land) but none of it — not the heading, not a row's rule — is
                visible until the field has lifted; then the lines write in
                one at a time. */}
            <div className="absolute inset-x-0 bottom-0 top-[54px] px-3 sm:top-[78px] sm:px-5">
              <div className="mx-auto w-full max-w-[640px]">
                <div
                  className="flex items-center gap-2"
                  style={{ opacity: writing ? 1 : 0, transition: "opacity .4s ease" }}
                >
                  <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#6a6a6a]">Written</span>
                  <span className="h-px flex-1" style={{ background: HAIR }} />
                </div>
                {lines.map(([name, qty, price], i) => {
                  const delay = stagger * (LINE_LEAD + i * LINE_MS);
                  return (
                    <div
                      key={name}
                      className="flex items-baseline gap-3 border-b border-black/[0.07] py-2.5"
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

          {/* The review: the grid's own cell, so it stretches to the stage's
              height and its rule runs unbroken top to bottom, as on the other
              estimators. Nothing of it shows until it lands. */}
          <Rail title="Proposal" shown={railOn}>
            {scenario.rail.map(([k, v]) => (
              <Stat key={k} k={k} v={v} />
            ))}
            <TotalPlate total={scenario.total} note={scenario.note} play={railOn} />
          </Rail>
        </div>
      </div>
    </AppFrame>
  );
}
