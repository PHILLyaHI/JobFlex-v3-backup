"use client";

// MANUAL PROPOSAL / BLUEPRINT — card 11, "The PDF".
//
// Card 10 is the client's copy as a SCREEN. This is the same proposal as a
// DOCUMENT: a real sheet of paper at true trim size, with the structure a
// contract needs and a screen does not — numbered sections, a letterhead that
// repeats, a footer that identifies the sheet if a page is separated from the
// rest, and an acceptance block at the end.
//
// ── WHY PRINT CSS AND NOT A PDF LIBRARY ──────────────────────
// The file the client receives is produced by the browser's own print engine
// (Save as PDF). Three things follow from that, and all three are the reason:
// the text stays VECTOR and selectable (a canvas rasteriser produces a picture
// of a proposal, which cannot be searched, copied or read by a screen reader);
// the document is styled in the same token system as every other blueprint
// page, so a theme change reaches the paper for free; and there is no second
// layout language to keep in sync with this one. The whole document below is
// the same HTML in both media — only the page furniture changes behaviour.
//
// ── THE STRUCTURE, AND WHY IT IS IN THIS ORDER ───────────────
// A proposal is read in a fixed sequence by someone deciding whether to sign:
// who is this for → what will be done → what it costs → when it is paid → what
// the rules are → sign here. Every section below is one of those questions and
// they appear in that order. Sections are NUMBERED, and the numbers are
// computed rather than typed, because a proposal that omits its scope must not
// print "3. TOTALS" after "1. PREPARED FOR" — a gap in the numbering reads to a
// client as a page that went missing.
//
// Sections are also the atomic unit of pagination: each one carries
// `break-inside: avoid`, so a section that will not fit in what is left of a
// page moves to the next page WHOLE rather than being cut at an arbitrary
// line. The single exception is the one the property makes for itself — a
// section taller than a page cannot be moved anywhere it would fit, so it
// flows, breaking at a row (pricing, payments, attachments) or between lines
// of prose (scope, terms), and never mid-row.
//
// ── WHAT THIS PRINTS THAT CARD 10 DOES NOT ───────────────────
// The payment schedule, the attachment list and the project overview. All three
// exist in the builder (cards 01, 08, 09) and all three are things the client
// is entitled to have in writing. Card 10 is a preview of the PRICE; this is
// the whole agreement. Everything the two DO share is rendered from the same
// classes and the same `totals`, so the figure on the screen and the figure on
// the paper cannot drift.
//
// ── THE HONEST LIMITS ────────────────────────────────────────
// · "≈ N pages" packs the measured blocks under the same rule the print layer
//   gives the browser (a section that does not fit moves whole; one taller
//   than a page flows), so it agrees with the file in every case measured. It
//   keeps the ≈ because the measurement is taken from the PREVIEW, which the
//   shell's fluid-scale zoom lays out at a fraction of 1 while the paper is
//   always at zoom 1 — a line that wraps on screen can hold on the sheet.
// · "Page 1 of 3" is not achievable in print CSS — `counter(page)` only works
//   inside @page margin boxes, which Chrome does not implement. The footer
//   therefore carries the identifiers that DO survive a separated page (the
//   reference number, the client and the expiry) and the card says plainly that
//   page numbers come from the browser's own header/footer option.

import { useEffect, useRef, useState } from "react";
import type {
  Installment,
  ProposalOptions,
  StagedFile,
  Totals,
} from "../manual-focus/manual-focus-types";
import {
  UNIT_LABEL,
  fileSize,
  installmentValue,
  money,
  pct,
  qty,
} from "../manual-focus/manual-focus-math";
// The five fixtures that used to sit here — ORG_NAME, ORG_LINE, PROPOSAL_NO,
// PROPOSAL_DATE, VALID_DAYS — are gone. Who is sending this, under what
// reference and until when are facts about a REAL org and a REAL row, so they
// arrive as `doc.identity`, read on the server. See manual-blueprint-bridge.ts.
import type { SheetIdentity } from "./manual-blueprint-bridge";
import styles from "./manual-blueprint.module.css";
import { Btn, Segmented, ToggleCell, cx } from "./bp-ui";

