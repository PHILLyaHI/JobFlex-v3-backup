"use client";

// VIDEO ESTIMATOR / BLUEPRINT — the page.
// Route: /dashboard/video-estimator.
//
// The donor `jobflex-videoestimator-blueprint.html`, ported value for value,
// and WIRED (2026-08-22): the clip is real, the frames are pulled from it, the
// audio is transcribed, the reading is a model's, and the estimate is priced
// by the Smart Proposal's own engine. Nothing on this page is a fixture any
// more — the ticket number is the org's next estimate, the date is today, the
// source line is the file's own length, and every figure in the result came
// back from a server call.
//
// ── WHERE THE LOGIC LIVES ──────────────────────────────────────────
// ./use-video-estimator.ts owns the whole flow and is shared with the handheld
// build; this file is the desktop RENDERING of it. ./video-ingest.ts is the
// browser-side reading of the clip (probe, stills, audio); actions/
// videoEstimator.ts is the model's reading of those; actions/advancedEstimator
// prices it. See the headers of each for the why.
//
// ── CHROME DROPPED ─────────────────────────────────────────────────
// The donor carries its own sidebar, topbar, sprite, `.layout`, `.main` and
// `.content`; blueprint-shell renders all of it from src/app/dashboard/
// layout.tsx and it persists across navigation. This component returns ONLY
// the donor's `.content` children, as a fragment, so they stay DIRECT children
// of `.content` — the reveal cascade walks `.content > *`.
//
// ── STATE, NOT innerHTML ───────────────────────────────────────────
// A repaint is not a re-render: rebuilding a container's markup would steal
// focus from the field being typed in and replay the entrance animations
// inside it. Both steps stay mounted, toggled by `hidden`, which is the donor's
// own `stepIntake.hidden` / `stepResult.hidden` mechanism and what lets the
// motion module's observer watch the result block before it is shown.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { MaterialThumb } from "@/components/materials/MaterialThumb";
import { merchantUrl } from "@/lib/merchantLinks";
import { lineTotal, unitOptionsFor, type LineGroup } from "@/lib/estimate/console-model";
import { ClarifyDialog } from "./clarify-dialog";
import { VIDEO_ACCEPT, fmtClock } from "./video-ingest";
import { confidenceTone, money, useVideoEstimator } from "./use-video-estimator";
import { useVideoEstimatorMotion } from "./video-estimator-motion";
import s from "./video-estimator.module.css";
import "./video-estimator-global.css";

/** Hashed module class, or the literal name when the module has none — which is
 *  how the fleet's global `rv` / `rv-in` / `pressed` and this page's
 *  `vt-prog-dot` (a global, see the module header) pass through. */
function cx(...names: Array<string | false | null | undefined>): string {
  return names
    .filter(Boolean)
    .map((n) => (s as Record<string, string>)[n as string] ?? (n as string))
    .join(" ");
}

