// Leads blueprint — runtime behaviors, ported verbatim from the donor file's
// <script> (jobflex-leads-blueprint_3.html). Every duration, easing, stagger,
// page size, regex and formula is the donor's exact value. Adaptations are
// mechanical only:
// - queries are scoped to the mounted `.content` root;
// - document/window listeners, timers, intervals and observers are tracked for
//   unmount cleanup;
// - the shell (components/v3/blueprint-shell/shell-behavior.ts) already owns
//   the mobile nav drawer, FLUID SCALE, the sidebar cascade, the sliding
//   active-item indicator and the graph-paper parallax, so those donor blocks
//   are NOT re-implemented here;
// - the donor's `safe(name, fn)` try/catch wrapper existed to stop one failing
//   module from unbinding the rest of a single top-level script; the port's
//   modules are already separated by file, so it is omitted;
// - the donor's window.matchMedia polyfill targeted file:// preview shells and
//   is inert in a Next.js client component.
//
// One structural difference the donor forced: its delete-confirm dialog
// (`.mdl`) is a sibling of `.main`, but this page may only render inside
// `.content`. It is therefore the last child of the fragment, and the reveal
// cascade below skips it so the fixed overlay is never left at `opacity: 0`
// (the donor never applied `.rv` to it either). `leads.module.css` carries the
// matching stacking-context escape hatch.

import { claimLead, deleteLead, importLeads, updateLeadStatus } from "@/actions/leads";
import { acceptLeadOffer, declineLeadOffer } from "@/actions/leadOffers";
import { closeMdl, openMdl } from "@/components/v3/blueprint-shell/mdl-motion";
import { leaveRow, staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import {
  LEADS_SEED,
  OFFERS_SEED,
  STAGES,
  LEAD_STATUSES,
  SRC,
  PAGE_SIZE,
  parseCsvRows,
  type Lead,
  type Offer,
  type StagedRow,
} from "./leads-data";

export type LeadsContentOptions = {
  /** The org's real pipeline, read server-side. Omit to fall back to the donor
   *  fixture (the standalone mock routes have no session to read from). */
  leads?: Lead[];
  /** Live Lead Center offers. Same fallback rule as `leads`. */
  offers?: Offer[];
  /** `router.refresh()` — pulls rows the client cannot construct itself (an
   *  import returns a count, an accepted offer materializes server-side). */
  refresh?: () => void;
  /** Handed the page's handle once it is live, so the React wrapper can push
   *  freshly-revalidated server rows in without remounting the module. */
  onReady?: (handle: LeadsHandle) => void;
};

/** The only way into a mounted leads sheet from React. */
export type LeadsHandle = {
  /** Adopt server rows. A no-op when they already match what is on screen —
   *  which is the normal case, because every write updates locally first. */
  sync: (leads: Lead[], offers: Offer[]) => void;
};

/** Lead server actions reject with an Error whose message is written for the
 *  user ("You can only update your own leads", "That lead is already claimed by
 *  someone else"). Surface that text; fall back to a generic line for anything
 *  unrecognisable. */
function actionError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  if (!msg || msg.toLowerCase().includes("fetch failed")) {
    return "Something went wrong. Check your connection and try again.";
  }
  return msg;
}

/** Cheap identity of a row set — id, status and assignee are everything this
 *  page paints that a write can change.
 *
 * SORTED, deliberately. A board move pushes the card to the end of the local
 * array (that is where it lands in its new column), while the server returns
 * the same rows in createdAt order — an order-sensitive signature would call
 * that a difference and repaint the whole sheet after every single drag. */
function leadsSig(rows: Lead[]): string {
  return rows
    .map((l) => l.id + "|" + l.status + "|" + (l.assignee || ""))
    .sort()
    .join(",");
}
function offersSig(rows: Offer[]): string {
  return rows.map((o) => o.id).sort().join(",");
}

