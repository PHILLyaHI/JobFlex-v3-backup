"use client";

// SMART PROPOSAL · ESTIMATE — HANDHELD.  Route: /mobile-smart-estimate-v1.
//
// A handheld re-cut of the ESTIMATE screen at /dashboard/advanced-ai — the
// result sheet: materials, labor, materials request, scope, summary and
// "change the estimate". Fluid 320–768px. The desktop page is NOT touched; this
// is a sibling preview URL, per the mobile route strategy.
//
// Built with the jobflex-page-styler skill (visual system: the desktop port's
// tokens, palette, type scale, Motion System "Balanced") and the
// mobile-app-ui-design skill (structure: thumb-zone commit bar, ≥44px targets,
// the total hoisted as the one thing seen first). Where the two disagree the
// house system wins — hard 3px offset shadows, 2px radii and Inter 900 caps
// stay, rather than the mobile skill's soft-shadow / rounded-3xl defaults.
//
// ── WHAT IS NOT HERE ───────────────────────────────────────────────
// The INTAKE CONSOLE. The desktop component is two panels; only
// `panel === "estimate"` is ported. Project type / location / brief / Generate
// and their fixtures (INTAKE, PROJECT_TYPES, SAMPLES, STATES) are deliberately
// untouched — this URL opens straight onto the estimate.
//
// Consequently "Start over" cannot mean "back to the console" as it does on
// desktop. Here it means what it says on a single-screen surface: put the
// estimate back to the fixture — every edited quantity, kept change and removed
// assumption discarded. Same reset the desktop runs, minus the panel switch.
//
// ── THE FIXTURE IS THE CONTENT ─────────────────────────────────────
// Every string and number comes from ../advanced-ai-blueprint/advanced-ai-data,
// imported as-is and never re-typed. Nothing is read from the database and
// nothing is written: no server actions, no API routes, no Prisma — the data
// layer is out of scope. "Send to proposal" is the donor's button and, like the
// donor's and the desktop port's, it has no handler.
//
// ── FIDELITY NOTES, BOTH LOAD-BEARING ──────────────────────────────
//  1. The qty / unit inputs are UNCONTROLLED (`defaultValue`), exactly as the
//     donor and the desktop port leave them. They sanitise the MODEL —
//     `Math.max(0, parseFloat(v) || 0)` — but never write back to the field, so
//     clearing a cell shows an empty box while the totals read 0. A controlled
//     input would slam a "0" into the field the moment it emptied, which this
//     design does not do.
//  2. `rev` reproduces the donor's `renderTables()` innerHTML reset. When "Keep
//     changes" rewrites Concrete bags to 40 (or Undo restores it), re-keying the
//     rows remounts them so the DOM inputs pick up the new values.
//
// ── THE THREE REFINE STAGES USE `hidden` ───────────────────────────
// Not conditional rendering: all three wrappers are always in the tree and the
// `hidden` attribute toggles them, which is the donor's own `setRefineStage()`
// mechanism. It is also why the stylesheet needs `[hidden] { display: none
// !important }` — `.mse-busy` sets `display: flex`, which would otherwise beat
// Tailwind preflight's plain `[hidden] { display: none }` on source order.
//
// ── ICONS ──────────────────────────────────────────────────────────
// Inline <svg>, not `<use href="#i-…">`. The desktop page gets its sprite from
// blueprint-shell; this route has no shell, so the three glyphs it needs are
// inlined at the shell sprite's own path data (24×24, stroke 2, currentColor)
// with no `id` emitted — nothing document-global to collide with.

import { useEffect, useRef, useState } from "react";
import "./mobile-smart-estimate.css";
import {
  MAT,
  LAB,
  ASM,
  DISCOUNT,
  KEEP_CHANGES,
  DIFF_ROWS,
  ESTIMATE,
  money,
  moneyU,
  sum,
  type MatRow,
  type LabRow,
} from "../advanced-ai-blueprint/advanced-ai-data";

type Stage = "idle" | "busy" | "diff";
type Snapshot = { mat: MatRow[]; asm: string[] };

