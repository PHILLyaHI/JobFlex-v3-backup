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

import { createJob, updateJob } from "@/actions/jobs";
import { closeMdl, openMdl, MDL_EXIT_MS } from "@/components/v3/blueprint-shell/mdl-motion";
import { leaveRow, staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import { initDatePopovers } from "@/components/v3/shared/date-popover";
import {
  JOB_TABS,
  ACCENT,
  JOBS_SEED,
  PAGE_SIZE,
  parseDay,
  rangeLabel,
  relLabel,
  type Job,
  type JobClientOption,
  type JobCrewOption,
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
  /** Owner/manager — gates the row menu's status writes. `updateJob` calls
   *  `requireManager`, so for anyone else the items are not offered at all. */
  canManage?: boolean;
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
  const jobsData: Job[] = (options.entries ?? JOBS_SEED).map((j) => ({ ...j, crew: [...j.crew] }));
  const clientOptions: JobClientOption[] = options.clients ?? [];
  const crewOptions: JobCrewOption[] = options.crew ?? [];
  const canManage = options.canManage ?? false;

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
      '<td><div class="j-title">' +
      esc(j.title) +
      "</div>" +
      '<div class="j-client">' +
      esc(j.client || "No client") +
      "</div></td>" +
      '<td data-cell="status">' +
      statusPill(j) +
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
  function statusPill(j: Job) {
    return (
      '<span class="pstatus jst--' +
      j.status.toLowerCase() +
      '"><span class="jst-dot"></span>' +
      statusLabel(j.status) +
      "</span>"
    );
  }
  function whenHtml(j: Job) {
    const range = rangeLabel(j);
    return range
      ? '<div class="j-date">' + range + '</div><div class="j-rel">' + (relLabel(j.start) || "") + "</div>"
      : '<span class="j-unsched">Unscheduled</span>';
  }
  function cardHtml(j: Job) {
    const range = rangeLabel(j);
    return (
      '<li><a class="jcard" href="' +
      jobHref(j.id) +
      '" data-id="' +
      esc(j.id) +
      '" style="--acc:' +
      ACCENT[j.status] +
      '">' +
      '<div class="jcard-top"><div style="min-width:0">' +
      '<div class="jcard-t">' +
      esc(j.title) +
      "</div>" +
      '<div class="jcard-c">' +
      esc(j.client || "No client") +
      "</div></div>" +
      '<span class="pstatus jst--' +
      j.status.toLowerCase() +
      '" data-cell="status">' +
      statusLabel(j.status) +
      "</span></div>" +
      '<div class="jcard-bot">' +
      '<span class="jcard-when"><svg class="ic"><use href="#i-cal"/></svg>' +
      (range || "Unscheduled") +
      "</span>" +
      (j.crew.length ? crewStack(j.crew) : "") +
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
  // The donor drew a bare arrow and nothing else. The actions behind it are the
  // classic detail page's status control (`updateJob`), which is the only write
  // this surface can make on an existing job — everything else (photos,
  // expenses, crew changes) lives on /dashboard/jobs/<id> and is one click away
  // through "Open job".
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
          )
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
    // The donor zooms document.documentElement; the port zooms the page root.
    const z = parseFloat(root.style.getPropertyValue("zoom")) || 1;
    const vw = window.innerWidth / z;
    const vh = window.innerHeight / z;
    const r = btn.getBoundingClientRect();
    const mw = 254;
    let left = Math.min(r.right - mw, vw - mw - 12);
    left = Math.max(12, left);
    pMenu.style.left = left + "px";
    pMenu.style.top = "0px";
    const mh = pMenu.offsetHeight;
    let top = r.bottom + 6;
    if (top + mh > vh - 12) top = Math.max(12, r.top - mh - 6);
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
      if (cell) cell.innerHTML = statusPill(j);
    }
    if (cardEl) {
      cardEl.style.setProperty("--acc", ACCENT[next]);
      const pill = cardEl.querySelector<HTMLElement>('[data-cell="status"]');
      if (pill) {
        pill.className = "pstatus jst--" + next.toLowerCase();
        pill.setAttribute("data-cell", "status");
        pill.textContent = statusLabel(next);
      }
    }
  }

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
      if (act === "open") {
        closeMenu();
        window.location.assign(jobHref(id));
        return;
      }
      if (act.startsWith("st:")) {
        void runStatus(id, act.slice(3) as JobStatus, item);
      }
      return;
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

    /** The org's real clients, filled once — the select is the only place the
     *  dialog can produce the `clientId` createJob links by. */
    function fillClients() {
      const box = root.querySelector<HTMLSelectElement>("#jfClient");
      if (!box) return;
      box.innerHTML =
        '<option value="">— No client —</option>' +
        clientOptions
          .map((c) => '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>")
          .join("");
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
      paintStatus();
      paintCrew();
      markErr(false);
      dlgError("");
    }

    fillClients();
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
      const clientSel = root.querySelector<HTMLSelectElement>("#jfClient");
      const clientId = clientSel?.value || null;
      const clientName = clientId
        ? clientOptions.find((c) => c.id === clientId)?.name ?? null
        : null;
      const startsAt = dayAt(startRaw, 9);
      const endsAt = dayAt(endRaw || startRaw, 17);
      const workerIds = draftCrew.slice();

      setSaving(true);
      dlgError("");
      void (async () => {
        try {
          const res = await createJob({
            title,
            clientId,
            status: draftStatus,
            startsAt,
            endsAt: startsAt ? endsAt : null,
            workerIds,
          });
          if (!alive) return;
          // Optimistic insert with the id the server just minted, so the row's
          // Open link points at the real record without a round trip.
          jobsData.unshift({
            id: res.id,
            title,
            client: clientName,
            status: draftStatus,
            start: startRaw || null,
            end: endRaw && endRaw !== startRaw ? endRaw : null,
            crew: workerIds
              .map((id) => crewOptions.find((w) => w.id === id)?.name)
              .filter((n): n is string => !!n),
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
    // `.mdl` is skipped: it is a `.content` child only because the port moved
    // the dialog inside the mounted root, and `.rv` would strand the fixed
    // overlay at `opacity: 0` until it happened to intersect the viewport.
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

    // Press effects
    function pressify(s: string, cls: string) {
      $$(s).forEach((el) => {
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
