// Proposals blueprint — runtime behaviors, ported from the donor file's
// <script> (jobflex-proposals-blueprint.html). Every duration, easing, stagger,
// page size and formula is the donor's exact value. Adaptations:
//
// - queries are scoped to the mounted root;
// - document/window listeners, timers and observers are tracked for unmount
//   cleanup;
// - FLUID SCALE zooms the page ROOT instead of document.documentElement (the
//   root owns the full viewport, so the visual result is identical, and the
//   zoom cannot leak into the rest of the app); the menu-positioning math reads
//   the root's zoom accordingly;
// - the reveal cascade reads `.content > *:not(.mdl):not([data-island])`. The
//   dialogs and the React-island host are not donor blocks; leaving them in
//   would shift the donor's i*60ms stagger indices, and a `display:none`
//   overlay that gets `.rv` never receives the IntersectionObserver callback
//   that would clear `opacity: 0` — it would open invisible.
//
// THE REAL WORK
//
// The donor page was a fixture: a seed array paged and mutated in memory. It
// is now the org's real proposal book, read in
// src/app/dashboard/proposals/page.tsx and handed in through `options.rows`;
// every row action calls the same server action the classic row menu called
// (src/components/proposal/RowActions.tsx), so a write here is the write the
// old design performed:
//
//   Edit proposal    → /dashboard/proposals/<id>            (the live editor)
//   View public page → /portal/q/<publicId>                 (the client page)
//   Duplicate        → duplicateProposal()
//   Send to client   → sendProposal()
//   Order materials  → the MaterialsSheet component, mounted as a React island
//   View on Zillow   → zillowSearchUrl(), precomputed per row on the server
//   Delete proposal  → bulkDeleteProposals([id])
//
// and the accepted / completed cards move through updateProposalStatus().
//
// Row motion follows the house rule: NO MutationObserver stagger. A list
// staggers only when it genuinely ARRIVES (first paint, first reveal of a tab,
// a page turn); a filter, a keystroke or a single-row change repaints silently,
// and a row that LEAVES does so alone through leaveRow.

import {
  bulkDeleteProposals,
  duplicateProposal,
  sendProposal,
  updateProposalStatus,
  uploadProposalPhoto,
} from "@/actions/proposals";
import { notifyPaymentReminder } from "@/actions/notify";
import { markInstallmentPaid, unmarkInstallmentPaid } from "@/actions/installments";
// The handheld surface's route-local read of the SAME book this page renders
// from (same query, same requireProposalStaff guard) — used to pick up a row
// the server just created without leaving the page.
import { loadProposalBook } from "@/app/(mobile)/mobile-proposals-v2/proposals-actions";
import { MaterialsSheet } from "@/components/proposal/MaterialsSheet";
import { currentZoom, leaveRow, staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import { MDL_EXIT_MS, closeMdl, openMdl } from "@/components/v3/blueprint-shell/mdl-motion";
import { mountIsland, type Island } from "@/components/v3/blueprint-shell/react-island";
import {
  PAGE_ACC,
  PAGE_ALL,
  PAGE_DONE,
  cloneRows,
  statusPlate,
  type Installment,
  type ProposalRow,
} from "./proposals-data";

export type ProposalsContentOptions = {
  /** The org's real proposal book, read server-side. There is no fixture to
   *  fall back to any more — an omitted book renders the real empty states. */
  rows?: ProposalRow[];
};

type MaterialsSheetProps = Parameters<typeof MaterialsSheet>[0];

/** Server actions reject with an Error whose message is written for the user
 *  ("Not found", "Plan limit reached", the send-transport failure). Surface
 *  that text; fall back to a generic line for anything unrecognisable. */
function actionError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  const code = (err as { code?: string } | null)?.code;
  if (code === "PLAN_LIMIT_REACHED") {
    return "Plan limit reached — this org has used its proposals for the period. Upgrade the plan to create more.";
  }
  if (msg === "Not found") {
    return "That proposal is no longer available to you. Reload the page.";
  }
  if (!msg || msg.toLowerCase().includes("fetch failed")) {
    return "Something went wrong. Check your connection and try again.";
  }
  return msg;
}

/** Every row field below is operator-entered text that lands in an innerHTML
 *  string. Escaping is not optional: a client called `Ben & Co <Roofing>` would
 *  otherwise break the table, and a crafted title would inject markup. */
