"use client";

// SMART PROPOSAL · ESTIMATE / BLUEPRINT — the page.
// Route: /dashboard/advanced-ai.
//
// A verbatim port of `jobflex-smartproposal-estimate-blueprint (8).html`. It
// REPLACES the previous Smart Proposal console that lived at this URL (the
// earlier donor, jobflex-smart-proposal-blueprint_4.html) — same URL, no
// parallel route beside it.
//
// The route segment is `advanced-ai` (the app's existing URL for this screen);
// the donor's visible title and heading text are kept exactly as authored.
// "AI" must never appear in the interface — the feature is called Smart
// Proposal.
//
// ── CHROME DROPPED ─────────────────────────────────────────────────
// The donor file carries its own sidebar, topbar, SVG sprite, `.layout`,
// `.main` (graph-paper field + scrollbars) and `.content` wrapper. ALL of it is
// discarded here: blueprint-shell already renders that furniture from
// src/app/dashboard/layout.tsx and it persists across navigation. Verified
// value-for-value against the donor before dropping — `--sidebar-w: 264px`,
// `--topbar-h: 62px`, `.content { padding: 40px 96px 80px; gap: 22px;
// display: flex; flex-direction: column; position: relative; z-index: 1 }` —
// all identical. This component returns ONLY the donor's `.content` children,
// as a fragment, so they stay DIRECT children of `.content`: the donor's reveal
// cascade walks `.content > *`.
//
// Also dropped, for the same reason: the donor's 42-symbol sprite (the shell
// sprite's copies of the three symbols used here — i-arrow, i-file, i-x — are
// character-identical), the nav burger / backdrop (the shell owns the drawer),
// FLUID SCALE, the sidebar cascade and the graph-paper parallax
// (shell-behavior.ts, same donor numbers). The donor's `.banner-close` dismiss
// IIFE is dropped too: this page renders no Lead Center banner, so its
// `querySelectorAll` matched nothing.
//
// ── TWO PANELS: CONSOLE → ESTIMATE ─────────────────────────────────
// The estimate donor covers only the RESULT screen. The page it is reached
// from — the intake console: project type, location, brief, Generate — is the
// previous build's, restored so this is a flow again rather than an estimate
// that appears from nowhere. Its markup, copy and styles are carried across
// unchanged (see the INTAKE CONSOLE block in ./advanced-ai.module.css and the
// INTAKE / PROJECT_TYPES / SAMPLES / STATES exports in ./advanced-ai-data.ts).
//
// `panel` switches between the two. The motion hook takes it as a dependency,
// so each panel gets the donor's entrance instead of appearing hard.
//
// ── THE FIXTURE IS THE CONTENT ─────────────────────────────────────
// The estimate itself ships the donor's demo verbatim — the explicit call for
// this port. "Cedar privacy fence — 128 ft" and its five material rows, three
// labour rows, three assumptions and $150 returning-client discount all come
// from ./advanced-ai-data.ts. Nothing is read from the database and nothing is
// written: the previous build's org markup lookup, its client-id resolution and
// its `convertEstimateToProposal` hand-off are all gone. "Send to proposal" is
// the donor's button, and like the donor's it has no handler.
//
// CONSEQUENCE, and it is visible: what you type into the console does not
// change the estimate that comes back — Generate always yields the donor's
// cedar-fence fixture. Wiring the brief through to a real estimator is a data-
// layer change, which is out of scope for this port.
//
// ── DONOR SCRIPT → REACT ───────────────────────────────────────────
// The donor drives everything through `innerHTML` re-renders (`renderTables()`,
// `renderTotals()`, `renderRequest()`, `renderAsm()`) off four module-level
// variables — MAT, LAB, ASM and `undoSnap` — plus a `setRefineStage()` that
// toggles `hidden` across three wrappers. Those are component state here; the
// emitted markup, class names and ordering are the donor's, element for element.
//
// TWO NOTES ON FIDELITY, both load-bearing:
//
//  1. The qty / unit inputs are UNCONTROLLED (`defaultValue`), exactly as the
//     donor leaves them. The donor sanitises the MODEL —
//     `Math.max(0, parseFloat(inp.value) || 0)` — but never writes back to the
//     field, so clearing a cell shows an empty box while the totals read 0. A
//     controlled input would slam a "0" into the field the moment it emptied,
//     which the donor does not do.
//  2. `rev` reproduces the donor's `renderTables()` innerHTML reset. When "Keep
//     changes" rewrites Concrete bags to 40 (or Undo restores it), the donor
//     rebuilds the rows and the DOM inputs pick up the new values. Bumping
//     `rev` re-keys the rows, remounting them — same observable result.
//
// The donor's `.req-qty` / `.req-line` class hooks are NOT carried: they exist
// only so its input listener can patch the mirrored Materials-request row in
// place, and they carry no CSS. Here the request rows derive from the same
// state, so they update without a hook.