/* ============================================================
   SETUP — the four decisions that belong to the DOCUMENT
   ============================================================ */

export type PaperSize = "letter" | "a4";

/**
 * Deliberately NOT merged into `ProposalOptions`.
 *
 * That type is shared with four other card-lab variants and describes what the
 * client's copy SAYS. These four describe how the paper is built, which is a
 * different question with a different owner — and this variant does not get to
 * widen a shared type on the way to answering it.
 */
export type PdfSetup = {
  paper: PaperSize;
  /** A first page carrying the title, the client and the total, and nothing
   *  else. Off by default: it is a page of paper that says what page two
   *  already says, and it earns its place only on large jobs. */
  cover: boolean;
  /** The org band at the head of every page. */
  letterhead: boolean;
  /** The identifying strip at the foot of every page. */
  footer: boolean;
};

export const DEFAULT_PDF_SETUP: PdfSetup = {
  paper: "letter",
  cover: false,
  letterhead: true,
  footer: true,
};

/** Trim sizes in CSS px (96/in), and the page box that prints inside them. */
const PAPER: Record<PaperSize, { label: string; css: string; w: number; h: number }> = {
  letter: { label: "US Letter", css: "Letter", w: 816, h: 1056 },
  a4: { label: "A4", css: "A4", w: 794, h: 1123 },
};

/** CSS px per millimetre at 96/in — the document is measured in px and the
 *  page box is specified in mm, and one of the two has to convert. */
const MM = 96 / 25.4;

/** THE PAGE BOX, IN ONE PLACE — the paper's own white edge, written into the
 *  @page rule below and used by the length estimate, so the estimate cannot
 *  drift from the paper it is estimating. */
const TRIM_MM = { top: 20, side: 16, bottom: 18 };

/** The two running bands cost their height on EVERY sheet, not once: they are
 *  a repeating <thead>/<tfoot> (see the note on the document), so the usable
 *  text height of every page is the page box less whichever bands are on.
 *  Measured from the rendered bands at true trim width. */
const RUNHEAD_H = 48;
const RUNFOOT_H = 53;

type DocProps = {
  /** Sender, reference, date and expiry — see SheetIdentity. */
  identity: SheetIdentity;
  title: string;
  clientName: string;
  email: string;
  phone: string;
  address: string;
  projectName: string;
  description: string;
  scopeOfWork: string;
  terms: string;
  taxPct: number;
  options: ProposalOptions;
  totals: Totals;
  installments: Installment[];
  files: StagedFile[];
  setup: PdfSetup;
};

/* ============================================================
   11 — THE CARD FACE
   A drawing's title block: the four facts about the sheet, ruled
   into four cells, mono, before any control. You should be able
   to answer "what am I about to send?" without opening anything.
   ============================================================ */

/** The zoom ladder, in the order the buttons step through it. Ratios rather
 *  than a linear range: 0.6 → 0.8 → 1 → 1.25… is how every document viewer
 *  steps, because each press should be a visible change at any starting point,
 *  and a fixed +0.1 is a big jump at 0.5 and an invisible one at 2. */
const ZOOM_STOPS = [0.5, 0.65, 0.8, 1, 1.25, 1.5, 2, 3] as const;
const ZOOM_FIT = 3; // index of 1 — "actual size"