function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function initProposalsContent(
  content: HTMLElement,
  options: ProposalsContentOptions = {},
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
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const $$ = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));

  // Tracked `setTimeout`s, so an unmount mid-flight cannot fire into a
  // detached tree. leaveRow and closeMdl both take this helper.
  const timers = new Set<number>();
  const after = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  disposers.push(() => {
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
  });

  // Runtime state — cloned per mount so edits never leak between navigations.
  let proposalsData: ProposalRow[] = cloneRows(options.rows ?? []);

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

  const pstate = {
    tab: "all",
    filter: "ALL",
    pageAll: 1,
    pageAcc: 1,
    pageDone: 1,
    menuId: null as string | null,
    /** The ⋮ the open menu belongs to — it carries the in-flight busy state. */
    menuBtn: null as HTMLElement | null,
    /** Guards a second write while one is on the wire. */
    writing: false,
    /** A panel staggers its rows the first time it is actually on screen. */
    revealed: { all: false, accepted: false, completed: false } as Record<string, boolean>,
  };

  function fmtMoney(n: number) {
    return "$" + Math.round(n).toLocaleString("en-US");
  }
  function instDollars(p: ProposalRow, inst: Installment) {
    if (inst.status === "PAID" && inst.paidAmt != null) return inst.paidAmt;
    return inst.pct ? Math.round(p.total * (inst.amount / 100)) : inst.amount;
  }
  function instCellActions(p: ProposalRow, inst: Installment): string {
    if (inst.status === "PAID") {
      const via = inst.paidVia === "STRIPE" ? "Stripe" : inst.paidVia === "SQUARE" ? "Square" : "manual";
      return (
        '<span class="pinst-paid"><svg class="ic"><use href="#i-check"/></svg>Paid · ' +
        via +
        "</span>" +
        (inst.paidVia === "MANUAL"
          ? '<button class="btn btn-ghost btn--sm" type="button" data-act="unmark-line" data-inst="' +
            esc(inst.id) +
            '">Undo</button>'
          : "")
      );
    }
    if (inst.status === "WAIVED") return '<span class="pinst-paid">Closed</span>';
    return (
      '<button class="btn btn-ghost btn--sm" type="button" data-act="markpaid" data-inst="' +
      esc(inst.id) +
      '"><svg class="ic"><use href="#i-check"/></svg>Mark paid</button>' +
      '<button class="btn btn-ghost btn--sm" type="button" data-act="remind" data-inst="' +
      esc(inst.id) +
      '"' +
      (p.clientEmail ? "" : " disabled") +
      '><svg class="ic"><use href="#i-bell"/></svg>Remind</button>'
    );
  }
  function sumOf(list: ProposalRow[]) {
    return list.reduce((a, p) => a + p.total, 0);
  }
  function byId(id: string | null) {
    return id ? proposalsData.find((p) => p.id === id) ?? null : null;
  }
  /** The row's second line — a client with no city must not print "Name · ". */
  function subLine(p: ProposalRow) {
    return [p.client, p.city].filter(Boolean).join(" · ");
  }
  /** Every proposal the tabs and chips then narrow. The page had a search box
   *  filtering this list; it was removed with the box rather than left as a
   *  filter nothing can set. */
  function book() {
    return proposalsData;
  }
  function filteredAll() {
    const base = book();
    return pstate.filter === "ALL" ? base : base.filter((p) => p.status === pstate.filter);
  }
  function listAccepted() {
    return book().filter((p) => p.status === "ACCEPTED");
  }
  function listDone() {
    return book().filter((p) => p.status === "PAID");
  }
  function rmOk() {
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function panelVisible(name: string) {
    const pn = root.querySelector<HTMLElement>(`.ppanel[data-panel="${name}"]`);
    return !!pn && !pn.classList.contains("is-hidden");
  }
  /** Find a rendered row by its proposal id without building a selector out of
   *  operator data (a cuid is safe, but the rule should not depend on that). */
  function findRow(container: HTMLElement | null, id: string): HTMLElement | null {
    if (!container) return null;
    return (
      Array.from(container.querySelectorAll<HTMLElement>("[data-id]")).find(
        (el) => el.dataset.id === id,
      ) ?? null
    );
  }

  // ================= PROPOSALS: RENDER =================
  // Masthead: one headline number per tab + exactly two annotations
  function mastData() {
    const all = book(),
      acc = listAccepted(),
      done = listDone();
    if (pstate.tab === "accepted") {
      const owed = sumOf(acc);
      return {
        lbl: "Money Owed · Work In Motion",
        tone: "accent",
        val: fmtMoney(owed),
        sub: [
          ["Active jobs", acc.length],
          ["Avg contract", acc.length ? fmtMoney(Math.round(owed / acc.length)) : "—"],
        ] as Array<[string, string | number]>,
      };
    }
    if (pstate.tab === "completed") {
      const banked = sumOf(done);
      return {
        lbl: "Banked · Jobs Closed",
        tone: "good",
        val: fmtMoney(banked),
        sub: [
          ["Filed jobs", done.length],
          ["Avg job size", done.length ? fmtMoney(Math.round(banked / done.length)) : "—"],
        ] as Array<[string, string | number]>,
      };
    }
    return {
      lbl: "Total Value",
      tone: "accent",
      val: fmtMoney(sumOf(all)),
      sub: [
        ["Open proposals", all.filter((p) => p.status !== "PAID").length],
        ["Accepted", acc.length],
      ] as Array<[string, string | number]>,
    };
  }
  function renderKpis() {
    const m = mastData();
    const el = $("#pMast");
    if (!el) return;
    el.innerHTML =
      '<div class="pmast-top"><span class="pmast-lbl">' +
      m.lbl +
      '</span><span class="pmast-rule"></span></div>' +
      '<div class="pmast-val ' +
      m.tone +
      '">' +
      m.val +
      "</div>" +
      '<div class="pmast-sub">' +
      m.sub.map((x) => "<span>" + x[0] + " <b>" + x[1] + "</b></span>").join("") +
      "</div>";
    if (rmOk()) {
      el.style.opacity = "0";
      el.style.transform = "translateY(8px)";
      el.style.transition =
        "opacity 320ms cubic-bezier(0.22, 0.61, 0.36, 1), transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1)";
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          el.style.opacity = "";
          el.style.transform = "";
          el.addEventListener(
            "transitionend",
            () => {
              el.style.transition = "";
            },
            { once: true },
          );
        }),
      );
    }
  }
  function renderTabCounts() {
    const counts: Record<string, number> = {
      all: book().length,
      accepted: listAccepted().length,
      completed: listDone().length,
    };
    root.querySelectorAll<HTMLElement>("#pTabs .ptab-count").forEach((el) => {
      el.textContent = String(counts[el.dataset.count || ""]);
    });
  }
  function renderChipCounts() {
    const c: Record<string, number> = { ALL: 0, DRAFT: 0, SENT: 0, VIEWED: 0, DECLINED: 0, EXPIRED: 0 };
    book().forEach((p) => {
      c.ALL += 1;
      if (p.status in c && p.status !== "ALL") c[p.status] += 1;
    });
    root.querySelectorAll<HTMLElement>("#pChips [data-cf]").forEach((el) => {
      el.textContent = String(c[el.dataset.cf || ""] ?? 0);
    });
  }
  function renderPager(el: HTMLElement | null, page: number, pages: number, key: string) {
    if (!el) return;
    if (pages <= 1) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML =
      '<span class="pager-info">Page ' +
      page +
      " / " +
      pages +
      "</span>" +
      '<button class="pager-btn" type="button" data-pg="prev" data-key="' +
      key +
      '"' +
      (page <= 1 ? " disabled" : "") +
      ' aria-label="Previous page"><svg class="ic rot-l"><use href="#i-chev"/></svg></button>' +
      '<button class="pager-btn" type="button" data-pg="next" data-key="' +
      key +
      '"' +
      (page >= pages ? " disabled" : "") +
      ' aria-label="Next page"><svg class="ic rot-r"><use href="#i-chev"/></svg></button>';
  }

  /** The rows the ALL table is currently showing, with the page clamped. */
  function allSlice() {
    const rows = filteredAll();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_ALL));
    if (pstate.pageAll > pages) pstate.pageAll = pages;
    return { rows, pages, slice: rows.slice((pstate.pageAll - 1) * PAGE_ALL, pstate.pageAll * PAGE_ALL) };
  }
  function allRowHtml(p: ProposalRow) {
    const st = statusPlate(p.status);
    return (
      '<tr class="prow" data-id="' +
      esc(p.id) +
      '">' +
      '<td><div class="pt-title">' +
      esc(p.title) +
      '</div><div class="pt-sub">' +
      esc(subLine(p)) +
      "</div></td>" +
      '<td><span class="pstatus ' +
      st.cls +
      '">' +
      esc(st.label) +
      "</span></td>" +
      '<td class="num"><span class="pt-money">' +
      fmtMoney(p.total) +
      "</span></td>" +
      '<td><span class="pt-mono">' +
      esc(p.updated) +
      "</span></td>" +
      '<td class="num"><span class="pt-mono">' +
      p.views +
      "</span></td>" +
      '<td><span class="pt-mono">' +
      esc(p.owner) +
      "</span></td>" +
      '<td class="num"><button class="pt-open" type="button" data-menu="' +
      esc(p.id) +
      '" aria-label="Actions for ' +
      esc(p.title) +
      '"><svg class="ic"><use href="#i-dots"/></svg></button></td>' +
      "</tr>"
    );
  }
  /** Chrome only — pager + empty state. Never touches the tbody, so it is safe
   *  to call from inside a leaveRow commit. */
  function syncAllChrome() {
    const { rows, pages } = allSlice();
    $("#allCard")?.classList.toggle("is-hidden", rows.length === 0);
    const empty = $("#allEmpty");
    empty?.classList.toggle("is-hidden", rows.length !== 0);
    // An empty BOOK and an empty FILTER are different situations and the copy
    // has to say which — "no match" on a brand new org reads as a broken page.
    if (empty && rows.length === 0) {
      empty.textContent = book().length
        ? "No proposals match this filter"
        : "No proposals yet — start one with Smart Proposal or Manual proposal above";
    }
    renderPager($("#allPager"), pstate.pageAll, pages, "all");
  }
  function renderAll(stagger = false) {
    const body = $("#propTableBody");
    if (!body) return;
    const { slice } = allSlice();
    body.innerHTML = slice.map(allRowHtml).join("");
    syncAllChrome();
    if (stagger && panelVisible("all")) {
      staggerIn(Array.from(body.querySelectorAll<HTMLElement>(".prow")));
    }
  }
  function accSlice() {
    const rows = listAccepted();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_ACC));
    if (pstate.pageAcc > pages) pstate.pageAcc = pages;
    return { rows, pages, slice: rows.slice((pstate.pageAcc - 1) * PAGE_ACC, pstate.pageAcc * PAGE_ACC) };
  }
  function syncAccChrome() {
    const { rows, pages } = accSlice();
    $("#accEmpty")?.classList.toggle("is-hidden", rows.length !== 0);
    renderPager($("#accPager"), pstate.pageAcc, pages, "acc");
  }
  function acceptedCardHtml(p: ProposalRow) {
    const insts = p.inst || [];
    // Payments: 1–5 items — columns; 6+ — a row table with dividers
    let payBlock = "";
    if (insts.length > 5) {
      payBlock =
        '<table class="psched psched--div"><tbody>' +
        insts
          .map(
            (inst) =>
              "<tr>" +
              '<td class="psched-label">' +
              esc(inst.label) +
              "</td>" +
              '<td><span class="pt-mono">' +
              (inst.due ? "due " + esc(inst.due) : "no due date") +
              "</span></td>" +
              '<td class="td-price"><span class="pt-money">' +
              fmtMoney(instDollars(p, inst)) +
              "</span></td>" +
              // Real: Mark paid records a manual payment (bank / cash / check);
              // Remind mails the client this instalment's reminder.
              '<td class="td-remind pinst-acts">' +
              instCellActions(p, inst) +
              "</td>" +
              "</tr>",
          )
          .join("") +
        "</tbody></table>";
    } else if (insts.length) {
      payBlock =
        '<div class="pcols">' +
        insts
          .map((inst) => {
            const sub =
              inst.status === "PAID"
                ? "Paid"
                : inst.pct
                  ? inst.amount + "% of total"
                  : inst.due
                    ? "due " + esc(inst.due)
                    : "";
            return (
              '<div class="pcol' +
              (inst.status === "PAID" ? " pcol--paid" : "") +
              '"><div class="kpi-lbl">' +
              esc(inst.label) +
              "</div>" +
              '<div class="pcol-val">' +
              fmtMoney(instDollars(p, inst)) +
              "</div>" +
              (sub ? '<div class="pcol-sub">' + sub + "</div>" : "") +
              '<div class="pinst-acts">' +
              instCellActions(p, inst) +
              "</div>" +
              "</div>"
            );
          })
          .join("") +
        "</div>";
    }
    return (
      '<div class="pjob" data-id="' +
      esc(p.id) +
      '">' +
      '<div class="pjob-head">' +
      '<div><div class="pjob-title">' +
      esc(p.title) +
      "</div>" +
      '<div class="pjob-sub">' +
      esc(subLine(p)) +
      (p.accepted ? " · accepted " + esc(p.accepted) : "") +
      "</div></div>" +
      '<div class="pjob-total"><span class="pt-mono">Contract value</span><span class="pt-money">' +
      fmtMoney(p.total) +
      "</span></div>" +
      "</div>" +
      payBlock +
      '<div class="pjob-foot">' +
      '<div class="pjob-foot-l">' +
      // Real: the scheduling surface. An anchor, not a handler, so ⌘-click and
      // "open in new tab" behave — the same shape the Pressroom edition uses.
      '<a class="btn btn-ghost btn--sm" href="/dashboard/calendar"><svg class="ic"><use href="#i-cal"/></svg>Schedule</a>' +
      // Real: mails the client a payment request for the outstanding balance
      // (notifyPaymentReminder with no instalment = the whole total).
      '<button class="btn btn--accent btn--sm" type="button" data-act="request"' +
      (p.clientEmail ? "" : " disabled") +
      '><svg class="ic"><use href="#i-msg"/></svg>Request payment</button>' +
      // Real: opens the same materials sheet the row menu opens.
      '<button class="btn btn-ghost btn--sm" type="button" data-act="materials"><svg class="ic"><use href="#i-box"/></svg>Materials · ' +
      (p.mat || 0) +
      "</button>" +
      // "Change order" was here and did nothing but flash "Drafted": the change
      // order data layer exists (actions/changeOrders.ts) but its only UI —
      // ChangeOrderList / NewChangeOrderSheet — is not mounted on any reachable
      // route, so there is nowhere honest to send this click. Removed rather
      // than left as decoration. See the audit note in the page header.
      // Real: the client-facing page for this proposal.
      '<a class="btn btn-ghost btn--sm" href="/portal/q/' +
      encodeURIComponent(p.publicId) +
      '" target="_blank" rel="noopener noreferrer"><svg class="ic"><use href="#i-ext"/></svg>View public</a>' +
      "</div>" +
      '<div class="pjob-foot-r">' +
      '<button class="btn btn-ghost btn--sm" type="button" data-act="unaccept"><svg class="ic"><use href="#i-undo"/></svg>Un-accept</button>' +
      '<button class="btn btn-primary btn--sm" type="button" data-act="done"><svg class="ic"><use href="#i-check"/></svg>Mark completed</button>' +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }
  function renderAccepted(stagger = false) {
    const stack = $("#propStack");
    if (!stack) return;
    const { slice } = accSlice();
    stack.innerHTML = slice.map(acceptedCardHtml).join("");
    syncAccChrome();
    if (stagger && panelVisible("accepted")) {
      staggerIn(Array.from(stack.querySelectorAll<HTMLElement>(".pjob")));
    }
  }
  function doneSlice() {
    const rows = listDone();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_DONE));
    if (pstate.pageDone > pages) pstate.pageDone = pages;
    return { rows, pages, slice: rows.slice((pstate.pageDone - 1) * PAGE_DONE, pstate.pageDone * PAGE_DONE) };
  }
  function syncDoneChrome() {
    const { rows, pages } = doneSlice();
    $("#doneEmpty")?.classList.toggle("is-hidden", rows.length !== 0);
    renderPager($("#donePager"), pstate.pageDone, pages, "done");
  }
  /** A dashed drop box per slot, showing what is already on the record. The
   *  input is a real <input type="file">, so the click opens the picker and the
   *  change handler uploads through uploadProposalPhoto(). */
  function photoBoxHtml(p: ProposalRow, slot: "before" | "after") {
    const shots = slot === "before" ? p.before : p.after;
    const last = shots[shots.length - 1];
    const label = slot === "before" ? "Before" : "After";
    return (
      '<div><div class="kpi-lbl">' +
      label +
      '</div><label class="photo-box' +
      (last ? " photo-box--filled" : "") +
      '">' +
      (last
        ? '<img src="' + esc(last.url) + '" alt="' + esc(label + " photo") + '">'
        : '<svg class="ic"><use href="#i-imgadd"/></svg>Add ' + label.toLowerCase()) +
      '<input type="file" accept="image/*" hidden data-photo="' +
      slot +
      '"></label></div>'
    );
  }

  function doneCardHtml(p: ProposalRow) {
    const insts = p.inst || [];
    // The donor invented a deposit (30% of the total) when a proposal had no
    // payment schedule. A proposal with no instalments genuinely has no
    // deposit on record, so print the em dash rather than a plausible number.
    const dep = insts.length ? fmtMoney(instDollars(p, insts[0])) : "—";
    const checks = insts
      .map(
        (inst) =>
          '<div class="pchk"><span class="pchk-ic"><svg class="ic"><use href="#i-check"/></svg></span>' +
          '<span class="pchk-lbl">' +
          esc(inst.label) +
          '</span><span class="pchk-lead"></span>' +
          '<span class="pt-money">' +
          fmtMoney(instDollars(p, inst)) +
          "</span></div>",
      )
      .join("");
    return (
      '<div class="psheet" data-id="' +
      esc(p.id) +
      '">' +
      '<div class="psheet-head">' +
      '<div><div class="pjob-title">' +
      esc(p.title) +
      "</div>" +
      '<div class="pjob-sub">' +
      esc(subLine(p)) +
      "</div></div>" +
      '<div><span class="psheet-banklbl">Banked</span><span class="pt-money banked big">' +
      fmtMoney(p.total) +
      "</span></div>" +
      "</div>" +
      '<div class="pcols pcols--sheet">' +
      '<div class="pcol"><div class="kpi-lbl">Deposit</div><div class="pcol-val">' +
      dep +
      '</div><div class="pcol-sub">' +
      (insts.length ? "Locked in" : "No payment schedule") +
      "</div></div>" +
      '<div class="pcol"><div class="kpi-lbl">Start</div><div class="pcol-val">' +
      esc(p.accepted || "—") +
      '</div><div class="pcol-sub">Work began</div></div>' +
      '<div class="pcol"><div class="kpi-lbl">Completed</div><div class="pcol-val good">' +
      esc(p.paid || "—") +
      '</div><div class="pcol-sub">Paid in full</div></div>' +
      "</div>" +
      '<div class="psheet-body">' +
      '<div class="psheet-check">' +
      checks +
      "</div>" +
      '<div class="psheet-photos">' +
      photoBoxHtml(p, "before") +
      photoBoxHtml(p, "after") +
      "</div>" +
      "</div>" +
      '<div class="psheet-foot">' +
      '<div class="psheet-send">' +
      // The donor's "Send paid receipt to <email>" box was decoration: there is
      // no receipt transport in the app (no builder in lib/email/build, no
      // action), so the input and its Send button were removed rather than left
      // pretending to mail something. The proposal PDF — the document a paid
      // client actually asks for — is a real route, so that is what ships here.
      '<span class="kpi-lbl">Paid record</span>' +
      '<a class="btn btn-primary btn--sm" href="/api/proposals/' +
      encodeURIComponent(p.id) +
      '/pdf" target="_blank" rel="noopener noreferrer"><svg class="ic"><use href="#i-download"/></svg>Download PDF</a>' +
      "</div>" +
      '<button class="btn btn-ghost btn--sm" type="button" data-act="unmark"><svg class="ic"><use href="#i-undo"/></svg>Unmark as paid</button>' +
      "</div>" +
      "</div>"
    );
  }
  function renderDone(stagger = false) {
    const stack = $("#doneStack");
    if (!stack) return;
    const { slice } = doneSlice();
    stack.innerHTML = slice.map(doneCardHtml).join("");
    syncDoneChrome();
    if (stagger && panelVisible("completed")) {
      staggerIn(Array.from(stack.querySelectorAll<HTMLElement>(".psheet")));
    }
  }
  function renderProposals(stagger = false) {
    renderKpis();
    renderTabCounts();
    renderChipCounts();
    renderAll(stagger);
    renderAccepted(stagger);
    renderDone(stagger);
  }

  /**
   * One record changed. Repaint the counts and the two lists the user was NOT
   * looking at (silently — they are behind a hidden panel), and leave the acted
   * list to its caller, which patches or removes exactly one node.
   */
  function repaintExcept(acted: "all" | "acc" | "done") {
    renderKpis();
    renderTabCounts();
    renderChipCounts();
    if (acted !== "all") renderAll();
    if (acted !== "acc") renderAccepted();
    if (acted !== "done") renderDone();
  }

  /** Patch a single ALL row in place — the cells that a write can change. */
  function patchAllRow(tr: HTMLElement, p: ProposalRow) {
    const st = statusPlate(p.status);
    const plate = tr.querySelector<HTMLElement>(".pstatus");
    if (plate) {
      plate.className = "pstatus" + (st.cls ? " " + st.cls : "");
      plate.textContent = st.label;
    }
    const money = tr.querySelector<HTMLElement>(".pt-money");
    if (money) money.textContent = fmtMoney(p.total);
    const monos = tr.querySelectorAll<HTMLElement>(".pt-mono");
    if (monos[0]) monos[0].textContent = p.updated;
  }

  /**
   * The one case a single-row exit cannot fix by itself: the row that left was
   * the last one on its page, so the reader is looking at an empty table with
   * records still in the book. Scheduled AFTER the exit (leave 180 + close 260)
   * so it never replaces the nodes the FLIP is still moving. A whole new page
   * of records genuinely arriving is one of the few things that earns a stagger.
   */
  function healAllPage() {
    after(460, () => {
      const body = $("#propTableBody");
      if (!body) return;
      const { slice } = allSlice();
      if (body.querySelectorAll(".prow").length === 0 && slice.length > 0) renderAll(true);
    });
  }
  /** Same repair for the two card stacks. */
  function healStack(kind: "acc" | "done") {
    after(460, () => {
      if (kind === "acc") {
        const stack = $("#propStack");
        if (stack && stack.querySelectorAll(".pjob").length === 0 && accSlice().slice.length > 0) {
          renderAccepted(true);
        }
        return;
      }
      const stack = $("#doneStack");
      if (stack && stack.querySelectorAll(".psheet").length === 0 && doneSlice().slice.length > 0) {
        renderDone(true);
      }
    });
  }

  /**
   * Reflect a change to one record in the ALL table.
   * - still on this page  → patch that row's cells, nothing else moves;
   * - no longer on it     → that row alone leaves through leaveRow;
   * - not currently drawn → a silent repaint (nothing on screen animates).
   */
  function syncAllAfterChange(id: string) {
    const body = $("#propTableBody");
    const tr = findRow(body, id);
    const onPage = allSlice().slice.some((p) => p.id === id);
    if (tr && !onPage) {
      leaveRow(
        tr,
        () => {
          syncAllChrome();
          repaintExcept("all");
          healAllPage();
        },
        after,
        { leaveClass: "is-leaving" },
      );
      return;
    }
    if (tr) {
      const p = byId(id);
      if (p) patchAllRow(tr, p);
      syncAllChrome();
      repaintExcept("all");
      return;
    }
    renderAll();
    repaintExcept("all");
  }

  // ================= PROPOSALS: ROW CONTEXT MENU =================
  const pMenu = $("#pMenu");
  type MenuOpts = { href?: string; blank?: boolean; dis?: boolean; danger?: boolean };
  function menuItem(
    icon: string,
    tone: string,
    t: string,
    sub: string,
    act: string,
    opts: MenuOpts = {},
  ) {
    const cls =
      "pmenu-item" + (opts.dis ? " is-disabled" : "") + (opts.danger ? " is-danger" : "");
    const inner =
      '<span class="pmi-ic' +
      (tone ? " " + tone : "") +
      '"><svg class="ic"><use href="#' +
      icon +
      '"/></svg></span>' +
      '<span><span class="pmenu-item-t">' +
      t +
      '</span><span class="pmenu-item-s" style="display:block">' +
      sub +
      "</span></span>";
    // Navigations are real links: middle-click, ⌘-click and "copy link
    // address" all work, and they need no JavaScript to do their job.
    if (opts.href && !opts.dis) {
      return (
        '<a class="' +
        cls +
        '" href="' +
        opts.href +
        '" data-mact="' +
        act +
        '"' +
        (opts.blank ? ' target="_blank" rel="noopener noreferrer"' : "") +
        ">" +
        inner +
        "</a>"
      );
    }
    return (
      '<button class="' +
      cls +
      '" type="button" data-mact="' +
      act +
      '"' +
      (opts.dis ? " disabled" : "") +
      ">" +
      inner +
      "</button>"
    );
  }
  function openMenu(id: string, btn: HTMLElement) {
    const p = byId(id);
    if (!p || !pMenu) return;
    pstate.menuId = id;
    pstate.menuBtn = btn;
    pMenu.innerHTML =
      '<div class="pmenu-head"><div class="pmenu-title">' +
      esc(p.title) +
      '</div><div class="pmenu-sub">' +
      esc(subLine(p)) +
      "</div></div>" +
      menuItem("i-pen", "pmi--bp", "Edit proposal", "Open editor", "edit", {
        href: "/dashboard/proposals/" + encodeURIComponent(p.id),
      }) +
      menuItem("i-ext", "pmi--sky", "View public page", "New tab", "view", {
        href: "/portal/q/" + encodeURIComponent(p.publicId),
        blank: true,
      }) +
      menuItem("i-dup", "", "Duplicate", "Clone &amp; edit", "dup") +
      '<div class="pmenu-div"></div>' +
      menuItem(
        "i-send",
        "pmi--ok",
        "Send to client",
        p.clientEmail ? esc(p.clientEmail) : "No email on the client",
        "sendto",
      ) +
      menuItem("i-box", "pmi--warn", "Order materials", (p.mat || 0) + " items", "materials", {
        dis: p.mat === 0,
      }) +
      menuItem(
        "i-building",
        "",
        "View on Zillow",
        p.zillow ? "Open listing" : "No address on client",
        "zillow",
        { href: p.zillow ?? undefined, blank: true, dis: !p.zillow },
      ) +
      '<div class="pmenu-div"></div>' +
      menuItem("i-trash", "pmi--danger", "Delete proposal", "Permanent", "del", { danger: true });
    pMenu.classList.add("open");
    // FLUID SCALE zoom lives on the SHELL ROOT (.jf-blueprint), not on this
    // page's `.content` column and not on documentElement — so reading it off
    // `root` here always parsed "" to NaN and fell through to 1. At any window
    // other than the ~1728px reference the menu was then laid out in the wrong
    // unit system: on a wide screen (zoom up to 1.35) it painted 254 × zoom
    // wide while the clamp still believed 254, and ran off the right edge of
    // the viewport with the client's email clipped in half.
    const z = currentZoom(btn);
    const vw = window.innerWidth / z,
      vh = window.innerHeight / z;
    // getBoundingClientRect reports ZOOMED pixels; `left`/`top` are written
    // back into the zoomed subtree, which measures in unzoomed ones. Every
    // measurement crossing that boundary has to be divided by z.
    const r = btn.getBoundingClientRect();
    const rRight = r.right / z,
      rTop = r.top / z,
      rBottom = r.bottom / z;
    const mw = 254;
    let left = Math.min(rRight - mw, vw - mw - 12);
    left = Math.max(12, left);
    pMenu.style.left = left + "px";
    pMenu.style.top = "0px";
    const mh = pMenu.offsetHeight;
    let top = rBottom + 6;
    if (top + mh > vh - 12) top = Math.max(12, rTop - mh - 6);
    pMenu.style.top = top + "px";
  }
  function closeMenu() {
    pstate.menuId = null;
    pMenu?.classList.remove("open");
  }
  // `.main` lives in the SHELL and survives navigation, so this listener has to
  // be tracked — an untracked one would stack up a dead closure per visit.
  if (main) on(main, "scroll", closeMenu, { passive: true });

  // ================= DIALOGS =================
  function openDlg(id: string) {
    const el = $("#" + id);
    if (el) openMdl(el);
  }
  function closeDlg(id: string) {
    const el = $("#" + id);
    if (el) closeMdl(el, after);
  }
  function setDlgError(sel: string, msg: string | null) {
    const box = $(sel);
    if (!box) return;
    box.textContent = msg ?? "";
    box.classList.toggle("is-hidden", !msg);
  }
  /** Busy state on a dialog's confirm button — same shape as Workers. */
  function setSaving(btn: HTMLElement | null, busy: boolean, busyLbl: string, idleLbl: string) {
    if (!btn) return;
    pstate.writing = busy;
    btn.classList.toggle("is-busy", busy);
    (btn as HTMLButtonElement).disabled = busy;
    const lbl = btn.querySelector<HTMLElement>("[data-save-lbl]");
    if (lbl) lbl.textContent = busy ? busyLbl : idleLbl;
  }
  function showAlert(title: string, msg: string) {
    const t = $("#alertTitle");
    const b = $("#alertTxt");
    if (t) t.textContent = title;
    if (b) b.textContent = msg;
    openDlg("alertMdl");
  }

  // Materials sheet — the finished React component, mounted as an island over
  // its own empty host. Props flow in; the only thing coming back is onClose.
  let matIsland: Island<MaterialsSheetProps> | null = null;
  let matProps: MaterialsSheetProps = {
    open: false,
    onClose: closeMaterials,
    proposalTitle: "",
    clientName: "",
    items: [],
  };
  function closeMaterials() {
    matProps = { ...matProps, open: false };
    matIsland?.update(matProps);
  }
  function shoppable(p: ProposalRow) {
    return p.materials.filter((m) => (m.materialCost ?? 0) > 0 && m.quantity > 0);
  }
  function openMaterials(p: ProposalRow) {
    const host = $("#pMatHost");
    if (!host) return;
    if (shoppable(p).length === 0) {
      showAlert(
        "Nothing to order",
        `"${p.title}" has no line item with a material cost, so there is nothing to shop for. Add materials in the editor first.`,
      );
      return;
    }
    matProps = {
      open: true,
      onClose: closeMaterials,
      proposalTitle: p.title,
      clientName: p.client,
      items: p.materials,
    };
    if (!matIsland) matIsland = mountIsland(host, MaterialsSheet, matProps);
    else matIsland.update(matProps);
  }
  disposers.push(() => {
    matIsland?.destroy();
    matIsland = null;
  });

  // ================= PROPOSALS: EVENTS =================
  function flashBtn(btn: HTMLElement, label: string) {
    if (btn.dataset.busy) return;
    btn.dataset.busy = "1";
    const old = btn.innerHTML;
    btn.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>' + label;
    btn.classList.add("is-flashed");
    after(1600, () => {
      btn.innerHTML = old;
      btn.classList.remove("is-flashed");
      delete btn.dataset.busy;
    });
  }
  $("#pTabs")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".ptab");
    if (!btn || btn.classList.contains("active")) return;
    pstate.tab = btn.dataset.tab || "all";
    root.querySelectorAll<HTMLElement>("#pTabs .ptab").forEach((t) => t.classList.toggle("active", t === btn));
    $$(".ppanel").forEach((pn) => pn.classList.toggle("is-hidden", pn.dataset.panel !== pstate.tab));
    renderKpis();
    // A panel's rows arrive the first time it is actually on screen. Playing
    // the cascade earlier — while the panel is display:none — would leave every
    // row pinned at `transform: none`, which kills row hover for good.
    if (!pstate.revealed[pstate.tab]) {
      pstate.revealed[pstate.tab] = true;
      const stack =
        pstate.tab === "accepted" ? $("#propStack") : pstate.tab === "completed" ? $("#doneStack") : $("#propTableBody");
      if (stack) staggerIn(Array.from(stack.querySelectorAll<HTMLElement>(".prow, .pjob, .psheet")));
    }
  });
  $("#pChips")?.addEventListener("click", (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>(".pchip");
    if (!chip) return;
    pstate.filter = chip.dataset.f || "ALL";
    pstate.pageAll = 1;
    root.querySelectorAll<HTMLElement>("#pChips .pchip").forEach((c) => c.classList.toggle("active", c === chip));
    // A filter toggle is NOT a list arriving — it repaints silently.
    renderAll();
  });

  on(document, "click", (e) => {
    const target = e.target as HTMLElement;

    // Dialog dismissals (scrim, ×, Cancel, the alert's Close).
    const dismiss = target.closest<HTMLElement>("[data-mdl]");
    if (dismiss) {
      if (pstate.writing) return; // never interrupt a write already on the wire
      const which = dismiss.dataset.mdl;
      if (which === "send") closeDlg("sendMdl");
      if (which === "del") closeDlg("delMdl");
      if (which === "alert") closeDlg("alertMdl");
      return;
    }

    const menuBtn = target.closest<HTMLElement>("[data-menu]");
    if (menuBtn) {
      const id = String(menuBtn.dataset.menu);
      if (pstate.menuId === id) closeMenu();
      else openMenu(id, menuBtn);
      return;
    }
    const mact = target.closest<HTMLElement>("[data-mact]");
    if (mact) {
      const id = pstate.menuId;
      const p = byId(id);
      const act = mact.dataset.mact;
      if (mact.classList.contains("is-disabled")) {
        e.preventDefault();
        return;
      }
      // `edit`, `view` and `zillow` are real anchors — let the browser follow
      // them. Closing the menu is deferred past the end of this dispatch:
      // `display: none`-ing the anchor mid-click can cancel the navigation.
      if (act === "edit" || act === "view" || act === "zillow") {
        after(0, closeMenu);
        return;
      }
      closeMenu();
      if (!p || !id) return;
      if (pstate.writing) return;
      if (act === "dup") {
        void runDuplicate(p, menuBtnFor(id));
        return;
      }
      if (act === "sendto") {
        promptSend(p);
        return;
      }
      if (act === "materials") {
        openMaterials(p);
        return;
      }
      if (act === "del") {
        promptDelete(p);
        return;
      }
      return;
    }
    if (!target.closest(".pmenu")) closeMenu();

    const pg = target.closest<HTMLButtonElement>(".pager-btn");
    if (pg && !pg.disabled) {
      const d = pg.dataset.pg === "next" ? 1 : -1;
      // A page turn IS a list arriving — a whole new set of records lands, and
      // nothing the reader was using is destroyed.
      if (pg.dataset.key === "all") {
        pstate.pageAll += d;
        renderAll(true);
      }
      if (pg.dataset.key === "acc") {
        pstate.pageAcc += d;
        renderAccepted(true);
      }
      if (pg.dataset.key === "done") {
        pstate.pageDone += d;
        renderDone(true);
      }
      return;
    }

    const act = target.closest<HTMLElement>("[data-act]");
    if (act) {
      const kind = act.dataset.act;
      const card = act.closest<HTMLElement>("[data-id]");
      const p = byId(card?.dataset.id ?? null);
      if (kind === "materials" && p) {
        openMaterials(p);
        return;
      }
      if (kind === "done" && p && card) {
        void runStatus(p, "PAID", card, "acc");
        return;
      }
      if (kind === "unaccept" && p && card) {
        void runStatus(p, "DRAFT", card, "acc");
        return;
      }
      if (kind === "unmark" && p && card) {
        void runStatus(p, "ACCEPTED", card, "done");
        return;
      }
      // Both of these mail the client through notifyPaymentReminder(): the
      // instalment row sends that line, the footer button sends the whole
      // outstanding balance (the action falls back to the proposal total when
      // it cannot find the instalment).
      if (kind === "remind" && p) {
        void runReminder(p, act.dataset.inst ?? "", act);
        return;
      }
      if (kind === "markpaid" && p) {
        openMarkPaidPicker(act, p, act.dataset.inst ?? "");
        return;
      }
      if (kind === "markpaid-go" && p) {
        void runMarkPaid(p, act.dataset.inst ?? "", act.dataset.method ?? "OTHER", act);
        return;
      }
      if (kind === "unmark-line" && p) {
        void runUnmark(p, act.dataset.inst ?? "", act);
        return;
      }
      if (kind === "request" && p) {
        void runReminder(p, "", act);
        return;
      }
    }
  });

  // Completion photos — a real <input type="file"> inside each dashed box.
  on(document, "change", (e) => {
    const input = e.target as HTMLInputElement;
    if (!input || input.type !== "file" || !input.dataset.photo) return;
    const slot = input.dataset.photo === "after" ? "after" : "before";
    const card = input.closest<HTMLElement>("[data-id]");
    const p = byId(card?.dataset.id ?? null);
    const file = input.files?.[0];
    input.value = "";
    if (!p || !file) return;
    void runPhotoUpload(p, slot, file, input.closest<HTMLElement>(".photo-box"));
  });

  function menuBtnFor(id: string): HTMLElement | null {
    const tr = findRow($("#propTableBody"), id);
    return tr?.querySelector<HTMLElement>(".pt-open") ?? null;
  }

  // ================= WRITES (real server actions) =================
  // These are the live proposal actions from src/actions/proposals.ts — the
  // same ones the classic row menu called. They are org-scoped and
  // owner-scoped on the server and they revalidate /dashboard/proposals.
  // `proposalsData` is patched from the result so the book repaints
  // immediately; a reload reads the same rows back from the database.

  async function runDuplicate(p: ProposalRow, btn: HTMLElement | null) {
    pstate.writing = true;
    btn?.classList.add("is-busy");
    try {
      const res = await duplicateProposal(p.id);
      // Duplicating is a LIST action: it makes a second row, and the person
      // doing it is working through the list. Sending them into an editor for
      // the copy (which is what "Clone & edit" used to do, via a hard
      // location.assign that also replayed the whole blueprint entrance) threw
      // away their filter, their tab and their scroll position to open a
      // document they had not asked to edit.
      //
      // Re-reading the book is what makes the copy appear: duplicateProposal
      // returns only an id, and a row needs a publicId, a client, totals and a
      // Zillow link — all server-derived. loadProposalBook() is the SAME query
      // the page rendered from, behind the same guard.
      proposalsData = cloneRows(await loadProposalBook());
      renderAll();
      repaintExcept("all");
      pstate.writing = false;
      btn?.classList.remove("is-busy");
      flashRow(res.id);
    } catch (err) {
      pstate.writing = false;
      btn?.classList.remove("is-busy");
      showAlert("Couldn't duplicate", actionError(err));
    }
  }

  /** Bring a freshly-created row into view and mark it, so a copy that lands
   *  further down a long list is not silently off-screen. */
  function flashRow(id: string) {
    const tr = findRow($("#propTableBody"), id);
    if (!tr) return;
    tr.scrollIntoView({ block: "center", behavior: "smooth" });
    tr.classList.add("is-fresh");
    window.setTimeout(() => tr.classList.remove("is-fresh"), 2200);
  }

  let sendId: string | null = null;
  function promptSend(p: ProposalRow) {
    sendId = p.id;
    const title = $("#sendTitle");
    if (title) title.textContent = `Send "${p.title}"`;
    const email = $<HTMLInputElement>("#sendEmail");
    if (email) {
      // Read-only on purpose. sendProposal() mails the address on the CLIENT
      // record — an editable box here would look like it changed the recipient
      // and would change nothing at all.
      email.value = p.clientEmail ?? "";
      email.placeholder = p.clientEmail ? "" : "No email on the client record";
      email.disabled = true;
    }
    const note = $("#sendNote");
    if (note) {
      note.textContent = p.clientEmail
        ? "A branded email with the proposal link goes to this address — the one on the client record. They can view, accept and pay from the public page."
        : "This client has no email on file. The proposal will be marked Sent, but no email goes out until you add an address to the client record.";
    }
    setDlgError("#sendErr", null);
    setSaving($("#sendOk"), false, "", "Send proposal");
    pstate.writing = false;
    openDlg("sendMdl");
  }
  const sendOk = $("#sendOk");
  if (sendOk) {
    on(sendOk, "click", () => {
      if (pstate.writing) return;
      void confirmSend();
    });
  }
  async function confirmSend() {
    const p = byId(sendId);
    if (!p) return;
    setDlgError("#sendErr", null);
    setSaving($("#sendOk"), true, "Sending…", "");
    try {
      await sendProposal(p.id);
      p.status = "SENT";
      p.updated = "just now";
      setSaving($("#sendOk"), false, "", "Send proposal");
      closeDlg("sendMdl");
      syncAllAfterChange(p.id);
    } catch (err) {
      setSaving($("#sendOk"), false, "", "Send proposal");
      // sendProposal refuses BEFORE writing when the provider fails, so the
      // proposal is genuinely still unsent — say so instead of closing.
      setDlgError("#sendErr", actionError(err));
    }
  }

  let delId: string | null = null;
  function promptDelete(p: ProposalRow) {
    delId = p.id;
    const txt = $("#delTxt");
    if (txt) {
      txt.textContent = `"${p.title}" for ${p.client}. This removes the proposal, its line items, payment schedule and snapshots. Public links stop working, and it can't be undone.`;
    }
    setDlgError("#delErr", null);
    setSaving($("#delOk"), false, "", "Delete forever");
    pstate.writing = false;
    openDlg("delMdl");
  }
  const delOk = $("#delOk");
  if (delOk) {
    on(delOk, "click", () => {
      if (pstate.writing) return;
      void confirmDelete();
    });
  }
  async function confirmDelete() {
    const id = delId;
    const p = byId(id);
    if (!id || !p) return;
    setDlgError("#delErr", null);
    setSaving($("#delOk"), true, "Deleting…", "");
    try {
      const res = await bulkDeleteProposals([id]);
      if (res.deleted === 0) {
        setSaving($("#delOk"), false, "", "Delete forever");
        setDlgError("#delErr", "That proposal is no longer yours to delete. Reload the page.");
        return;
      }
      proposalsData = proposalsData.filter((x) => x.id !== id);
      setSaving($("#delOk"), false, "", "Delete forever");
      closeDlg("delMdl");
      delId = null;
      // The row leaves alone, once the dialog is out of the way. Every other
      // list repaints silently inside leaveRow's commit.
      after(MDL_EXIT_MS, () => {
        const tr = findRow($("#propTableBody"), id);
        if (tr) {
          leaveRow(
            tr,
            () => {
              syncAllChrome();
              repaintExcept("all");
              healAllPage();
            },
            after,
            { leaveClass: "is-leaving" },
          );
        } else {
          renderProposals();
        }
      });
    } catch (err) {
      setSaving($("#delOk"), false, "", "Delete forever");
      setDlgError("#delErr", actionError(err));
    }
  }

  /**
   * Mark completed / Un-accept / Unmark as paid. The card always leaves the
   * stack it was in (its status no longer belongs there), so it exits through
   * leaveRow and every other list repaints behind a hidden panel.
   */
  async function runStatus(
    p: ProposalRow,
    status: "PAID" | "DRAFT" | "ACCEPTED",
    card: HTMLElement,
    acted: "acc" | "done",
  ) {
    if (pstate.writing) return;
    pstate.writing = true;
    card.classList.add("is-busy");
    try {
      const res = await updateProposalStatus(p.id, status);
      if (!res.ok) {
        pstate.writing = false;
        card.classList.remove("is-busy");
        if (res.reason === "payment_outstanding") {
          showAlert(
            "Money still owed",
            fmtMoney(res.remainingMinor / 100) +
              " is outstanding. Use Mark paid on each stage (or Record payment) first, then mark completed.",
          );
        } else if (res.reason === "provider_paid") {
          showAlert(
            "Paid through Stripe / Square",
            "Refund it from that dashboard — the proposal syncs back automatically.",
          );
        } else {
          showAlert("Stages already paid", "A proposal with paid stages can't go back to draft.");
        }
        return;
      }
      p.status = status;
      p.updated = "just now";
      if (status === "PAID") p.paid = todayPlate();
      if (status === "ACCEPTED") p.paid = undefined;
      if (status === "DRAFT") {
        p.accepted = undefined;
        p.paid = undefined;
      }
      pstate.writing = false;
      card.classList.remove("is-busy");
      leaveRow(
        card,
        () => {
          if (acted === "acc") syncAccChrome();
          else syncDoneChrome();
          repaintExcept(acted);
          healStack(acted);
        },
        after,
        { leaveClass: "is-leaving" },
      );
    } catch (err) {
      pstate.writing = false;
      card.classList.remove("is-busy");
      showAlert("Couldn't update", actionError(err));
    }
  }
  function todayPlate() {
    return new Date()
      .toLocaleDateString("en-US", { month: "short", day: "2-digit" })
      .toUpperCase();
  }

  /**
   * Mark paid (manual). The button turns into a three-way method picker in
   * place — bank / cash / check — so recording a payment is two taps and no
   * modal. The stage's own amount is recorded; a different figure is a job
   * for the desktop editor.
   */
  function openMarkPaidPicker(btn: HTMLElement, p: ProposalRow, instId: string) {
    const host = btn.parentElement;
    if (!host) return;
    host.innerHTML =
      '<span class="pinst-pick">' +
      ["BANK_TRANSFER|Bank", "CASH|Cash", "CHECK|Check"]
        .map((m) => {
          const [key, label] = m.split("|");
          return (
            '<button class="btn btn-ghost btn--sm" type="button" data-act="markpaid-go" data-inst="' +
            esc(instId) +
            '" data-method="' +
            key +
            '">' +
            label +
            "</button>"
          );
        })
        .join("") +
      "</span>";
    void p;
  }
  async function runMarkPaid(p: ProposalRow, instId: string, method: string, btn: HTMLElement) {
    if (pstate.writing) return;
    pstate.writing = true;
    (btn as HTMLButtonElement).disabled = true;
    try {
      await markInstallmentPaid({ installmentId: instId, method });
      proposalsData = cloneRows(await loadProposalBook());
      renderAccepted();
      repaintExcept("acc");
    } catch (err) {
      showAlert("Couldn't record payment", actionError(err));
    } finally {
      pstate.writing = false;
    }
  }
  async function runUnmark(p: ProposalRow, instId: string, btn: HTMLElement) {
    if (pstate.writing) return;
    pstate.writing = true;
    (btn as HTMLButtonElement).disabled = true;
    try {
      const res = await unmarkInstallmentPaid(instId);
      if (!res.ok) {
        showAlert("Can't undo here", res.message);
        (btn as HTMLButtonElement).disabled = false;
        return;
      }
      proposalsData = cloneRows(await loadProposalBook());
      renderAccepted();
      repaintExcept("acc");
    } catch (err) {
      showAlert("Couldn't undo", actionError(err));
      (btn as HTMLButtonElement).disabled = false;
    } finally {
      pstate.writing = false;
    }
    void p;
  }

  /**
   * Remind / Request payment. One action for both: notifyPaymentReminder mails
   * the client the branded reminder with a link to the public page. An empty
   * `installmentId` is the whole balance — the action's own fallback, not a
   * trick — which is exactly what "Request payment" means on a contract card.
   *
   * The action is requireManager()-gated, so a SALES / ESTIMATOR caller gets a
   * refusal here rather than a silent no-op; it also RETURNS a skip reason
   * instead of throwing, so a skipped send has to be reported too.
   */
  async function runReminder(p: ProposalRow, installmentId: string, btn: HTMLElement) {
    if (pstate.writing) return;
    pstate.writing = true;
    (btn as HTMLButtonElement).disabled = true;
    try {
      const res = await notifyPaymentReminder({ proposalId: p.id, installmentId });
      if (res && "skipped" in res && res.skipped) {
        showAlert(
          "Nothing sent",
          res.reason === "no-client-email"
            ? "This client has no email on file. Add an address to the client record and try again."
            : "That proposal is no longer available to you. Reload the page.",
        );
      } else {
        flashBtn(btn, "Sent");
      }
    } catch (err) {
      showAlert("Couldn't send", actionError(err));
    } finally {
      pstate.writing = false;
      (btn as HTMLButtonElement).disabled = false;
    }
  }

  /** Before / After completion shot → uploadProposalPhoto(). The action stores
   *  it on the proposal (Vercel Blob when configured, inline data URL if not)
   *  and returns the persisted record, which is what the box then shows. */
  async function runPhotoUpload(
    p: ProposalRow,
    slot: "before" | "after",
    file: File,
    box: HTMLElement | null,
  ) {
    if (pstate.writing) return;
    pstate.writing = true;
    box?.classList.add("is-busy");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("Couldn't read that file."));
        fr.readAsDataURL(file);
      });
      const photo = await uploadProposalPhoto(p.id, dataUrl, file.name, slot);
      if (slot === "before") p.before = [...p.before, photo];
      else p.after = [...p.after, photo];
      if (box) {
        box.classList.add("photo-box--filled");
        const img = document.createElement("img");
        img.src = photo.url;
        img.alt = slot === "before" ? "Before photo" : "After photo";
        box.querySelectorAll("svg, img").forEach((n) => n.remove());
        box.childNodes.forEach((n) => {
          if (n.nodeType === Node.TEXT_NODE) n.textContent = "";
        });
        box.prepend(img);
      }
    } catch (err) {
      showAlert("Couldn't add the photo", actionError(err));
    } finally {
      pstate.writing = false;
      box?.classList.remove("is-busy");
    }
  }

  // ================= INITIALIZATION =================
  renderProposals();
  pstate.revealed.all = true;

  // The mobile nav drawer and FLUID SCALE belong to the persistent chrome and
  // now live in components/v3/blueprint-shell/shell-behavior.ts.

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Reveal: load + scroll
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
    const blocks = $$(".content > *:not(.mdl):not([data-island])");
    blocks.forEach((el, i) => {
      el.classList.add("rv");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? i * 60 + "ms" : "200ms";
    });
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

    // Row stagger on the FIRST paint of the visible tab. The donor drove this
    // from a MutationObserver on each list; that replayed the full cascade on
    // every render — a filter, a keystroke, a delete — and read as the list
    // wiping itself. `staggerIn` is called from the places where a list
    // genuinely arrives instead (here, a tab's first reveal, a page turn).
    const firstList = $("#propTableBody");
    if (firstList) staggerIn(Array.from(firstList.querySelectorAll<HTMLElement>(".prow")));

    // KPI count-up
    $$(".kpi-val").forEach((el) => {
      const raw = (el.textContent || "").trim();
      const money = raw.charAt(0) === "$";
      const target = parseInt(raw.replace(/[^0-9]/g, ""), 10);
      if (!isFinite(target)) return;
      let t0: number | null = null;
      function frame(t: number) {
        if (!t0) t0 = t;
        const pr = Math.min(1, (t - t0) / 750);
        const e = 1 - Math.pow(1 - pr, 3);
        el.textContent = (money ? "$" : "") + Math.round(target * e).toLocaleString("en-US");
        if (pr < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });

    // Press effects
    function pressify(sel: string, cls: string) {
      on(root, "click", (e) => {
        const el = (e.target as Element).closest<HTMLElement>(sel);
        if (!el || !root.contains(el)) return;
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
      });
      on(root, "animationend", (e) => {
        const el = e.target as HTMLElement;
        if (el.matches && el.matches(sel)) el.classList.remove(cls);
      });
    }
    // Shell controls (.icon-btn, .sb-foot-*) press from the shell module.
    pressify(
      ".page-actions .btn, .card-foot-btn, .ptab, .pchip, .pager-btn, .pmenu-item, .photo-box, .pt-open, .pjob-foot .btn, .psheet-foot .btn, .td-remind .btn",
      "pressed",
    );

    // (Graph-paper parallax lives in the shell — it owns .main.)
  })();

  // The sliding sidebar indicator lives in the shell — it survives navigation
  // and re-points at whichever item React marks `active`.

  return () => {
    disposers.forEach((d) => d());
  };
}