import { useEffect, useId, useRef, useState } from "react";
import s from "./advanced-ai.module.css";
import { useSmartProposalMotion } from "./advanced-ai-motion";
import {
  MAT,
  LAB,
  ASM,
  DISCOUNT,
  KEEP_CHANGES,
  DIFF_ROWS,
  ESTIMATE,
  INTAKE,
  PROJECT_TYPES,
  SAMPLES,
  STATES,
  money,
  moneyU,
  sum,
  type MatRow,
  type LabRow,
} from "./advanced-ai-data";

/** Hashed module class, or the literal name when the module has none — which is
 *  how the fleet's global `rv` / `rv-in` / `pressed` pass through. */
function cx(...names: Array<string | false | null | undefined>): string {
  return names
    .filter(Boolean)
    .map((n) => (s as Record<string, string>)[n as string] ?? (n as string))
    .join(" ");
}

type Stage = "idle" | "busy" | "diff";
type Snapshot = { mat: MatRow[]; asm: string[] };
/** Which of the page's two panels is on screen. */
type Panel = "intake" | "estimate";

export function AdvancedAiContent() {
  // ── Panel 1: the intake console ──────────────────────────────────
  const [panel, setPanel] = useState<Panel>("intake");
  const [ptype, setPtype] = useState<string | null>(null);
  const [addr, setAddr] = useState("");
  const [usState, setUsState] = useState("");
  const [brief, setBrief] = useState("");
  const [generating, setGenerating] = useState(false);

  // ── Panel 2: the estimate ────────────────────────────────────────
  // Donor: the module-level MAT / LAB / ASM arrays and `let undoSnap = null`.
  const [mat, setMat] = useState<MatRow[]>(() => MAT.map((r) => ({ ...r })));
  const [lab, setLab] = useState<LabRow[]>(() => LAB.map((r) => ({ ...r })));
  const [asm, setAsm] = useState<string[]>(() => [...ASM]);
  const [stage, setStage] = useState<Stage>("idle");
  const [refineText, setRefineText] = useState("");
  const [undoSnap, setUndoSnap] = useState<Snapshot | null>(null);
  const [failedImg, setFailedImg] = useState<string[]>([]);
  // See note 2 in the header — the donor's innerHTML reset, as a remount key.
  const [rev, setRev] = useState(0);

  const briefId = useId();
  const addrId = useId();
  const stateId = useId();

  useSmartProposalMotion(s.btn, panel);

  // Donor: `setTimeout(() => setRefineStage('diff'), 1400)`.
  const busyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const genTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (busyTimer.current) clearTimeout(busyTimer.current);
      if (genTimer.current) clearTimeout(genTimer.current);
    };
  }, []);

  // The console's gate, as the previous build had it: a project type and a
  // brief are the two things the pricing model cannot be inferred without.
  const canGenerate = !!ptype && brief.trim().length > 0 && !generating;

  function generate() {
    if (!canGenerate) return;
    setGenerating(true);
    genTimer.current = setTimeout(() => {
      setGenerating(false);
      setPanel("estimate");
    }, 1500);
  }

  /** Back to the console, with the estimate's edits discarded. */
  function startOver() {
    setPanel("intake");
    setMat(MAT.map((r) => ({ ...r })));
    setLab(LAB.map((r) => ({ ...r })));
    setAsm([...ASM]);
    setStage("idle");
    setRefineText("");
    setUndoSnap(null);
    setRev((r) => r + 1);
  }

  const matTotal = sum(mat);
  const labTotal = sum(lab);

  /** Donor: the `.sp-main` input listener — sanitise the model, leave the field. */
  function editCell(
    kind: "mat" | "lab",
    id: string,
    field: "q" | "u",
    raw: string,
  ) {
    const v = Math.max(0, parseFloat(raw) || 0);
    const apply = <T extends { id: string }>(rows: T[]) =>
      rows.map((r) => (r.id === id ? { ...r, [field]: v } : r));
    if (kind === "mat") setMat((rows) => apply(rows));
    else setLab((rows) => apply(rows));
  }

  /** Donor: `$id('spKeep')` — snapshot, append the new row, bump the changed one. */
  function keepChanges() {
    setUndoSnap({ mat: mat.map((r) => ({ ...r })), asm: [...asm] });
    setMat((rows) => [
      ...rows.map((r) =>
        r.id === KEEP_CHANGES.changedId
          ? { ...r, q: KEEP_CHANGES.changedQty, badge: KEEP_CHANGES.changedBadge }
          : r,
      ),
      { ...KEEP_CHANGES.added },
    ]);
    setAsm((rows) => [
      ...rows.filter((a) => a.indexOf(KEEP_CHANGES.dropAssumptionMatching) === -1),
      KEEP_CHANGES.addAssumption,
    ]);
    setStage("idle");
    setRefineText("");
    setRev((r) => r + 1);
  }

  /** Donor: `$id('spUndo')` — restore the snapshot and strip every badge. */
  function undo() {
    if (!undoSnap) return;
    setMat(
      undoSnap.mat.map((r) => {
        // Donor: `undoSnap.mat.forEach(r => { delete r.badge; MAT.push(r) })`.
        const copy = { ...r };
        delete copy.badge;
        return copy;
      }),
    );
    setAsm(undoSnap.asm);
    setUndoSnap(null);
    setRev((r) => r + 1);
  }

  /** Donor `rowHtml(r)` — one estimate line, materials or labour. */
  const row = (r: MatRow | LabRow, kind: "mat" | "lab") => (
    <div className={cx("sp-row")} key={`${r.id}-${rev}`}>
      <span className={cx("sp-row-n")}>
        {r.n}
        {r.badge && <em>{r.badge}</em>}
      </span>
      <input
        className={cx("sp-in")}
        type="number"
        min="0"
        step="1"
        defaultValue={r.q}
        aria-label={`${r.n} — quantity`}
        onChange={(e) => editCell(kind, r.id, "q", e.target.value)}
      />
      <input
        className={cx("sp-in")}
        type="number"
        min="0"
        step="0.5"
        defaultValue={r.u}
        aria-label={`${r.n} — unit price`}
        onChange={(e) => editCell(kind, r.id, "u", e.target.value)}
      />
      <span className={cx("sp-row-t")}>{money(r.q * r.u)}</span>
    </div>
  );

  // ══════════════ PANEL 1 — INTAKE CONSOLE ══════════════
  if (panel === "intake") {
    return (
      <>
        <div className={cx("page-head")}>
          <div>
            <div className={cx("kicker")}>{INTAKE.kicker}</div>
            <h1 className={cx("page-title")}>{INTAKE.title}</h1>
          </div>
        </div>

        <section className={cx("card", "est-console")}>
          <div className={cx("est-mast")}>
            <span className={cx("est-mark")}>
              <svg className={cx("ic")}>
                <use href="#i-bulb" />
              </svg>
            </span>
            <div>
              <h2 className={cx("est-title")}>{INTAKE.consoleTitle}</h2>
              <p className={cx("est-lede")}>{INTAKE.lede}</p>
            </div>
          </div>

          <div className={cx("est-rail")}>
            {/* 1 — PROJECT TYPE */}
            <div className={cx("est-step", ptype && "done")}>
              <span className={cx("est-n")}>1</span>
              <div className={cx("est-body")}>
                <div className={cx("est-h")}>{INTAKE.steps.type.h}</div>
                <div className={cx("est-hint")}>{INTAKE.steps.type.hint}</div>
                <div className={cx("ptypes")}>
                  {PROJECT_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={cx("ptype", ptype === t.id && "on")}
                      aria-pressed={ptype === t.id}
                      onClick={() => setPtype(t.id)}
                    >
                      <svg className={cx("ic")}>
                        <use href={`#${t.icon}`} />
                      </svg>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 2 — LOCATION */}
            <div className={cx("est-step", (addr.trim() || usState) && "done")}>
              <span className={cx("est-n")}>2</span>
              <div className={cx("est-body")}>
                <div className={cx("est-h")}>{INTAKE.steps.location.h}</div>
                <div className={cx("est-hint")}>{INTAKE.steps.location.hint}</div>
                <div className={cx("loc-row")}>
                  <label className={cx("est-field")} htmlFor={addrId}>
                    <span className={cx("est-lbl")}>Address or city</span>
                    <input
                      id={addrId}
                      className={cx("est-in")}
                      placeholder={INTAKE.addressPlaceholder}
                      value={addr}
                      onChange={(e) => setAddr(e.target.value)}
                    />
                  </label>
                  <label className={cx("est-field")} htmlFor={stateId}>
                    <span className={cx("est-lbl")}>State</span>
                    <span className={cx("est-selwrap")}>
                      <select
                        id={stateId}
                        className={cx("est-in", "est-sel")}
                        data-empty={usState ? undefined : "1"}
                        value={usState}
                        onChange={(e) => setUsState(e.target.value)}
                      >
                        <option value="">State</option>
                        {STATES.map(([abbr, name]) => (
                          <option key={abbr} value={abbr}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* 3 — THE BRIEF */}
            <div className={cx("est-step", brief.trim() && "done")}>
              <span className={cx("est-n")}>3</span>
              <div className={cx("est-body")}>
                <div className={cx("est-h")}>{INTAKE.steps.brief.h}</div>
                <div className={cx("est-hint")}>{INTAKE.steps.brief.hint}</div>
                <textarea
                  id={briefId}
                  className={cx("est-area")}
                  aria-label={INTAKE.steps.brief.h}
                  placeholder={INTAKE.briefPlaceholder}
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                />
                <div className={cx("samples")}>
                  {SAMPLES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={cx("sample")}
                      onClick={() => setBrief(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className={cx("est-bar")}>
            {/* The console's feedback channel. A live region because the run
                takes seconds and the Generate button is disabled throughout —
                without it a screen-reader user hears nothing at all. */}
            <span
              className={cx("est-status", generating && "run")}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {generating ? INTAKE.running : ""}
            </span>
            <button
              className={cx("btn", "btn-primary")}
              type="button"
              disabled={!canGenerate}
              onClick={generate}
            >
              <svg className={cx("ic")}>
                <use href="#i-bulb" />
              </svg>
              <span>{generating ? "Generating…" : INTAKE.cta}</span>
            </button>
          </div>
        </section>
      </>
    );
  }

  // ══════════════ PANEL 2 — THE ESTIMATE ══════════════
  return (
    <>
      {/* PAGE HEAD */}
      <div className={cx("page-head")}>
        <div>
          <div className={cx("kicker")}>{ESTIMATE.kicker}</div>
          <h1 className={cx("page-title")}>{ESTIMATE.title}</h1>
          <div className={cx("sp-brief")}>{ESTIMATE.brief}</div>
        </div>
        <div className={cx("sp-head-btns")}>
          {/* NOT in the donor, which is a single static screen with no way
              back. This page is a two-step flow, so it needs a return path;
              it borrows Undo's ghost treatment and sits in the same slot, so
              the head keeps the donor's shape. */}
          <button className={cx("btn", "btn-ghost")} type="button" onClick={startOver}>
            Start over
          </button>
          {/* Donor: `<button … id="spUndo" hidden>`. Rendered conditionally
              instead, because the donor's `[hidden]{display:none!important}`
              exists only to beat `.btn { display: inline-flex }` — with the
              element absent there is nothing to beat. */}
          {undoSnap && (
            <button className={cx("btn", "btn-ghost")} type="button" onClick={undo}>
              <svg className={cx("ic")}>
                <use href="#i-arrow" />
              </svg>
              Undo
            </button>
          )}
          <button className={cx("btn", "btn-primary")} type="button">
            <svg className={cx("ic")}>
              <use href="#i-file" />
            </svg>
            Send to proposal
          </button>
        </div>
      </div>

      <div className={cx("sp-grid")}>
        <div className={cx("sp-main")}>
          {/* MATERIALS */}
          <section className={cx("card")}>
            <div className={cx("sp-h")}>
              <div>
                <h2 className={cx("sp-t")}>Materials</h2>
              </div>
              <div className={cx("sp-cardtotal")}>{money(matTotal)}</div>
            </div>
            <div className={cx("sp-thead")}>
              <span>Item</span>
              <span>Qty</span>
              <span>Unit $</span>
              <span>Total</span>
            </div>
            <div>{mat.map((r) => row(r, "mat"))}</div>
          </section>

          {/* LABOR */}
          <section className={cx("card")}>
            <div className={cx("sp-h")}>
              <div>
                <h2 className={cx("sp-t")}>Labor</h2>
              </div>
              <div className={cx("sp-cardtotal")}>{money(labTotal)}</div>
            </div>
            <div className={cx("sp-thead")}>
              <span>Item</span>
              <span>Qty</span>
              <span>Unit $</span>
              <span>Total</span>
            </div>
            <div>{lab.map((r) => row(r, "lab"))}</div>
          </section>

          {/* MATERIALS REQUEST */}
          <section className={cx("card")}>
            <div className={cx("sp-h")}>
              <div>
                <h2 className={cx("sp-t")}>Materials request</h2>
              </div>
              <span className={cx("sp-req-count")}>{mat.length} items</span>
            </div>
            <div>
              {mat.map((r) => (
                <div className={cx("sp-req-row")} key={r.id}>
                  <span className={cx("sp-thumb")}>
                    {r.img && !failedImg.includes(r.id) && (
                      // Plain <img>, not next/image: the donor's thumb is an
                      // absolutely-positioned fill inside a 58px hatch box, and
                      // its `onerror="this.remove()"` is what reveals the hatch.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.img}
                        alt=""
                        loading="lazy"
                        onError={() => setFailedImg((f) => (f.includes(r.id) ? f : [...f, r.id]))}
                      />
                    )}
                  </span>
                  <span className={cx("sp-req-main")}>
                    <span className={cx("sp-req-n")}>{r.n}{r.badge ? " " : ""}</span>
                    <span className={cx("sp-req-m")}>
                      {r.dims && <span>{r.dims}</span>}
                      <span>Qty {r.q}</span>
                      {r.store && <span className={cx("sp-store")}>{r.store}</span>}
                    </span>
                  </span>
                  <span className={cx("sp-req-price")}>
                    <b>{money(r.q * r.u)}</b>
                    <span>{moneyU(r.u)} / unit</span>
                  </span>
                  <button
                    className={cx("sp-req-link")}
                    type="button"
                    aria-label={`Open at ${r.store || "store"}`}
                  >
                    <svg className={cx("ic")}>
                      <use href="#i-arrow" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <div className={cx("sp-reqtotal")}>
              <span>Total material cost</span>
              <b>{money(matTotal)}</b>
            </div>
          </section>

          {/* SCOPE */}
          <section className={cx("card")}>
            <div className={cx("sp-h")}>
              <div>
                <h2 className={cx("sp-t")}>Scope of work</h2>
              </div>
            </div>
            {/* Donor: an uncontrolled textarea with no listener. */}
            <textarea
              className={cx("sp-scope")}
              spellCheck={false}
              aria-label="Scope of work"
              defaultValue={ESTIMATE.scopeOfWork}
            />
          </section>
        </div>

        <div className={cx("sp-rail")}>
          {/* SUMMARY */}
          <section className={cx("card")}>
            <div className={cx("sp-h")}>
              <div>
                <h2 className={cx("sp-t")}>Summary</h2>
              </div>
            </div>
            <div className={cx("sp-sumrow")}>
              <span>Materials</span>
              <b>{money(matTotal)}</b>
            </div>
            <div className={cx("sp-sumrow")}>
              <span>Labor</span>
              <b>{money(labTotal)}</b>
            </div>
            <div className={cx("sp-sumrow", "sp-sumrow--disc")}>
              <span>{ESTIMATE.discountLabel}</span>
              <b>−${DISCOUNT}</b>
            </div>
            <div className={cx("sp-sumtotal")}>
              <span>Total</span>
              <b>{money(matTotal + labTotal - DISCOUNT)}</b>
            </div>

            <div className={cx("sp-asm")}>
              <div className={cx("sp-asm-l")}>Assumptions</div>
              <div>
                {asm.map((a, i) => (
                  <div className={cx("sp-asm-row")} key={a}>
                    <span>{a}</span>
                    <button
                      className={cx("sp-asm-x")}
                      type="button"
                      aria-label="Remove assumption"
                      onClick={() => setAsm((rows) => rows.filter((_, j) => j !== i))}
                    >
                      <svg className={cx("ic")}>
                        <use href="#i-x" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* REFINE */}
          <section className={cx("card")}>
            <div className={cx("sp-h")}>
              <div>
                <h2 className={cx("sp-t")}>Change the estimate</h2>
              </div>
            </div>

            {stage === "idle" && (
              <div>
                <textarea
                  className={cx("sp-refine-in")}
                  spellCheck={false}
                  placeholder={ESTIMATE.refinePlaceholder}
                  aria-label="Change the estimate"
                  value={refineText}
                  onChange={(e) => setRefineText(e.target.value)}
                />
                <button
                  className={cx("btn", "btn-primary", "sp-apply")}
                  type="button"
                  onClick={() => {
                    setStage("busy");
                    busyTimer.current = setTimeout(() => setStage("diff"), 1400);
                  }}
                >
                  Apply changes
                </button>
              </div>
            )}

            {stage === "busy" && (
              <div>
                <div className={cx("sp-busy")}>
                  <span className={cx("sp-busy-dot")}></span>Editing the estimate…
                </div>
              </div>
            )}

            {stage === "diff" && (
              <div>
                <div className={cx("sp-diff-l")}>Review changes</div>
                {DIFF_ROWS.map((d) => (
                  <div className={cx("sp-diff-row")} key={d.b}>
                    <span className={cx("sp-pill", d.mod)}>{d.pill}</span>
                    <div>
                      <b>{d.b}</b>
                      <i>{d.i}</i>
                    </div>
                  </div>
                ))}
                <div className={cx("sp-diff-btns")}>
                  <button className={cx("btn", "btn-primary")} type="button" onClick={keepChanges}>
                    Keep changes
                  </button>
                  <button
                    className={cx("btn", "btn-ghost")}
                    type="button"
                    onClick={() => setStage("idle")}
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
