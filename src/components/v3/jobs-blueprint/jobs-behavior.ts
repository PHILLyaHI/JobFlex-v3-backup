// Jobs blueprint — runtime behaviors, ported from the donor file's <script>
// (jobflex-jobs-blueprint.html). Every duration, easing, stagger, page size and
// string is the donor's exact value. Adaptations are mechanical only:
// - queries are scoped to the mounted `.content` root;
// - every listener, timer and observer is tracked for unmount cleanup.
//
// NOT A FIXTURE ANY MORE. The board arrives from the database through
// `initJobsContent(content, options)` (see src/app/dashboard/jobs/page.tsx) and
// every write goes through the real job server actions:
//   - the create dialog  → createJob   (@/actions/jobs)
//   - the row menu       → updateJob   (@/actions/jobs)
//   - the open affordance→ /dashboard/jobs/<id>, the classic detail page
// Local state is updated optimistically after the action resolves, in the same
// shape Workers uses: pending label on the button, the action's own error text
// surfaced verbatim (those messages are written for users), no silent flash.
//
// SKIPPED — owned by components/v3/blueprint-shell/shell-behavior.ts, which
// mounts once and survives navigation: the mobile nav drawer / burger /
// overlay, FLUID SCALE (root zoom + --app-h + the eff-* breakpoint classes),
// the sidebar entry cascade, the sliding active-item indicator, the
// graph-paper parallax on `.main`, and press feedback on shell controls.

import { createJob, deleteJob, scheduleJobFromTray, updateJob } from "@/actions/jobs";
import { createClient } from "@/actions/clients";
import { assignWorker, unassignAssignment } from "@/actions/workers";
import { closeMdl, openMdl, MDL_EXIT_MS } from "@/components/v3/blueprint-shell/mdl-motion";
import { leaveRow, staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import { initDatePopovers } from "@/components/v3/shared/date-popover";
import { attachCombo, type ComboItem } from "./combo";
import { OFFER_ANSWERED_EVENT, type OfferAnsweredDetail } from "./job-offers";
import {
  JOB_TABS,
  ACCENT,
  JOBS_SEED,
  PAGE_SIZE,
  money,
  parseDay,
  rangeLabel,
  relLabel,
  type Job,
  type JobClientOption,
  type JobCrewOption,
  type JobProposalOption,
  type JobStatus,
} from "./jobs-data";

export type JobsContentOptions = {
  /** The org's real board, read server-side. Omit to fall back to the donor
   *  fixture (the standalone mock routes have no session to read from). */
  entries?: Job[];
  /** Clients the create dialog can link the job to. */
  clients?: JobClientOption[];
  /** Workers the create dialog can staff it with. */
  crew?: JobCrewOption[];
  /** Proposals the create dialog can attach the job to (`Job.proposalId`). */
  proposals?: JobProposalOption[];
  /** Owner/manager — gates the row menu's status writes. `updateJob` calls
   *  `requireManager`, so for anyone else the items are not offered at all. */
  canManage?: boolean;
  /** LIMITED role. The rows headline the caller's OWN answer while it is
   *  outstanding ("Not accepted yet" / "Declined" instead of the job status),
   *  and the offers popup in the page head patches them through the
   *  OFFER_ANSWERED_EVENT listener below. */
  workerView?: boolean;
  /**
   * Next's client-side router push, handed down from jobs-content.tsx.
   *
   * The job record at /dashboard/jobs/<id> is a blueprint page whose entrance
   * cascade is armed from a LAYOUT EFFECT (blueprint-shell/use-blueprint-content),
   * and that timing only beats the paint on a CLIENT-SIDE navigation. A
   * `location.assign()` paints the server HTML in full, then drops it to
   * opacity 0 and replays the entrance — the "it shows one version, then the
   * real one" double take — and tears the shared shell down on the way.
   *
   * Optional: the standalone mock route mounts with no router and falls back.
   */
  navigate?: (href: string) => void;
};

/** Server actions reject with an Error whose message is written for the user
 *  ("You've hit the jobs limit on your plan.", "Your account isn't set up as a
 *  worker yet…"). Surface that text; fall back to a generic line for anything
 *  unrecognisable — a Next.js server-action transport failure has no useful
 *  message. */
function actionError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  if (!msg || msg.toLowerCase().includes("fetch failed")) {
    return "Something went wrong. Check your connection and try again.";
  }
  return msg;
}

/** Row text comes from the database now, so it is escaped before it reaches
 *  innerHTML. The donor's own demo strings never needed this. */
