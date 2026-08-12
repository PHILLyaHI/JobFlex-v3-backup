// Advanced AI (Smart Proposal) blueprint — runtime behaviors, ported verbatim
// from the donor file's <script> (jobflex-smart-proposal-blueprint_4.html).
// Every duration, easing, stagger, interval, formula and generated HTML string
// is the donor's exact value. Adaptations are mechanical only:
// - queries are scoped to the mounted `.content` root;
// - document/window listeners, timers and observers are tracked for unmount
//   cleanup;
// - the donor's chrome modules (matchMedia polyfill, mobile nav drawer, FLUID
//   SCALE, the sidebar entry cascade, the sliding active indicator and the
//   graph-paper parallax) are NOT ported here — the shared shell
//   (components/v3/blueprint-shell/shell-behavior.ts) already owns all of them;
// - the donor's `safe(name, fn)` try/catch wrapper is dropped: the modules it
//   guarded are either shell-owned or replaced by strict null checks below;
// - `undefined + string` concatenations the donor relies on are written as
//   `String(x) + …`, which produces the byte-identical result under TypeScript.
//
// THE ESTIMATOR IS NO LONGER THE DONOR'S FIXTURE. The donor's "Generate
// estimate" was a 620ms ticker that walked four strings and then dealt a
// hardcoded fixture into the studio; its "Apply changes" invented four deltas
// about lines named `m1`/`l3`; its "Convert to proposal" swapped the button
// label for 1.8s and wrote nothing. All four flows now run the real server
// actions the old estimator used:
//
//   analyzeEstimatePrompt      the intake gate that decides whether to ask
//                              clarifying questions (dialog restored below)
//   generateAdvancedEstimate   the estimate itself
//   refineAdvancedEstimate     the plain-English edit, reviewed as an EXACT
//                              diff (computed by the old page's own
//                              refine-diff module) before anything applies
//   convertEstimateToProposal  writes a real DRAFT Proposal + LineItems and
//                              navigates to it
//
// Still the donor's fixture: the project-type list and the four sample briefs.