export function VideoEstimatorContent({
  ticketNo,
  aiEnabled,
}: {
  /** The org's next estimate number — what the ticket stamp prints. */
  ticketNo: number;
  /** OPENAI_API_KEY present; read on the server in page.tsx. */
  aiEnabled: boolean;
}) {
  useVideoEstimatorMotion(s.btn);

  // The hook navigates after "Convert to proposal"; it has no React tree of its
  // own, so the router is handed down through a ref that is always current.
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);
  const navigate = useCallback((href: string) => routerRef.current.push(href as Route), []);

  const ve = useVideoEstimator({ navigate, aiEnabled });

  const inputRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const intakeRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);

  // ── NOTES: РАСШИРЯЮЩЕЕСЯ ПОЛЕ ────────────────────────────────────────────
  useEffect(() => {
    const ta = notesRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }, [ve.notes]);

  // Donor: after the swap, the result block reveals and scrolls itself into
  // view. Kept MOUNTED behind `hidden`, so the motion module's observer is
  // already watching it — this replays the donor's explicit `rv` / `rv-in` add
  // and the smooth scroll, and brings the intake back the same way.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = ve.step === "result" ? resultRef.current : intakeRef.current;
    if (!el) return;
    el.classList.add("rv");
    const raf = requestAnimationFrame(() => el.classList.add("rv-in"));
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    return () => cancelAnimationFrame(raf);
  }, [ve.step]);

  // ── ЭКРАН: THE FILE ──────────────────────────────────────────────────────
  const openPicker = () => inputRef.current?.click();
  const takeFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f) void ve.pickFile(f);
  };

  const conf = ve.analysis ? ve.analysis.confidence : null;
  const audioNote =
    ve.audioState === "none"
      ? " · no audio"
      : ve.audioState === "failed"
        ? " · audio not transcribed"
        : ve.audioState === "partial"
          ? " · audio partly transcribed"
          : "";
  const locked = ve.saveState === "saving" || ve.saveState === "opening";

  // ── The ledger, editable ────────────────────────────────────────────────
  // Raw text while a numeric cell has focus, the model otherwise — the Smart
  // Proposal console's own buffer. Without it, clearing a field to retype it
  // parses as 0 and the row's total flickers to $0 mid-keystroke.
  const [field, setField] = useState<{ key: string; text: string } | null>(null);
  const cellValue = (key: string, n: number) => (field?.key === key ? field.text : String(n));
  const commitNumber = (id: string, k: "qty" | "price", raw: string) => {
    const v = Number(raw);
    ve.setLine(id, { [k]: Number.isFinite(v) && v >= 0 ? v : 0 });
    setField(null);
  };

  /** One ledger section: its own rows, its own Add, and its OWN change box —
   *  the split the Smart Proposal's estimate panel has. An instruction typed
   *  here is fenced to this section server-side (see the hook), and the review
   *  gate opens inside the section that asked rather than at the page foot, so
   *  a diff always belongs to something. */
  const ledger = (
    heading: string,
    group: LineGroup,
    rows: typeof ve.matLines,
    sectionTotal: number,
  ) => {
    const gateHere = ve.pending !== null && ve.pending.scope === group;
    const anyGate = ve.pending !== null;
    return (
      <section className={cx("vr-sec")} key={group}>
        <div className={cx("vr-sec-bar")}>
          <div className={cx("vr-sec-h")}>{heading}</div>
          <b className={cx("vr-sec-total")}>{money(sectionTotal)}</b>
        </div>

        <div className={cx("vr-thead")}>
          <span>Item</span>
          <span>Qty</span>
          <span>Price</span>
          <span>Total</span>
          <span />
        </div>

        {rows.length === 0 ? (
          <div className={cx("vr-none")}>No {heading.toLowerCase()} lines on this estimate.</div>
        ) : null}

        {rows.map((l) => (
          <div
            className={cx(
              "vr-row",
              l.badge === "Added" && "is-new",
              l.badge === "Updated" && "is-upd",
            )}
            key={l.id}
          >
            <input
              className={cx("vr-name")}
              value={l.name}
              placeholder="Line item"
              onChange={(e) => ve.setLine(l.id, { name: e.target.value })}
            />
            <span className={cx("vr-qty")}>
              <input
                className={cx("vr-in", "vr-in--qty")}
                inputMode="decimal"
                value={cellValue(`${l.id}:qty`, l.qty)}
                onFocus={() => setField({ key: `${l.id}:qty`, text: String(l.qty) })}
                onChange={(e) => setField({ key: `${l.id}:qty`, text: e.target.value })}
                onBlur={(e) => commitNumber(l.id, "qty", e.target.value)}
              />
              <input
                className={cx("vr-unit")}
                value={l.unit}
                list={`vr-units-${group}`}
                onChange={(e) => ve.setLine(l.id, { unit: e.target.value })}
              />
            </span>
            <input
              className={cx("vr-in")}
              inputMode="decimal"
              value={cellValue(`${l.id}:price`, l.price)}
              onFocus={() => setField({ key: `${l.id}:price`, text: String(l.price) })}
              onChange={(e) => setField({ key: `${l.id}:price`, text: e.target.value })}
              onBlur={(e) => commitNumber(l.id, "price", e.target.value)}
            />
            <span className={cx("vr-row-t")}>{money(lineTotal(l))}</span>
            <button
              className={cx("vr-row-x")}
              type="button"
              aria-label={`Remove ${l.name || "line"}`}
              onClick={() => ve.removeLine(l.id)}
            >
              <svg className={cx("ic")}>
                <use href="#i-x" />
              </svg>
            </button>
          </div>
        ))}

        <datalist id={`vr-units-${group}`}>
          {unitOptionsFor(group).map((u) => (
            <option value={u} key={u} />
          ))}
        </datalist>

        <button className={cx("vr-add")} type="button" onClick={() => ve.addLine(group)}>
          <svg className={cx("ic")}>
            <use href="#i-plus" />
          </svg>
          Add {heading.toLowerCase()} line
        </button>

        {/* This section's own change box. Hidden while ANY gate is open, so two
            sections can never have pending diffs at once. */}
        <div className={cx("vr-refine")} hidden={anyGate}>
          <input
            className={cx("vr-refine-in")}
            type="text"
            placeholder={`Change the ${heading.toLowerCase()}…`}
            value={ve.refineText}
            onChange={(e) => ve.setRefineText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ve.canRefine) void ve.applyRefine(group);
            }}
            disabled={ve.refineBusy}
          />
          <button
            className={cx("btn", "btn-ghost")}
            type="button"
            disabled={!ve.canRefine}
            onClick={() => void ve.applyRefine(group)}
          >
            {ve.refineBusy ? "Applying…" : "Apply"}
          </button>
        </div>

        <div className={cx("vr-review")} hidden={!gateHere}>
          <div className={cx("vr-review-h")}>Review &mdash; nothing applies until you confirm</div>
          <div className={cx("vr-diff")}>
            {ve.pending?.rows.map((r, i) => (
              <div
                className={cx(r.kind === "Added" ? "add" : r.kind === "Removed" ? "del" : "chg")}
                key={i}
              >
                {r.kind === "Added" ? "+" : r.kind === "Removed" ? "−" : "~"} {r.name} &middot;{" "}
                {r.detail}
              </div>
            ))}
            {ve.pending ? (
              <div className={cx("tot")}>
                Total {money(ve.pending.totalBefore)} &rarr; {money(ve.pending.totalAfter)}
              </div>
            ) : null}
          </div>
          {ve.pending && ve.pending.warnings.length > 0 ? (
            <ul className={cx("vr-warn")}>
              {ve.pending.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}
          <div className={cx("vr-review-a")}>
            <button className={cx("btn", "btn-primary")} type="button" onClick={ve.confirmRefine}>
              Confirm
            </button>
            <button className={cx("btn", "btn-ghost")} type="button" onClick={ve.discardRefine}>
              Discard
            </button>
          </div>
        </div>
      </section>
    );
  };

  return (
    <>
      <div className={cx("page-head", "rv")}>
        <div>
          <div className={cx("kicker")}>Automation</div>
          <h1 className={cx("page-title")}>Video estimator</h1>
        </div>
      </div>

      {/* ─── ЗАГОЛОВОЧНЫЙ СТЕК ─── */}
      <div className={cx("vt", "rv")} ref={intakeRef} hidden={ve.step === "result"}>
        {/* Просмотровый экран — the drop target */}
        <div
          className={cx("vt-screen", drag && "is-drag")}
          onDragEnter={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!drag) setDrag(true);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            setDrag(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            takeFiles(e.dataTransfer.files);
          }}
        >
          <span className={cx("vt-crop", "tl")}></span>
          <span className={cx("vt-crop", "tr")}></span>
          <span className={cx("vt-crop", "bl")}></span>
          <span className={cx("vt-crop", "br")}></span>

          <input
            ref={inputRef}
            type="file"
            accept={VIDEO_ACCEPT}
            hidden
            onChange={(e) => {
              takeFiles(e.target.files);
              // Picking the same file twice must fire again.
              e.target.value = "";
            }}
          />

          <div className={cx("vt-empty")} hidden={!!ve.file}>
            <button
              className={cx("vt-play")}
              type="button"
              aria-label="Add a walkthrough video"
              onClick={openPicker}
            >
              <svg className={cx("ic", "vt-play-ic")}>
                <use href="#i-video" />
              </svg>
            </button>
            <div className={cx("vt-empty-t")}>{drag ? "Drop to add" : "Drop a walkthrough"}</div>
            <div className={cx("vt-empty-m")}>MP4 / MOV &middot; up to 5 min &middot; say the measurements as you walk</div>
            <button className={cx("btn", "btn-primary", "vt-add")} type="button" onClick={openPicker}>
              <svg className={cx("ic")}>
                <use href="#i-plus" />
              </svg>
              Add video
            </button>
          </div>

          <div className={cx("vt-loaded")} hidden={!ve.file}>
            <div className={cx("vt-fileline")}>
              <svg className={cx("ic")}>
                <use href="#i-video" />
              </svg>
              <b>{ve.file?.name}</b>
              <span>{ve.fileMeta}</span>
              <button
                className={cx("vt-remove")}
                type="button"
                onClick={ve.removeFile}
                disabled={ve.busy}
              >
                Remove
              </button>
            </div>
            {ve.previewUrl ? (
              <video
                className={cx("vt-preview")}
                src={ve.previewUrl}
                controls
                muted
                playsInline
                preload="metadata"
              />
            ) : null}
            <div className={cx("vt-strip")}>
              {ve.stripFrames.length > 0
                ? ve.stripFrames.map((f) => (
                    <div className={cx("vt-cell")} key={f.t}>
                      {/* A data: URL the browser rendered a moment ago — next/image has nothing to optimise. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.dataUrl} alt="" />
                      <span>{fmtClock(f.t)}</span>
                    </div>
                  ))
                : [0, 1, 2, 3].map((i) => (
                    <div className={cx("vt-cell", "is-wait")} key={i}>
                      <span>
                        {ve.framesProgress
                          ? `${ve.framesProgress.done} / ${ve.framesProgress.total}`
                          : "…"}
                      </span>
                    </div>
                  ))}
            </div>
          </div>
        </div>

        {/* Титульный блок — чертёжный штамп */}
        <div className={cx("vt-tb")}>
          <div className={cx("vt-tb-head")}>
            <span>Job ticket</span>
            <span className={cx("vt-tb-no")}>&#8470; {ticketNo}</span>
          </div>

          <div className={cx("vt-cells")}>
            <label className={cx("vt-c", "vt-c--full")}>
              <span className={cx("vt-c-l")}>Project</span>
              <input
                className={cx("vt-c-in")}
                type="text"
                placeholder="Optional — read from the video if left blank"
                value={ve.job}
                onChange={(e) => ve.setJob(e.target.value)}
                disabled={ve.busy}
              />
            </label>
            <label className={cx("vt-c", "vt-c--full")}>
              <span className={cx("vt-c-l")}>Address</span>
              <input
                className={cx("vt-c-in")}
                type="text"
                placeholder="Street, city"
                value={ve.addr}
                onChange={(e) => ve.setAddr(e.target.value)}
                disabled={ve.busy}
              />
            </label>
            <div className={cx("vt-c")}>
              <span className={cx("vt-c-l")}>Date</span>
              <b className={cx("vt-c-v")}>{ve.today || " "}</b>
            </div>
            <div className={cx("vt-c")}>
              <span className={cx("vt-c-l")}>Source</span>
              <b className={cx("vt-c-v")}>{ve.sourceLabel}</b>
            </div>
            <label className={cx("vt-c", "vt-c--full")}>
              <span className={cx("vt-c-l")}>Notes</span>
              <textarea
                className={cx("vt-c-in", "vt-c-ta")}
                ref={notesRef}
                rows={1}
                placeholder="Optional — anything the camera can't tell: material, finish, what to leave out"
                value={ve.notes}
                onChange={(e) => ve.setNotes(e.target.value)}
                disabled={ve.busy}
              />
            </label>
          </div>

          <div className={cx("vt-tb-foot")}>
            <div className={cx("vt-prog")} hidden={!ve.stage}>
              <span className="vt-prog-dot"></span>
              <span>{ve.stageText}</span>
            </div>
            <div className={cx("vt-err")} hidden={!ve.error} role="alert">
              <span>{ve.error}</span>
              <button
                className={cx("vt-err-x")}
                type="button"
                aria-label="Dismiss"
                onClick={ve.dismissError}
              >
                <svg className={cx("ic")}>
                  <use href="#i-x" />
                </svg>
              </button>
            </div>
            <button
              className={cx("btn", "btn-primary", "vt-go")}
              type="button"
              disabled={!ve.canAnalyze}
              onClick={() => void ve.analyze()}
            >
              <svg className={cx("ic")}>
                <use href="#i-bulb" />
              </svg>
              Analyze video
            </button>
          </div>
        </div>
      </div>

      {/* ─── РЕЗУЛЬТАТ ─── */}
      <div className={cx("step-result")} ref={resultRef} hidden={ve.step !== "result"}>
        <section className={cx("card", "card--flush")}>
          <div className={cx("vr-mast")}>
            <div className={cx("vr-mast-min")}>
              <div className={cx("vr-mast-k")}>Video estimate &middot; ready</div>
              <h2 className={cx("vr-mast-t")}>{ve.title}</h2>
              <div className={cx("vr-mast-s")}>
                {ve.locationUsed || ve.addr.trim() || "Location not stated"} &middot; from{" "}
                {ve.probe ? fmtClock(ve.probe.duration) : "—"} walkthrough{audioNote}
              </div>
            </div>
            {conf !== null ? (
              <span className={cx("vr-conf", `vr-conf--${confidenceTone(conf)}`)}>
                Confidence {conf}%
              </span>
            ) : null}
          </div>

          <div className={cx("vr-grid")}>
            <div className={cx("vr-left")}>
              {ve.scope ? (
                <>
                  <div className={cx("vr-sec-h")}>Scope</div>
                  <p className={cx("vr-scope")}>{ve.scope}</p>
                </>
              ) : null}

              <div className={cx("vr-sec-h", ve.scope && "vr-sec-h--gap")}>Frames we read</div>
              <div className={cx("vr-frames")}>
                {ve.framesRead.map((f) => (
                  <div className={cx("vr-frame")} key={f.frame.t}>
                    <div className={cx("vr-frame-img")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.frame.dataUrl} alt={f.label} />
                      <span className={cx("vr-frame-tc")}>{fmtClock(f.frame.t)}</span>
                    </div>
                    <div className={cx("vr-frame-l")}>{f.label}</div>
                  </div>
                ))}
              </div>

              <div className={cx("vr-sec-h", "vr-sec-h--gap")}>Measured from video</div>
              {ve.analysis && ve.analysis.measurements.length > 0 ? (
                <div className={cx("vr-meas")}>
                  {ve.analysis.measurements.map((m, i) => (
                    <div className={cx("vr-m")} key={`${m.label}-${i}`}>
                      <span>{m.label}</span>
                      <b>
                        {m.value}
                        {m.unit ? ` ${m.unit}` : ""}
                      </b>
                      <i className={cx("vr-m-tag")} data-c={m.confidence}>
                        {m.source} &middot; {m.confidence}
                      </i>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={cx("vr-none")}>
                  Nothing measurable was said or visible — the estimate is priced on the scope
                  and assumptions.
                </div>
              )}

              {ve.analysis && ve.analysis.observations.length > 0 ? (
                <>
                  <div className={cx("vr-sec-h", "vr-sec-h--gap")}>Site notes</div>
                  <ul className={cx("vr-notes")}>
                    {ve.analysis.observations.map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                </>
              ) : null}

              {ve.assumptions.length > 0 ? (
                <>
                  <div className={cx("vr-sec-h", "vr-sec-h--gap")}>Assumptions</div>
                  <ul className={cx("vr-notes", "vr-notes--assume")}>
                    {ve.assumptions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>

            <div className={cx("vr-right")}>
              {ledger("Materials", "materials", ve.matLines, ve.totals.materials)}
              {ledger("Labor", "labor", ve.labLines, ve.totals.labor)}

              {ve.totals.discountCash > 0 ? (
                <div className={cx("vr-line")}>
                  <b>Discount</b>
                  <span>&minus;{money(ve.totals.discountCash)}</span>
                </div>
              ) : null}
              <div className={cx("vr-total")}>
                <span>Total</span>
                <b>{money(ve.totals.total)}</b>
              </div>
            </div>
          </div>

          {/* MATERIALS REQUEST — the shoppable list, DERIVED from the ledger
              rather than mirrored from it, exactly as the Smart Proposal's is.
              Editing a quantity above moves its buy quantity here; deleting a
              line removes its row. Nothing to keep in sync, because there is no
              second copy. */}
          <div className={cx("vr-req")}>
            <div className={cx("vr-req-head")}>
              <div className={cx("vr-sec-h")}>Materials request</div>
              <span className={cx("vr-req-count")}>
                {ve.reqRows.length} {ve.reqRows.length === 1 ? "item" : "items"}
              </span>
            </div>
            <div>
              {ve.reqRows.map((r) => {
                // merchantUrl is the render-time guard: it rejects Google
                // interstitials and model-fabricated retailer paths and swaps
                // them for the store's own search. Null means there is nowhere
                // real to send the contractor, so no button is drawn.
                const buy = merchantUrl(
                  r.store,
                  [r.name, r.dimensions].filter(Boolean).join(" "),
                  r.productUrl,
                );
                return (
                  <div className={cx("vr-req-row")} key={r.id}>
                    <span className={cx("vr-thumb")}>
                      <MaterialThumb src={r.imageUrl ?? null} alt="" />
                    </span>
                    <span className={cx("vr-req-main")}>
                      <span className={cx("vr-req-n")}>{r.name || "Untitled line"}</span>
                      <span className={cx("vr-req-m")}>
                        {r.dimensions ? <span>{r.dimensions}</span> : null}
                        <span>
                          Qty {r.qty} {r.unit}
                        </span>
                        {r.store ? (
                          <span className={cx("vr-store")}>{r.store}</span>
                        ) : (
                          <span className={cx("vr-store", "vr-store--none")}>No retail source</span>
                        )}
                      </span>
                    </span>
                    <span className={cx("vr-req-price")}>
                      <b>{money(r.total)}</b>
                      <span>
                        {/* The retail price is what the store charges and never
                            follows a typed price — the override rides beside it
                            in parentheses instead of replacing it. */}
                        {r.retailUnitPrice != null
                          ? `${money(r.retailUnitPrice)} / ${r.unit}`
                          : `${money(r.unitPrice)} / ${r.unit}`}
                        {r.overridden ? (
                          <i className={cx("vr-req-ov")}> (billed {money(r.unitPrice)})</i>
                        ) : null}
                      </span>
                    </span>
                    {buy ? (
                      <a
                        className={cx("vr-req-link")}
                        href={buy}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Buy ${r.name || "this item"}${r.store ? ` at ${r.store}` : ""}`}
                      >
                        <svg className={cx("ic")}>
                          <use href="#i-arrow" />
                        </svg>
                      </a>
                    ) : null}
                  </div>
                );
              })}
              {ve.reqRows.length === 0 ? (
                <div className={cx("vr-none")}>No materials on this estimate.</div>
              ) : null}
            </div>
            <div className={cx("vr-reqtotal")}>
              <span>Total material cost</span>
              <b>{money(ve.reqTotal)}</b>
            </div>
          </div>

          <div className={cx("vr-bar")}>
            <button
              className={cx("btn", "btn-danger")}
              type="button"
              onClick={ve.startOver}
              disabled={locked}
            >
              Start over
            </button>
            <div className={cx("vr-bar-r")}>
              {/* No "Save estimate" button (owner, 2026-08-22): Convert already
                  writes the AiEstimate row before it creates the proposal, so a
                  separate save was a second name for a step that always
                  happened anyway. `ve.save` stays on the hook — Convert calls
                  it. */}
              <button
                className={cx("btn", "btn-primary")}
                type="button"
                onClick={() => void ve.convert()}
                disabled={locked || ve.lines.length === 0}
              >
                <svg className={cx("ic")}>
                  <use href="#i-arrow" />
                </svg>
                {ve.saveState === "opening"
                  ? "Opening…"
                  : ve.saveState === "saving"
                    ? "Saving…"
                    : "Convert to proposal"}
              </button>
            </div>
          </div>
        </section>
      </div>

      {ve.clarify ? <ClarifyDialog questions={ve.clarify} onSettle={ve.settleClarify} cx={cx} /> : null}
    </>
  );
}
