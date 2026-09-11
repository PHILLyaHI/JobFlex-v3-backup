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
   trade heroes pass their own. */

import type { SmartScenario } from "./smart-scenarios";
import {
  AppFrame,
  EASE,
  HAIR,
  Prompt,
  Rail,
  SKY,
  STAGE,
  Stat,
  TotalPlate,
  useCompact,
  usePhases,
  useTyped,
  Beat,
} from "./showcase-kit";

export function SmartProposalShot({ active, scenario }: { active: boolean; scenario: SmartScenario }) {
  const compact = useCompact();
  const phase = usePhases([1000, 1400], active);
  const typed = useTyped(scenario.typedPrompt, active, 18);
  const lifted = phase >= 1;
  const writing = phase >= 2;
  const lines = scenario.lines;

  return (
    <AppFrame path="app.jobflex.com/proposals/new" action="Send for signature">
      <div className="relative">
        <Prompt label="Scope" value={typed} lifted={lifted} attach compact={compact} />
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_260px]">
        <div className={STAGE}>
          {/* the document, arriving under the lifted prompt — same wrapper
              padding and max-width as the prompt, so the two edges register */}
          <div
            className="absolute inset-x-0 bottom-0 px-3 pb-4 sm:px-5 sm:pb-5"
            style={{
              top: compact ? 50 : 78,
              opacity: writing ? 1 : 0,
              transform: writing ? "translateY(0)" : "translateY(16px)",
              transition: `opacity .5s ease, transform .7s ${EASE}`,
            }}
          >
            <div className="mx-auto w-full max-w-[640px]">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-ink-faint">Written</span>
                <span className="h-px flex-1" style={{ background: HAIR }} />
              </div>
              {writing &&
                lines.map(([name, qty, price], i) => (
                  <Beat key={name} delay={120 + i * 160}>
                    <div className="flex items-baseline gap-3 border-b border-black/[0.07] py-2.5">
                      <span className="w-4 shrink-0 font-mono text-[10px] text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-ink sm:text-[13.5px]">{name}</span>
                      {/* the quantity is the first thing to go when the column
                          is 350px wide — the line and its price are not */}
                      <span className="hidden shrink-0 font-mono text-[10.5px] text-ink-faint sm:inline">{qty}</span>
                      <span className="w-[62px] shrink-0 text-right font-mono text-[12px] font-bold text-ink sm:w-[68px] sm:text-[13px]">{price}</span>
                    </div>
                  </Beat>
                ))}
              {writing && (
                <Beat delay={120 + lines.length * 160}>
                  <div className="flex items-center gap-2 py-2.5">
                    <span className="h-[3px] w-24 rounded-full" style={{ background: SKY, opacity: 0.5 }} />
                    <span className="font-mono text-[10px] text-ink-faint">writing…</span>
                  </div>
                </Beat>
              )}
            </div>
          </div>
        </div>

        <Rail title="Proposal" shown={writing}>
          {scenario.rail.map(([k, v]) => (
            <Stat key={k} k={k} v={v} />
          ))}
          <TotalPlate total={scenario.total} note={scenario.note} />
        </Rail>
        </div>
      </div>
    </AppFrame>
  );
}