export function PdfBlock({
  setup,
  onPatch,
  doc,
}: {
  setup: PdfSetup;
  onPatch: (patch: Partial<PdfSetup>) => void;
  doc: Omit<DocProps, "setup">;
}) {
  const [open, setOpen] = useState(false);
  const [zoomAt, setZoomAt] = useState(ZOOM_FIT);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const flowRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // The page estimate measures the REAL flow, at real paper width, whether or
  // not the preview is open — the vault clips the sheet but does not stop it
  // laying out, which is the whole reason it clips instead of unmounting.
  //
  // It measures the BLOCKS, not the total. Dividing one tall column by the
  // page height answers "how much paper is this", which stopped being the
  // question when the sheet started moving whole sections to the next page
  // rather than cutting them: a proposal whose sections happen to land badly
  // is genuinely longer than its own height, and an estimate that cannot see
  // that reads one page short exactly when the contractor is deciding whether
  // to trim something.
  useEffect(() => {
    const el = flowRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      // `offsetHeight`, NOT getBoundingClientRect: the overlay scales the sheet
      // with a CSS transform, and a bounding rect is the VISUAL box — at 200%
      // zoom it would report twice the height and the card would claim the
      // proposal had doubled in length. offsetHeight is the layout box, which
      // is what a page count is a function of.
      //
      // The margin above each block is kept SEPARATE from its height, because
      // the two are not worth the same on paper: a margin at the top of a new
      // page is truncated by the fragmenter and costs nothing, which is worth
      // roughly one section's height across a long proposal. It is read from
      // the computed style rather than hard-coded so the stylesheet stays the
      // one place the rhythm is set.
      const next = Array.from(el.children).map((node) => {
        const n = node as HTMLElement;
        return { h: n.offsetHeight, mt: parseFloat(getComputedStyle(n).marginTop) || 0 };
      });
      // Read OUTSIDE the updater: a DOM read inside one runs twice under
      // StrictMode.
      setBlocks((prev) =>
        prev.length === next.length && prev.every((v, i) => v.h === next[i].h && v.mt === next[i].mt)
          ? prev
          : next,
      );
    };
    const ro = new ResizeObserver(measure);
    // Every block is watched, not just the flow: the flow's own height changes
    // for a hundred reasons, and what the estimate needs is which BLOCK grew.
    const watch = () => {
      ro.disconnect();
      ro.observe(el);
      Array.from(el.children).forEach((n) => ro.observe(n));
    };
    watch();
    // Sections come and go with the proposal — a section appears the moment
    // terms are typed — and a new child is not a resize of anything already
    // observed, so the list is re-watched when it changes rather than the
    // effect being re-run on every render of a doc object that is new each
    // time regardless of whether the document is.
    const mo = new MutationObserver(watch);
    mo.observe(el, { childList: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  // ESCAPE, and the scroll lock. Both belong to the overlay being open and both
  // have to be undone by the same effect that set them — a preview that leaves
  // `overflow: hidden` on the body after it closes has broken the whole page.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    // The close button is the one control that is always present, so it is
    // where focus goes — landing on <body> inside an open dialog is the same
    // bug the client picker fixed on card 01.
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const paper = PAPER[setup.paper];
  const usable =
    paper.h -
    (TRIM_MM.top + TRIM_MM.bottom) * MM -
    (setup.letterhead ? RUNHEAD_H : 0) -
    (setup.footer ? RUNFOOT_H : 0);
  const bodyPages = fitPages(blocks, usable);
  const pages = bodyPages > 0 ? bodyPages + (setup.cover ? 1 : 0) : 0;
  const count = sectionCount(doc);

  const zoom = ZOOM_STOPS[zoomAt] ?? 1;
  const stepZoom = (dir: 1 | -1) =>
    setZoomAt((at) => Math.min(ZOOM_STOPS.length - 1, Math.max(0, at + dir)));

  /** Chrome names the saved file from `document.title`. Setting it for the
   *  duration of the print is the difference between the client receiving
   *  "MC-2041 Roof replacement.pdf" and "JobFlex · Manual proposal.pdf". */
  const download = () => {
    const prev = document.title;
    const stem = [doc.identity.ref, doc.title.trim() || "Proposal"].join(" ");
    document.title = stem.replace(/[\\/:*?"<>|]+/g, "-");
    const restore = () => {
      document.title = prev;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  return (
    <div className={styles.pdfBlock}>
      {/* @page cannot be scoped to a class, so the one rule that has to follow
          the paper control is written as a real stylesheet. Keyed on the whole
          page box — paper AND the two bands, since each band widens a margin —
          so React replaces the rule rather than appending a second. */}
      <style key={setup.paper}>
        {`@page { size: ${paper.css} portrait; margin: ${TRIM_MM.top}mm ${TRIM_MM.side}mm ${TRIM_MM.bottom}mm; }`}
      </style>

      <div className={styles.pdfSpec}>
        <SpecCell label="Paper" value={paper.label} />
        <SpecCell label="Orient" value="Portrait" />
        <SpecCell label="Length" value={pages > 0 ? `≈ ${pages} ${pages === 1 ? "page" : "pages"}` : "—"} />
        <SpecCell label="Sections" value={String(count)} />
      </div>

      <div className={styles.toggles}>
        <Segmented<PaperSize>
          label="Paper size"
          value={setup.paper}
          options={[
            { value: "letter", label: "Letter" },
            { value: "a4", label: "A4" },
          ]}
          onChange={(v) => onPatch({ paper: v })}
        />
        {/* The same three-cell row as card 06, for the same reason: three
            independent yes/no facts about one sheet, scanned in one sweep. */}
        <div className={styles.switchRow}>
          <ToggleCell
            label="Cover page"
            on={setup.cover}
            onChange={(on) => onPatch({ cover: on })}
          />
          <ToggleCell
            label="Letterhead every page"
            on={setup.letterhead}
            onChange={(on) => onPatch({ letterhead: on })}
          />
          <ToggleCell
            label="Footer every page"
            on={setup.footer}
            onChange={(on) => onPatch({ footer: on })}
          />
        </div>
      </div>

      <div className={styles.pdfActions}>
        <Btn icon="file" onClick={() => setOpen(true)}>
          Preview the sheet
        </Btn>
        <Btn tone="primary" icon="download" onClick={download}>
          Download PDF
        </Btn>
      </div>

      {/* THE VAULT, WHICH IS ALSO THE VIEWER.
          Closed, it is clipped — not unmounted and not `display: none`, because
          the page estimate needs a laid-out document and the print layer needs
          one that is still in the DOM when the preview is shut.

          Open, the SAME element becomes a full-screen overlay. One instance of
          the document, in both states: a second copy rendered only for the
          modal would be a second thing to keep in agreement with the paper, and
          the measured flow would be whichever of the two happened to hold the
          ref. */}
      <div
        className={cx(styles.pdfVault, open && styles.pdfVaultOpen)}
        aria-hidden={!open}
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? "Proposal PDF preview" : undefined}
      >
        {open ? (
          <div className={styles.pdfBar}>
            <span className={styles.pdfBarTitle}>
              {doc.identity.ref}
              <span className={styles.pdfBarSep}>·</span>
              {paper.label}
              <span className={styles.pdfBarSep}>·</span>
              {pages > 0 ? `≈ ${pages} ${pages === 1 ? "page" : "pages"}` : "—"}
            </span>

            <div className={styles.pdfZoom}>
              <button
                type="button"
                className={styles.pdfZoomBtn}
                aria-label="Zoom out"
                disabled={zoomAt === 0}
                onClick={() => stepZoom(-1)}
              >
                −
              </button>
              {/* The readout is a BUTTON: the percentage is also the way back to
                  100%, which is the one zoom level anybody ever wants to return
                  to, and a viewer that can only step there is a viewer you have
                  to click four times. */}
              <button
                type="button"
                className={styles.pdfZoomNow}
                aria-label={`Zoom, ${Math.round(zoom * 100)} percent. Reset to actual size`}
                onClick={() => setZoomAt(ZOOM_FIT)}
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                className={styles.pdfZoomBtn}
                aria-label="Zoom in"
                disabled={zoomAt === ZOOM_STOPS.length - 1}
                onClick={() => stepZoom(1)}
              >
                +
              </button>
            </div>

            <button
              ref={closeRef}
              type="button"
              className={styles.pdfClose}
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        ) : null}

        {/* `--pdf-zoom` scales the sheet at the STAGE, not on the sheet itself:
            a transform creates a containing block, and scaling the article
            would take the print layer's `position: fixed` page furniture with
            it. The stage is screen-only scenery, so it is safe to transform. */}
        <div
          className={styles.pdfStage}
          style={{ "--pdf-zoom": open ? zoom : 1 } as React.CSSProperties}
        >
          <PdfDocument {...doc} setup={setup} flowRef={flowRef} />
        </div>
      </div>
    </div>
  );
}

/** One block of the flow — the document head, then one per section — with the
 *  space above it kept apart from its own height. */
type Block = { h: number; mt: number };

/**
 * The page count, under the rule the printed sheet actually follows.
 *
 * It is the same rule stated twice — once to the browser as `break-inside`,
 * once here as arithmetic — because there is no way to ask a browser how many
 * pages something WILL be without printing it. The two are kept adjacent in
 * the comments for that reason: change one and the other is wrong.
 *
 *   · a block that does not fit in what is left of the page moves whole;
 *   · a block taller than a whole page is the exception, and flows;
 *   · a block that opens a page loses the margin above it, as the fragmenter
 *     truncates it — so it is charged for its height and nothing else.
 */
function fitPages(blocks: Block[], usable: number): number {
  if (usable <= 0 || blocks.length === 0) return 0;
  let pages = 1;
  let used = 0;
  for (const b of blocks) {
    if (used > 0 && used + b.mt + b.h > usable) {
      pages += 1;
      used = 0;
    }
    const cost = used > 0 ? b.mt + b.h : b.h;
    if (used + cost <= usable) {
      used += cost;
      continue;
    }
    // Taller than the page it starts on: it breaks, and what is left of it
    // decides how many further sheets it costs.
    const rest = cost - (usable - used);
    const extra = Math.ceil(rest / usable);
    pages += extra;
    used = rest - (extra - 1) * usable;
  }
  return pages;
}

function SpecCell({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.pdfSpecCell}>
      <span className={styles.pdfSpecLabel}>{label}</span>
      <span className={styles.pdfSpecValue}>{value}</span>
    </div>
  );
}

/* ============================================================
   THE DOCUMENT
   ============================================================ */

export function PdfDocument({
  identity,
  title,
  clientName,
  email,
  phone,
  address,
  projectName,
  description,
  scopeOfWork,
  terms,
  taxPct,
  options,
  totals,
  installments,
  files,
  setup,
  flowRef,
}: DocProps & { flowRef?: React.RefObject<HTMLDivElement | null> }) {
  const paper = PAPER[setup.paper];
  const jobTitle = title.trim() || "Untitled proposal";
  const client = clientName.trim() || "No client yet";
  const sections = buildSections({
    identity,
    title,
    clientName,
    email,
    phone,
    address,
    projectName,
    description,
    scopeOfWork,
    terms,
    taxPct,
    options,
    totals,
    installments,
    files,
    setup,
  });

  return (
    <article
      className={styles.pdfSheet}
      style={{ "--pdf-w": `${paper.w}px` } as React.CSSProperties}
      aria-label="Proposal PDF"
    >
      {/* ── THE PAGED FRAME ──────────────────────────────────────────
          A REAL TABLE, and the only reason is the one thing print CSS has no
          other way to say: repeat this band at the head of every sheet AND
          reserve its height in the text area of every sheet.

          `position: fixed` repeats a band, but a fixed box is out of flow, so
          nothing below it moves — it printed the letterhead straight through
          the opening lines of page two onward, and the padding that cleared it
          on page one could not reach page two, because padding belongs to a
          box and pages are not boxes. Negative offsets into the page margin do
          not help either: a fixed box that overflows the top of its page area
          is painted on the PREVIOUS sheet (measured, not assumed).
          `display: table-header-group` on a div is ignored by Chrome for
          repetition — also measured. A real <thead> is repeated, reserves its
          own space, and the section-level `break-inside: avoid` below keeps
          working inside the cell. That is the whole justification; the table
          carries no data and is marked `presentation` so it carries no
          meaning either. */}
      <table className={styles.pdfPaged} role="presentation">
        {setup.letterhead ? (
          <thead>
            <tr>
              <td>
                <header className={styles.pdfRunHead}>
                  <div>
                    <div className={styles.pdfHeadOrg}>{identity.orgName}</div>
                    {identity.orgLine ? (
                      <div className={styles.pdfHeadLine}>{identity.orgLine}</div>
                    ) : null}
                  </div>
                  <div className={styles.pdfHeadRef}>
                    {identity.ref}
                    <br />
                    {identity.date}
                  </div>
                </header>
              </td>
            </tr>
          </thead>
        ) : null}

        <tbody>
          <tr>
            <td>
      <div className={cx(styles.pdfFlow, setup.letterhead && styles.pdfFlowHead, setup.footer && styles.pdfFlowFoot)}>
        {setup.cover ? (
          <section className={styles.pdfCover}>
            <div className={styles.pdfCoverKicker}>Proposal {identity.ref}</div>
            <h1 className={styles.pdfCoverTitle}>{jobTitle}</h1>
            <div className={styles.pdfCoverFor}>
              Prepared for {client}
              {address ? (
                <>
                  <br />
                  {address}
                </>
              ) : null}
            </div>
            <div className={styles.pdfCoverTotal}>
              <span className={styles.pdfCoverTotalLabel}>Total</span>
              <span className={styles.pdfCoverTotalValue}>{money(totals.total)}</span>
            </div>
            <div className={styles.pdfCoverMeta}>
              {identity.orgName} · {identity.date} · valid until {identity.validUntil}
            </div>
          </section>
        ) : null}

        {/* The measured element is the FLOW's inner stack, so the estimate is
            of the pages that actually flow — the cover is added separately
            because it is one page by construction. */}
        <div ref={flowRef} className={styles.pdfBody}>
          <div className={styles.pdfDocHead}>
            <h2 className={styles.pdfDocTitle}>{jobTitle}</h2>
            <div className={styles.pdfDocSub}>
              Proposal {identity.ref} · {identity.date} · valid until {identity.validUntil}
            </div>
          </div>

          {sections.map((s, i) => (
            <section key={s.key} className={styles.pdfSection}>
              <div className={styles.pdfSecHead}>
                <span className={styles.pdfSecNum}>{String(i + 1).padStart(2, "0")}</span>
                <h3 className={styles.pdfSecTitle}>{s.title}</h3>
              </div>
              {s.body}
            </section>
          ))}
        </div>
      </div>
            </td>
          </tr>
        </tbody>

        {setup.footer ? (
          <tfoot>
            <tr>
              <td>
                <footer className={styles.pdfRunFoot}>
                  <span>
                    {identity.ref} · {client}
                  </span>
                  <span>Valid until {identity.validUntil} · {identity.orgName}</span>
                </footer>
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </article>
  );
}

/* ============================================================
   THE SECTIONS
   Built as a list so the numbering is a consequence of what is
   actually present. `sectionCount` is the same list, counted —
   never a second hand-kept number.
   ============================================================ */

type Section = { key: string; title: string; body: React.ReactNode };

function sectionCount(doc: Omit<DocProps, "setup">): number {
  return buildSections({ ...doc, setup: DEFAULT_PDF_SETUP }).length;
}

function buildSections(d: DocProps): Section[] {
  const out: Section[] = [];

  out.push({
    key: "parties",
    title: "Prepared for",
    body: (
      <div className={styles.pdfMeta}>
        <MetaPair label="Client" value={d.clientName.trim() || "—"} />
        <MetaPair label="Job address" value={d.address.trim() || "—"} />
        <MetaPair label="Email" value={d.email.trim() || "—"} />
        <MetaPair label="Phone" value={d.phone.trim() || "—"} />
        <MetaPair label="Project" value={d.projectName || "—"} />
        <MetaPair label="Prepared by" value={d.identity.orgName} />
      </div>
    ),
  });

  if (d.description.trim()) {
    out.push({
      key: "overview",
      title: "Project overview",
      body: <p className={styles.pdfProse}>{d.description}</p>,
    });
  }

  if (d.options.showScope && d.scopeOfWork.trim()) {
    out.push({
      key: "scope",
      title: "Scope of work",
      body: <p className={styles.pdfProse}>{d.scopeOfWork}</p>,
    });
  }

  out.push({
    key: "pricing",
    title: "Schedule of work & pricing",
    // The card-10 classes, deliberately. Two sets of row styles for one priced
    // column is how the screen and the paper start disagreeing.
    body: d.options.laborOnly ? (
      <div className={cx(styles.printRow, styles.printFirst)}>
        <span className={styles.printName}>Complete scope of work as described</span>
        <span className={styles.printAmt}>{money(d.totals.preTax)}</span>
      </div>
    ) : d.totals.printed.length === 0 ? (
      <div className={styles.empty}>No named lines yet — nothing prints.</div>
    ) : (
      d.totals.printed.map((row, i) => (
        <div key={row.id} className={cx(styles.printRow, i === 0 && styles.printFirst)}>
          <span>
            <span className={styles.printName}>{row.name}</span>
            {row.description ? <span className={styles.printSub}>{row.description}</span> : null}
            {!d.options.hideBreakdown ? (
              <span className={styles.printSub}>
                {qty(row.quantity)} {UNIT_LABEL[row.unit]} · {money(row.unitPrice)} each
              </span>
            ) : null}
          </span>
          <span className={styles.printAmt}>{money(row.amount)}</span>
        </div>
      ))
    ),
  });

  out.push({
    key: "totals",
    title: "Totals",
    body: (
      <>
        <div className={styles.sumRow}>
          <span className={styles.sumLabel}>Subtotal</span>
          <span className={styles.sumValue}>{money(d.totals.preTax)}</span>
        </div>
        {/* Printed only when it is worth something. A "Discount $0.00" row on a
            client's copy invites the question it answers. */}
        {d.totals.discountAmount > 0 ? (
          <div className={styles.sumRow}>
            <span className={styles.sumLabel}>Discount</span>
            <span className={styles.sumValue}>−{money(d.totals.discountAmount)}</span>
          </div>
        ) : null}
        <div className={styles.sumRow}>
          <span className={styles.sumLabel}>Tax · {pct(d.taxPct)}</span>
          <span className={styles.sumValue}>{money(d.totals.tax)}</span>
        </div>
        <div className={cx(styles.sumRow, styles.sumTotal)}>
          <span className={styles.sumTotalLabel}>Total</span>
          <span className={styles.sumTotalValue}>{money(d.totals.total)}</span>
        </div>
      </>
    ),
  });

  if (d.installments.length > 0) {
    out.push({
      key: "pay",
      title: "Payment schedule",
      body: (
        <>
          {d.installments.map((inst, i) => (
            <div key={inst.id} className={cx(styles.pdfPayRow, i === 0 && styles.printFirst)}>
              <span className={styles.printName}>{inst.label.trim() || "Unnamed payment"}</span>
              <span className={styles.pdfPayShare}>
                {inst.isPercent ? `${inst.amount}% of total` : "Fixed amount"}
              </span>
              <span className={styles.printAmt}>
                {money(installmentValue(inst, d.totals.total))}
              </span>
            </div>
          ))}
          <p className={styles.pdfFine}>
            Amounts are calculated from the total above. Any balance not covered by the
            schedule is due on completion.
          </p>
        </>
      ),
    });
  }

  if (d.terms.trim()) {
    out.push({
      key: "terms",
      title: "Terms & conditions",
      body: <p className={styles.pdfProse}>{d.terms}</p>,
    });
  }

  if (d.options.showSignature) {
    out.push({
      key: "accept",
      title: "Acceptance",
      body: (
        <>
          <p className={styles.pdfProse}>
            Signing below accepts this proposal, its scope, its price of{" "}
            {money(d.totals.total)} and the terms above. This offer stands until{" "}
            {d.identity.validUntil}.
          </p>
          <div className={styles.signRow}>
            <div className={styles.signLine}>Client signature</div>
            <div className={styles.signLine}>Date</div>
          </div>
          <div className={styles.signRow}>
            <div className={styles.signLine}>For {d.identity.orgName}</div>
            <div className={styles.signLine}>Date</div>
          </div>
        </>
      ),
    });
  }

  if (d.files.length > 0) {
    out.push({
      key: "files",
      title: "Attachments",
      body: (
        <>
          {d.files.map((f, i) => (
            <div key={f.id} className={cx(styles.pdfFileRow, i === 0 && styles.printFirst)}>
              <span className={styles.printName}>{f.name}</span>
              <span className={styles.printAmt}>{fileSize(f.size)}</span>
            </div>
          ))}
          {/* The list is a manifest, not the files. Saying so on the paper is
              the difference between a client waiting for a page that is not
              coming and one who knows to look in the email. */}
          <p className={styles.pdfFine}>
            Listed for reference — the files themselves are sent alongside this document.
          </p>
        </>
      ),
    });
  }

  return out;
}

function MetaPair({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.pdfMetaPair}>
      <span className={styles.pdfMetaLabel}>{label}</span>
      <span className={styles.pdfMetaValue}>{value}</span>
    </div>
  );
}