export function initLeadsContent(
  content: HTMLElement,
  options: LeadsContentOptions = {},
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
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  /** `later` with the argument order the blueprint-shell helpers expect. */
  const after = (ms: number, fn: () => void) => later(fn, ms);
  /**
   * `on` for a possibly-absent element. EVERY listener that outlives this call
   * must go through here or through `on` — nothing may use bare
   * addEventListener on a node React owns.
   *
   * `reactStrictMode` is on, so in development this module mounts, tears down
   * and mounts again against the SAME DOM nodes. An untracked listener from the
   * first mount survives the teardown and keeps running beside the second
   * mount's — two closures, two `leadsData`/`staged` arrays, both writing the
   * same innerHTML. Mutations made through a tracked listener (the delegated
   * document handler) then land in only one of them, and the two states drift:
   * staging a lead ran twice, un-staging one ran once, and each re-render
   * showed whichever closure happened to paint last.
   */
  const onEl = (
    el: HTMLElement | null,
    ev: string,
    fn: EventListener,
    opts?: AddEventListenerOptions,
  ) => {
    if (el) on(el, ev, fn, opts);
  };
  const $ = (sel: string) => root.querySelector<HTMLElement>(sel);
  const $$ = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));

  // The org's real pipeline when the page supplies one (src/app/dashboard/leads),
  // the donor fixture otherwise. Either way it is CLONED, because import /
  // accept / decline / delete / drag mutate it in place: the server actions are
  // the source of truth, and this array mirrors them so the sheet repaints the
  // moment one returns instead of waiting on a round trip through the router.
  const leadsData: Lead[] = (options.leads ?? LEADS_SEED).map((l) => ({ ...l }));
  const offersData: Offer[] = (options.offers ?? OFFERS_SEED).map((o) => ({ ...o }));
  const refresh = options.refresh ?? (() => {});

  // Dismiss Lead Center banners (smooth height + gap collapse) — inert on this
  // page (no banner in the markup), kept for donor parity with shared shells.
  $$(".banner-close").forEach((btn) => {
    on(btn, "click", () => {
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

  // ================= LEADS: STATE =================
  const lstate = {
    tab: "all",
    view: "table",
    status: "ALL",
    source: null as string | null,
    spec: null as string | null,
    query: "",
    page: 1,
    picked: null as string | null,
    /** The lead the delete dialog is currently asking about. */
    pendingDelete: null as string | null,
    /** Ids with a status write in flight — a second drag on the same card is
     *  ignored rather than racing the first. */
    busy: new Set<string>(),
    saving: false,
  };
  const staged: StagedRow[] = [];

  // ================= FAILURE SURFACES =================
  /** Errors that have a dialog / panel of their own land in a boxed line. */
  function setErr(sel: string, msg: string | null) {
    const box = $(sel);
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-hidden", !msg);
  }
  /** Everything else — a refused stage drag, a lost accept/decline race. */
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  function toast(msg: string) {
    const el = $("#lToast");
    const txt = $("#lToastText");
    if (!el || !txt) return;
    txt.textContent = msg;
    el.classList.remove("is-hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastTimer = null;
      el.classList.add("is-hidden");
    }, 6000);
    timers.add(toastTimer);
  }
  /** Button label + disabled state while an action is in flight. */
  function setBusy(sel: string, on: boolean, busyLabel: string, idleLabel: string) {
    lstate.saving = on;
    const btn = root.querySelector<HTMLButtonElement>(sel);
    if (!btn) return;
    btn.disabled = on;
    btn.classList.toggle("is-busy", on);
    const lbl = btn.querySelector<HTMLElement>("[data-save-lbl]");
    if (lbl) lbl.textContent = on ? busyLabel : idleLabel;
  }

  function srcLabel(v: string | null) {
    return v ? SRC[v] || v : "Direct";
  }
  function initials(n: string) {
    const p = n
      .replace(/[^A-Za-z. ]/g, "")
      .split(" ")
      .filter(Boolean);
    return p.length === 1
      ? p[0].slice(0, 2).toUpperCase()
      : (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }
  function incoming() {
    return leadsData.filter(function (l) {
      return l.status === "NEW" || l.status === "ROUTED";
    });
  }
  function pct(c: number) {
    return Math.round(c * 100) + "%";
  }
  function clock(mins: number) {
    const h = Math.floor(mins / 60),
      m = mins % 60;
    return h > 0 ? h + "h " + m + "m left" : m + "m left";
  }
  /** ROUTED -> "Routed", ALL -> "All statuses". Status keys are SCREAMING_CASE. */
  function statusLabel(st: string) {
    if (st === "ALL") return "All statuses";
    return st.charAt(0) + st.slice(1).toLowerCase();
  }

  // ================= RENDER =================
  function renderCounts() {
    const all = $('.ptab-count[data-count="all"]');
    if (all) all.textContent = String(leadsData.length);
    const inc = $('.ptab-count[data-count="incoming"]');
    if (inc) inc.textContent = String(incoming().length + offersData.length);
  }
  function renderFilters() {
    const sources: string[] = [];
    const specs: string[] = [];
    leadsData.forEach(function (l) {
      if (l.source && sources.indexOf(l.source) === -1) sources.push(l.source);
      if (l.spec && specs.indexOf(l.spec) === -1) specs.push(l.spec);
    });
    // Status is a dropdown (.dd, the shell's own pattern): the closed button
    // reports the current status and how many leads it yields, the menu lists
    // all nine. Counts come from `filteredExceptStatus`, so each option answers
    // "how many would I get if I picked this" under the search and the other
    // filters already in play.
    const pool = filteredExceptStatus();
    const statusCount = function (st: string) {
      return st === "ALL" ? pool.length : pool.filter((l) => l.status === st).length;
    };
    const fStatus = $("#fStatus");
    if (fStatus) {
      fStatus.innerHTML = LEAD_STATUSES.map(function (st) {
        const sel = lstate.status === st;
        return (
          '<button class="dd-item' +
          (sel ? " active" : "") +
          '" type="button" role="option" aria-selected="' +
          sel +
          '" data-fs="' +
          st +
          '"><span class="dd-item-lbl">' +
          statusLabel(st) +
          '</span><span class="dd-item-n">' +
          statusCount(st) +
          "</span></button>"
        );
      }).join("");
    }
    const fStatusLbl = $("#fStatusDd .dd-label");
    if (fStatusLbl) fStatusLbl.textContent = statusLabel(lstate.status);
    const fStatusN = $("#fStatusN");
    if (fStatusN) fStatusN.textContent = String(statusCount(lstate.status));
    const fSource = $("#fSource");
    if (fSource) {
      fSource.innerHTML =
        '<button class="fchip' +
        (!lstate.source ? " on" : "") +
        '" type="button" data-fsrc="">Any</button>' +
        sources
          .sort()
          .map(function (v) {
            return (
              '<button class="fchip' +
              (lstate.source === v ? " on" : "") +
              '" type="button" data-fsrc="' +
              v +
              '">' +
              srcLabel(v) +
              "</button>"
            );
          })
          .join("");
    }
    const fSpec = $("#fSpec");
    if (fSpec) {
      fSpec.innerHTML =
        '<button class="fchip' +
        (!lstate.spec ? " on" : "") +
        '" type="button" data-fspec="">Any</button>' +
        specs
          .sort()
          .map(function (v) {
            return (
              '<button class="fchip' +
              (lstate.spec === v ? " on" : "") +
              '" type="button" data-fspec="' +
              v +
              '">' +
              v +
              "</button>"
            );
          })
          .join("");
    }
    const n = (lstate.status !== "ALL" ? 1 : 0) + (lstate.source ? 1 : 0) + (lstate.spec ? 1 : 0);
    const badge = $("#fCount");
    if (badge) {
      badge.textContent = String(n);
      badge.classList.toggle("is-hidden", n === 0);
    }
  }
  /**
   * Everything except the status filter. The status list in the popover counts
   * against THIS set, so each row answers "how many would I get if I picked
   * this" under the search and the other two filters already in play — a count
   * taken from the whole dataset would lie the moment anything else is on.
   */
  function filteredExceptStatus() {
    const q = lstate.query.trim().toLowerCase();
    return leadsData.filter(function (l) {
      if (lstate.source && l.source !== lstate.source) return false;
      if (lstate.spec && l.spec !== lstate.spec) return false;
      if (!q) return true;
      return (
        (l.name + " " + (l.email || "") + " " + l.project + " " + l.desc).toLowerCase().indexOf(q) !==
        -1
      );
    });
  }
  function filtered() {
    return filteredExceptStatus().filter(function (l) {
      return lstate.status === "ALL" || l.status === lstate.status;
    });
  }
  /**
   * The table's frame — empty state and pager. Split out of `renderTable` so a
   * row that LEAVES can refresh the count and the pager without the table body
   * being rebuilt underneath the exit animation.
   */
  function renderPagerAndEmpty() {
    const rows = filtered();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (lstate.page > pages) lstate.page = pages;
    $("#leadsCard")?.classList.toggle("is-hidden", rows.length === 0);
    $("#allEmpty")?.classList.toggle("is-hidden", rows.length !== 0);
    const el = $("#leadsPager");
    if (!el) return;
    if (pages <= 1) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML =
      '<span class="pager-info">Page ' +
      lstate.page +
      " / " +
      pages +
      "</span>" +
      '<button class="pager-btn" type="button" data-pg="prev"' +
      (lstate.page <= 1 ? " disabled" : "") +
      ' aria-label="Previous"><svg class="ic rot-l"><use href="#i-chev"/></svg></button>' +
      '<button class="pager-btn" type="button" data-pg="next"' +
      (lstate.page >= pages ? " disabled" : "") +
      ' aria-label="Next"><svg class="ic rot-r"><use href="#i-chev"/></svg></button>';
  }
  function renderTable() {
    const rows = filtered();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (lstate.page > pages) lstate.page = pages;
    const slice = rows.slice((lstate.page - 1) * PAGE_SIZE, lstate.page * PAGE_SIZE);
    const body = $("#leadTableBody");
    if (body) {
      body.innerHTML = slice
        .map(function (l) {
          return (
            '<tr class="prow" data-id="' +
            l.id +
            '">' +
            '<td><div class="cname"><span class="cav">' +
            initials(l.name) +
            "</span>" +
            '<span><span class="pt-title">' +
            l.name +
            "</span>" +
            '<span class="pt-sub" style="display:block">' +
            (l.email || l.phone || "—") +
            " · " +
            srcLabel(l.source) +
            "</span></span></div></td>" +
            '<td><span class="pt-sub">' +
            l.project +
            "</span>" +
            (l.spec
              ? ' <span class="pstatus ltrade" style="--p:' +
                Math.round(l.conf * 100) +
                '%">' +
                l.spec +
                "<b>" +
                pct(l.conf) +
                "</b></span>"
              : "") +
            "</td>" +
            '<td><span class="pstatus lst--' +
            l.status.toLowerCase() +
            '">' +
            l.status +
            "</span></td>" +
            '<td><span class="pt-mono">' +
            (l.assignee || "—") +
            "</span></td>" +
            '<td><span class="pt-mono">' +
            l.age +
            "</span></td>" +
            '<td class="num"><button class="pt-open" type="button" data-act="ask-delete" aria-label="Delete ' +
            l.name +
            '"><svg class="ic"><use href="#i-trash"/></svg></button></td>' +
            "</tr>"
          );
        })
        .join("");
    }
    renderPagerAndEmpty();
  }
  // ================= BOARD: STAGE COLUMNS + DRAG & DROP =================
  // The dashboard's Lead Flow board, ported from
  // dashboard-blueprint/blueprint-behavior.ts — same markup, same card, same
  // drop-slot preview, same landing animation, same durations and easings.
  // Two differences the leads page forces, both mechanical:
  // - the columns are the seven leads stages, not the dashboard's five, and a
  //   column's items come from `filtered()` rather than the whole dataset, so a
  //   dragged card can leave the board entirely when a status filter is on —
  //   exactly as it leaves the table;
  // - card drag binding is delegated to the board instead of re-attached per
  //   card on every render, because this board re-renders on every filter
  //   keystroke. Identical behavior, no listener churn.
  let dragH = 0;
  let dragSrcStage: string | null = null;

  function leadCardHtml(l: Lead) {
    return (
      '<div class="lead-card" draggable="true" data-id="' +
      l.id +
      '">' +
      '<div class="lead-name">' +
      l.name +
      "</div>" +
      '<div class="lead-job">' +
      l.project +
      " · " +
      l.city +
      "</div>" +
      '<div class="lead-meta"><span class="lead-val' +
      (l.assignee ? "" : " none") +
      '">' +
      (l.assignee || "Unassigned") +
      '</span><span class="lead-age">' +
      l.age +
      "</span></div>" +
      "</div>"
    );
  }
  function collapseSlot(col: HTMLElement, instant?: boolean) {
    const wrap = col.querySelector<HTMLElement>(".stage-cards");
    const slot = wrap && wrap.querySelector<HTMLElement>(".drop-slot");
    if (!wrap || !slot) return;
    wrap.classList.remove("previewing");
    if (instant) {
      slot.remove();
      return;
    }
    slot.classList.remove("open");
    slot.style.height = "0px";
    slot.addEventListener("transitionend", () => slot.remove(), { once: true });
    later(function () {
      if (slot.parentNode) slot.remove();
    }, 300);
  }
  function renderStage(
    st: string,
    opts?: { rows?: Lead[]; animateAll?: boolean; highlightId?: string | null },
  ) {
    const o = opts || {};
    const col = $('.stage-col[data-stage="' + st + '"]');
    if (!col) return;
    const wrap = col.querySelector<HTMLElement>(".stage-cards");
    if (!wrap) return;
    const items = (o.rows || filtered()).filter(function (l) {
      return l.status === st;
    });
    wrap.innerHTML = items.length
      ? items.map(leadCardHtml).join("")
      : '<div class="lead-empty">No leads</div>';
    const count = col.querySelector<HTMLElement>(".stage-count");
    if (count) count.textContent = String(items.length);
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (o.animateAll && !rm) {
      Array.from(wrap.children).forEach(function (child, i) {
        const c = child as HTMLElement;
        c.style.opacity = "0";
        c.style.transform = "translateY(8px)";
        c.style.transition =
          "opacity 280ms cubic-bezier(0.22, 0.61, 0.36, 1) " +
          i * 40 +
          "ms, transform 280ms cubic-bezier(0.22, 0.61, 0.36, 1) " +
          i * 40 +
          "ms";
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            c.style.opacity = "";
            c.style.transform = "";
            c.addEventListener(
              "transitionend",
              () => {
                c.style.transition = "";
              },
              { once: true },
            );
          }),
        );
      });
    }
    if (o.highlightId != null && !rm) {
      const el = wrap.querySelector<HTMLElement>(
        '.lead-card[data-id="' + o.highlightId + '"]',
      );
      if (el) {
        el.classList.add("landed");
        // Transient node, `once` — self-removes, so it stays off the disposer list.
        el.addEventListener("animationend", () => el.classList.remove("landed"), { once: true });
      }
    }
    // A tap-selected card (mobile move) keeps its ring across re-renders.
    if (lstate.picked != null) {
      wrap
        .querySelector<HTMLElement>('.lead-card[data-id="' + lstate.picked + '"]')
        ?.classList.add("picked");
    }
  }
  function renderBoard() {
    const rows = filtered();
    STAGES.forEach(function (st) {
      renderStage(st.key, { rows: rows, animateAll: true });
    });
  }
  /**
   * Board move: the card lands at the END of the target column — exactly where
   * the preview slot sat — and only the two touched columns re-render, so the
   * rest of the board never flickers. The table, tab counts and filter chips
   * are refreshed alongside, since the status change is shared state.
   *
   * The move is OPTIMISTIC and then PERSISTED with `updateLeadStatus` — the
   * same action the classic board used. The server is org-scoped and gates
   * sales reps to their own slice, so a refusal is real and has to be honoured:
   * the card goes back to the column it came from and the action's own message
   * (written for the user) is shown.
   */
  function applyMove(id: string, from: string, to: string, highlight: boolean) {
    const idx = leadsData.findIndex((l) => l.id === id);
    if (idx === -1) return;
    const lead = leadsData[idx];
    leadsData.splice(idx, 1);
    lead.status = to;
    leadsData.push(lead);
    renderCounts();
    renderFilters();
    renderTable();
    renderIncoming();
    const rows = filtered();
    renderStage(from, { rows: rows });
    renderStage(to, { rows: rows, highlightId: highlight ? lead.id : null });
  }
  async function moveLead(id: string, st: string) {
    if (!st) return;
    const lead = leadsData.find((l) => l.id === id);
    if (!lead || lead.status === st) return;
    // A second drop on a card whose first write is still in flight would race
    // its own rollback — ignore it.
    if (lstate.busy.has(id)) return;
    const from = lead.status;
    lstate.picked = null;
    lstate.busy.add(id);
    applyMove(id, from, st, true);
    try {
      await updateLeadStatus(id, st);
      lstate.busy.delete(id);
    } catch (err) {
      lstate.busy.delete(id);
      applyMove(id, st, from, false);
      toast(actionError(err));
    }
  }
  function renderIncoming() {
    const offers = offersData
      .map(function (o) {
        return (
          '<div class="icard" data-offer="' +
          o.id +
          '">' +
          '<div class="icard-strip"><svg class="ic"><use href="#i-send"/></svg>' +
          '<span class="icard-strip-lbl">Platform lead — reserved for your shop</span>' +
          '<span class="icd-timer' +
          (o.mins < 240 ? " warn" : "") +
          '" data-clock="' +
          o.id +
          '">' +
          clock(o.mins) +
          "</span></div>" +
          '<div class="icard-body">' +
          '<div class="icard-top"><span class="cav">' +
          initials(o.name) +
          "</span>" +
          '<div class="icard-id"><div class="icard-name">' +
          o.name +
          "</div>" +
          '<div class="icard-meta" title="' +
          o.age +
          " · Lead center · " +
          o.city +
          '">' +
          o.age +
          " · Lead center · " +
          o.city +
          "</div></div>" +
          '<span class="pstatus lst--new">Offer</span></div>' +
          '<div class="icard-proj">' +
          o.project +
          '<span class="pstatus ltrade" style="--p:' +
          Math.round(o.conf * 100) +
          '%">' +
          o.spec +
          "<b>" +
          pct(o.conf) +
          "</b></span></div>" +
          '<div class="icard-desc">' +
          o.desc +
          "</div>" +
          '<div class="icard-contact">' +
          (o.email || o.phone) +
          "</div>" +
          '<div class="icard-act">' +
          '<button class="btn btn-primary btn--sm" type="button" data-act="offer-yes"><svg class="ic"><use href="#i-check"/></svg>Accept lead</button>' +
          '<button class="btn btn-ghost btn--sm" type="button" data-act="offer-no">Pass</button>' +
          "</div>" +
          "</div></div>"
        );
      })
      .join("");
    const leads = incoming()
      .map(function (l) {
        return (
          '<div class="icard" data-id="' +
          l.id +
          '">' +
          '<div class="icard-body">' +
          '<div class="icard-top"><span class="cav">' +
          initials(l.name) +
          "</span>" +
          '<div class="icard-id"><div class="icard-name">' +
          l.name +
          "</div>" +
          '<div class="icard-meta" title="' +
          l.age +
          " · " +
          srcLabel(l.source) +
          " · " +
          l.city +
          '">' +
          l.age +
          " · " +
          srcLabel(l.source) +
          " · " +
          l.city +
          "</div></div>" +
          '<span class="pstatus lst--' +
          l.status.toLowerCase() +
          '">' +
          l.status +
          "</span></div>" +
          '<div class="icard-proj">' +
          l.project +
          '<span class="pstatus ltrade" style="--p:' +
          Math.round(l.conf * 100) +
          '%">' +
          l.spec +
          "<b>" +
          pct(l.conf) +
          "</b></span></div>" +
          '<div class="icard-desc">' +
          l.desc +
          "</div>" +
          '<div class="icard-contact">' +
          [l.email, l.phone].filter(Boolean).join(" · ") +
          "</div>" +
          '<div class="icard-act">' +
          '<button class="btn btn-primary btn--sm" type="button" data-act="accept"><svg class="ic"><use href="#i-check"/></svg>Accept</button>' +
          '<button class="btn btn-ghost btn--sm" type="button" data-act="decline">Decline</button>' +
          "</div>" +
          "</div></div>"
        );
      })
      .join("");
    const grid = $("#inboxGrid");
    if (grid) grid.innerHTML = offers + leads;
    $("#inboxEmpty")?.classList.toggle("is-hidden", offersData.length + incoming().length !== 0);
  }
  function renderStaged() {
    const count = $("#stagedCount");
    if (count) count.textContent = String(staged.length);
    // The card is a permanent column of the import row, so "empty" is a state
    // it renders — the dashed note plus a dead Import button — rather than a
    // reason to pull the whole card out of the layout.
    $("#stagedEmpty")?.classList.toggle("is-hidden", staged.length !== 0);
    const importBtn = root.querySelector<HTMLButtonElement>("#importBtn");
    if (importBtn) importBtn.disabled = staged.length === 0;
    const list = $("#stagedList");
    if (!list) return;
    list.innerHTML = staged
      .map(function (r, i) {
        return (
          '<div class="st-row"><div><div class="st-name">' +
          r.name +
          "</div>" +
          '<div class="st-meta">' +
          [r.email, r.phone, r.project].filter(Boolean).join(" · ") +
          " · " +
          srcLabel(r.source) +
          "</div></div>" +
          '<button class="st-x" type="button" data-unstage="' +
          i +
          '" aria-label="Remove">×</button></div>'
        );
      })
      .join("");
  }
  function renderLeads() {
    renderCounts();
    renderFilters();
    renderTable();
    renderBoard();
    renderIncoming();
    renderStaged();
  }

  // Offer-window countdown — as in the original, once every 30 seconds
  const clockTimer = setInterval(function () {
    offersData.forEach(function (o) {
      if (o.mins > 0) o.mins -= 1;
      const el = $('[data-clock="' + o.id + '"]');
      if (el) {
        el.textContent = clock(o.mins);
        el.classList.toggle("warn", o.mins < 240);
      }
    });
  }, 30000);
  disposers.push(() => clearInterval(clockTimer));

  // ================= ACTIONS =================
  function setStatus(id: string, st: string) {
    const l = leadsData.find(function (x) {
      return x.id === id;
    });
    if (!l) return;
    l.status = st;
    renderLeads();
  }
  /**
   * Incoming triage. Accept is `claimLead` — it stamps CLAIMED plus who took it
   * and when, which is why it is not just `updateLeadStatus(id,"CLAIMED")`.
   * Decline is `updateLeadStatus(id,"LOST")`, exactly as the classic Incoming
   * tab did. Both are optimistic; a refusal puts the card back.
   */
  async function triage(id: string, kind: "accept" | "decline") {
    const lead = leadsData.find((l) => l.id === id);
    if (!lead || lstate.busy.has(id)) return;
    const from = lead.status;
    lstate.busy.add(id);
    setStatus(id, kind === "accept" ? "CLAIMED" : "LOST");
    try {
      if (kind === "accept") await claimLead(id);
      else await updateLeadStatus(id, "LOST");
      lstate.busy.delete(id);
    } catch (err) {
      lstate.busy.delete(id);
      setStatus(id, from);
      toast(actionError(err));
    }
  }
  /**
   * Lead Center offers. Accept materializes the org Lead server-side, so the
   * new row can only come back from a refresh — the action returns its id, not
   * the row. Pass advances the platform cascade to the next shop.
   */
  async function respondToOffer(offerId: string, kind: "accept" | "pass") {
    const idx = offersData.findIndex((o) => o.id === offerId);
    if (idx === -1 || lstate.busy.has(offerId)) return;
    const offer = offersData[idx];
    lstate.busy.add(offerId);
    offersData.splice(idx, 1);
    renderCounts();
    renderIncoming();
    try {
      if (kind === "accept") await acceptLeadOffer(offerId);
      else await declineLeadOffer(offerId);
      lstate.busy.delete(offerId);
      refresh();
    } catch (err) {
      lstate.busy.delete(offerId);
      offersData.splice(idx, 0, offer);
      renderCounts();
      renderIncoming();
      toast(actionError(err));
    }
  }
  function fadeOut(el: HTMLElement, after: () => void) {
    el.classList.add("out");
    later(after, 220);
  }
  /** The staggered entrance, played only when a list genuinely ARRIVES — first
   *  paint and a tab switch onto it. Repaints after a filter keystroke, a drag
   *  or a delete leave the surviving rows alone (blueprint-shell/list-motion). */
  function staggerList(sel: string) {
    const list = $(sel);
    if (!list) return;
    staggerIn(Array.from(list.querySelectorAll<HTMLElement>(".prow, .icard")));
  }
  function switchTab(name: string) {
    const arriving = lstate.tab !== name;
    lstate.tab = name;
    root.querySelectorAll<HTMLElement>("#lTabs .ptab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.tab === name);
    });
    $$(".ppanel").forEach(function (p) {
      p.classList.toggle("is-hidden", p.dataset.panel !== name);
    });
    if (!arriving) return;
    if (name === "all" && lstate.view === "table") staggerList("#leadTableBody");
    if (name === "incoming") staggerList("#inboxGrid");
  }

  // ================= EVENTS =================
  onEl($("#lTabs"), "click", function (e) {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".ptab");
    if (btn && !btn.classList.contains("active")) switchTab(btn.dataset.tab || "all");
  });
  const lSearch = root.querySelector<HTMLInputElement>("#lSearch");
  if (lSearch) {
    on(lSearch, "input", function () {
      lstate.query = lSearch.value;
      lstate.page = 1;
      renderFilters(); // the status counts are scoped to the search too
      renderTable();
      renderBoard();
    });
  }
  // Filters dropdown: anchored to its button, so it closes the way every other
  // dropdown does — click the button again, click anywhere outside, or Escape.
  function setFilterPop(open: boolean) {
    const pop = $("#fPop");
    const btn = $("#filterBtn");
    if (!pop || !btn) return;
    pop.classList.toggle("open", open);
    btn.classList.toggle("on", open);
    btn.setAttribute("aria-expanded", String(open));
    if (!open) {
      // Never leave the nested status menu open behind a closed panel.
      $("#fStatusDd")?.classList.remove("open");
      $("#fStatusDd .dd-btn")?.setAttribute("aria-expanded", "false");
    }
  }
  onEl($("#filterBtn"), "click", function (e) {
    e.stopPropagation();
    setFilterPop(!$("#fPop")?.classList.contains("open"));
  });
  on(document, "click", function (e) {
    const pop = $("#fPop");
    if (!pop || !pop.classList.contains("open")) return;
    if ((e.target as HTMLElement).closest(".fwrap")) return;
    setFilterPop(false);
  });
  on(document, "keydown", function (e) {
    if ((e as KeyboardEvent).key !== "Escape") return;
    if (!$("#fPop")?.classList.contains("open")) return;
    setFilterPop(false);
    $("#filterBtn")?.focus();
  });
  onEl($("#fClear"), "click", function () {
    lstate.status = "ALL";
    lstate.source = null;
    lstate.spec = null;
    lstate.page = 1;
    renderFilters();
    renderTable();
    renderBoard();
  });
  onEl($("#fPop"), "click", function (e) {
    // Keep clicks inside the dropdown out of the outside-click closer below.
    // It matters beyond taste: renderFilters() replaces these buttons, so by
    // the time the event reached document its target would be a detached node
    // and `closest('.fwrap')` would miss — closing the dropdown on every pick.
    e.stopPropagation();
    const target = e.target as HTMLElement;

    // The status dropdown nested inside the panel: its button toggles it, any
    // other click in the panel closes it.
    const dd = $("#fStatusDd");
    if (target.closest(".dd-btn")) {
      const open = !dd?.classList.contains("open");
      dd?.classList.toggle("open", open);
      dd?.querySelector(".dd-btn")?.setAttribute("aria-expanded", String(open));
      return;
    }
    dd?.classList.remove("open");
    dd?.querySelector(".dd-btn")?.setAttribute("aria-expanded", "false");

    const st = target.closest<HTMLElement>("[data-fs]");
    if (st) {
      const v = st.dataset.fs ?? "ALL";
      lstate.status = lstate.status === v && v !== "ALL" ? "ALL" : v;
    }
    const src = target.closest<HTMLElement>("[data-fsrc]");
    if (src) {
      const v = src.dataset.fsrc;
      lstate.source = !v || lstate.source === v ? null : v;
    }
    const sp = target.closest<HTMLElement>("[data-fspec]");
    if (sp) {
      const v = sp.dataset.fspec;
      lstate.spec = !v || lstate.spec === v ? null : v;
    }
    if (st || src || sp) {
      lstate.page = 1;
      renderFilters();
      renderTable();
      renderBoard();
    }
  });
  onEl($("#vSwitch"), "click", function (e) {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".vsw-btn");
    if (!btn) return;
    lstate.view = btn.dataset.view || "table";
    root.querySelectorAll<HTMLElement>("#vSwitch .vsw-btn").forEach(function (b) {
      b.classList.toggle("active", b === btn);
    });
    $("#tableView")?.classList.toggle("is-hidden", lstate.view !== "table");
    $("#boardView")?.classList.toggle("is-hidden", lstate.view !== "board");
  });
  onEl($("#iMeth"), "click", function (e) {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".imeth-btn");
    if (!btn) return;
    root.querySelectorAll<HTMLElement>("#iMeth .imeth-btn").forEach(function (b) {
      b.classList.toggle("active", b === btn);
    });
    $$(".imp-pane").forEach(function (p) {
      p.classList.toggle("is-hidden", p.dataset.m !== btn.dataset.m);
    });
  });
  onEl($("#mAdd"), "click", function () {
    const nameEl = root.querySelector<HTMLInputElement>("#mName");
    if (!nameEl) return;
    const name = nameEl.value.trim();
    if (!name) {
      nameEl.focus();
      return;
    }
    staged.push({
      name: name,
      email: root.querySelector<HTMLInputElement>("#mEmail")?.value.trim() || null,
      phone: root.querySelector<HTMLInputElement>("#mPhone")?.value.trim() || null,
      project: root.querySelector<HTMLInputElement>("#mProject")?.value.trim() || null,
      description: null,
      source: "MANUAL",
    });
    ["mName", "mEmail", "mPhone", "mProject"].forEach(function (id) {
      const el = root.querySelector<HTMLInputElement>("#" + id);
      if (el) el.value = "";
    });
    renderStaged();
  });
  onEl($("#pasteAdd"), "click", function () {
    const box = root.querySelector<HTMLTextAreaElement>("#pasteBox");
    if (!box) return;
    const text = box.value.trim();
    if (!text) {
      box.focus();
      return;
    }
    text
      .split("\n")
      .map(function (x) {
        return x.trim();
      })
      .filter(Boolean)
      .forEach(function (line) {
        const mail = line.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
        const tel = line.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
        let rest = line;
        if (mail) rest = rest.replace(mail[0], " ");
        if (tel) rest = rest.replace(tel[0], " ");
        const parts = rest
          .split(/\s{2,}|\t|,|—|–/)
          .map(function (x) {
            return x.trim();
          })
          .filter(Boolean);
        staged.push({
          name: parts[0] || "Unnamed lead",
          email: mail ? mail[0] : null,
          phone: tel ? tel[0] : null,
          project: parts[1] || null,
          description: null,
          source: "EMAIL",
        });
      });
    box.value = "";
    renderStaged();
  });
  // The file bench. The donor's dropzone staged three hardcoded demo names; it
  // now reads the dropped/chosen file through the classic bench's own CSV
  // parser (leads-data.ts) and stages whatever is actually in it. Nothing here
  // touches the database — the batch still has to be sent with Import leads.
  const dz = $("#dropZone");
  const dzInput = root.querySelector<HTMLInputElement>("#dropInput");
  function readFile(file: File) {
    setErr("#fileErr", null);
    const reader = new FileReader();
    reader.onload = function () {
      const text = String(reader.result ?? "");
      const rows = parseCsvRows(text);
      if (!rows.length) {
        setErr("#fileErr", "Couldn't find any rows in " + file.name + ".");
        return;
      }
      rows.forEach((r) => staged.push(r));
      const lbl = $("#dropZoneLbl");
      if (lbl) {
        lbl.textContent =
          file.name + " · staged " + rows.length + " lead" + (rows.length === 1 ? "" : "s");
      }
      renderStaged();
    };
    reader.onerror = function () {
      setErr("#fileErr", "That file couldn't be read.");
    };
    reader.readAsText(file);
  }
  if (dzInput) {
    on(dzInput, "change", function () {
      const file = dzInput.files && dzInput.files[0];
      if (file) readFile(file);
      // Let the same file be chosen twice in a row.
      dzInput.value = "";
    });
  }
  if (dz) {
    on(dz, "click", function () {
      dzInput?.click();
    });
    ["dragenter", "dragover"].forEach(function (ev) {
      on(dz, ev, function (e) {
        e.preventDefault();
        dz.classList.add("over");
      });
    });
    on(dz, "dragleave", function (e) {
      e.preventDefault();
      dz.classList.remove("over");
    });
    on(dz, "drop", function (e) {
      e.preventDefault();
      dz.classList.remove("over");
      const file = (e as DragEvent).dataTransfer?.files?.[0];
      if (file) readFile(file);
    });
  }
  /**
   * The import bench's one real write. `importLeads` is the classic page's
   * action: it enforces the plan's lead quota across the WHOLE batch, creates
   * every row as NEW, and notifies the owner per lead. It returns a count, not
   * rows — the created ids can only come back from a refresh, and the pipeline
   * must not be shown rows whose delete/drag would then fail.
   */
  async function runImport() {
    if (!staged.length || lstate.saving) return;
    setErr("#impErr", null);
    setBusy("#importBtn", true, "Importing…", "");
    try {
      await importLeads(
        staged.map((r) => ({
          name: r.name,
          email: r.email,
          phone: r.phone,
          projectType: r.project,
          description: r.description,
          source: r.source as "MANUAL" | "EMAIL" | "IMPORT",
        })),
      );
      staged.length = 0;
      setBusy("#importBtn", false, "", "Import leads");
      renderStaged();
      switchTab("all");
      refresh();
    } catch (err) {
      setBusy("#importBtn", false, "", "Import leads");
      setErr("#impErr", actionError(err));
    }
  }
  onEl($("#importBtn"), "click", function () {
    void runImport();
  });

  /**
   * The delete confirmation. `deleteLead` is manager-gated and org-scoped on the
   * server, so a sales rep gets a refusal — which stays in the dialog instead of
   * closing it on a write that never happened. On success the row LEAVES (only
   * that row animates; the rest close the gap) rather than the table being
   * rebuilt out from under the click.
   */
  async function confirmDelete() {
    const id = lstate.pendingDelete;
    if (!id || lstate.saving) return;
    setErr("#mdlErr", null);
    setBusy("#mdlOk", true, "Deleting…", "");
    try {
      await deleteLead(id);
      setBusy("#mdlOk", false, "", "Delete");
      lstate.pendingDelete = null;
      const mdl = $("#mdl");
      if (mdl) closeMdl(mdl, after);
      const row = $('#leadTableBody .prow[data-id="' + id + '"]');
      const commit = () => {
        const i = leadsData.findIndex((x) => x.id === id);
        if (i > -1) leadsData.splice(i, 1);
        // Everything EXCEPT the table body — rebuilding it would replace the
        // very nodes leaveRow is mid-flight animating.
        renderCounts();
        renderFilters();
        renderBoard();
        renderIncoming();
        renderPagerAndEmpty();
      };
      if (row) leaveRow(row, commit, after);
      else commit();
    } catch (err) {
      setBusy("#mdlOk", false, "", "Delete");
      setErr("#mdlErr", actionError(err));
    }
  }
  onEl($("#mdlOk"), "click", function () {
    void confirmDelete();
  });

  on(document, "click", function (e) {
    const target = e.target as HTMLElement;
    if (target.closest('[data-toast="close"]')) {
      $("#lToast")?.classList.add("is-hidden");
      return;
    }
    if (target.closest('[data-mdl="close"]')) {
      if (lstate.saving) return; // a delete is in flight — don't orphan it
      const mdl = $("#mdl");
      if (mdl) closeMdl(mdl, after);
      lstate.pendingDelete = null;
      return;
    }
    const uns = target.closest<HTMLElement>("[data-unstage]");
    if (uns) {
      staged.splice(Number(uns.dataset.unstage), 1);
      renderStaged();
      return;
    }
    const pg = target.closest<HTMLButtonElement>(".pager-btn");
    if (pg && !pg.disabled) {
      lstate.page += pg.dataset.pg === "next" ? 1 : -1;
      renderTable();
      return;
    }

    const act = target.closest<HTMLElement>("[data-act]");
    if (!act) return;
    const kind = act.dataset.act;

    if (kind === "offer-yes" || kind === "offer-no") {
      const card = act.closest<HTMLElement>("[data-offer]");
      if (!card) return;
      const offerId = card.dataset.offer || "";
      if (!offerId || lstate.busy.has(offerId)) return;
      // The card leaves on the donor's fade; the write runs alongside it and
      // puts the card back if the platform refuses (an offer can expire or be
      // taken between the render and the click).
      fadeOut(card, function () {
        void respondToOffer(offerId, kind === "offer-yes" ? "accept" : "pass");
      });
      return;
    }
    if (kind === "accept" || kind === "decline") {
      const card = act.closest<HTMLElement>(".icard[data-id]");
      if (!card) return;
      const id = card.dataset.id || "";
      if (!id || lstate.busy.has(id)) return;
      fadeOut(card, function () {
        void triage(id, kind === "accept" ? "accept" : "decline");
      });
      return;
    }
    if (kind === "ask-delete") {
      const row = act.closest<HTMLElement>("[data-id]");
      if (!row) return;
      const id = row.dataset.id || "";
      const lead = leadsData.find(function (x) {
        return x.id === id;
      });
      if (!lead) return;
      const txt = $("#mdlText");
      if (txt) txt.textContent = "Remove " + lead.name + " from the pipeline? This can't be undone.";
      setErr("#mdlErr", null);
      lstate.pendingDelete = id;
      const mdl = $("#mdl");
      if (mdl) openMdl(mdl);
    }
  });

  // board: drag-and-drop (desktop) and tap-to-move (mobile).
  // Card grab/release is delegated to the board — cards are replaced on every
  // filter change. Column dragover/dragleave/drop bind per column, as in the
  // dashboard, because the columns are static markup and dragleave needs the
  // relatedTarget containment check to survive moving across child nodes.
  (function () {
    const board = $("#lBoard");
    if (!board) return;
    on(board, "dragstart", function (e) {
      const card = (e.target as HTMLElement).closest<HTMLElement>(".lead-card");
      if (!card) return;
      const lead = leadsData.find(function (l) {
        return String(l.id) === card.dataset.id;
      });
      dragH = card.offsetHeight;
      dragSrcStage = lead ? lead.status : null;
      const dt = (e as DragEvent).dataTransfer;
      if (dt) {
        dt.setData("text/plain", card.dataset.id || "");
        dt.effectAllowed = "move";
      }
      requestAnimationFrame(() => card.classList.add("dragging"));
    });
    on(board, "dragend", function () {
      dragSrcStage = null;
      board.querySelectorAll(".dragging").forEach(function (c) {
        c.classList.remove("dragging");
      });
      board.querySelectorAll<HTMLElement>(".stage-col").forEach(function (c) {
        c.classList.remove("dragover");
        collapseSlot(c);
      });
    });

    board.querySelectorAll<HTMLElement>(".stage-col").forEach(function (col) {
      on(col, "dragover", function (e) {
        e.preventDefault();
        const dt = (e as DragEvent).dataTransfer;
        if (dt) dt.dropEffect = "move";
        col.classList.add("dragover");
        if (!dragSrcStage || col.dataset.stage === dragSrcStage) return;
        const wrap = col.querySelector<HTMLElement>(".stage-cards");
        if (!wrap) return;
        if (!wrap.querySelector(".drop-slot")) {
          const slot = document.createElement("div");
          slot.className = "drop-slot";
          wrap.appendChild(slot);
          wrap.classList.add("previewing");
          requestAnimationFrame(function () {
            slot.classList.add("open");
            slot.style.height = (dragH || 64) + "px";
          });
          // If the open slot pushed the board past the bottom edge — scroll it into view
          later(function () {
            if (!wrap.querySelector(".drop-slot")) return;
            const boardEl = $("#lBoard");
            if (!boardEl || !main) return;
            const over =
              boardEl.getBoundingClientRect().bottom - main.getBoundingClientRect().bottom + 24;
            if (over > 0) {
              const rmq = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              main.scrollBy({ top: over, behavior: rmq ? "auto" : "smooth" });
            }
          }, 230);
        }
      });
      on(col, "dragleave", function (e) {
        if (col.contains((e as DragEvent).relatedTarget as Node)) return;
        col.classList.remove("dragover");
        collapseSlot(col);
      });
      on(col, "drop", function (e) {
        e.preventDefault();
        col.classList.remove("dragover");
        collapseSlot(col, true);
        const dt = (e as DragEvent).dataTransfer;
        const id = dt ? dt.getData("text/plain") : "";
        if (!id) return;
        void moveLead(id, col.dataset.stage || "");
      });
    });

    on(board, "click", function (e) {
      if (window.innerWidth > 860) return;
      const card = (e.target as HTMLElement).closest<HTMLElement>(".lead-card");
      if (card) {
        const same = lstate.picked === card.dataset.id;
        board.querySelectorAll(".picked").forEach(function (c) {
          c.classList.remove("picked");
        });
        lstate.picked = same ? null : card.dataset.id || null;
        if (!same) card.classList.add("picked");
        return;
      }
      const head = (e.target as HTMLElement).closest<HTMLElement>(".stage-col-head");
      if (head && lstate.picked != null) {
        void moveLead(lstate.picked, head.closest<HTMLElement>(".stage-col")?.dataset.stage || "");
      }
    });
  })();

  // ================= SERVER SYNC =================
  // Every lead action calls `revalidatePath("/dashboard/leads")`, so the page's
  // server component re-renders after each write and React hands the fresh rows
  // back here. They almost always describe what is already on screen (the write
  // updated locally first), so the signature check makes that the silent case —
  // repainting on every action would replay the board's entrance and yank focus
  // out of the search box.
  let appliedLeads = leadsSig(leadsData);
  let appliedOffers = offersSig(offersData);
  options.onReady?.({
    sync(nextLeads, nextOffers) {
      const ls = leadsSig(nextLeads);
      const os = offersSig(nextOffers);
      if (ls === appliedLeads && os === appliedOffers) return;
      appliedLeads = ls;
      appliedOffers = os;
      leadsData.length = 0;
      nextLeads.forEach((l) => leadsData.push({ ...l }));
      offersData.length = 0;
      nextOffers.forEach((o) => offersData.push({ ...o }));
      renderLeads();
    },
  });

  // ================= INITIALIZATION =================
  renderLeads();
  // The lists ARRIVE here and only here — later repaints are patches, not
  // arrivals, so they do not re-stagger (blueprint-shell/list-motion).
  staggerList("#leadTableBody");
  staggerList("#inboxGrid");

  // The mobile nav drawer and FLUID SCALE belong to the persistent chrome and
  // live in components/v3/blueprint-shell/shell-behavior.ts.

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // (The donor's EASE constant lived here for the row stagger; that moved to
    // blueprint-shell/list-motion, which carries the same curve.)

    // Reveal: load + scroll.
    // Reveal adapts to scroll speed: slow scrolling gets the full 420ms
    // animation; fast scrolling a shorter one — it never lags, but stays
    // visible.
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
    // `.mdl` is skipped: the donor rendered it outside `.content`, so it never
    // took `.rv`. Leaving it in would strand the fixed overlay at opacity 0
    // (a display:none element never intersects, so `.rv-in` would never land).
    // `.l-toast` is skipped for the same reason as `.mdl`: both are fixed
    // overlays that start `display: none`, so they never intersect and `.rv-in`
    // would never land — the first failure would show a toast stuck at
    // opacity 0.
    const blocks = $$(".content > *").filter(
      (el) => !el.classList.contains("mdl") && !el.classList.contains("l-toast"),
    );
    blocks.forEach((el, i) => {
      el.classList.add("rv");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? i * 60 + "ms" : "200ms";
    });
    // Second layer of the arrival — Overview cascades its `.kpi` strip here.
    // This page has no `.kpi`, so the layer was silently absent; its equivalent
    // small units are the view tabs and the pipeline board's stage columns —
    // the same read as Overview's Lead Flow board coming in column by column.
    // Skip anything the block cascade claimed: never `rv` and `rv-cell` both.
    const cells = $$(".ptab, .stage-col").filter((el) => !el.classList.contains("rv"));
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

    // Row stagger — the donor wired a MutationObserver here, so EVERY repaint
    // replayed the full cascade: a search keystroke, a filter chip, a delete.
    // It now lives in `staggerList`, called from the two places a list really
    // arrives (first paint, a tab switch onto it). See the long note in
    // blueprint-shell/list-motion.ts.

    // Numeral count-up — Overview's `.kpi-val`; here the tab counts. The donor
    // rebuilt the text from digits alone, safe only for its own plain
    // "$12,400"/"18": it drops any trailing unit and would wipe an inline icon.
    // So keep whatever frames the number, skip decimals (digits-only mangles
    // them), and skip nodes that hold elements rather than bare text.
    $$(".ptab-count").forEach((el) => {
      if (el.children.length) return;
      const m = (el.textContent || "").trim().match(/^([^\d]*)(\d[\d,]*)([^\d]*)$/);
      if (!m) return;
      const [, prefix, digits, suffix] = m;
      const target = parseInt(digits.replace(/,/g, ""), 10);
      if (!isFinite(target)) return;
      let t0: number | null = null;
      function frame(t: number) {
        if (!t0) t0 = t;
        const pr = Math.min(1, (t - t0) / 750);
        const e = 1 - Math.pow(1 - pr, 3);
        el.textContent = prefix + Math.round(target * e).toLocaleString("en-US") + suffix;
        if (pr < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });

    // Press effects. The donor also listed `.icon-btn`, `.sb-foot-ic` and
    // `.sb-foot-acc`; those are shell chrome and press from the shell module.
    function pressify(sel: string, cls: string) {
      $$(sel).forEach((el) => {
        on(el, "click", () => {
          el.classList.remove(cls);
          void el.offsetWidth;
          el.classList.add(cls);
        });
        on(el, "animationend", () => el.classList.remove(cls));
      });
    }
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
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
  };
}