/* Shell-sprite path data, inlined. */
const IcArrow = () => (
  <svg className="mse-ic" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 7h10v10" />
    <path d="M7 17 17 7" />
  </svg>
);
const IcFile = () => (
  <svg className="mse-ic" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
  </svg>
);
const IcX = () => (
  <svg className="mse-ic" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

export function MobileSmartEstimate() {
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
  // A SEPARATE key for the scope textarea, bumped only by "Start over". `rev`
  // fires on every Keep changes / Undo, and re-keying the scope on those would
  // throw away prose the contractor had typed into it.
  const [scopeRev, setScopeRev] = useState(0);

  // Donor: `setTimeout(() => setRefineStage('diff'), 1400)`.
  const busyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (busyTimer.current) clearTimeout(busyTimer.current);
    };
  }, []);

  const matTotal = sum(mat);
  const labTotal = sum(lab);
  const grandTotal = matTotal + labTotal - DISCOUNT;

  /** Donor: the `.sp-main` input listener — sanitise the model, leave the field. */
  function editCell(kind: "mat" | "lab", id: string, field: "q" | "u", raw: string) {
    const v = Math.max(0, parseFloat(raw) || 0);
    const apply = <T extends { id: string }>(rows: T[]) =>
      rows.map((r) => (r.id === id ? { ...r, [field]: v } : r));
    if (kind === "mat") setMat((rows) => apply(rows));
    else setLab((rows) => apply(rows));
  }

  /** Every edit discarded, back to the fixture. See the header. */
  function startOver() {
    setMat(MAT.map((r) => ({ ...r })));
    setLab(LAB.map((r) => ({ ...r })));
    setAsm([...ASM]);
    setStage("idle");
    setRefineText("");
    setUndoSnap(null);
    setFailedImg([]);
    setRev((r) => r + 1);
    setScopeRev((r) => r + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
        const copy = { ...r };
        delete copy.badge;
        return copy;
      }),
    );
    setAsm(undoSnap.asm);
    setUndoSnap(null);
    setRev((r) => r + 1);
  }

  /** Donor `rowHtml(r)`, re-cut into two lines — see the stylesheet's
   *  LINE ITEMS block for why the four-column grid cannot survive 320px. */
  const row = (r: MatRow | LabRow, kind: "mat" | "lab") => (
    <div className="mse-row" key={`${r.id}-${rev}`}>
      <div className="mse-row-a">
        <span className="mse-row-n">{r.n}</span>
        {r.badge && <em className="mse-badge">{r.badge}</em>}
      </div>
      <div className="mse-row-b">
        <input
          className="mse-in mse-cell-q"
          type="number"
          inputMode="decimal"
          min="0"
          step="1"
          defaultValue={r.q}
          aria-label={`${r.n} — quantity`}
          onChange={(e) => editCell(kind, r.id, "q", e.target.value)}
        />
        <span className="mse-cell-x" aria-hidden="true">
          ×
        </span>
        <input
          className="mse-in mse-cell-u"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.5"
          defaultValue={r.u}
          aria-label={`${r.n} — unit price`}
          onChange={(e) => editCell(kind, r.id, "u", e.target.value)}
        />
        <span className="mse-row-t mse-cell-t">{money(r.q * r.u)}</span>
      </div>
    </div>
  );

  /** The column legend. Its cells share line B's flex geometry, so each label
   *  sits directly over the control it names. */
  const thead = (
    <div className="mse-thead" aria-hidden="true">
      <span className="mse-cell-q">Qty</span>
      <span className="mse-cell-x" />
      <span className="mse-cell-u">Unit $</span>
      <span className="mse-cell-t">Total</span>
    </div>
  );

  return (
    <div className="jf-mobile-smart-estimate">
      <div className="mse-doc">
        {/* ── HEAD ─────────────────────────────────────────────────── */}
        <header>
          <div className="mse-kicker">{ESTIMATE.kicker}</div>
          <h1 className="mse-title">{ESTIMATE.title}</h1>
          <div className="mse-brief">{ESTIMATE.brief}</div>
        </header>

        {/* ── SUMMARY, hoisted above the ledgers ───────────────────── */}
        <section className="mse-card">
          <div className="mse-h">
            <h2 className="mse-t">Summary</h2>
          </div>
          <div className="mse-sumrow">
            <span>Materials</span>
            <b>{money(matTotal)}</b>
          </div>
          <div className="mse-sumrow">
            <span>Labor</span>
            <b>{money(labTotal)}</b>
          </div>
          <div className="mse-sumrow mse-sumrow--disc">
            <span>{ESTIMATE.discountLabel}</span>
            <b>−${DISCOUNT}</b>
          </div>
          <div className="mse-sumtotal">
            <span>Total</span>
            <b>{money(grandTotal)}</b>
          </div>
        </section>

        {/* ── MATERIALS ────────────────────────────────────────────── */}
        <section className="mse-card">
          <div className="mse-h">
            <h2 className="mse-t">Materials</h2>
            <div className="mse-cardtotal">{money(matTotal)}</div>
          </div>
          {thead}
          <div>{mat.map((r) => row(r, "mat"))}</div>
        </section>

        {/* ── LABOR ────────────────────────────────────────────────── */}
        <section className="mse-card">
          <div className="mse-h">
            <h2 className="mse-t">Labor</h2>
            <div className="mse-cardtotal">{money(labTotal)}</div>
          </div>
          {thead}
          <div>{lab.map((r) => row(r, "lab"))}</div>
        </section>

        {/* ── MATERIALS REQUEST ────────────────────────────────────── */}
        <section className="mse-card">
          <div className="mse-h">
            <h2 className="mse-t">Materials request</h2>
            <span className="mse-req-count">{mat.length} items</span>
          </div>
          <div>
            {mat.map((r) => (
              <div className="mse-req-row" key={r.id}>
                <div className="mse-req-top">
                  <span className="mse-thumb">
                    {r.img && !failedImg.includes(r.id) && (
                      // Plain <img>, not next/image: the donor's thumb is an
                      // absolutely-positioned fill inside a 58px hatch box, and
                      // its `onerror="this.remove()"` is what reveals the hatch.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.img}
                        alt=""
                        loading="lazy"
                        onError={() =>
                          setFailedImg((f) => (f.includes(r.id) ? f : [...f, r.id]))
                        }
                      />
                    )}
                  </span>
                  <span className="mse-req-main">
                    <span className="mse-req-n">{r.n}</span>
                    <span className="mse-req-m">
                      {r.dims && <span>{r.dims}</span>}
                      <span>Qty {r.q}</span>
                      {r.store && <span className="mse-store">{r.store}</span>}
                    </span>
                  </span>
                </div>
                <div className="mse-req-foot">
                  <span className="mse-req-price">
                    <b>{money(r.q * r.u)}</b>
                    <span>{moneyU(r.u)} / unit</span>
                  </span>
                  <button
                    className="mse-req-link"
                    type="button"
                    aria-label={`Open at ${r.store || "store"}`}
                  >
                    <IcArrow />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mse-reqtotal">
            <span>Total material cost</span>
            <b>{money(matTotal)}</b>
          </div>
        </section>

        {/* ── SCOPE ────────────────────────────────────────────────── */}
        <section className="mse-card">
          <div className="mse-h">
            <h2 className="mse-t">Scope of work</h2>
          </div>
          {/* Donor: an uncontrolled textarea with no listener. */}
          <textarea
            className="mse-scope"
            spellCheck={false}
            aria-label="Scope of work"
            defaultValue={ESTIMATE.scopeOfWork}
            key={`scope-${scopeRev}`}
          />
        </section>

        {/* ── ASSUMPTIONS, split out of Summary ────────────────────── */}
        <section className="mse-card">
          <div className="mse-h">
            <h2 className="mse-t">Assumptions</h2>
          </div>
          <div className="mse-asm-l">What this price assumes</div>
          <div>
            {asm.map((a, i) => (
              <div className="mse-asm-row" key={a}>
                <span>{a}</span>
                <button
                  className="mse-asm-x"
                  type="button"
                  aria-label={`Remove assumption: ${a}`}
                  onClick={() => setAsm((rows) => rows.filter((_, j) => j !== i))}
                >
                  <IcX />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ── CHANGE THE ESTIMATE — three `hidden`-toggled stages ──── */}
        <section className="mse-card">
          <div className="mse-h">
            <h2 className="mse-t">Change the estimate</h2>
          </div>

          <div hidden={stage !== "idle"}>
            <textarea
              className="mse-refine-in"
              spellCheck={false}
              placeholder={ESTIMATE.refinePlaceholder}
              aria-label="Change the estimate"
              value={refineText}
              onChange={(e) => setRefineText(e.target.value)}
            />
            <button
              className="mse-btn mse-btn--primary mse-btn--block mse-apply"
              type="button"
              onClick={() => {
                setStage("busy");
                busyTimer.current = setTimeout(() => setStage("diff"), 1400);
              }}
            >
              Apply changes
            </button>
          </div>

          {/* A live region: the run takes 1.4s with no other feedback, so a
              screen-reader user would otherwise hear nothing at all. */}
          <div
            className="mse-busy"
            hidden={stage !== "busy"}
            role="status"
            aria-live="polite"
          >
            <span className="mse-busy-dot" />
            Editing the estimate…
          </div>

          <div hidden={stage !== "diff"}>
            <div className="mse-diff-l">Review changes</div>
            {DIFF_ROWS.map((d) => (
              <div className="mse-diff-row" key={d.b}>
                <span
                  className={`mse-pill ${
                    d.mod === "sp-pill--add" ? "mse-pill--add" : "mse-pill--chg"
                  }`}
                >
                  {d.pill}
                </span>
                <div>
                  <b>{d.b}</b>
                  <i>{d.i}</i>
                </div>
              </div>
            ))}
            <div className="mse-diff-btns">
              <button className="mse-btn mse-btn--primary" type="button" onClick={keepChanges}>
                Keep changes
              </button>
              <button
                className="mse-btn mse-btn--ghost"
                type="button"
                onClick={() => setStage("idle")}
              >
                Discard
              </button>
            </div>
          </div>
        </section>

        {/* ── DOCUMENT-END ACTIONS ─────────────────────────────────── */}
        <div className="mse-foot">
          <button className="mse-btn mse-btn--ghost" type="button" onClick={startOver}>
            Start over
          </button>
          {undoSnap && (
            <button className="mse-btn mse-btn--ghost" type="button" onClick={undo}>
              <IcArrow />
              Undo
            </button>
          )}
        </div>
      </div>

      {/* ── THE ACTION BAR — thumb zone ─────────────────────────────── */}
      <div className="mse-bar">
        <div className="mse-bar-in">
          <div className="mse-bar-total">
            <div className="mse-bar-l">Total</div>
            <div className="mse-bar-v">{money(grandTotal)}</div>
          </div>
          <button className="mse-btn mse-btn--primary" type="button">
            <IcFile />
            Send to proposal
          </button>
        </div>
      </div>
    </div>
  );
}
