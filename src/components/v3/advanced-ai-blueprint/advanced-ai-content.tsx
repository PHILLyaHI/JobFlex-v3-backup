"use client";

// Blueprint Smart Proposal (route: /dashboard/advanced-ai) — page CONTENT only.
// The donor's `.content` children, verbatim
// (jobflex-smart-proposal-blueprint_4.html); the sidebar, topbar and sprite
// come from the shared shell (components/v3/blueprint-shell), which persists
// across navigation. Dynamic regions (#ptypes, #locState, #samples, the two
// line-item tbodies, #refineCard, #assump, #totals) are left empty exactly
// like the donor and filled by the ported script on mount — same
// architecture, same timing.
//
// One block is NOT the donor's: the clarifying-questions dialog (`#clarifyMdl`)
// at the end of the file. The donor has no intake gate; this restores the one
// the old estimator had, in the system's shared `.mdl` vocabulary.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.
//
// No sprite of its own: the donor's 42 symbols are a byte-identical subset of
// the shell sprite, so every `<use href="#i-…">` here resolves against it.

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initAdvancedAiContent } from "./advanced-ai-behavior";

/**
 * @param markup the org's hidden profit markup, read in the page's server
 *   component. `convertEstimateToProposal` applies exactly these rates when it
 *   writes the proposal, so the studio's Totals card can state the price the
 *   proposal will actually carry.
 */