function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** `[data-id="…"]` with a cuid is safe, but CSS.escape is free and correct. */
function sel(v: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(v) : v.replace(/"/g, '\\"');
}

export function initJobsContent(
  content: HTMLElement,
  options: JobsContentOptions = {},
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
  // Tracked timeouts — the dialog's exit animation runs on one, so an unmount
  // mid-close must not fire the cleanup into a detached tree.
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const after = (ms: number, fn: () => void) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  disposers.push(() => {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
  });
  const $ = (s: string) => root.querySelector<HTMLElement>(s);
  const $$ = (s: string) => Array.from(root.querySelectorAll<HTMLElement>(s));

  // A late-resolving server action must not write into a torn-down tree.
  let alive = true;
  disposers.push(() => {
    alive = false;
  });

  // ================= SAFETY: module isolation =================
  // Each block is wrapped so a failure in one does not disable the rest
  // (a throw higher up used to cut off every handler below it).
  function safe(name: string, fn: () => void) {
    try {
      fn();
    } catch (err) {
      console.error("[JobFlex] module failed: " + name, err);
    }
  }

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

  // ================= JOBS: DATA =================
  const jobsData: Job[] = (options.entries ?? JOBS_SEED).map((j) => ({
    ...j,
    crew: [...j.crew],
    assignments: (j.assignments ?? []).map((a) => ({ ...a })),
  }));
  // Not `const`: a client typed into the create dialog is created through the
  // existing `createClient` action and joins the book, so the next job can pick
  // them from the list without a page reload.
  const clientOptions: JobClientOption[] = (options.clients ?? []).slice();
  const crewOptions: JobCrewOption[] = options.crew ?? [];
  const proposalOptions: JobProposalOption[] = options.proposals ?? [];
  const canManage = options.canManage ?? false;
  const workerView = options.workerView ?? false;

  const jstate = { tab: "ALL" as "ALL" | JobStatus, page: 1, menuId: null as string | null };

  function statusLabel(s: string) {
    return s.charAt(0) + s.slice(1).toLowerCase().replace("_", " ");
  }
  function initials(name: string) {
    const p = name.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
    if (!p.length) return "?";
    return p.length === 1
      ? p[0].slice(0, 2).toUpperCase()
      : (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }
  function crewStack(crew: string[]) {
    if (!crew.length) return '<span class="crew-none">—</span>';
    const shown = crew.slice(0, 3);
    return (
      '<span class="crew">' +
      shown
        .map(function (n) {
          return '<span class="crew-av" title="' + esc(n) + '">' + esc(initials(n)) + "</span>";
        })
        .join("") +
      (crew.length > shown.length
        ? '<span class="crew-more">+' + (crew.length - shown.length) + "</span>"
        : "") +
      "</span>"
    );
  }
  function filtered() {
    return jstate.tab === "ALL"
      ? jobsData
      : jobsData.filter(function (j) {
          return j.status === jstate.tab;
        });
  }
  function pageCount() {
    return Math.max(1, Math.ceil(filtered().length / PAGE_SIZE));
  }
  function jobHref(id: string) {
    return "/dashboard/jobs/" + encodeURIComponent(id);
  }
  /** ONE door out of this page, for the same reason jobHref is one string:
   *  three call sites (the whole row, the arrow, the menu's "Open job") that
   *  must all navigate the same WAY, not just to the same place. See
   *  `navigate` on JobsContentOptions for why the way matters. */
  function openRecord(id: string) {
    const href = jobHref(id);
    if (options.navigate) options.navigate(href);
    else window.location.assign(href);
  }

  // ================= RENDER =================
  function renderTabs() {
    const tabs = $("#jTabs");
    if (!tabs) return;
    tabs.innerHTML = JOB_TABS.map(function (t) {
      return (
        '<button class="jtab' +
        (jstate.tab === t.key ? " on" : "") +
        '" type="button" data-t="' +
        t.key +
        '">' +
        (t.key === "ALL"
          ? ""
          : '<span class="jtab-dot" style="background:' + ACCENT[t.key] + '"></span>') +
        t.label +
        '<span class="jtab-n" data-n="' +
        t.key +
        '">' +
        tabCount(t.key) +
        "</span></button>"
      );
    }).join("");
  }
  function tabCount(key: "ALL" | JobStatus) {
    return key === "ALL"
      ? jobsData.length
      : jobsData.filter(function (j) {
          return j.status === key;
        }).length;
  }
  /** A status write changes five numbers and nothing else. Patch them — a
   *  rebuilt #jTabs would drop the tab the user is standing on and replay the
   *  count-up on every visit. */
  function patchTabCounts() {
    JOB_TABS.forEach((t) => {
      const el = root.querySelector<HTMLElement>('.jtab-n[data-n="' + t.key + '"]');
      if (el) el.textContent = String(tabCount(t.key));
    });
  }

  function rowHtml(j: Job) {
    return (
      '<tr class="prow" data-id="' +
      esc(j.id) +
      '" style="--acc:' +
      ACCENT[j.status] +
      '">' +
      // `title` carries the untruncated text — both lines are line-clamped so a
      // pasted 200-character job name cannot widen the column past the card.
      '<td><div class="j-title" title="' +
      esc(j.title) +
      '">' +
      esc(j.title) +
      "</div>" +
      '<div class="j-client" title="' +
      esc(j.client || "No client") +
      '">' +
      esc(j.client || "No client") +
      "</div></td>" +
      '<td data-cell="status">' +
      statusPill(j) +
      awaitHint(j) +
      "</td>" +
      '<td data-cell="when">' +
      whenHtml(j) +
      "</td>" +
      '<td class="num" data-cell="crew">' +
      crewStack(j.crew) +
      "</td>" +
      // Both affordances share ONE cell. They used to sit in two separate
      // <td>s, which put 32px of cell padding between them (16 right + 16
      // left) and read as a layout gap rather than a pair. The menu comes
      // first, then the open arrow — the arrow is the row's primary action
      // and belongs closest to the row's edge.
      '<td class="num"><div class="j-acts">' +
      '<button class="pt-open" type="button" data-menu="' +
      esc(j.id) +
      '" aria-haspopup="menu" aria-label="Actions for ' +
      esc(j.title) +
      '"><svg class="ic"><use href="#i-dots"/></svg></button>' +
      '<a class="pt-open" href="' +
      jobHref(j.id) +
      '" aria-label="Open ' +
      esc(j.title) +
      '"><svg class="ic"><use href="#i-arrow"/></svg></a>' +
      "</div></td>" +
      "</tr>"
    );
  }
  /** What the status plate SAYS for this viewer. A crew member's unanswered
   *  offer outranks the job status — "Not accepted yet" (warning tone) until
   *  they answer, "Declined" (danger) if they said no. Everyone else reads the
   *  job's own status. */
  function pillState(j: Job): { cls: string; label: string } {
    if (workerView && j.myAssignment === "PENDING") {
      return { cls: "jst--offer_pending", label: "Not accepted yet" };
    }
    if (workerView && j.myAssignment === "DECLINED") {
      return { cls: "jst--offer_declined", label: "Declined" };
    }
    return { cls: "jst--" + j.status.toLowerCase(), label: statusLabel(j.status) };
  }
  function statusPill(j: Job) {
    const s = pillState(j);
    return '<span class="pstatus ' + s.cls + '">' + s.label + "</span>";
  }
  /** The manager's small print under the status plate: somebody assigned to
   *  this job has not answered yet. Annotation layer — mono, muted, quiet. */
  function awaitHint(j: Job) {
    return !workerView && (j.pendingCrew ?? 0) > 0
      ? '<span class="j-await">awaiting crew</span>'
      : "";
  }
  function whenHtml(j: Job) {
    const range = rangeLabel(j);
    return range
      ? '<div class="j-date">' + range + '</div><div class="j-rel">' + (relLabel(j.start) || "") + "</div>"
      : '<span class="j-unsched">Unscheduled</span>';
  }
  function cardHtml(j: Job) {
    const range = rangeLabel(j);
    const st = pillState(j);
    return (
      '<li><a class="jcard" href="' +
      jobHref(j.id) +
      '" data-id="' +
      esc(j.id) +
      '" style="--acc:' +
      ACCENT[j.status] +
      '">' +
      '<div class="jcard-top"><div style="min-width:0">' +
      '<div class="jcard-t" title="' +
      esc(j.title) +
      '">' +
      esc(j.title) +
      "</div>" +
      '<div class="jcard-c" title="' +
      esc(j.client || "No client") +
      '">' +
      esc(j.client || "No client") +
      "</div></div>" +
      // The plate and the manager's awaiting-crew hint stack in their own
      // column, so the card head stays a two-child space-between row.
      '<div class="jcard-st"><span class="pstatus ' +
      st.cls +
      '" data-cell="status">' +
      st.label +
      "</span>" +
      awaitHint(j) +
      "</div></div>" +
      // Both slots carry `data-cell` so a schedule or crew write can be patched
      // into the card in place, the way the status pill already is.
      '<div class="jcard-bot">' +
      '<span class="jcard-when" data-cell="when"><svg class="ic"><use href="#i-cal"/></svg>' +
      (range || "Unscheduled") +
      "</span>" +
      // Empty rather than absent: an inline span with no children takes no
      // space in the `space-between` row, and the patch has somewhere to land.
      '<span data-cell="crew">' +
      (j.crew.length ? crewStack(j.crew) : "") +
      "</span>" +
      "</div></a></li>"
    );
  }

  /** Empty state + card visibility, driven by the CURRENT dom row count so it
   *  stays honest after a single-row exit that did not re-render the list. */
  function syncEmpty() {
    const card = $("#jobsCard");
    const cards = $("#jobsCards");
    const empty = $("#jobsEmpty");
    if (!card || !cards || !empty) return;
    const none = filtered().length === 0;
    card.classList.toggle("is-hidden", none);
    cards.style.display = none ? "none" : "";
    empty.classList.toggle("is-hidden", !none);
  }

  function renderPager() {
    const el = $("#jobsPager");
    if (!el) return;
    const pages = pageCount();
    if (pages <= 1) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML =
      '<span class="pager-info">Page ' +
      jstate.page +
      " / " +
      pages +
      "</span>" +
      '<button class="pager-btn" type="button" data-pg="prev"' +
      (jstate.page <= 1 ? " disabled" : "") +
      ' aria-label="Previous"><svg class="ic rot-l"><use href="#i-chev"/></svg></button>' +
      '<button class="pager-btn" type="button" data-pg="next"' +
      (jstate.page >= pages ? " disabled" : "") +
      ' aria-label="Next"><svg class="ic rot-r"><use href="#i-chev"/></svg></button>';
  }

  /**
   * Rebuild both lists.
   *
   * `animate` is the caller's answer to "is this list ARRIVING?" — a tab
   * switch, a page turn, first paint. It is NOT a MutationObserver, on purpose:
   * see blueprint-shell/list-motion for the five pages that shipped that bug.
   */
  function renderRows(animate = true) {
    const body = $("#jobsBody");
    const cards = $("#jobsCards");
    if (!body || !cards) return;

    const rows = filtered();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (jstate.page > pages) jstate.page = pages;
    const slice = rows.slice((jstate.page - 1) * PAGE_SIZE, jstate.page * PAGE_SIZE);

    body.innerHTML = slice.map(rowHtml).join("");
    cards.innerHTML = slice.map(cardHtml).join("");

    syncEmpty();
    renderPager();

    if (animate) {
      staggerIn(Array.from(body.querySelectorAll<HTMLElement>(".prow")));
      staggerIn(Array.from(cards.querySelectorAll<HTMLElement>(".jcard")));
    }
  }
  function renderJobs() {
    renderTabs();
    renderRows();
  }

  // ================= EVENTS: TABS + PAGER =================
  const tabsEl = $("#jTabs");
  if (tabsEl) {
    on(tabsEl, "click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>(".jtab");
      if (!b) return;
      const next = (b.dataset.t || "ALL") as "ALL" | JobStatus;
      if (next === jstate.tab) return;
      jstate.tab = next;
      jstate.page = 1;
      closeMenu();
      $$("#jTabs .jtab").forEach((t) => t.classList.toggle("on", t === b));
      renderRows();
    });
  }
  const pagerEl = $("#jobsPager");
  if (pagerEl) {
    on(pagerEl, "click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".pager-btn");
      if (!b || b.disabled) return;
      jstate.page += b.dataset.pg === "next" ? 1 : -1;
      closeMenu();
      renderRows();
    });
  }

  // ================= ROW MENU =================
  // The donor drew a bare arrow and nothing else. What sits behind the dots is
  // the row's whole vocabulary: open the record, put it on the calendar
  // (scheduleJobFromTray / updateJob), staff it (assignWorker /
  // unassignAssignment), move its status (updateJob) and delete it (deleteJob).
  // Everything deeper — photos, expenses, change orders — lives on
  // /dashboard/jobs/<id> and is one click away through "Open job".
  //
  // ── WHY THIS MENU LOOKED DEAD ──────────────────────────────────────
  // Two faults, both in the port, both invisible in the markup:
  //
  // 1. The reveal cascade below claims every `.content` child — it skipped
  //    `.mdl` and nothing else — so `#pMenu` was handed `.rv` (opacity: 0,
  //    translateY(14px)) with a 360ms transition delay. A `display: none`
  //    element never intersects, so the IntersectionObserver never granted it
  //    `.rv-in`: the first click on the dots produced NOTHING for the better
  //    part of a second, and then a menu faded up out of nowhere.
  // 2. `openMenu` read the FLUID SCALE zoom off `.content`. The zoom lives on
  //    the shell root (`.jf-blueprint`) — decisions.md — so the read returned
  //    "" → NaN → 1, and the un-zoomed viewport maths placed the box ~420px
  //    left of the dots that opened it, over the Schedule column.
  //
  // Fix 1 is the filter in the motion IIFE; fix 2 is the zoom read in
  // `openMenu`, which is now the clients page's — the one that was already
  // correct. proposals-behavior.ts:860 still carries fault 2.
  const pMenu = $("#pMenu");

  function menuItem(
    icon: string,
    tone: string,
    t: string,
    sub: string,
    act: string,
    dis?: boolean,
    danger?: boolean,
  ) {
    return (
      '<button class="pmenu-item' +
      (dis ? " is-disabled" : "") +
      (danger ? " is-danger" : "") +
      '" type="button" data-mact="' +
      act +
      '">' +
      '<span class="pmi-ic' +
      (tone ? " " + tone : "") +
      '"><svg class="ic"><use href="#' +
      icon +
      '"/></svg></span>' +
      '<span><span class="pmenu-item-t">' +
      t +
      '</span><span class="pmenu-item-s" style="display:block">' +
      sub +
      "</span></span>" +
      "</button>"
    );
  }

  function menuBody(j: Job) {
    const done = j.status === "COMPLETED";
    const range = rangeLabel(j);
    return (
      '<div class="pmenu-head"><div class="pmenu-title">' +
      esc(j.title) +
      '</div><div class="pmenu-sub">' +
      esc(j.client || "No client") +
      " · " +
      statusLabel(j.status) +
      "</div></div>" +
      menuItem("i-arrow", "pmi--bp", "Open job", "Schedule, crew, photos", "open") +
      (canManage
        ? '<div class="pmenu-div"></div>' +
          menuItem(
            "i-cal",
            "pmi--bp",
            range ? "Reschedule" : "Schedule",
            range ? esc(range) : "Not on the calendar yet",
            "sched",
          ) +
          menuItem(
            "i-userplus",
            "",
            "Assign crew",
            j.crew.length ? esc(j.crew.join(", ")) : "Nobody dispatched yet",
            "crew",
            !crewOptions.length,
          ) +
          '<div class="pmenu-div"></div>' +
          menuItem(
            "i-clock",
            "pmi--warn",
            "Mark in progress",
            j.status === "IN_PROGRESS" ? "Already in progress" : "Crew is on site",
            "st:IN_PROGRESS",
            j.status === "IN_PROGRESS",
          ) +
          menuItem(
            "i-check",
            "pmi--ok",
            "Mark completed",
            done ? "Already completed" : "Also asks the client for a review",
            "st:COMPLETED",
            done,
          ) +
          menuItem(
            "i-clock",
            "",
            "Back to scheduled",
            j.status === "SCHEDULED" ? "Already scheduled" : "Not started yet",
            "st:SCHEDULED",
            j.status === "SCHEDULED",
          ) +
          '<div class="pmenu-div"></div>' +
          menuItem(
            "i-ban",
            "pmi--danger",
            "Cancel job",
            j.status === "CANCELED" ? "Already canceled" : "Keeps the record",
            "st:CANCELED",
            j.status === "CANCELED",
            true,
          ) +
          menuItem("i-trash", "pmi--danger", "Delete job", "Removes it for good", "del", false, true)
        : "") +
      '<div class="pmenu-err is-hidden" data-menu-err role="alert"></div>'
    );
  }

  function openMenu(id: string, btn: HTMLElement) {
    const j = jobsData.find((x) => x.id === id);
    if (!j || !pMenu) return;
    jstate.menuId = id;
    pMenu.innerHTML = menuBody(j);
    pMenu.classList.add("open");
    // FLUID SCALE zooms the SHELL ROOT (`.jf-blueprint`), not `.content` and
    // not documentElement — reading it anywhere else returns "", parses to NaN
    // and silently falls back to 1 (decisions.md). That fallback is what put
    // this menu ~420px left of the dots at every viewport but 1728px.
    const host = root.closest<HTMLElement>(".jf-blueprint");
    const zRaw = host ? parseFloat(getComputedStyle(host).zoom) : 1;
    const z = isFinite(zRaw) && zRaw > 0 ? zRaw : 1;
    const vw = window.innerWidth / z;
    const vh = window.innerHeight / z;
    // getBoundingClientRect reports ZOOMED pixels; `left`/`top` are written in
    // the menu's own unzoomed space, so the anchor is divided by the live zoom
    // too — every popover placement on these pages does this.
    const r = btn.getBoundingClientRect();
    const rRight = r.right / z;
    const rTop = r.top / z;
    const rBottom = r.bottom / z;
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
    jstate.menuId = null;
    pMenu?.classList.remove("open");
  }
  if (main) on(main, "scroll", closeMenu, { passive: true });

  function menuError(msg: string) {
    const box = pMenu?.querySelector<HTMLElement>("[data-menu-err]");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-hidden", !msg);
  }

  /** One job's status changed. Patch the two nodes that show it — a full
   *  re-render would steal focus from the menu the user is standing in and
   *  replay every row's entrance. If the row no longer belongs under the
   *  active tab, it LEAVES, and the rows below close the gap. */
  function applyStatus(j: Job, next: JobStatus) {
    j.status = next;
    patchTabCounts();

    const rowEl = root.querySelector<HTMLElement>('#jobsBody .prow[data-id="' + sel(j.id) + '"]');
    const cardEl = root.querySelector<HTMLElement>('#jobsCards .jcard[data-id="' + sel(j.id) + '"]');
    const stillListed = jstate.tab === "ALL" || jstate.tab === next;

    if (!stillListed) {
      if (rowEl) {
        leaveRow(
          rowEl,
          () => {
            // Bookkeeping only — NOT a re-render, or the survivors the FLIP just
            // measured are replaced and the gap snaps shut instead of closing.
            jstate.page = Math.min(jstate.page, pageCount());
            syncEmpty();
            renderPager();
          },
          after,
        );
      }
      if (cardEl?.parentElement) leaveRow(cardEl.parentElement, () => {}, after);
      return;
    }

    if (rowEl) {
      rowEl.style.setProperty("--acc", ACCENT[next]);
      const cell = rowEl.querySelector<HTMLElement>('[data-cell="status"]');
      if (cell) cell.innerHTML = statusPill(j) + awaitHint(j);
    }
    if (cardEl) {
      cardEl.style.setProperty("--acc", ACCENT[next]);
      const pill = cardEl.querySelector<HTMLElement>('[data-cell="status"]');
      if (pill) {
        const st = pillState(j);
        pill.className = "pstatus " + st.cls;
        pill.setAttribute("data-cell", "status");
        pill.textContent = st.label;
      }
    }
  }

  /** A crew member answered an offer through the page-head popup (see
   *  ./job-offers). Their row's headline is that answer, so it flips here —
   *  in place, no reload, same patch discipline as applyStatus. */
  on(window, OFFER_ANSWERED_EVENT, (e) => {
    const detail = (e as CustomEvent<OfferAnsweredDetail>).detail;
    if (!detail?.jobId) return;
    const j = jobsData.find((x) => x.id === detail.jobId);
    if (!j) return;
    j.myAssignment = detail.response === "DECLINED" ? "DECLINED" : "ACCEPTED";
    const rowCell = root.querySelector<HTMLElement>(
      '#jobsBody .prow[data-id="' + sel(j.id) + '"] [data-cell="status"]',
    );
    if (rowCell) rowCell.innerHTML = statusPill(j) + awaitHint(j);
    const pill = root.querySelector<HTMLElement>(
      '#jobsCards .jcard[data-id="' + sel(j.id) + '"] [data-cell="status"]',
    );
    if (pill) {
      const st = pillState(j);
      pill.className = "pstatus " + st.cls;
      pill.setAttribute("data-cell", "status");
      pill.textContent = st.label;
    }
  });

  /** The schedule changed. Same contract as applyStatus: patch the two cells
   *  that print it, never re-render the list around the menu the user is in. */
  function applySchedule(j: Job, start: string | null, end: string | null) {
    j.start = start;
    j.end = end && end !== start ? end : null;
    const rowEl = root.querySelector<HTMLElement>('#jobsBody .prow[data-id="' + sel(j.id) + '"]');
    const cell = rowEl?.querySelector<HTMLElement>('[data-cell="when"]');
    if (cell) cell.innerHTML = whenHtml(j);
    const cardEl = root.querySelector<HTMLElement>('#jobsCards .jcard[data-id="' + sel(j.id) + '"]');
    const chip = cardEl?.querySelector<HTMLElement>("[data-cell=\"when\"]");
    if (chip) {
      chip.innerHTML =
        '<svg class="ic"><use href="#i-cal"/></svg>' + (rangeLabel(j) || "Unscheduled");
    }
  }

  /** The crew changed. The table cell and the card's avatar stack both print
   *  `crewStack`, so both are rewritten from the same string. */
  function applyCrew(j: Job) {
    const rowEl = root.querySelector<HTMLElement>('#jobsBody .prow[data-id="' + sel(j.id) + '"]');
    const cell = rowEl?.querySelector<HTMLElement>('[data-cell="crew"]');
    if (cell) cell.innerHTML = crewStack(j.crew);
    const cardEl = root.querySelector<HTMLElement>('#jobsCards .jcard[data-id="' + sel(j.id) + '"]');
    const slot = cardEl?.querySelector<HTMLElement>('[data-cell="crew"]');
    if (slot) slot.innerHTML = j.crew.length ? crewStack(j.crew) : "";
  }

  /** The job is gone. The row fades out alone and the rows below FLIP up to
   *  close the gap — nothing else on the page moves. */
  function dropJob(id: string) {
    const at = jobsData.findIndex((x) => x.id === id);
    if (at !== -1) jobsData.splice(at, 1);
    patchTabCounts();
    const rowEl = root.querySelector<HTMLElement>('#jobsBody .prow[data-id="' + sel(id) + '"]');
    const cardEl = root.querySelector<HTMLElement>('#jobsCards .jcard[data-id="' + sel(id) + '"]');
    if (rowEl) {
      leaveRow(
        rowEl,
        () => {
          // Bookkeeping only, NOT a re-render — see applyStatus.
          jstate.page = Math.min(jstate.page, pageCount());
          syncEmpty();
          renderPager();
        },
        after,
      );
    } else {
      syncEmpty();
      renderPager();
    }
    if (cardEl?.parentElement) leaveRow(cardEl.parentElement, () => {}, after);
  }

  // The row menu's three dialogs live further down (they need the same frame
  // plumbing as the create dialog). The menu is wired first, so it reaches them
  // through these — assigned in the dialog section, null on a mount where the
  // markup is missing.
  let openSchedDlg: ((j: Job) => void) | null = null;
  let openCrewDlg: ((j: Job) => void) | null = null;
  let openDelDlg: ((j: Job) => void) | null = null;

  let statusBusy = false;
  async function runStatus(id: string, next: JobStatus, item: HTMLElement) {
    if (statusBusy) return;
    const j = jobsData.find((x) => x.id === id);
    if (!j) return;
    statusBusy = true;
    menuError("");
    const label = item.querySelector<HTMLElement>(".pmenu-item-t");
    const idle = label?.textContent || "";
    if (label) label.textContent = "Working…";
    pMenu?.classList.add("is-busy");
    try {
      await updateJob(id, { status: next });
      if (!alive) return;
      applyStatus(j, next);
      closeMenu();
    } catch (err) {
      if (!alive) return;
      if (label) label.textContent = idle;
      menuError(actionError(err));
    } finally {
      statusBusy = false;
      pMenu?.classList.remove("is-busy");
    }
  }

  on(document, "click", (e) => {
    const target = e.target as HTMLElement;
    if (!root.contains(target) && !pMenu?.contains(target)) {
      closeMenu();
      return;
    }
    const trigger = target.closest<HTMLElement>("[data-menu]");
    if (trigger) {
      const id = trigger.dataset.menu || "";
      if (jstate.menuId === id) closeMenu();
      else openMenu(id, trigger);
      return;
    }
    const item = target.closest<HTMLElement>(".pmenu-item");
    if (item && pMenu?.contains(item)) {
      const act = item.dataset.mact || "";
      const id = jstate.menuId;
      if (!id) return;
      // The status items write in place and keep the menu open on a refusal,
      // so they are the only ones that do NOT close it up front.
      if (act.startsWith("st:")) {
        void runStatus(id, act.slice(3) as JobStatus, item);
        return;
      }
      const j = jobsData.find((x) => x.id === id) ?? null;
      closeMenu();
      if (!j) return;
      if (act === "open") openRecord(j.id);
      else if (act === "sched") openSchedDlg?.(j);
      else if (act === "crew") openCrewDlg?.(j);
      else if (act === "del") openDelDlg?.(j);
      return;
    }

    // Modified and non-primary clicks belong to the browser: ⌘/ctrl-click,
    // shift-click and middle-click on the row's arrow must still open a new
    // tab, and swallowing them here would break that.
    const ev = e as MouseEvent;
    const plainClick =
      ev.button === 0 && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey && !ev.altKey;

    // The arrow stays a real <a> with a real href — that is what keeps
    // "copy link address" and new-tab working — but a plain left click is
    // claimed so it goes through openRecord like the other two doors.
    const arrow = target.closest<HTMLElement>("#jobsBody a.pt-open");
    if (arrow && plainClick) {
      const id = arrow.closest<HTMLElement>(".prow")?.dataset.id;
      if (id) {
        e.preventDefault();
        closeMenu();
        openRecord(id);
        return;
      }
    }
    // The narrow-viewport card is one big anchor. Same treatment, same reason:
    // it stays a real <a> for new-tab and copy-link, and a plain left click
    // goes through the one door.
    const card = target.closest<HTMLElement>("#jobsCards a.jcard");
    if (card && plainClick && card.dataset.id) {
      e.preventDefault();
      closeMenu();
      openRecord(card.dataset.id);
      return;
    }

    // The WHOLE ROW is the door into the record, not just the 15px arrow at
    // the far right. The row has advertised itself as a target since the port
    // (it lifts to --paper-deep on hover) while doing nothing, which is worse
    // than a row that looks inert. Excluded: anything that already owns its
    // click — the dots trigger and the arrow anchor both sit inside `.j-acts`
    // and are matched by the `a, button` test, which is what keeps the kebab
    // from ALSO navigating.
    const row = target.closest<HTMLElement>("#jobsBody .prow");
    if (row && !target.closest("a, button") && plainClick) {
      const id = row.dataset.id;
      if (id) {
        closeMenu();
        openRecord(id);
        return;
      }
    }
    if (!pMenu?.contains(target)) closeMenu();
  });
  on(document, "keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape" && jstate.menuId) closeMenu();
  });

  // ================= CREATE DIALOG (new job) =================
  // The blueprint replacement for /dashboard/jobs/new. Same server action, same
  // payload shape, same validation — only the frame is different.
  const newJobBtn = $("#newJobBtn");
  const jDlg = $("#jNew");
  const jForm = root.querySelector<HTMLFormElement>("#jNewForm");
  if (jDlg && jForm) {
    const inp = (s: string) => root.querySelector<HTMLInputElement>(s);
    let draftStatus: JobStatus = "SCHEDULED";
    let draftCrew: string[] = [];
    let restoreFocus: HTMLElement | null = null;
    let saving = false;

    /** A dated job with no clock on it: the classic form defaulted to a 9am–2pm
     *  window, so a day picked here becomes 09:00 → 17:00 local rather than UTC
     *  midnight (which reads as the previous day in every negative offset). */
    function dayAt(v: string, hour: number): Date | null {
      const d = parseDay(v);
      if (!d) return null;
      d.setHours(hour, 0, 0, 0);
      return d;
    }

    // Schedule fields: the blueprint month-grid popover replaces the two native
    // date inputs, whose OS panel no stylesheet can reach. The icon pairing is
    // the calendar page's own (DTP_ICON) so a start and an end are named the
    // same thing on both surfaces. Everything above still reads `.value` as
    // "YYYY-MM-DD" — the picker writes through the input and fires the same
    // input/change events a keystroke would.
    disposers.push(
      initDatePopovers(root, [
        { sel: "#jfStart", icon: "i-clock", label: "Starts" },
        { sel: "#jfEnd", icon: "i-hourglass", label: "Ends" },
      ]),
    );

    function markErr(bad: boolean) {
      jDlg!.querySelector<HTMLElement>('[data-fld="title"]')?.classList.toggle("is-err", bad);
    }
    function dlgError(msg: string) {
      const box = $("#jNewErr");
      if (!box) return;
      box.textContent = msg || "";
      box.classList.toggle("is-hidden", !msg);
    }
    function setSaving(on: boolean) {
      saving = on;
      const btn = root.querySelector<HTMLButtonElement>("#jNewOk");
      if (!btn) return;
      btn.disabled = on;
      btn.classList.toggle("is-busy", on);
      const lbl = btn.querySelector<HTMLElement>("[data-save-lbl]");
      if (lbl) lbl.textContent = on ? "Creating…" : "Create job";
    }

    function paintStatus() {
      $$("#jfStatus .fseg-btn").forEach((b) => {
        const isOn = b.dataset.v === draftStatus;
        b.classList.toggle("on", isOn);
        b.setAttribute("aria-pressed", isOn ? "true" : "false");
      });
    }
    function paintCrew() {
      $$("#jfCrew .fseg-btn").forEach((b) => {
        const isOn = draftCrew.indexOf(b.dataset.w || "") !== -1;
        b.classList.toggle("on", isOn);
        b.setAttribute("aria-pressed", isOn ? "true" : "false");
      });
    }

    /** The client field is a COMBOBOX: it produces the `clientId` createJob
     *  links by when a row is picked, and it accepts a name that is not in the
     *  book yet. What happens to free text is decided at submit — see
     *  `resolveClient`. */
    let pickedClientId: string | null = null;
    let pickedProposalId: string | null = null;

    function clientItems(): ComboItem[] {
      return clientOptions.map((c) => ({ id: c.id, label: c.name, icon: "i-user" }));
    }
    function proposalItems(): ComboItem[] {
      return proposalOptions.map((p) => ({
        id: p.id,
        label: p.title,
        sub: [p.client || "No client", statusLabel(p.status), money(p.total)].join(" · "),
        icon: "i-file",
      }));
    }

    const clientInput = inp("#jfClient");
    if (clientInput) {
      disposers.push(
        attachCombo({
          input: clientInput,
          toggle: $("#jfClientCaret"),
          icon: "i-user",
          emptyText: "No client by that name — it will be added",
          items: clientItems,
          onPick: (it) => {
            pickedClientId = it ? it.id : null;
          },
        }),
      );
    }
    const proposalInput = inp("#jfProposal");
    if (proposalInput) {
      disposers.push(
        attachCombo({
          input: proposalInput,
          toggle: $("#jfProposalCaret"),
          icon: "i-file",
          emptyText: "No matching proposal",
          // A Job.proposalId can only point at a row that exists, so free text
          // here is not a value — the field clears itself and the job is
          // created with no proposal, which is a perfectly good outcome.
          strict: true,
          items: proposalItems,
          onPick: (it) => {
            pickedProposalId = it ? it.id : null;
            if (!it) return;
            // Picking the paperwork fills in who it is for, but never
            // overwrites a client the user already chose.
            const p = proposalOptions.find((x) => x.id === it.id);
            if (p?.clientId && clientInput && !clientInput.value.trim()) {
              clientInput.value = p.client || "";
              pickedClientId = p.clientId;
            }
          },
        }),
      );
    }

    /**
     * Turn whatever is in the client field into the id `createJob` wants.
     *
     * Three outcomes: empty → no client; a name already in the book (picked, or
     * typed exactly) → that id; anything else → a new Client through the
     * EXISTING `createClient` action, because `Job` has no client-name column
     * and `createJob` links by id only. The new client joins `clientOptions` so
     * the next job can pick them without a reload.
     */
    async function resolveClient(): Promise<string | null> {
      const typed = (clientInput?.value || "").trim();
      if (!typed) return null;
      const known =
        (pickedClientId && clientOptions.find((c) => c.id === pickedClientId)) ||
        clientOptions.find((c) => c.name.toLowerCase() === typed.toLowerCase());
      if (known && known.name.toLowerCase() === typed.toLowerCase()) return known.id;
      const made = await createClient({ name: typed });
      clientOptions.push({ id: made.id, name: made.name });
      clientOptions.sort((a, b) => a.name.localeCompare(b.name));
      pickedClientId = made.id;
      return made.id;
    }
    /** The org's real roster as toggles. Installers get no list at all (the
     *  server auto-assigns them and refuses anyone else), so the field goes. */
    function fillCrew() {
      const box = $("#jfCrew");
      const fld = $("#jfCrewFld");
      if (!box || !fld) return;
      if (!crewOptions.length) {
        fld.classList.add("is-hidden");
        return;
      }
      fld.classList.remove("is-hidden");
      box.innerHTML = crewOptions
        .map(
          (w) =>
            '<button class="fseg-btn" type="button" data-w="' +
            esc(w.id) +
            '" aria-pressed="false">' +
            esc(w.name) +
            "</button>",
        )
        .join("");
    }

    function openDlg() {
      restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dlgError("");
      openMdl(jDlg!);
      // land on the first field, not on the dialog frame
      requestAnimationFrame(() => inp("#jfTitle")?.focus());
    }

    function closeDlg() {
      // The dialog animates out over MDL_EXIT_MS (see mdl-motion). Focus goes
      // back to the opener immediately — waiting for the exit would leave the
      // keyboard stranded inside a dialog that is already on its way out.
      if (!closeMdl(jDlg!, after)) return;
      markErr(false);
      restoreFocus?.focus();
    }

    function resetDlg() {
      jForm!.reset();
      draftStatus = "SCHEDULED";
      draftCrew = [];
      // `form.reset()` restores the DEFAULT value of an input, which for the
      // two comboboxes is the empty string they were rendered with — but the
      // ids they produced are module state and have to be dropped by hand.
      pickedClientId = null;
      pickedProposalId = null;
      paintStatus();
      paintCrew();
      markErr(false);
      dlgError("");
    }

    fillCrew();

    if (newJobBtn) on(newJobBtn, "click", openDlg);

    on(jDlg, "click", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-mdl="close"]')) {
        if (saving) return;
        closeDlg();
        return;
      }
      const seg = t.closest<HTMLElement>("#jfStatus .fseg-btn");
      if (seg) {
        draftStatus = (seg.dataset.v || "SCHEDULED") as JobStatus;
        paintStatus();
        return;
      }
      const who = t.closest<HTMLElement>("#jfCrew .fseg-btn");
      if (who) {
        const id = who.dataset.w || "";
        const at = draftCrew.indexOf(id);
        if (at === -1) draftCrew.push(id);
        else draftCrew.splice(at, 1);
        paintCrew();
      }
    });

    on(document, "keydown", (e) => {
      const ev = e as KeyboardEvent;
      if (!jDlg.classList.contains("open")) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        if (!saving) closeDlg();
        return;
      }
      // aria-modal: Tab must not walk out of the dialog and into the page behind
      if (ev.key !== "Tab") return;
      const items = Array.from(
        jDlg.querySelectorAll<HTMLElement>("button, input, textarea, select, [href]"),
      ).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (ev.shiftKey && (active === first || !jDlg.contains(active))) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && active === last) {
        ev.preventDefault();
        first.focus();
      }
    });

    on(jForm, "input", () => {
      markErr(false);
      dlgError("");
    });

    on(jForm, "submit", (e) => {
      e.preventDefault();
      if (saving) return;
      const titleEl = inp("#jfTitle");
      const title = (titleEl?.value || "").trim();
      if (!title) {
        markErr(true);
        titleEl?.focus();
        return;
      }
      const startRaw = inp("#jfStart")?.value || "";
      const endRaw = inp("#jfEnd")?.value || "";
      const startsAt = dayAt(startRaw, 9);
      const endsAt = dayAt(endRaw || startRaw, 17);
      const workerIds = draftCrew.slice();
      // Read the proposal back off the field rather than trusting the stored
      // id alone: a value typed over and left un-picked must not attach.
      const proposalTyped = (proposalInput?.value || "").trim();
      const proposalId =
        pickedProposalId &&
        proposalOptions.find((p) => p.id === pickedProposalId)?.title === proposalTyped
          ? pickedProposalId
          : null;

      setSaving(true);
      dlgError("");
      void (async () => {
        try {
          // A client typed but not in the book is created first — the job
          // cannot carry a name, only an id. Its own refusal message (plan
          // limit, wrong role) lands in the dialog like any other.
          const clientId = await resolveClient();
          if (!alive) return;
          const clientName = clientId
            ? clientOptions.find((c) => c.id === clientId)?.name ?? null
            : null;
          const res = await createJob({
            title,
            clientId,
            proposalId,
            status: draftStatus,
            startsAt,
            endsAt: startsAt ? endsAt : null,
            workerIds,
          });
          if (!alive) return;
          // Optimistic insert with the id the server just minted, so the row's
          // Open link points at the real record without a round trip.
          // `assignments` comes back from the action rather than being guessed
          // from workerIds: the row menu's crew editor unassigns by ASSIGNMENT
          // id, and a job created in this session would otherwise be the one
          // row on the board whose crew could be added to but never removed.
          const made = res.assignments ?? [];
          jobsData.unshift({
            id: res.id,
            title,
            client: clientName,
            status: draftStatus,
            start: startRaw || null,
            end: endRaw && endRaw !== startRaw ? endRaw : null,
            crew: made
              .map((a) => crewOptions.find((w) => w.id === a.workerId)?.name)
              .filter((n): n is string => !!n),
            assignments: made.map((a) => ({ id: a.id, workerId: a.workerId })),
          });
          // Drop back to All, so a job created while a status tab was active is
          // actually visible — it lands in the first row.
          jstate.tab = "ALL";
          jstate.page = 1;
          setSaving(false);
          closeDlg();
          // Clear the form only once the box has finished animating out — reset
          // it on the same frame and you watch the fields blank while the dialog
          // is still visible.
          after(MDL_EXIT_MS, resetDlg);
          // Counts and the active tab are patched, not rebuilt: #jTabs carries
          // the reveal cascade's state and the tab the user was standing on.
          patchTabCounts();
          $$("#jTabs .jtab").forEach((t) => t.classList.toggle("on", t.dataset.t === "ALL"));
          renderRows();
        } catch (err) {
          if (!alive) return;
          setSaving(false);
          dlgError(actionError(err));
        }
      })();
    });
  }

  // ================= ROW-MENU DIALOGS =================
  // Schedule, crew and delete each need the create dialog's frame plumbing —
  // open/close motion, an Escape that closes one layer, a busy button, an error
  // box carrying the action's own words. That is the same shape three times, so
  // it is written once here and handed a spec, rather than three near-copies
  // drifting apart (decisions.md: never create parallel style sets for
  // identical blocks — the same is true of their behavior).
  type RowDlg = {
    el: HTMLElement;
    open: (j: Job) => void;
    close: () => void;
    busy: (on: boolean) => void;
    error: (msg: string) => void;
    /** The job the dialog is currently about. */
    job: () => Job | null;
  };

  function makeRowDlg(spec: {
    id: string;
    okId: string;
    errId: string;
    idleLabel: string;
    busyLabel: string;
    /** Fill the dialog's own fields for this job. */
    paint: (j: Job) => void;
  }): RowDlg | null {
    const el = $("#" + spec.id);
    if (!el) return null;
    let current: Job | null = null;
    let restore: HTMLElement | null = null;
    let working = false;

    const error = (msg: string) => {
      const box = $("#" + spec.errId);
      if (!box) return;
      box.textContent = msg || "";
      box.classList.toggle("is-hidden", !msg);
    };
    const busy = (on: boolean) => {
      working = on;
      const btn = root.querySelector<HTMLButtonElement>("#" + spec.okId);
      if (!btn) return;
      btn.disabled = on;
      btn.classList.toggle("is-busy", on);
      const lbl = btn.querySelector<HTMLElement>("[data-save-lbl]");
      if (lbl) lbl.textContent = on ? spec.busyLabel : spec.idleLabel;
    };
    const close = () => {
      if (!closeMdl(el, after)) return;
      current = null;
      restore?.focus();
    };
    const open = (j: Job) => {
      current = j;
      restore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      error("");
      busy(false);
      spec.paint(j);
      openMdl(el);
    };

    on(el, "click", (e) => {
      if ((e.target as HTMLElement).closest('[data-mdl="close"]') && !working) close();
    });
    on(document, "keydown", (e) => {
      const ev = e as KeyboardEvent;
      if (ev.key !== "Escape" || !el.classList.contains("open")) return;
      ev.preventDefault();
      if (!working) close();
    });

    return { el, open, close, busy, error, job: () => current };
  }

  // ── SCHEDULE ────────────────────────────────────────────────────
  const schedDlg = makeRowDlg({
    id: "jSched",
    okId: "jSchedOk",
    errId: "jSchedErr",
    idleLabel: "Save schedule",
    busyLabel: "Saving…",
    paint: (j) => {
      const who = $("#jSchedWho");
      if (who) {
        who.innerHTML = "<b>" + esc(j.title) + "</b> · " + esc(j.client || "No client");
      }
      const hint = $("#jSchedHint");
      if (hint) {
        hint.textContent = j.start
          ? "Moves the job's own window. Leave Ends empty for a single day."
          : "Puts the job on the calendar at 9am and creates its event.";
      }
      const title = $("#jSchedTitle");
      if (title) title.textContent = j.start ? "Reschedule job" : "Schedule job";
      const s = root.querySelector<HTMLInputElement>("#jsStart");
      const e = root.querySelector<HTMLInputElement>("#jsEnd");
      if (s) s.value = j.start || "";
      if (e) e.value = j.end || "";
      $("#jSched")?.querySelector('[data-fld="schedStart"]')?.classList.remove("is-err");
    },
  });
  if (schedDlg) {
    // The two date fields get the same month-grid popover the create dialog's
    // do — the native control's panel is an OS surface CSS cannot reach.
    disposers.push(
      initDatePopovers(root, [
        { sel: "#jsStart", icon: "i-clock", label: "Starts" },
        { sel: "#jsEnd", icon: "i-hourglass", label: "Ends" },
      ]),
    );
    openSchedDlg = schedDlg.open;
    const schedForm = root.querySelector<HTMLFormElement>("#jSchedForm");
    if (schedForm) {
      on(schedForm, "submit", (e) => {
        e.preventDefault();
        const j = schedDlg.job();
        if (!j) return;
        const startEl = root.querySelector<HTMLInputElement>("#jsStart");
        const endEl = root.querySelector<HTMLInputElement>("#jsEnd");
        const start = (startEl?.value || "").trim();
        const end = (endEl?.value || "").trim();
        const fld = schedDlg.el.querySelector<HTMLElement>('[data-fld="schedStart"]');
        if (!start) {
          fld?.classList.add("is-err");
          startEl?.focus();
          return;
        }
        fld?.classList.remove("is-err");
        const wasUnscheduled = !j.start;
        schedDlg.busy(true);
        schedDlg.error("");
        void (async () => {
          try {
            if (wasUnscheduled) {
              // Nothing on the calendar yet: the dispatch tray's action is the
              // one that creates the JobEvent as well as setting the window,
              // so the job actually appears on /dashboard/calendar.
              //
              // It is handed a full INSTANT, not the "YYYY-MM-DD" day: the
              // action does `new Date(dateISO)`, which reads a bare day as UTC
              // midnight, and its `setHours(9, …)` then lands on the PREVIOUS
              // day in every negative-offset timezone. Verified — a job
              // scheduled for Sep 15 got a Sep 14 calendar event. (The calendar
              // page's own drag-to-tray caller passes a bare day and still
              // carries this.)
              await scheduleJobFromTray(j.id, (dayAtLocal(start, 9) as Date).toISOString());
              // It defaults to a 9am–2pm single day; widen it only if the user
              // asked for a span, rather than firing a second write every time.
              if (end && end !== start) {
                await updateJob(j.id, {
                  startsAt: dayAtLocal(start, 9),
                  endsAt: dayAtLocal(end, 17),
                });
              }
            } else {
              // Already on the calendar: move the job's own window. Calling the
              // tray action again would mint a SECOND JobEvent for the same job.
              await updateJob(j.id, {
                startsAt: dayAtLocal(start, 9),
                endsAt: dayAtLocal(end || start, 17),
              });
            }
            if (!alive) return;
            applySchedule(j, start, end || null);
            schedDlg.busy(false);
            schedDlg.close();
          } catch (err) {
            if (!alive) return;
            schedDlg.busy(false);
            schedDlg.error(actionError(err));
          }
        })();
      });
    }
  }

  // ── ASSIGN CREW ─────────────────────────────────────────────────
  const crewDlg = makeRowDlg({
    id: "jCrew",
    okId: "jCrewOk",
    errId: "jCrewErr",
    idleLabel: "Save crew",
    busyLabel: "Saving…",
    paint: (j) => {
      const who = $("#jCrewWho");
      if (who) {
        who.innerHTML = "<b>" + esc(j.title) + "</b> · " + esc(j.client || "No client");
      }
      draftRoster = (j.assignments ?? []).map((a) => a.workerId);
      const box = $("#jCrewList");
      if (box) {
        box.innerHTML = crewOptions.length
          ? crewOptions
              .map(
                (w) =>
                  '<button class="fseg-btn" type="button" data-w="' +
                  esc(w.id) +
                  '" aria-pressed="false">' +
                  esc(w.name) +
                  "</button>",
              )
              .join("")
          : '<span class="fld-hint">No workers on the roster yet.</span>';
      }
      paintRoster();
    },
  });
  /** Worker ids toggled on in the crew dialog. Diffed against the job's live
   *  assignments on save — nothing is written until then. */
  let draftRoster: string[] = [];
  function paintRoster() {
    $$("#jCrewList .fseg-btn").forEach((b) => {
      const isOn = draftRoster.indexOf(b.dataset.w || "") !== -1;
      b.classList.toggle("on", isOn);
      b.setAttribute("aria-pressed", isOn ? "true" : "false");
    });
  }
  if (crewDlg) {
    openCrewDlg = crewDlg.open;
    on(crewDlg.el, "click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("#jCrewList .fseg-btn");
      if (!b) return;
      const id = b.dataset.w || "";
      const at = draftRoster.indexOf(id);
      if (at === -1) draftRoster.push(id);
      else draftRoster.splice(at, 1);
      paintRoster();
    });
    const crewForm = root.querySelector<HTMLFormElement>("#jCrewForm");
    if (crewForm) {
      on(crewForm, "submit", (e) => {
        e.preventDefault();
        const j = crewDlg.job();
        if (!j) return;
        const live = j.assignments ?? [];
        const added = draftRoster.filter((w) => !live.some((a) => a.workerId === w));
        const removed = live.filter((a) => draftRoster.indexOf(a.workerId) === -1);
        if (!added.length && !removed.length) {
          crewDlg.close();
          return;
        }
        crewDlg.busy(true);
        crewDlg.error("");
        void (async () => {
          try {
            // Sequential, not Promise.all: SQLite serialises writes anyway, and
            // a partial failure here has to leave the local state describing
            // exactly what landed.
            for (const a of removed) {
              await unassignAssignment(a.id);
              const at = (j.assignments ?? []).findIndex((x) => x.id === a.id);
              if (at !== -1) j.assignments!.splice(at, 1);
            }
            for (const workerId of added) {
              await assignWorker(j.id, workerId);
            }
            if (!alive) return;
            // `assignWorker` returns nothing, so the new assignment ids are not
            // known until the next server read. The names are what the board
            // PRINTS, and they are known; the ids are only needed to unassign,
            // and a row added in this session can be removed again after a
            // reload. Recorded with an empty id so the diff above still sees it.
            for (const workerId of added) {
              (j.assignments ??= []).push({ id: "", workerId });
            }
            j.crew = (j.assignments ?? [])
              .map((a) => crewOptions.find((w) => w.id === a.workerId)?.name)
              .filter((n): n is string => !!n);
            applyCrew(j);
            crewDlg.busy(false);
            crewDlg.close();
          } catch (err) {
            if (!alive) return;
            j.crew = (j.assignments ?? [])
              .map((a) => crewOptions.find((w) => w.id === a.workerId)?.name)
              .filter((n): n is string => !!n);
            applyCrew(j);
            crewDlg.busy(false);
            crewDlg.error(actionError(err));
          }
        })();
      });
    }
  }

  // ── DELETE ──────────────────────────────────────────────────────
  const delDlg = makeRowDlg({
    id: "jDel",
    okId: "jDelOk",
    errId: "jDelErr",
    idleLabel: "Delete job",
    busyLabel: "Deleting…",
    paint: (j) => {
      const who = $("#jDelWho");
      if (who) {
        who.innerHTML =
          "Delete <b>" + esc(j.title) + "</b> for " + esc(j.client || "no client") + "?";
      }
    },
  });
  if (delDlg) {
    openDelDlg = delDlg.open;
    const ok = root.querySelector<HTMLButtonElement>("#jDelOk");
    if (ok) {
      on(ok, "click", () => {
        const j = delDlg.job();
        if (!j) return;
        delDlg.busy(true);
        delDlg.error("");
        void (async () => {
          try {
            await deleteJob(j.id);
            if (!alive) return;
            delDlg.busy(false);
            delDlg.close();
            // After the box is gone, so the row's exit is not competing with the
            // dialog's own.
            after(MDL_EXIT_MS, () => dropJob(j.id));
          } catch (err) {
            if (!alive) return;
            delDlg.busy(false);
            delDlg.error(actionError(err));
          }
        })();
      });
    }
  }

  /** Module-level twin of the create dialog's `dayAt`: the row dialogs live
   *  outside that block and need the same 9am / 5pm local anchoring, for the
   *  same reason (UTC midnight reads as the previous day west of Greenwich). */
  function dayAtLocal(v: string, hour: number): Date | null {
    const d = parseDay(v);
    if (!d) return null;
    d.setHours(hour, 0, 0, 0);
    return d;
  }

  // ================= INITIALIZATION =================
  safe("init", function () {
    renderJobs();
  });

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Reveal: load + scroll.
    // Reveal adapts to scroll speed: slow scroll — the full 420ms animation;
    // fast — a short one (down to 200ms): never lags, still visible.
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
    // `.mdl` and `.pmenu` are skipped: both are `.content` children only
    // because the port moved them inside the mounted root, and both are
    // `display: none` until opened. `.rv` would strand a fixed overlay at
    // `opacity: 0` — an element with no box never intersects, so the observer
    // below never grants it `.rv-in`, and the FIRST open of the row menu
    // produced nothing for ~800ms (a 360ms cascade delay plus the 420ms fade)
    // before a box faded up out of nowhere, 420px from the dots that asked for
    // it. That was half of "the three dots do nothing"; the other half was the
    // zoom read in openMenu.
    const blocks = (Array.from(root.children) as HTMLElement[]).filter(
      (el) => !el.classList.contains("mdl") && !el.classList.contains("pmenu"),
    );
    blocks.forEach((el, i) => {
      el.classList.add("rv");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? i * 60 + "ms" : "200ms";
    });
    // Second layer of the arrival — Overview cascades its `.kpi` strip here.
    // This page has no `.kpi`, so the layer was silently absent; its strip of
    // small units is the status tab row. Skip anything the block cascade
    // already claimed: no element should carry `rv` and `rv-cell` at once.
    const cells = $$(".jtab").filter((el) => !el.classList.contains("rv"));
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
            // element below the fold: duration from the current scroll speed
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
    //
    // Row stagger: the donor drove it from a MutationObserver on the two list
    // containers, which replayed the whole cascade on every repaint — including
    // a single status patch. It is now called by renderRows() only, when the
    // list genuinely arrives. See blueprint-shell/list-motion.

    // Numeral count-up — Overview's `.kpi-val`; here the per-status tab counts.
    // The donor rebuilt the text from digits alone, safe only for its own plain
    // "$12,400"/"18": it drops any trailing unit and would wipe an inline icon.
    // So keep whatever frames the number, skip decimals (digits-only mangles
    // them), and skip nodes that hold elements rather than bare text.
    $$(".jtab-n").forEach((el) => {
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

    // Press effects — delegated to `root` so nodes injected after init
    // (menu items, JS-rendered buttons, innerHTML re-renders) still press.
    function pressify(s: string, cls: string) {
      on(root, "click", (e) => {
        const el = (e.target as Element).closest<HTMLElement>(s);
        if (!el || !root.contains(el)) return;
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
      });
      on(root, "animationend", (e) => {
        const el = e.target as HTMLElement;
        if (el.matches && el.matches(s)) el.classList.remove(cls);
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