import { attachPlacesSuggest } from "@/components/v3/blueprint-shell/places-suggest";
import { closeMdl, openMdl } from "@/components/v3/blueprint-shell/mdl-motion";
import { leaveRow, staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import {
  analyzeEstimatePrompt,
  convertEstimateToProposal,
  generateAdvancedEstimate,
  refineAdvancedEstimate,
} from "@/actions/advancedEstimator";
import type {
  ClarifyQuestion,
  EstimateDiscount,
  GeneratedEstimate,
} from "@/lib/estimatorSchema";
import type { EstimateLine } from "@/components/estimator/EstimatorBreakdown";
import { diffEstimate } from "@/app/(dashboard)/dashboard/advanced-ai/refine-diff";
import { applyMarkup } from "@/lib/pricing/markup";
import { money as fmtMoney } from "@/lib/format";
import { PROJECT_TYPES, STATES, SAMPLES, type Line } from "./advanced-ai-data";
import {
  CQ_OTHER,
  clarifyBodyHtml,
  collectClarifications,
  readAnswer,
} from "./advanced-ai-clarify";

/** Everything one "Apply" can touch, so a single Undo restores all of it. */
type Snapshot = {
  title: string;
  scope: string;
  assumptions: string[];
  materials: Line[];
  labor: Line[];
  discount: EstimateDiscount | null;
  timelineDays: number | null;
  history: string[];
};
/** One row of the review card. `kind` is the donor's add / chg / rem class. */
type Delta = { kind: "add" | "chg" | "rem"; group: string; title: string; detail: string };
/** A refine result parked for review — nothing is applied until confirmed. */
type Pending = {
  instructions: string;
  data: GeneratedEstimate;
  warnings: string[];
  reshopFailed: boolean;
  deltas: Delta[];
};

export type AdvancedAiOptions = {
  /**
   * The org's hidden profit markup, read from the database in the page's server
   * component. `convertEstimateToProposal` applies exactly these rates when it
   * writes the proposal, so the studio's "Client price" is the price the
   * proposal will actually carry — the donor's editable "Margin" box changed a
   * number on screen that the server never saw.
   */
  markup: { materialMarkupPct: number; laborMarkupPct: number };
  /** `router.push`, handed down from the content component. */
  navigate: (href: string) => void;
  /**
   * The client this estimate belongs to, when the studio was opened from one.
   *
   * The estimator picker puts `?client=<id>` on whichever engine is chosen, and
   * the page verifies the id against the org before it reaches here — so by the
   * time this is set it is a real client of this organization, not a string off
   * the URL bar. `convertEstimateToProposal` re-checks it anyway, because a
   * server action never trusts an id from a browser.
   *
   * null when the studio was opened from the topbar: no client was chosen, and
   * a proposal with no client is a legitimate draft.
   */
  clientId?: string | null;
};

export function initAdvancedAiContent(
  content: HTMLElement,
  opts: AdvancedAiOptions,
): () => void {
  // Scoped to `.content`, which the shared shell owns and re-fills on every
  // navigation. `.main` lives in the shell, above this element.
  const root = content;
  const main = content.closest<HTMLElement>(".main");
  const disposers: Array<() => void> = [];
  const on = (
    target: EventTarget,
    ev: string,
    fn: EventListener,
    opts?: AddEventListenerOptions,
  ) => {
    target.addEventListener(ev, fn, opts);
    disposers.push(() => target.removeEventListener(ev, fn, opts));
  };
  // Tracked timers — the "Really start over?" confirm window, the "Proposal
  // created" flash and the generation ticker all outlive a click, so an
  // unmount mid-flight must not fire them into a detached tree.
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const after = (ms: number, fn: () => void) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  const intervals = new Set<ReturnType<typeof setInterval>>();
  disposers.push(() => {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    intervals.forEach((id) => clearInterval(id));
    intervals.clear();
  });
  // The estimator calls are real server actions and take seconds. A navigation
  // mid-flight tears this module down while the promise is still pending, so
  // every `await` re-checks `live` before writing to a tree that may already be
  // detached. Timers have the same problem and `after`/`intervals` solve it by
  // being cleared above; a promise cannot be cancelled, only ignored.
  let live = true;
  disposers.push(() => {
    live = false;
  });
  const $$ = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
  /** The donor's `document.getElementById(id)`, scoped to the mounted root. */
  const byId = <T extends HTMLElement = HTMLElement>(id: string) =>
    root.querySelector<T>("#" + id);

  // Dismiss Lead Center banners (smooth height + gap collapse) — inert on this
  // page (no banner in the markup), kept for donor parity with shared shells.
  $$(".banner-close").forEach((btn) => {
    btn.addEventListener("click", () => {
      const b = btn.closest<HTMLElement>(".banner");
      if (!b || b.classList.contains("closing")) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        b.classList.add("hidden");
        return;
      }
      b.style.height = b.offsetHeight + "px";
      b.style.transitionDelay = "0ms";
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          b.classList.add("closing");
          b.style.height = "0px";
        }),
      );
      b.addEventListener("transitionend", function te(e) {
        if (e.propertyName !== "height") return;
        b.classList.add("hidden");
        b.removeEventListener("transitionend", te);
      });
    });
  });

  // ================= SMART PROPOSAL: STATE =================
  // A per-mount COPY of every mutable field. Nothing here is module-level, so
  // two mounts can never write through to each other.
  const sp: {
    step: string;
    type: string | null;
    locState: string;
    otherWork: string;
    busy: boolean;
    /** The AI-authored estimate title — the created proposal's title. */
    title: string;
    materials: Line[];
    labor: Line[];
    scope: string;
    assumptions: string[];
    /** AI-authored duration; carried through the refine round trip. */
    timelineDays: number | null;
    /**
     * Order-level discount. Only the refine sets it ("add a 10% discount"),
     * exactly as on the old page — it is never mangled into line prices, and it
     * materializes as a Discount row on the converted proposal.
     */
    discount: EstimateDiscount | null;
    /** APPLIED change requests, oldest first — the refine's short-term memory. */
    history: string[];
    pending: Pending | null;
    undo: Snapshot | null;
    lineSeq: number;
    confirmReset: boolean;
    /** The questions currently on screen in the intake gate. Empty when shut. */
    clarify: ClarifyQuestion[];
    /** True when the estimate on screen is the server's AI-disabled sample. */
    demo: boolean;
    /** Survives a re-render of the refine card, so a failed apply keeps the text. */
    refineText: string;
    refineBusy: boolean;
    convertBusy: boolean;
  } = {
    step: "intake", type: null, locState: "", otherWork: "", busy: false,
    title: "", materials: [], labor: [], scope: "", assumptions: [],
    timelineDays: null, discount: null, history: [],
    pending: null, undo: null, lineSeq: 100, confirmReset: false,
    clarify: [], demo: false, refineText: "", refineBusy: false, convertBusy: false,
  };

  function money(n: number) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function lineTotal(l: Line) { return l.qty * l.price; }
  function sum(list: Line[]) { return list.reduce(function (a, l) { return a + lineTotal(l); }, 0); }
  function clone(list: Line[]): Line[] { return list.map(function (l) { return Object.assign({}, l); }); }
  /**
   * Every string below reaches the page through `innerHTML`, and most of them
   * are written by the model (line names, assumptions, diff details) or typed by
   * the contractor (the change request). The donor only ever escaped `"` inside
   * an attribute, which leaves `<script>` in an AI-authored assumption live.
   */
  function esc(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  /** An action's thrown error, or a generic line — never a raw stack. */
  function actionError(err: unknown): string {
    const msg = err instanceof Error ? err.message : "";
    return msg && msg.length < 200 ? msg : "Something went wrong. Try again.";
  }
  /**
   * Assigned by the motion pack at the bottom of this module; a no-op under
   * reduced motion. Declared here so the studio can call it without reaching
   * forward into an IIFE.
   */
  let playListStagger: () => void = function () {};

  // ================= INTAKE CONSOLE =================
  function renderIntake() {
    const ptypes = byId("ptypes");
    if (ptypes) {
      ptypes.innerHTML = PROJECT_TYPES.map(function (t) {
        return '<button class="ptype' + (sp.type === t.id ? ' on' : '') + '" type="button" data-type="' + t.id + '">' +
          '<svg class="ic"><use href="#' + t.icon + '"/></svg>' + t.label + '</button>';
      }).join('') + (sp.type === 'other'
        ? '<label class="other-field"><span class="est-lbl">What kind of work?</span>' +
          '<input class="est-in" id="otherWork" placeholder="Skylights, pergola, storm repair…" value="' +
          sp.otherWork.replace(/"/g, '&quot;') + '"></label>'
        : '');
    }
    const sel = byId<HTMLSelectElement>("locState");
    if (sel && !sel.options.length) {
      sel.innerHTML = '<option value="" selected>State…</option>' +
        STATES.map(function (st) { return '<option value="' + st[0] + '">' + st[0] + ' — ' + st[1] + '</option>'; }).join('');
    }
    const samples = byId("samples");
    if (samples) {
      samples.innerHTML = SAMPLES.map(function (x, i) {
        return '<button class="sample" type="button" data-sample="' + i + '">' + x + '</button>';
      }).join('');
    }
    syncGenerate();
  }
  function syncGenerate() {
    const briefEl = byId<HTMLTextAreaElement>("brief");
    const locTextEl = byId<HTMLInputElement>("locText");
    if (!briefEl || !locTextEl) return;
    const brief = briefEl.value.trim();
    const otherOk = sp.type !== 'other' || sp.otherWork.trim().length > 0;
    const ok = !!sp.type && otherOk && brief.length > 0 && !sp.busy;
    const genBtn = byId<HTMLButtonElement>("genBtn");
    if (genBtn) genBtn.disabled = !ok;
    $$(".est-step").forEach(function (st, i) {
      const done =
        (i === 0 && sp.type !== null && (sp.type !== 'other' || sp.otherWork.trim() !== '')) ||
        (i === 1 && locTextEl.value.trim() !== '') ||
        (i === 2 && brief !== '');
      st.classList.toggle('done', !!done);
    });
  }

  // ================= STUDIO =================
  type Group = "materials" | "labor";
  const groupOf = (v: string | undefined): Group => (v === 'labor' ? 'labor' : 'materials');
  const listOf = (g: Group) => (g === 'materials' ? sp.materials : sp.labor);
  const bodyOf = (g: Group) => byId<HTMLTableSectionElement>(g === 'materials' ? 'matBody' : 'labBody');

  /**
   * One `<tr>`. The "Retail link" is now the line's ACTUAL product page: the
   * live-pricing pass attaches `productUrl` (validated to http(s) by
   * estimatorSchema before it ever leaves the server), so the donor's dead
   * `href="#"` becomes the link a contractor can buy from.
   */
  function lineRowHtml(l: Line, which: Group) {
    return '<tr data-line="' + esc(l.id) + '" data-grp="' + which + '">' +
      '<td><input class="li-in" data-f="name" value="' + esc(l.name) + '">' +
        (l.link && l.productUrl
          ? '<a class="li-link" href="' + esc(l.productUrl) + '" target="_blank" rel="noopener noreferrer">' +
            (l.store ? esc(l.store) : 'Retail link') + '<svg class="ic"><use href="#i-ext"/></svg></a>'
          : '') + '</td>' +
      '<td class="num"><input class="li-in num" data-f="qty" type="number" min="0" step="0.5" value="' + l.qty + '"></td>' +
      '<td><input class="li-in" data-f="unit" value="' + esc(l.unit) + '"></td>' +
      '<td class="num"><input class="li-in num" data-f="price" type="number" min="0" step="1" value="' + l.price + '"></td>' +
      '<td class="num"><span class="li-total">' + money(lineTotal(l)) + '</span></td>' +
      '<td class="num"><button class="icon-sq" type="button" data-del-line aria-label="Remove line"><svg class="ic"><use href="#i-trash"/></svg></button></td>' +
    '</tr>';
  }
  /** Full rebuild — only for a list that genuinely ARRIVED (generate, apply, undo). */
  function renderLines(which: Group) {
    const body = bodyOf(which);
    if (body) body.innerHTML = listOf(which).map(function (l) { return lineRowHtml(l, which); }).join('');
    renderSum(which);
  }
  function renderSum(which: Group) {
    const sumEl = byId(which === 'materials' ? 'matSum' : 'labSum');
    if (sumEl) sumEl.textContent = money(sum(listOf(which)));
  }

  /** The discount in dollars, against a given base. Mirrors the server's clamp. */
  function discountOn(base: number): number {
    const d = sp.discount;
    if (!d) return 0;
    return Math.min(base, d.isPercent ? (base * Math.min(d.amount, 100)) / 100 : d.amount);
  }
  function discountLabel(d: EstimateDiscount): string {
    return esc(d.label) + ' — ' + (d.isPercent ? d.amount + '% off' : fmtMoney(d.amount) + ' off');
  }
  /**
   * The donor had an editable "Margin %" box here. It moved a number on screen
   * and nothing else: `convertEstimateToProposal` marks every line up by the
   * ORG's stored material/labor rates and never sees a margin from the browser,
   * so the studio's "Client price" and the created proposal disagreed by
   * whatever the contractor had typed. The box is now the real, org-wide rate
   * (read from the database in the page's server component) applied the same
   * way the action applies it, so this total is the proposal's subtotal.
   */
  function renderTotals() {
    const totals = byId("totals");
    if (!totals) return;
    const mat = sum(sp.materials), lab = sum(sp.labor);
    const sub = mat + lab;
    const sell = applyMarkup({
      materialCost: mat,
      laborCost: lab,
      materialMarkupPct: opts.markup.materialMarkupPct,
      laborMarkupPct: opts.markup.laborMarkupPct,
    });
    const markupAmt = sell.subtotalSell - sub;
    const disc = discountOn(sell.subtotalSell);
    totals.innerHTML =
      '<div class="tot-row"><span>Materials</span><span>' + money(mat) + '</span></div>' +
      '<div class="tot-row"><span>Labor</span><span>' + money(lab) + '</span></div>' +
      '<div class="tot-row"><span>Subtotal · your cost</span><span>' + money(sub) + '</span></div>' +
      (markupAmt > 0.5
        ? '<div class="tot-margin"><div class="tot-margin-row"><span class="kpi-lbl">Markup</span>' +
            '<span class="li-total">' + money(markupAmt) + '</span></div>' +
          '<div class="tot-margin-row" style="margin-top:8px"><span class="diff-m">Company default — materials ' +
            opts.markup.materialMarkupPct + '%, labor ' + opts.markup.laborMarkupPct +
            '%. Never shown to the client.</span></div></div>'
        : '') +
      (sp.discount
        ? '<div class="tot-row"><span>' + discountLabel(sp.discount) +
            ' <button class="icon-sq" type="button" data-discount-remove aria-label="Remove discount">' +
            '<svg class="ic"><use href="#i-x"/></svg></button></span><span>−' + money(disc) + '</span></div>'
        : '') +
      '<div class="tot-row grand"><span>Client price</span><span>' + money(sell.subtotalSell - disc) + '</span></div>' +
      '<div class="tot-margin-row" style="margin-top:10px"><span class="diff-m">Sales tax is added on the proposal.</span></div>';
  }
  function renderAssumptions() {
    const assump = byId("assump");
    if (!assump) return;
    assump.innerHTML = sp.assumptions.map(function (a) {
      return '<li>' + esc(a) + '</li>';
    }).join('');
  }
  /**
   * Three states, one card: the change box, the reviewed diff, and (patched in
   * place, never re-rendered) the in-flight state. Re-rendering while a request
   * is running would destroy the textarea the contractor is still looking at.
   */
  function renderRefine(errText?: string) {
    const card = byId("refineCard");
    if (!card) return;
    const p = sp.pending;
    if (p) {
      card.innerHTML =
        '<div class="st-card-head"><span class="kpi-lbl">Review changes</span></div>' +
        '<div class="rf-pad">' +
          (p.instructions ? '<div class="rf-note">“' + esc(p.instructions) + '”</div>' : '') +
          (p.warnings.length
            ? '<ul class="rf-warn">' + p.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>'
            : '') +
          (p.deltas.length
            ? '<ul class="diff-list">' + p.deltas.map(function (d) {
                return '<li class="' + d.kind + '"><div class="diff-grp">' + esc(d.group) + '</div>' +
                  '<div class="diff-t">' + esc(d.title) + '</div>' +
                  (d.detail ? '<div class="diff-m">' + d.detail + '</div>' : '') + '</li>';
              }).join('') + '</ul>'
            : '<div class="rf-note" style="margin-top:10px">Only caveats — no line changes.</div>') +
          '<div class="rf-act">' +
            '<button class="btn btn-ghost btn--sm" type="button" data-act="discard">Discard</button>' +
            '<button class="btn btn-primary btn--sm" type="button" data-act="apply"><svg class="ic"><use href="#i-check"/></svg>Apply</button>' +
          '</div>' +
        '</div>';
      return;
    }
    card.innerHTML =
      '<div class="st-card-head"><span class="kpi-lbl">Refine</span></div>' +
      '<div class="rf-pad">' +
        '<div class="rf-note">Ask for a change in plain words — the estimate is re-priced and shown as a diff before anything is applied.</div>' +
        '<textarea class="rf-area" id="refineBox" maxlength="4000" placeholder="e.g. Use 30-year shingles instead of 25-year, drop the ridge vents, add a 10% discount…">' +
          esc(sp.refineText) + '</textarea>' +
        (errText ? '<span class="rf-err" role="status">' + esc(errText) + '</span>' : '') +
        '<div class="rf-act"><button class="btn btn-primary btn--sm" type="button" id="refineBtn" data-act="refine"' +
          (sp.refineText.trim() ? '' : ' disabled') +
          '><svg class="ic"><use href="#i-bulb"/></svg><span id="refineLabel">Apply changes</span></button></div>' +
      '</div>';
  }
  function renderStudio() {
    const briefEl = byId<HTMLTextAreaElement>("brief");
    const locTextEl = byId<HTMLInputElement>("locText");
    if (!briefEl || !locTextEl) return;
    const stTitle = byId("stTitle");
    // The model titles the estimate; the brief's first line is the fallback for
    // the AI-disabled sample and for a title the model left blank.
    if (stTitle) {
      stTitle.textContent =
        sp.title.trim() || briefEl.value.trim().split('\n')[0].slice(0, 90) || 'New estimate';
    }
    const loc = locTextEl.value.trim();
    const found = PROJECT_TYPES.find(function (t) { return t.id === sp.type; });
    const typeLabel = sp.type === 'other' && sp.otherWork.trim()
      ? sp.otherWork.trim()
      : found
        ? found.label
        : undefined;
    const stKicker = byId("stKicker");
    if (stKicker) {
      stKicker.textContent = String(typeLabel) +
        (loc ? ' · ' + loc + (sp.locState ? ', ' + sp.locState : '') : '') +
        (sp.timelineDays ? ' · ' + sp.timelineDays + ' day' + (sp.timelineDays === 1 ? '' : 's') : '') +
        // Never let the server's AI-disabled placeholder pass for a real
        // estimate — it is a plausible-looking roof job with invented prices.
        (sp.demo ? ' · sample data (OpenAI not configured)' : '');
    }
    const scopeBox = byId<HTMLTextAreaElement>("scopeBox");
    if (scopeBox) scopeBox.value = sp.scope;
    renderLines('materials'); renderLines('labor');
    renderAssumptions(); renderTotals(); renderRefine();
    syncStudioActions();
  }
  /** The head bar's three buttons, derived from state. Patched, never rebuilt. */
  function syncStudioActions() {
    const undoBtn = byId<HTMLButtonElement>("undoBtn");
    if (undoBtn) undoBtn.disabled = !sp.undo || sp.refineBusy || !!sp.pending;
    const convertBtn = byId<HTMLButtonElement>("convertBtn");
    if (convertBtn) {
      convertBtn.disabled =
        sp.convertBusy || sp.refineBusy || !!sp.pending ||
        (sp.materials.length === 0 && sp.labor.length === 0);
    }
    const resetBtn = byId<HTMLButtonElement>("resetBtn");
    if (resetBtn) resetBtn.disabled = sp.refineBusy || sp.convertBusy;
  }
  /** The studio's own status line (convert errors, refine outcomes). */
  function setStudioStatus(text: string, tone?: 'run' | 'err') {
    const el = byId("stStatus");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('run', tone === 'run');
    el.classList.toggle('err', tone === 'err');
  }
  function goStudio() {
    sp.step = 'studio';
    $$(".ppanel").forEach(function (p) { p.classList.toggle('is-hidden', p.dataset.panel !== 'studio'); });
    renderStudio();
    // The lists have genuinely ARRIVED — this is the one place the stagger is
    // allowed to play (see blueprint-shell/list-motion on why the donor's
    // MutationObserver could not be kept).
    playListStagger();
  }
  function goIntake() {
    sp.step = 'intake';
    $$(".ppanel").forEach(function (p) { p.classList.toggle('is-hidden', p.dataset.panel !== 'intake'); });
  }

  // ================= GENERATION =================
  // The donor shipped a pure animation here: a 620ms ticker walked four STAGES
  // strings and then dealt a hardcoded fixture into the studio. Both halves are
  // now real server calls (src/actions/advancedEstimator) — the same two the old
  // estimator used — and the ticker is GONE. The actions report no progress, so
  // there is nothing truthful to narrate between them; the status line changes
  // only at boundaries this module actually observes (gate → questions →
  // estimate) and the button carries a live elapsed count so a 40-second wait
  // still looks alive.

  /** Console → action input, or null while the form is incomplete. */
  function briefInput(): { projectType: string; description: string; location?: string } | null {
    const briefEl = byId<HTMLTextAreaElement>("brief");
    const locTextEl = byId<HTMLInputElement>("locText");
    if (!briefEl || !locTextEl) return null;
    const description = briefEl.value.trim();
    const found = PROJECT_TYPES.find(function (t) { return t.id === sp.type; });
    // "Other work" carries the contractor's own words — the generic label would
    // tell the estimator nothing about the trade.
    const projectType = sp.type === 'other' ? sp.otherWork.trim() : found ? found.label : '';
    if (!projectType || !description) return null;
    const city = locTextEl.value.trim();
    const location = city ? (sp.locState ? city + ', ' + sp.locState : city) : undefined;
    return { projectType, description, location };
  }

  /** The intake bar's one line of feedback. `tone` picks its colour. */
  function setStatus(text: string, tone?: 'run' | 'err') {
    const status = byId("estStatus");
    if (!status) return;
    status.textContent = text;
    status.classList.toggle('run', tone === 'run');
    status.classList.toggle('err', tone === 'err');
  }

  /** Park the console: button label back to rest, form re-enabled. */
  function endRun(message: string, tone?: 'err') {
    sp.busy = false;
    const genLabel = byId("genLabel");
    if (genLabel) genLabel.textContent = 'Generate estimate';
    setStatus(message, tone);
    syncGenerate();
  }

  /** Hold the console busy: the form stays locked for the whole gate → run. */
  function beginRun(label: string) {
    sp.busy = true;
    const genLabel = byId("genLabel");
    if (genLabel) genLabel.textContent = label;
    syncGenerate();
  }

  /**
   * The only progress this page can honestly report: how long the request has
   * actually been running. `write` receives "Working…" then "Working… 3s",
   * "Working… 4s" and so on, once a second, until the caller stops it.
   *
   * It is deliberately pointed at a BUTTON LABEL, not at `#estStatus`: that
   * element is `role="status" aria-live="polite"`, so a per-second rewrite would
   * read a new number to a screen-reader user every second for the whole run.
   */
  function startElapsed(write: (label: string) => void, base: string): () => void {
    const t0 = Date.now();
    write(base);
    const tick = setInterval(function () {
      write(base + ' ' + Math.round((Date.now() - t0) / 1000) + 's');
    }, 1000);
    intervals.add(tick);
    return function stop() {
      clearInterval(tick);
      intervals.delete(tick);
    };
  }
  /** `startElapsed` target for the console's Generate button. */
  function writeGenLabel(label: string) {
    const genLabel = byId("genLabel");
    if (genLabel) genLabel.textContent = label;
  }

  /**
   * The gate normalizes the location to "City, ST". Split it back across the
   * two console fields, so the correction lands in the controls that produced
   * it — step 2's own hint promises "City typos are corrected before we price".
   */
  function applyCorrectedLocation(corrected: string) {
    const locTextEl = byId<HTMLInputElement>("locText");
    if (!locTextEl) return;
    const trimmed = corrected.trim();
    const m = /^(.+),\s*([A-Za-z]{2})$/.exec(trimmed);
    const code = m ? m[2].toUpperCase() : '';
    if (m && STATES.some(function (s) { return s[0] === code; })) {
      locTextEl.value = m[1].trim();
      setLocState(code);
    } else {
      locTextEl.value = trimmed;
    }
    syncGenerate();
  }

  /**
   * Server rows → studio rows.
   *
   * The server's `id` is REUSED wherever it survived the round trip. That is not
   * cosmetic: `refineAdvancedEstimate` matches lines by id (its rule 6/7), so an
   * id that persists is what lets "call the shingles 30-year" stay the same row
   * and keep its price and product link instead of looking like a new line and
   * being re-shopped. Ids are minted only where the model dropped or duplicated
   * one, and `seen` keeps `data-line` unique across BOTH tables.
   */
  let genSeq = 0;
  function toLines(rows: GeneratedEstimate["materials"], seen: Set<string>): Line[] {
    return rows.map(function (l) {
      let id = l.id && !seen.has(l.id) ? l.id : '';
      while (!id) {
        genSeq += 1;
        if (!seen.has('g' + genSeq)) id = 'g' + genSeq;
      }
      seen.add(id);
      return {
        id,
        name: l.name,
        qty: l.quantity,
        unit: l.unit ?? 'each',
        price: l.unitPrice,
        // The affordance marks the lines the live-pricing pass actually matched
        // to a retail product, and the anchor now points AT that product.
        link: Boolean(l.productUrl),
        store: l.store,
        productUrl: l.productUrl,
        imageUrl: l.imageUrl,
        dimensions: l.dimensions,
        notes: l.notes,
      };
    });
  }

  /** Take a server estimate into the studio — a fresh estimate, not a refine. */
  function adoptEstimate(data: GeneratedEstimate, disabled: boolean) {
    const seen = new Set<string>();
    sp.title = data.title;
    sp.materials = toLines(data.materials, seen);
    sp.labor = toLines(data.labor, seen);
    sp.scope = data.scope;
    sp.assumptions = data.assumptions.slice();
    sp.timelineDays = data.estimatedTimelineDays ?? null;
    sp.discount = data.discount ?? null;
    sp.history = [];
    sp.refineText = '';
    sp.pending = null;
    sp.undo = null;
    sp.demo = disabled;
    endRun('');
    setStudioStatus(
      disabled ? 'Sample data — set OPENAI_API_KEY for a real estimate.' : '',
      disabled ? 'err' : undefined,
    );
    goStudio();
  }

  /**
   * "Generate estimate" → the intake gate, then the estimate. Mirrors the old
   * estimator-studio `onGenerate` including its never-block contract: the gate
   * returns `enoughDetail: true` on any AI failure, so a thin brief is asked
   * about but a broken analyzer still generates.
   */
  async function onGenerate() {
    if (sp.busy) return;
    const input = briefInput();
    if (!input) return;
    beginRun('Reading…');
    setStatus('Reading your brief…', 'run');
    let res: Awaited<ReturnType<typeof analyzeEstimatePrompt>>;
    try {
      res = await analyzeEstimatePrompt(input);
    } catch {
      if (!live) return;
      endRun("Couldn't reach the estimator. Try again.", 'err');
      return;
    }
    if (!live) return;
    if (!res.ok) {
      // Plan limits arrive here too. The old page raised the upgrade dialog via
      // usePlanLimitStore, but nothing in the blueprint shell renders that
      // dialog, so the message is shown where the contractor is looking instead
      // of opening a modal into a tree that would never paint it.
      endRun(res.error, 'err');
      return;
    }
    const a = res.data;
    if (a.correctedLocation) applyCorrectedLocation(a.correctedLocation);
    if (!a.enoughDetail && a.questions.length > 0) {
      openClarify(a.questions);
      return;
    }
    await runGenerate();
  }

  /**
   * The estimate itself. `extraDetail` is the clarifying answers, appended to
   * the brief exactly as the old estimator did — the textarea is never
   * rewritten, so re-running with different answers starts from the same brief.
   */
  async function runGenerate(extraDetail?: string[]) {
    const input = briefInput();
    if (!input) { endRun(''); return; }
    const description = extraDetail && extraDetail.length
      ? input.description + '\n\nAdditional details from the contractor:\n' + extraDetail.join('\n')
      : input.description;
    beginRun('Working…');
    // One honest line for the whole call: the action plans materials, shops
    // them live and prices labor in a single round trip and reports nothing in
    // between, so this is the last thing the page can truthfully say until the
    // estimate lands. The seconds tick on the button, not in the live region.
    setStatus('Pricing materials and labor…', 'run');
    const stop = startElapsed(writeGenLabel, 'Working…');
    try {
      const res = await generateAdvancedEstimate({ ...input, description });
      stop();
      if (!live) return;
      if (!res.ok) { endRun(res.error, 'err'); return; }
      adoptEstimate(res.data, res.disabled === true);
    } catch {
      stop();
      if (!live) return;
      endRun("Couldn't reach the estimator. Try again.", 'err');
    }
  }

  // ================= INTAKE GATE: CLARIFYING QUESTIONS =================
  // Restores the flow the old estimator had. The dialog is native blueprint
  // `.mdl` markup rather than a React island of ClarifyingQuestions.tsx: that
  // component is a list of form controls whose every class is a retired sage
  // token, and it carries its own scrim, focus trap and body-scroll lock that
  // would fight this system's dialog contract. The LOGIC it implemented is
  // preserved exactly — see advanced-ai-clarify.ts.
  //
  // No scroll lock: `.main` is the only scroll container in the blueprint shell
  // (blueprint-global.css), so a body-overflow lock would be inert here, and
  // every other `.mdl` in the system locks nothing.
  const clarifyMdl = byId("clarifyMdl");
  const clarifyBody = byId("clarifyBody");
  const clarifyUse = byId<HTMLButtonElement>("clarifyUse");
  const clarifyCount = byId("clarifyCount");
  let clarifyRestore: HTMLElement | null = null;

  /** Answered count, filled numerals and the submit gate, re-derived from the
   *  DOM — the controls are the only store, so nothing can drift out of sync. */
  function syncClarify() {
    if (!clarifyBody) return;
    const rows = Array.from(clarifyBody.querySelectorAll<HTMLElement>(".cq-q"));
    let answered = 0;
    rows.forEach(function (row) {
      const done = readAnswer(row) !== '';
      if (done) answered += 1;
      row.classList.toggle('is-done', done);
    });
    if (clarifyCount) clarifyCount.textContent = answered + ' of ' + rows.length + ' answered';
    // "Use answers" needs one answer; skipping is the zero-answer path and is
    // always available.
    if (clarifyUse) clarifyUse.disabled = answered === 0;
  }

  function openClarify(questions: ClarifyQuestion[]) {
    if (!clarifyMdl || !clarifyBody) { void runGenerate(); return; }
    sp.clarify = questions;
    clarifyBody.innerHTML = clarifyBodyHtml(questions);
    clarifyBody.scrollTop = 0;
    syncClarify();
    clarifyRestore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The console stays busy behind the dialog: this is one uninterrupted run.
    setStatus('Waiting on your answers…');
    openMdl(clarifyMdl);
    const body = clarifyBody;
    requestAnimationFrame(function () {
      body.querySelector<HTMLElement>("select, textarea, input")?.focus();
    });
  }

  /** @returns false when there was nothing to close, so callers can bail. */
  function closeClarify(): boolean {
    if (!clarifyMdl || !closeMdl(clarifyMdl, after)) return false;
    sp.clarify = [];
    clarifyRestore?.focus();
    clarifyRestore = null;
    return true;
  }

  /** Generate without answers — Escape, the scrim, the X and "Skip". */
  function skipClarify() {
    if (!closeClarify()) return;
    void runGenerate();
  }

  /** Generate with the answered questions appended to the brief. */
  function useClarify() {
    if (!clarifyBody) return;
    const pairs = collectClarifications(clarifyBody, sp.clarify);
    if (!closeClarify()) return;
    void runGenerate(pairs);
  }

  if (clarifyMdl) {
    on(clarifyMdl, "click", function (ev) {
      const t = ev.target instanceof Element ? ev.target : null;
      const act = t?.closest<HTMLElement>("[data-clarify]");
      if (!act) return;
      if (act.dataset.clarify === 'skip') { skipClarify(); return; }
      if (act.dataset.clarify === 'use') { useClarify(); }
    });

    // The custom-answer path. "Something else…" reveals the free-text field and
    // takes focus, so a finite option list can never trap the contractor — the
    // one interaction rule the old dialog was built around.
    on(clarifyMdl, "change", function (ev) {
      const sel = ev.target instanceof HTMLSelectElement ? ev.target : null;
      if (!sel || sel.dataset.cqSel !== '1') return;
      const row = sel.closest<HTMLElement>(".cq-q");
      const area = row?.querySelector<HTMLTextAreaElement>("[data-cq-in]");
      const other = sel.value === CQ_OTHER;
      // The shared `.bp-sel-in[data-empty="1"]` treatment greys an unpicked
      // value off, so it reads as a placeholder rather than an answer.
      sel.dataset.empty = sel.value ? '0' : '1';
      if (area) {
        area.hidden = !other;
        if (other) { area.removeAttribute("aria-hidden"); area.focus(); }
        else { area.setAttribute("aria-hidden", "true"); area.value = ''; }
      }
      syncClarify();
    });

    on(clarifyMdl, "input", function () { syncClarify(); });

    on(document, "keydown", function (e) {
      const ev = e as KeyboardEvent;
      if (!clarifyMdl.classList.contains("open")) return;
      // Escape is the skip path, matching the old dialog and the scrim.
      if (ev.key === "Escape") { ev.preventDefault(); skipClarify(); return; }
      // aria-modal: Tab must not walk out of the dialog and into the page.
      if (ev.key !== "Tab") return;
      const items = Array.from(
        clarifyMdl.querySelectorAll<HTMLElement>("button, input, textarea, select, [href]"),
      ).filter(function (el) {
        return el.offsetParent !== null && !(el as HTMLButtonElement).disabled;
      });
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;
      if (ev.shiftKey && (activeEl === first || !clarifyMdl.contains(activeEl))) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && activeEl === last) {
        ev.preventDefault();
        first.focus();
      }
    });
  }

  // ================= REFINE (real) =================
  // The donor's "Apply changes" invented four deltas about lines literally named
  // `m1` and `l3`, and applying them ran a hardcoded ×1.12 / +8 arithmetic on
  // whatever happened to carry those ids. It now calls `refineAdvancedEstimate`
  // — one surgical AI pass that edits the EXISTING estimate, preserves every
  // untouched line and product link, and re-shops only what it changed — and the
  // diff on screen is computed by `diffEstimate`, the same pure module the old
  // page's review gate used. Nothing is applied until the contractor confirms.

  /** Studio row → the wire shape both `refineAdvancedEstimate` and `diffEstimate` take. */
  function toWire(l: Line): EstimateLine {
    return {
      id: l.id,
      name: l.name,
      quantity: l.qty,
      unitPrice: l.price,
      unit: l.unit,
      store: l.store,
      productUrl: l.productUrl,
      imageUrl: l.imageUrl,
      dimensions: l.dimensions,
      notes: l.notes,
    };
  }
  /**
   * Studio row → the proposal payload's line shape. `id` is deliberately absent:
   * it is the refine's identity handle inside this mount, and the proposal mints
   * its own LineItem ids. Everything else — including the live-pricing product
   * metadata — is carried, because that is what makes the created proposal's
   * Materials Request shoppable.
   */
  function toProposalLine(l: Line) {
    return {
      name: l.name,
      quantity: l.qty,
      unitPrice: l.price,
      unit: l.unit,
      store: l.store,
      productUrl: l.productUrl,
      imageUrl: l.imageUrl,
      dimensions: l.dimensions,
      notes: l.notes,
    };
  }
  /** The estimate as the actions model it — `estimateSchema`. */
  function currentEstimate(): GeneratedEstimate {
    return {
      title: sp.title,
      scope: sp.scope,
      assumptions: sp.assumptions,
      materials: sp.materials.map(toWire),
      labor: sp.labor.map(toWire),
      estimatedTimelineDays: sp.timelineDays ?? undefined,
      discount: sp.discount,
    };
  }

  /** The refine card's own busy state — patched onto the live nodes, never re-rendered. */
  function setRefineBusy(on: boolean) {
    sp.refineBusy = on;
    const box = byId<HTMLTextAreaElement>("refineBox");
    if (box) box.disabled = on;
    const btn = byId<HTMLButtonElement>("refineBtn");
    if (btn) btn.disabled = on || !sp.refineText.trim();
    if (!on) {
      const label = byId("refineLabel");
      if (label) label.textContent = 'Apply changes';
    }
    syncStudioActions();
  }
  function writeRefineLabel(text: string) {
    const label = byId("refineLabel");
    if (label) label.textContent = text;
  }

  /** `diffEstimate`'s line deltas + the meta changes, as the donor's diff rows. */
  function buildDeltas(next: GeneratedEstimate): Delta[] {
    const diff = diffEstimate(
      { materials: sp.materials.map(toWire), labor: sp.labor.map(toWire) },
      next,
    );
    const rows: Delta[] = [];
    // Meta first — a title/scope/timeline/discount change explains the line
    // changes underneath it.
    if (next.title && next.title !== sp.title) {
      rows.push({ kind: 'chg', group: 'Details', title: 'Title', detail: esc(next.title) });
    }
    if ((next.scope || '') !== sp.scope) {
      rows.push({ kind: 'chg', group: 'Details', title: 'Scope of work', detail: 'Rewritten' });
    }
    const nextDays = next.estimatedTimelineDays ?? null;
    if (nextDays !== sp.timelineDays) {
      rows.push({
        kind: 'chg', group: 'Details', title: 'Timeline',
        detail: nextDays == null
          ? 'Removed'
          : sp.timelineDays == null
            ? nextDays + ' days'
            : '<s>' + sp.timelineDays + ' days</s> → ' + nextDays + ' days',
      });
    }
    const key = (d: EstimateDiscount | null | undefined) =>
      d ? d.label + '|' + d.amount + '|' + d.isPercent : '';
    const nextDiscount = next.discount ?? null;
    if (key(nextDiscount) !== key(sp.discount)) {
      rows.push(
        nextDiscount
          ? { kind: 'add', group: 'Discount', title: nextDiscount.label,
              detail: nextDiscount.isPercent
                ? nextDiscount.amount + '% off the client price'
                : fmtMoney(nextDiscount.amount) + ' off the client price' }
          : { kind: 'rem', group: 'Discount', title: 'Discount', detail: 'Removed' },
      );
    }
    diff.deltas.forEach(function (d) {
      const group = d.group === 'materials' ? 'Materials' : 'Labor';
      if (d.kind === 'added') {
        const row = (d.group === 'materials' ? next.materials : next.labor)[d.index];
        rows.push({
          kind: 'add', group, title: d.name,
          detail: row
            ? row.quantity + ' ' + esc(row.unit ?? 'each') + ' × ' + fmtMoney(row.unitPrice) + ' — added'
            : 'Added',
        });
        return;
      }
      if (d.kind === 'removed') {
        rows.push({ kind: 'rem', group, title: d.name, detail: 'Removed' });
        return;
      }
      rows.push({
        kind: 'chg', group, title: d.name,
        detail: d.fields
          .map(function (f) { return f.label + ' <s>' + esc(f.from) + '</s> → ' + esc(f.to); })
          .join(' · '),
      });
    });
    return rows;
  }

  async function refine(text: string) {
    if (sp.refineBusy || sp.pending) return;
    const input = briefInput();
    const projectType = input ? input.projectType : sp.type ?? '';
    if (!projectType) { renderRefine('Pick a project type before refining.'); return; }
    setRefineBusy(true);
    const stop = startElapsed(writeRefineLabel, 'Working…');
    try {
      const res = await refineAdvancedEstimate({
        projectType,
        location: input?.location,
        instructions: text,
        // The last few APPLIED requests — the refine is stateless, so this is
        // what lets "now make it cheaper" know what "it" was.
        history: sp.history.slice(-5),
        assumptions: sp.assumptions,
        current: currentEstimate(),
      });
      stop();
      if (!live) return;
      setRefineBusy(false);
      if (!res.ok) { renderRefine(res.error); return; }
      // Demo mode returns the estimate unchanged — there is nothing to review.
      if (res.disabled) {
        sp.assumptions = res.data.assumptions.slice();
        renderAssumptions();
        renderRefine('Demo mode — set OPENAI_API_KEY to apply AI edits.');
        return;
      }
      const deltas = buildDeltas(res.data);
      if (deltas.length === 0 && res.warnings.length === 0) {
        renderRefine("The AI reported nothing to change — try being more specific.");
        return;
      }
      sp.pending = {
        instructions: text,
        data: res.data,
        warnings: res.warnings,
        reshopFailed: res.reshopFailed,
        deltas,
      };
      renderRefine();
      syncStudioActions();
    } catch (err) {
      stop();
      if (!live) return;
      setRefineBusy(false);
      renderRefine(actionError(err));
    }
  }

  /** Confirm the reviewed refine: snapshot for Undo, then swap the estimate in. */
  function applyPending() {
    const p = sp.pending;
    if (!p) return;
    sp.undo = {
      title: sp.title,
      scope: sp.scope,
      assumptions: sp.assumptions.slice(),
      materials: clone(sp.materials),
      labor: clone(sp.labor),
      discount: sp.discount,
      timelineDays: sp.timelineDays,
      history: sp.history.slice(),
    };
    const seen = new Set<string>();
    sp.title = p.data.title || sp.title;
    sp.materials = toLines(p.data.materials, seen);
    sp.labor = toLines(p.data.labor, seen);
    sp.scope = p.data.scope || sp.scope;
    sp.assumptions = p.data.assumptions.slice();
    sp.timelineDays = p.data.estimatedTimelineDays ?? null;
    sp.discount = p.data.discount ?? null;
    if (p.instructions) sp.history = sp.history.concat([p.instructions]).slice(-8);
    sp.refineText = '';
    sp.pending = null;
    renderStudio();
    // Both tables were rebuilt from a new estimate — a genuine arrival.
    playListStagger();
    setStudioStatus(
      p.reshopFailed
        ? 'Applied — live pricing failed on the changed lines, check them before sending.'
        : 'Changes applied. Undo is available until your next edit.',
      p.reshopFailed ? 'err' : undefined,
    );
  }

  // ================= CONVERT TO PROPOSAL (real) =================
  // The donor swapped the button's label to "Proposal created" for 1.8 seconds
  // and wrote nothing anywhere. `convertEstimateToProposal` creates a real DRAFT
  // Proposal: every studio row becomes a LineItem carrying its store /
  // productUrl / imageUrl / dimensions (which is what makes the proposal's
  // Materials Request shoppable), the org markup turns cost into sell price, the
  // discount becomes a Discount row, the location becomes the job address and
  // seeds the tax rate, and an ActivityEvent records the conversion. Then we
  // navigate to the proposal that now exists.
  async function onConvert() {
    if (sp.convertBusy || sp.refineBusy || sp.pending) return;
    if (sp.materials.length === 0 && sp.labor.length === 0) return;
    const input = briefInput();
    const projectType = input ? input.projectType : sp.type ?? '';
    if (!projectType) { setStudioStatus('Pick a project type first.', 'err'); return; }
    const briefEl = byId<HTMLTextAreaElement>("brief");
    const fallbackTitle = briefEl ? briefEl.value.trim().split('\n')[0].slice(0, 90) : '';

    sp.convertBusy = true;
    syncStudioActions();
    const convertBtn = byId("convertBtn");
    const restore = convertBtn ? convertBtn.innerHTML : '';
    if (convertBtn) convertBtn.innerHTML = '<svg class="ic"><use href="#i-file"/></svg>Creating…';
    setStudioStatus('Creating the proposal…', 'run');
    try {
      const res = await convertEstimateToProposal({
        projectType,
        title: sp.title.trim() || fallbackTitle || 'Estimate',
        // The AI-authored scope, as edited in the scope box — falls back to the
        // brief so the proposal is never created with an empty scope of work.
        scope: sp.scope.trim() || input?.description || '',
        materials: sp.materials.map(toProposalLine),
        labor: sp.labor.map(toProposalLine),
        assumptions: sp.assumptions,
        // Was hardcoded null, which is why a proposal started from a client's
        // record used to arrive unassigned and had to be re-attached by hand in
        // the builder.
        clientId: opts.clientId ?? null,
        location: input?.location ?? null,
        discount: sp.discount,
      });
      if (!live) return;
      // Deliberately NOT restoring the button: the page is navigating away, and
      // flipping the label back would read as "nothing happened".
      setStudioStatus('Proposal created — opening it…', 'run');
      opts.navigate('/dashboard/proposals/' + res.id);
    } catch (err) {
      if (!live) return;
      sp.convertBusy = false;
      if (convertBtn) convertBtn.innerHTML = restore;
      syncStudioActions();
      // Plan limits (`proposalsCreated`) throw from `enforcePlanLimit` and land
      // here with their own message.
      setStudioStatus(actionError(err), 'err');
    }
  }

  // ================= EVENTS =================
  on(document, "click", function (ev) {
    const src = ev.target instanceof Element ? ev.target : null;
    if (!src) return;
    const t = src.closest<HTMLElement>('[data-type]');
    if (t) { sp.type = t.dataset.type ?? null; renderIntake(); return; }
    const smp = src.closest<HTMLElement>('[data-sample]');
    if (smp) {
      const briefEl = byId<HTMLTextAreaElement>("brief");
      if (briefEl) briefEl.value = SAMPLES[Number(smp.dataset.sample)];
      if (!sp.type) sp.type = Number(smp.dataset.sample) === 1 ? 'fence' : Number(smp.dataset.sample) === 2 ? 'deck' : Number(smp.dataset.sample) === 3 ? 'gutters' : 'roof';
      renderIntake();
      return;
    }
    if (src.closest('#genBtn')) { void onGenerate(); return; }
    const add = src.closest<HTMLElement>('[data-add]');
    if (add) {
      if (sp.refineBusy || sp.pending) return;
      const grp = groupOf(add.dataset.add);
      sp.lineSeq += 1;
      const line: Line = { id: 'n' + sp.lineSeq, name: 'New line', qty: 1, unit: 'each', price: 0, link: false };
      listOf(grp).push(line);
      // APPEND the one new row. Re-rendering the table would replace the input
      // the contractor may be halfway through on another line and take its focus.
      const body = bodyOf(grp);
      if (body) body.insertAdjacentHTML('beforeend', lineRowHtml(line, grp));
      body?.querySelector<HTMLInputElement>('tr:last-child [data-f="name"]')?.focus();
      renderSum(grp); renderTotals(); syncStudioActions();
      return;
    }
    const del = src.closest<HTMLElement>('[data-del-line]');
    if (del) {
      if (sp.refineBusy || sp.pending) return;
      const row = del.closest<HTMLElement>('[data-line]');
      if (!row) return;
      const grp = groupOf(row.dataset.grp);
      const id = row.dataset.line;
      // One row leaves and the rows below close the gap — `commit` must not
      // re-render the table, or the FLIP has nothing left to move.
      leaveRow(row, function () {
        if (grp === 'materials') sp.materials = sp.materials.filter(function (l) { return l.id !== id; });
        else sp.labor = sp.labor.filter(function (l) { return l.id !== id; });
        renderSum(grp); renderTotals(); syncStudioActions();
      }, after);
      return;
    }
    if (src.closest('[data-discount-remove]')) {
      sp.discount = null;
      renderTotals();
      return;
    }
    const act = src.closest<HTMLElement>('[data-act]');
    if (act) {
      const kind = act.dataset.act;
      if (kind === 'refine') {
        const box = byId<HTMLTextAreaElement>("refineBox");
        if (!box) return;
        const text = box.value.trim();
        if (!text) { box.focus(); return; }
        sp.refineText = text;
        void refine(text);
        return;
      }
      if (kind === 'apply') { applyPending(); return; }
      if (kind === 'discard') {
        sp.pending = null;
        renderRefine();
        syncStudioActions();
        setStudioStatus('Discarded — nothing was changed.');
        return;
      }
    }
    if (src.closest('#undoBtn')) {
      const u = sp.undo;
      if (!u || sp.refineBusy || sp.pending) return;
      sp.title = u.title;
      sp.scope = u.scope;
      sp.assumptions = u.assumptions.slice();
      sp.materials = clone(u.materials);
      sp.labor = clone(u.labor);
      sp.discount = u.discount;
      sp.timelineDays = u.timelineDays;
      sp.history = u.history.slice();
      sp.undo = null;
      renderStudio();
      playListStagger();
      setStudioStatus('Reverted to the previous version.');
      return;
    }
    if (src.closest('#resetBtn')) {
      const btn = byId("resetBtn");
      if (!btn || sp.refineBusy || sp.convertBusy) return;
      if (!sp.confirmReset) {
        sp.confirmReset = true;
        btn.innerHTML = '<svg class="ic"><use href="#i-x"/></svg>Really start over?';
        after(3000, function () {
          sp.confirmReset = false;
          btn.innerHTML = '<svg class="ic"><use href="#i-x"/></svg>Start over';
        });
        return;
      }
      sp.confirmReset = false;
      sp.title = ''; sp.materials = []; sp.labor = []; sp.scope = ''; sp.assumptions = [];
      sp.timelineDays = null; sp.discount = null; sp.history = [];
      sp.pending = null; sp.undo = null; sp.refineText = '';
      sp.demo = false;
      btn.innerHTML = '<svg class="ic"><use href="#i-x"/></svg>Start over';
      // The console is coming back into view — clear the last run's line and
      // re-derive the Generate button from the (still filled in) form.
      setStatus('');
      setStudioStatus('');
      syncGenerate();
      goIntake();
      return;
    }
    if (src.closest('#convertBtn')) { void onConvert(); return; }
  });

  on(document, "input", function (ev) {
    const src = ev.target instanceof HTMLElement ? ev.target : null;
    if (!src) return;
    if (src.id === 'brief' || src.id === 'locText') { syncGenerate(); return; }
    if (src.id === 'otherWork') { sp.otherWork = (src as HTMLInputElement).value; syncGenerate(); return; }
    if (src.id === 'scopeBox') { sp.scope = (src as HTMLTextAreaElement).value; return; }
    if (src.id === 'refineBox') {
      // Kept in state so a failed apply (or a re-render of the card) gives the
      // contractor their sentence back instead of an empty box.
      sp.refineText = (src as HTMLTextAreaElement).value;
      const btn = byId<HTMLButtonElement>("refineBtn");
      if (btn) btn.disabled = sp.refineBusy || !sp.refineText.trim();
      return;
    }
    const f = src.closest<HTMLInputElement>('[data-f]');
    if (f) {
      const row = f.closest<HTMLElement>('[data-line]');
      if (!row) return;
      const grp = groupOf(row.dataset.grp);
      const line = listOf(grp).find(function (l) { return l.id === row.dataset.line; });
      if (!line) return;
      const key = f.dataset.f;
      if (key === 'qty' || key === 'price') line[key] = parseFloat(f.value) || 0;
      else if (key === 'name' || key === 'unit') line[key] = f.value;
      // Patch the three nodes the edit actually changed. Re-rendering the table
      // here would replace the input mid-keystroke and drop the caret.
      const totalEl = row.querySelector<HTMLElement>('.li-total');
      if (totalEl) totalEl.textContent = money(lineTotal(line));
      renderSum(grp);
      renderTotals();
    }
  });
  on(document, "change", function (ev) {
    const src = ev.target instanceof HTMLElement ? ev.target : null;
    if (!src) return;
    if (src.id === 'locState') { setLocState((src as HTMLSelectElement).value); }
  });

  // ================= LOCATION =================
  /** Keeps the state in `sp`, on the <select>, and on the `data-empty` flag the
   *  CSS reads to grey out an unpicked "State…" placeholder. */
  function setLocState(v: string) {
    sp.locState = v;
    const sel = byId<HTMLSelectElement>("locState");
    if (!sel) return;
    if (sel.value !== v) sel.value = v;
    sel.dataset.empty = v ? "0" : "1";
  }

  // Real Google Places suggestions on the location field. The browser key
  // (NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY) was already configured — this field
  // was a plain text input that never used it, so "regional pricing" relied on
  // the user typing a city correctly. Picking a suggestion now also fills the
  // State select, because the pick already knows the state.
  const locTextEl = byId<HTMLInputElement>("locText");
  if (locTextEl) {
    disposers.push(
      attachPlacesSuggest(locTextEl, {
        onPick(p) {
          if (!p.typed && p.state) setLocState(p.state);
          syncGenerate();
        },
      }),
    );
  }

  // ================= INITIALISATION =================
  renderIntake();

  // (FLUID SCALE lives in the shell — it owns <html> zoom and the eff-* classes.)

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // (The donor's local EASE constant went with its row-stagger function —
    // blueprint-shell/list-motion owns that easing now.)

    // Reveal: load + scroll.
    // Reveal adapts to scroll speed: a slow scroll gets the full 420ms
    // animation, a fast one a shorter pass — never lagging, still visible.
    const vpH = window.innerHeight;
    const scrollHost = main;
    let velLastY = scrollHost ? scrollHost.scrollTop : 0;
    let velLastT = performance.now();
    let scrollVel = 0; // px/ms
    if (scrollHost)
      on(
        scrollHost,
        "scroll",
        () => {
          const now = performance.now();
          scrollVel = Math.abs(scrollHost.scrollTop - velLastY) / Math.max(1, now - velLastT);
          velLastY = scrollHost.scrollTop;
          velLastT = now;
        },
        { passive: true },
      );
    // `.mdl` is skipped: it is a `.content` child only because the clarifying
    // questions dialog mounts inside the page root, and `.rv` would strand the
    // fixed overlay at `opacity: 0` (plus a translate, which on a fixed element
    // also makes it a containing block) until it happened to intersect — which
    // it never does, because it is `display: none` until it opens.
    const blocks = (Array.from(root.children) as HTMLElement[]).filter(
      (el) => !el.classList.contains("mdl"),
    );
    blocks.forEach((el, i) => {
      el.classList.add("rv");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? i * 60 + "ms" : "200ms";
    });
    // Second layer of the arrival — Overview cascades its `.kpi` strip here.
    // This page has no `.kpi`, so the donor's layer is silently empty. Kept
    // verbatim rather than re-pointed, so the arrival matches the donor file.
    const cells = $$(".kpi");
    cells.forEach((el, i) => {
      el.classList.add("rv-cell");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? 160 + (i % 8) * 45 + "ms" : "200ms";
    });
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((en) => {
          if (!en.isIntersecting) return;
          const target = en.target as HTMLElement;
          if (target.dataset.rvScroll) {
            // below the fold: duration follows the current scroll speed
            const dur = Math.round(Math.max(550, 900 - scrollVel * 160));
            target.style.transitionDuration = dur + "ms";
          }
          target.classList.add("rv-in");
          io.unobserve(target);
          target.addEventListener("transitionend", function te() {
            target.style.transitionDelay = "";
            target.style.transitionDuration = "";
            target.removeEventListener("transitionend", te);
          });
        });
      },
      { threshold: 0, rootMargin: "0px 0px 60px 0px" },
    );
    blocks.concat(cells).forEach((el) => io.observe(el));
    disposers.push(() => io.disconnect());

    // (Sidebar cascade lives in the shell — it plays once, on first load.)

    // Row stagger — the CALLER decides when a list has arrived.
    //
    // The donor wired this to `new MutationObserver(…, { childList: true })` on
    // each of the three lists. That fires on ANY child change, so every add,
    // every delete and every repaint replayed the whole 45ms-per-row entrance:
    // the studio dropped to opacity 0 and crawled back each time a line was
    // added or removed. It is played here only where the lists genuinely
    // ARRIVE — a generated estimate, an applied refine, an undo — see
    // blueprint-shell/list-motion.
    playListStagger = () => {
      ["matBody", "labBody", "assump"].forEach((id) => {
        const list = byId(id);
        // Never stagger inside a hidden subtree: the transition cannot run,
        // `transitionend` never fires, and the inline `transform: none` stays
        // pinned — which outranks every stylesheet :hover rule.
        if (!list || list.offsetParent === null) return;
        staggerIn(Array.from(list.children) as HTMLElement[]);
      });
    };

    // Numeral count-up — Overview's `.kpi-val`. This page has none, so the
    // donor's loop is a no-op here; kept verbatim.
    $$(".kpi-val").forEach((el) => {
      const raw = (el.textContent || "").trim();
      const isMoney = raw.charAt(0) === "$";
      const target = parseInt(raw.replace(/[^0-9]/g, ""), 10);
      if (!isFinite(target)) return;
      let t0: number | null = null;
      function frame(t: number) {
        if (!t0) t0 = t;
        const pr = Math.min(1, (t - t0) / 750);
        const e = 1 - Math.pow(1 - pr, 3);
        el.textContent = (isMoney ? "$" : "") + Math.round(target * e).toLocaleString("en-US");
        if (pr < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });

    // Press effects
    function pressify(sel: string, cls: string) {
      $$(sel).forEach((el) => {
        el.addEventListener("click", () => {
          el.classList.remove(cls);
          void el.offsetWidth;
          el.classList.add(cls);
        });
        el.addEventListener("animationend", () => el.classList.remove(cls));
      });
    }
    // Shell controls (.icon-btn, .sb-foot-*) press from the shell module.
    pressify(
      ".btn, .card-foot-btn, .ptab, .pchip, .pager-btn, .pmenu-item, .photo-box, .pt-open",
      "pressed",
    );
    pressify(".week-strip .day", "day-pressed");

    // (Graph-paper parallax lives in the shell — it owns .main.)
  })();

  // The sliding sidebar indicator lives in the shell — it survives navigation
  // and re-points at whichever item React marks `active`.

  return () => {
    disposers.forEach((d) => d());
  };
}