export function AdvancedAiContent({
  markup,
}: {
  markup: { materialMarkupPct: number; laborMarkupPct: number };
}) {
  const router = useRouter();
  // Both of these reach `init` through refs, NOT through the callback's deps.
  // `useBlueprintContent` re-runs whenever `init` changes identity, and a re-run
  // tears the page down and replays the whole reveal cascade — so the init has
  // to stay referentially stable for the life of the mount. The refs are seeded
  // on the first render and read from the layout effect of that same commit.
  // `useRouter` returns the same object for the life of the mount, so seeding
  // the ref once is enough — and writing to a ref during render is not allowed.
  const markupRef = useRef(markup);
  const routerRef = useRef(router);

  const init = useCallback(
    (content: HTMLElement) =>
      initAdvancedAiContent(content, {
        markup: markupRef.current,
        navigate: (href) => routerRef.current.push(href as Route),
      }),
    [],
  );
  useBlueprintContent(init);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Sales · Estimating</div>
          <h1 className="page-title">Smart Proposal</h1>
        </div>
      </div>

      {/* ===== STEP 1: INTAKE CONSOLE ===== */}
      <section className="ppanel" data-panel="intake">
        <div className="card est-console">
          <div className="est-mast">
            <span className="est-mark">
              <svg className="ic">
                <use href="#i-bulb" />
              </svg>
            </span>
            <div>
              <h2 className="est-title">Estimate console</h2>
              <p className="est-lede">Describe the job. Real materials with retail pricing, labor and scope
                come back as separate, editable breakdowns.</p>
            </div>
          </div>

          <div className="est-rail">
            <div className="est-step">
              <span className="est-n">1</span>
              <div className="est-body">
                <div className="est-h">Project type</div>
                <div className="est-hint">Shapes the pricing model.</div>
                <div className="ptypes" id="ptypes"></div>
              </div>
            </div>

            <div className="est-step">
              <span className="est-n">2</span>
              <div className="est-body">
                <div className="est-h">Location</div>
                <div className="est-hint">Regional pricing. City typos are corrected before we price.</div>
                {/* `#locText` carries real Google Places suggestions (wired in
                    advanced-ai-behavior via blueprint-shell/places-suggest); the
                    list is drawn in the blueprint's own style, not Google's. The
                    state select is wrapped so the wrapper can draw the caret —
                    a <select> cannot carry a pseudo-element. */}
                <div className="loc-row">
                  <label className="est-field"><span className="est-lbl">Address or city</span>
                    <input className="est-in" id="locText" placeholder="Search address or city…" /></label>
                  <label className="est-field est-field--sm"><span className="est-lbl">State</span>
                    <span className="est-selwrap">
                      <select className="est-in est-sel" id="locState" data-empty="1"></select>
                    </span></label>
                </div>
              </div>
            </div>

            <div className="est-step">
              <span className="est-n">3</span>
              <div className="est-body">
                <div className="est-h">The brief</div>
                <div className="est-hint">The more specific, the tighter the estimate.</div>
                <textarea className="est-area" id="brief"
                  placeholder="Materials, finishes, conditions, access, square footage if you have it…"></textarea>
                <div className="samples" id="samples"></div>
              </div>
            </div>
          </div>

          <div className="est-bar">
            {/* The console's only feedback channel once the clarifying-questions
                dialog closes: the gate narration, "Waiting on your answers…",
                and every generation error land here. Without a live region a
                screen-reader user hears nothing for the whole multi-second run
                — and nothing at all when it fails — because the dialog returns
                focus to a Generate button that is disabled while busy. */}
            <span className="est-status" id="estStatus" role="status" aria-live="polite" aria-atomic="true"></span>
            <button className="btn btn-primary" id="genBtn" disabled>
              <svg className="ic">
                <use href="#i-bulb" />
              </svg><span id="genLabel">Generate estimate</span>
            </button>
          </div>
        </div>
      </section>

      {/* ===== STEP 2: ESTIMATE STUDIO ===== */}
      <section className="ppanel is-hidden" data-panel="studio">
        <div className="card st-head">
          <div className="st-head-l">
            <div className="kicker" id="stKicker">Estimate</div>
            <h2 className="st-title" id="stTitle">—</h2>
            {/* The studio's own feedback channel — "Changes applied", "Reverted",
                a convert failure, a plan limit. Same live-region contract as the
                console's `#estStatus`, and the same `.est-status` treatment, so
                the two steps speak in one voice. */}
            <span className="est-status" id="stStatus" role="status" aria-live="polite" aria-atomic="true"></span>
          </div>
          <div className="st-head-r">
            <button className="btn btn-ghost btn--sm" type="button" id="undoBtn" disabled>
              <svg className="ic">
                <use href="#i-undo" />
              </svg>Undo
            </button>
            <button className="btn btn-ghost btn--sm" type="button" id="resetBtn">
              <svg className="ic">
                <use href="#i-x" />
              </svg>Start over
            </button>
            <button className="btn btn-primary btn--sm" type="button" id="convertBtn">
              <svg className="ic">
                <use href="#i-file" />
              </svg>Convert to proposal
            </button>
          </div>
        </div>

        <div className="st-grid">
          <div className="st-main">
            <div className="card st-card">
              <div className="st-card-head"><span className="kpi-lbl">Scope of work</span></div>
              <div className="st-pad"><textarea className="est-area" id="scopeBox"></textarea></div>
            </div>

            <div className="card st-card">
              <div className="st-card-head">
                <span className="kpi-lbl">Materials</span>
                <span className="st-sum" id="matSum"></span>
              </div>
              <table className="ptable st-table">
                <thead><tr><th>Item</th><th className="num">Qty</th><th>Unit</th><th className="num">Unit price</th><th className="num">Total</th><th className="th-open"></th></tr></thead>
                <tbody id="matBody"></tbody>
              </table>
              <div className="st-add"><button className="btn btn-ghost btn--sm" type="button" data-add="materials"><svg className="ic"><use href="#i-plus" /></svg>Add line</button></div>
            </div>

            <div className="card st-card">
              <div className="st-card-head">
                <span className="kpi-lbl">Labor</span>
                <span className="st-sum" id="labSum"></span>
              </div>
              <table className="ptable st-table">
                <thead><tr><th>Item</th><th className="num">Qty</th><th>Unit</th><th className="num">Unit price</th><th className="num">Total</th><th className="th-open"></th></tr></thead>
                <tbody id="labBody"></tbody>
              </table>
              <div className="st-add"><button className="btn btn-ghost btn--sm" type="button" data-add="labor"><svg className="ic"><use href="#i-plus" /></svg>Add line</button></div>
            </div>
          </div>

          <aside className="st-side">
            <div className="card st-card st-refine" id="refineCard"></div>

            <div className="card st-card">
              <div className="st-card-head"><span className="kpi-lbl">Assumptions</span></div>
              <ul className="assump" id="assump"></ul>
            </div>

            <div className="card st-card st-totals">
              <div className="st-card-head"><span className="kpi-lbl">Totals</span></div>
              <div className="tot-body" id="totals"></div>
            </div>
          </aside>
        </div>
      </section>
      <div className="pmenu" id="pMenu"></div>

      {/* ===== INTAKE GATE: CLARIFYING QUESTIONS =====
          Opens between "Generate estimate" and the estimate itself, and only
          when `analyzeEstimatePrompt` reports the brief is too thin to price.
          The frame is the system's shared dialog vocabulary (.mdl / .mdl-bg /
          .mdl-box / .mdl-head / .mdl-foot — the Clients create dialog's,
          verbatim), so it opens and closes on the same 280ms/190ms contract as
          every other dialog via openMdl / closeMdl. `#clarifyBody` is empty
          here and filled per-run by advanced-ai-behavior, because the questions
          are authored by the model at request time.

          It sits outside `.ppanel` so it can cover either step, and the reveal
          cascade skips it — `.rv` would strand a fixed overlay at opacity 0. */}
      <div className="mdl" id="clarifyMdl" role="dialog" aria-modal="true" aria-labelledby="clarifyTitle">
        <div className="mdl-bg" data-clarify="skip"></div>
        <div className="mdl-box">
          <div className="mdl-head">
            <div>
              <span className="mdl-kick">Intake · brief review</span>
              <div className="mdl-title" id="clarifyTitle">A few quick questions</div>
              <p className="cq-lede">Your brief is thin for an accurate price. Answer what you can —
                every question takes a custom answer, and you can skip.</p>
            </div>
            <button className="mdl-x" type="button" data-clarify="skip" aria-label="Skip the questions and generate anyway">
              <svg className="ic">
                <use href="#i-x" />
              </svg>
            </button>
          </div>

          <div className="mdl-body cq-body" id="clarifyBody"></div>

          <div className="mdl-foot">
            <span className="cq-count" id="clarifyCount" aria-live="polite"></span>
            <button className="btn btn-ghost btn--sm" type="button" data-clarify="skip">Skip</button>
            <button className="btn btn-primary btn--sm" type="button" data-clarify="use" id="clarifyUse" disabled>
              <svg className="ic">
                <use href="#i-arrow" />
              </svg>Use answers
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
