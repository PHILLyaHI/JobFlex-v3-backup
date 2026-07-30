// Calendar blueprint — runtime behaviors, ported verbatim from the donor
// file's <script> (jobflex-calendar-blueprint_5.html). Every duration, easing,
// stagger, window (6:00–20:00), format string and formula is the donor's exact
// value. Adaptations are mechanical only:
// - queries are scoped to the mounted `.content` root instead of `document`;
// - document/window listeners and observers are tracked for unmount cleanup;
// - the donor blocks that belong to the PERSISTENT chrome are skipped, because
//   components/v3/blueprint-shell/shell-behavior.ts already owns them: the
//   mobile nav drawer / burger, FLUID SCALE, the sidebar entry cascade, the
//   sliding active-item indicator and the graph-paper parallax;
// - the donor's `window.matchMedia` polyfill (for file-preview webviews) is
//   dropped: it patched a global, and the browsers this app targets all ship
//   matchMedia;
// - the donor's unused `traySeq` counter is dropped (dead in the donor too).
//
// Everything the script injects lands inside `.content` — nothing is appended
// to document.body.

import {
  TODAY,
  JOB_STATUSES,
  workersData,
  EVENTS_SEED,
  TRAY_SEED,
  INBOX_SEED,
  LINK_OPTIONS,
  LINK_TABS,
  LINK_LABEL,
  WG_START,
  WG_END,
  WG_ROW,
  SNAP_MIN,
  DOW,
  DOW1,
  KIND_IC,
  type CalEvent,
  type CalKind,
  type InboxItem,
  type LinkOption,
  type TrayJob,
} from "./calendar-data";

export function initCalendarContent(content: HTMLElement): () => void {
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
  const $$ = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
  const byId = (id: string) => root.querySelector<HTMLElement>("#" + id);
  // Click targets inside a button are often the icon, and an <svg>/<use> is an
  // SVGElement — NOT an HTMLElement. Returning null for those made every
  // delegated handler ignore clicks that landed on an icon: the filter
  // triggers, the kind tabs and the event chips all needed a second click on
  // their text to respond. Walk up to the nearest HTML ancestor instead.
  const asEl = (t: EventTarget | null): HTMLElement | null => {
    let n: Node | null = t instanceof Node ? t : null;
    while (n && !(n instanceof HTMLElement)) n = n.parentNode;
    return n instanceof HTMLElement ? n : null;
  };

  // Each block is wrapped so a failure in one does not disable the rest
  // (the donor's `safe()` helper).
  const safe = (name: string, fn: () => void) => {
    try {
      fn();
    } catch (err) {
      console.error("[JobFlex] module failed: " + name, err);
    }
  };

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

  // ================= CALENDAR: DATA =================
  // Runtime mutations (drag-to-reschedule, create, delete, confirm) — clone the
  // seeds per mount so every navigation starts from the donor's state.
  const eventsData: CalEvent[] = EVENTS_SEED.map((e) => ({
    ...e,
    start: new Date(e.start),
    end: new Date(e.end),
    workers: e.workers.slice(),
  }));
  let trayJobs: TrayJob[] = TRAY_SEED.map((j) => ({ ...j }));
  let inboxData: InboxItem[] = INBOX_SEED.map((r) => ({ ...r }));
  let evSeq = 100;

  const cal = {
    view: "month" as "month" | "week" | "team",
    cursor: new Date(TODAY),
    trayOpen: true,
    workers: [] as string[],
    statuses: [] as string[],
    query: "",
    dragEvent: null as string | null,
    dragJob: null as string | null,
    /** Minutes between a dragged block's start and the point it was grabbed. */
    dragGrabMin: 0,
    sheet: null as string | null,
    editing: null as string | null,
    kind: "job" as CalKind,
    /** Direction of the last cursor move — the view animates in from that side. */
    nav: "" as "" | "prev" | "next",
    /** Working state of the sheet's form controls (the custom pickers own their
     *  value here instead of in a native input). */
    form: {
      start: new Date(TODAY),
      end: new Date(TODAY),
      crew: [] as string[],
      link: null as string | null,
      status: "SCHEDULED",
      /** Which pop-over the pickers currently have open, if any. */
      pop: null as string | null,
      /** Month the picker calendars are browsing, per picker id. */
      calCursor: {} as Record<string, string>,
      linkTab: "all" as string,
      linkQuery: "",
      allDay: false,
    },
  };

  function sameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function startOfWeek(d: Date) {
    const x = new Date(d);
    x.setDate(x.getDate() - x.getDay());
    x.setHours(0, 0, 0, 0);
    return x;
  }
  function fmtTime(d: Date) {
    let h = d.getHours();
    const m = d.getMinutes();
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return h + (m ? ":" + String(m).padStart(2, "0") : "") + " " + ap;
  }
  function fmtDate(d: Date) {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);
  }
  function fmtDayShort(d: Date) {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
  }
  function fmtMonthYear(d: Date) {
    return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(d);
  }
  /** "7:00 AM – 3:00 PM" — the range label used by chips, previews and pickers. */
  function fmtRange(a: Date, b: Date) {
    return fmtTime(a) + " – " + fmtTime(b);
  }
  function durLabel(ms: number) {
    const total = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (!h) return m + "m";
    return m ? h + "h " + m + "m" : h + "h";
  }
  /** Minutes since midnight. */
  function minsOf(d: Date) {
    return d.getHours() * 60 + d.getMinutes();
  }
  function addMin(d: Date, m: number) {
    return new Date(d.getTime() + m * 60000);
  }
  /** Same calendar day as `day`, at `mins` minutes past midnight. */
  function atMins(day: Date, mins: number) {
    const x = new Date(day);
    x.setHours(0, 0, 0, 0);
    return new Date(x.getTime() + mins * 60000);
  }
  function snapMins(mins: number) {
    return Math.round(mins / SNAP_MIN) * SNAP_MIN;
  }
  function initials(name: string) {
    return name.split(" ").map(function (p) { return p[0]; }).join("").slice(0, 2).toUpperCase();
  }
  function esc(s: string) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function statusCls(e: CalEvent) {
    return e.kind === "job" ? "evc--" + e.status.toLowerCase() : "evc--" + e.kind;
  }

  function visibleEvents() {
    const q = cal.query.trim().toLowerCase();
    return eventsData.filter(function (e) {
      if (cal.statuses.length && cal.statuses.indexOf(e.status) === -1) return false;
      if (cal.workers.length && !e.workers.some(function (w) { return cal.workers.indexOf(w) !== -1; })) return false;
      if (!q) return true;
      return (e.title + " " + (e.client || "") + " " + (e.addr || "")).toLowerCase().indexOf(q) !== -1;
    });
  }
  function eventsOn(day: Date, workerId?: string) {
    return visibleEvents().filter(function (e) {
      if (!sameDay(e.start, day)) return false;
      if (workerId && e.workers.indexOf(workerId) === -1) return false;
      return true;
    }).sort(function (a, b) { return a.start.getTime() - b.start.getTime(); });
  }
  function workerNames(e: CalEvent) {
    return e.workers.map(function (id) {
      const w = workersData.find(function (x) { return x.id === id; });
      return w ? w.name : id;
    });
  }

  // ================= RENDER: toolbar and filters =================
  function renderBar() {
    const c = cal.cursor;
    let title: string;
    if (cal.view === "month") {
      title = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(c);
    } else {
      const st = startOfWeek(c), en = new Date(st); en.setDate(en.getDate() + 6);
      const sMo = new Intl.DateTimeFormat("en-US", { month: "short" }).format(st);
      const eMo = new Intl.DateTimeFormat("en-US", { month: "short" }).format(en);
      title = st.getMonth() === en.getMonth()
        ? sMo + " " + st.getDate() + "–" + en.getDate() + ", " + en.getFullYear()
        : sMo + " " + st.getDate() + " – " + eMo + " " + en.getDate() + ", " + en.getFullYear();
    }
    const calTitle = byId("calTitle");
    if (calTitle) calTitle.textContent = title;
    const inb = byId("inboxN");
    if (inb) {
      inb.textContent = String(inboxData.length);
      inb.classList.toggle("is-hidden", inboxData.length === 0);
    }
    const tr = byId("trayN");
    if (tr) {
      tr.textContent = String(trayJobs.length);
      tr.classList.toggle("is-hidden", trayJobs.length === 0 || cal.trayOpen);
    }
    const trayCount = byId("trayCount");
    if (trayCount) trayCount.textContent = String(trayJobs.length);
    byId("trayBtn")?.classList.toggle("active", cal.trayOpen);
    byId("calWrap")?.classList.toggle("no-tray", !cal.trayOpen);
    byId("trayEmpty")?.classList.toggle("is-hidden", trayJobs.length !== 0);
  }
  const STATUS_DOT: Record<string, string> = {
    SCHEDULED: "var(--blueprint)", IN_PROGRESS: "var(--warning)",
    COMPLETED: "var(--success)", CANCELED: "var(--danger)",
  };

  /** Summary shown on a filter button: "All" / the single pick / "N selected". */
  function fddValue(picked: string[], labelOf: (v: string) => string) {
    if (!picked.length) return "All";
    if (picked.length === 1) return labelOf(picked[0]);
    return picked.length + " selected";
  }
  /** One filter dropdown: trigger + multi-select menu. The two sets are the
   *  only filter chrome left in the bar — the old row of one-chip-per-worker
   *  and one-chip-per-status buttons collapsed into these. */
  function fddHtml(opts: {
    id: string; icon: string; label: string; value: string;
    count: number; body: string; open: boolean;
  }) {
    return '<button class="fdd-btn' + (opts.count ? " on" : "") + '" type="button" data-fdd="' + opts.id +
        '" aria-expanded="' + opts.open + '">' +
        '<svg class="ic fdd-ic"><use href="#' + opts.icon + '"/></svg>' +
        '<span class="fdd-lbl">' + opts.label + '</span>' +
        '<span class="fdd-sep" aria-hidden="true"></span>' +
        '<span class="fdd-val">' + esc(opts.value) + '</span>' +
        '<span class="fdd-n' + (opts.count ? "" : " is-hidden") + '">' + (opts.count || "") + '</span>' +
        '<svg class="ic fdd-chev"><use href="#i-chev"/></svg>' +
      "</button>" +
      '<div class="fdd-menu" role="group">' +
        '<div class="fdd-menu-head"><span>' + opts.label + '</span>' +
          '<button class="fdd-reset" type="button" data-fdd-reset="' + opts.id + '">Reset</button></div>' +
        opts.body +
      "</div>";
  }

  /** The worker filter's own summary line, used by both the full render and the
   *  in-place patch so the two can never word it differently. */
  function workerSummary() {
    return fddValue(cal.workers, function (id) {
      const w = workersData.find(function (x) { return x.id === id; });
      return w ? w.name : id;
    });
  }

  /**
   * Repaint one dropdown's trigger WITHOUT touching its menu.
   *
   * Toggling an option used to run a full `renderFilters()`, which replaced the
   * open menu's innerHTML — so the row you had just clicked was destroyed
   * mid-click and every remaining row restarted its `calendar_optIn` entry
   * animation from `opacity: 0`. The selection did register, but the menu
   * blinked and the calendar behind it re-animated, which reads as "the click
   * did nothing". Now only the summary, the count badge and the clicked row
   * change, and the menu stays perfectly still.
   */
  function paintFddTrigger(hostId: string, value: string, count: number) {
    const host = byId(hostId);
    if (!host) return;
    host.querySelector<HTMLElement>(".fdd-btn")?.classList.toggle("on", count > 0);
    const val = host.querySelector<HTMLElement>(".fdd-val");
    if (val) val.textContent = value;
    const n = host.querySelector<HTMLElement>(".fdd-n");
    if (n) {
      n.textContent = count ? String(count) : "";
      n.classList.toggle("is-hidden", count === 0);
    }
  }

  /** The "Clear N" affordance — shared by the full render and the patch path. */
  function syncClear() {
    const n = cal.workers.length + cal.statuses.length + (cal.query.trim() ? 1 : 0);
    const clearN = byId("clearN");
    if (clearN) clearN.textContent = String(n);
    byId("calClear")?.classList.toggle("is-hidden", n === 0);
  }
  function renderFilters() {
    const wf = byId("workerFilter");
    if (wf) {
      const wasOpen = wf.classList.contains("open");
      wf.innerHTML = fddHtml({
        id: "worker", icon: "i-users", label: "Worker",
        value: workerSummary(),
        count: cal.workers.length,
        open: wasOpen,
        body: workersData.map(function (w) {
          const on = cal.workers.indexOf(w.id) !== -1;
          return '<button class="fdd-opt' + (on ? " on" : "") + '" type="button" data-w="' + w.id + '" aria-pressed="' + on + '">' +
            '<span class="ckbox"><svg class="ic"><use href="#i-check"/></svg></span>' +
            '<span class="cav">' + initials(w.name) + "</span>" +
            '<span class="fdd-opt-t">' + esc(w.name) + "<em>" + esc(w.role) + "</em></span>" +
            "</button>";
        }).join(""),
      });
      wf.classList.toggle("open", wasOpen);
    }
    // One button per status, each its own toggle. Active buttons take their own
    // status tones (border/fill/text) through `data-f`, the same pure-CSS
    // mechanism the proposals filter chips use.
    const sf = byId("statusFilter");
    if (sf) {
      sf.innerHTML = JOB_STATUSES.map(function (st) {
        const on = cal.statuses.indexOf(st.value) !== -1;
        return '<button class="sfil' + (on ? " on" : "") + '" type="button" data-s="' + st.value +
          '" data-f="' + st.value.toLowerCase() + '" aria-pressed="' + on + '">' + st.label + "</button>";
      }).join("");
    }
    syncClear();
  }
  function closeFdd() {
    $$(".fdd.open").forEach(function (d) {
      d.classList.remove("open");
      d.querySelector(".fdd-btn")?.setAttribute("aria-expanded", "false");
    });
  }

  // ================= RENDER: chips =================
  function chipHtml(e: CalEvent, compact: boolean) {
    return '<button class="evc ' + statusCls(e) + '" type="button" draggable="true" data-ev="' + e.id + '">' +
      '<span class="evc-t"><svg class="ic"><use href="#' + (KIND_IC[e.kind] || "i-cal") + '"/></svg><span class="evc-txt">' + e.title + "</span></span>" +
      (compact ? "" : '<span class="evc-time">' + (e.allDay ? "All day" : fmtTime(e.start)) + " · " + (workerNames(e).join(", ") || "unassigned") + "</span>") +
      "</button>";
  }

  // ================= RENDER: month =================
  /** A month cell shows at most this many chips before it offers "show more". */
  const MG_CAP = 3;
  /** Days expanded past MG_CAP, by `toDateString()`. Reset when the month or the
   *  filters change — an expansion belongs to what is on screen now. */
  const mgOpen: string[] = [];
  const mgKey = (day: Date) => day.toDateString();

  function renderMonth() {
    const mgHead = byId("mgHead");
    if (mgHead) mgHead.innerHTML = DOW.map(function (d) { return "<span>" + d + "</span>"; }).join("");
    const first = new Date(cal.cursor.getFullYear(), cal.cursor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    let html = "";
    for (let w = 0; w < 6; w++) {
      html += '<div class="mg-row">';
      for (let d = 0; d < 7; d++) {
        const day = new Date(gridStart);
        day.setDate(day.getDate() + w * 7 + d);
        const out = day.getMonth() !== cal.cursor.getMonth();
        const evs = eventsOn(day);
        const open = mgOpen.indexOf(mgKey(day)) !== -1;
        const hidden = Math.max(0, evs.length - MG_CAP);
        const shown = open ? evs : evs.slice(0, MG_CAP);
        // The control is a real button so it is reachable by keyboard and cannot
        // be mistaken for the cell's own "click an empty day to create" surface.
        const more = hidden > 0
          ? '<button class="mg-more" type="button" data-more="' + day.toISOString() + '" aria-expanded="' + open + '">' +
            (open ? "Show less" : "Show " + hidden + " more") + "</button>"
          : "";
        html += '<div class="mg-cell' + (out ? " out" : "") + ((w + d) % 2 ? " alt" : "") +
          (sameDay(day, TODAY) ? " today" : "") + (open ? " is-open" : "") +
          '" data-day="' + day.toISOString() + '">' +
          '<div class="mg-day">' + day.getDate() + "</div>" +
          shown.map(function (e) { return chipHtml(e, false); }).join("") +
          more +
          "</div>";
      }
      html += "</div>";
    }
    const mgGrid = byId("mgGrid");
    if (mgGrid) mgGrid.innerHTML = html;
  }

  /** Expand or collapse one day's overflow. Only the month grid is redrawn — a
   *  full `renderCal()` would replay the card's entry animation for what is a
   *  local disclosure. */
  function toggleMonthMore(iso: string) {
    const key = mgKey(new Date(iso));
    const i = mgOpen.indexOf(key);
    if (i === -1) mgOpen.push(key); else mgOpen.splice(i, 1);
    renderMonth();
  }

  // ================= RENDER: week (time grid) =================
  // The week is a real time grid: one column per day, events absolutely
  // positioned and sized by their actual duration, so a 9-hour reroof reads as
  // a 9-hour block. Under the event layer sits a slot per hour — those are the
  // drop targets for drag-and-drop and the surface drag-to-create paints on.
  const WG_MINS = (WG_END - WG_START) * 60;
  const WG_H = (WG_END - WG_START) * WG_ROW;
  /** Minutes → offset in px inside a day column. */
  function yOfMins(mins: number) {
    return ((Math.max(WG_START * 60, Math.min(WG_END * 60, mins)) - WG_START * 60) / WG_MINS) * WG_H;
  }
  /** Offset in px inside a day column → minutes since midnight. */
  function minsOfY(y: number) {
    return WG_START * 60 + (Math.max(0, Math.min(WG_H, y)) / WG_H) * WG_MINS;
  }

  // ---- the week's preview block ----
  // One element serves both gestures: drawing a new span, and showing where a
  // dragged card will land. It survives the pointer release so the span the
  // user drew stays on the grid while the create form is open — it is cleared
  // when the form closes or when a render replaces the grid.
  let wgGhost: HTMLElement | null = null;
  function ghostIn(col: HTMLElement) {
    const layer = col.querySelector<HTMLElement>(".wg-evs");
    if (!layer) return null;
    if (!wgGhost || wgGhost.parentElement !== layer) {
      wgGhost?.remove();
      wgGhost = document.createElement("div");
      wgGhost.className = "wg-ghost";
      layer.appendChild(wgGhost);
    }
    return wgGhost;
  }
  function dropGhost() {
    clearPreview();
    wgGhost?.remove();
    wgGhost = null;
    $$(".wg-col.is-drawing").forEach(function (c) { c.classList.remove("is-drawing"); });
  }
  function paintGhost(day: Date, a: number, b: number, title: string, extra?: string, lane?: { lane: number; lanes: number }) {
    if (!wgGhost) return;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const top = yOfMins(lo), h = Math.max(yOfMins(hi) - top, 8);
    // Same flush-top correction as a real block, so the preview is the size and
    // position the card will actually land at — down to the hairline.
    const g = flushTop(top, h);
    wgGhost.className = "wg-ghost" + (extra ? " " + extra : "") + (h < 46 ? " is-tight" : "");
    wgGhost.style.cssText =
      "top:" + g.top.toFixed(1) + "px;height:" + g.height.toFixed(1) + "px;" +
      laneStyle(lane ? lane.lane : 0, lane ? lane.lanes : 1);
    wgGhost.innerHTML =
      '<span class="wg-ghost-t">' + esc(title) + "</span>" +
      '<span class="wg-ghost-time">' + fmtRange(atMins(day, lo), atMins(day, hi)) + "</span>" +
      '<span class="wg-ghost-dur">' + durLabel((hi - lo) * 60000) + "</span>";
  }

  // ---- live drop preview ----
  // While a card is dragged over the grid, the column is laid out AS IF the card
  // were already there: the blocks it would share an hour with shrink into lanes
  // and the preview takes its own lane, so what you see is the result, not a
  // floating outline. The originals' inline geometry is stashed on the node and
  // written back when the pointer leaves.
  let previewCol: HTMLElement | null = null;
  let previewKey = "";
  function clearPreview() {
    if (!previewCol) return;
    previewCol.querySelectorAll<HTMLElement>(".wg-ev[data-geo]").forEach(function (el) {
      el.style.cssText = el.dataset.geo || "";
      delete el.dataset.geo;
      // The shrink may have crossed the "too short for a time line" threshold.
      el.classList.toggle("is-short", (parseFloat(el.style.height) || 999) < 42);
    });
    previewCol = null;
    previewKey = "";
  }
  function previewDrop(col: HTMLElement, day: Date, startMins: number, durMin: number, title: string, dragId: string | null) {
    const key = col.dataset.day + ":" + startMins + ":" + durMin;
    if (previewCol === col && previewKey === key) return;
    if (previewCol !== col) clearPreview();
    previewCol = col;
    previewKey = key;

    const gStart = atMins(day, startMins).getTime();
    const gEnd = atMins(day, startMins + durMin).getTime();

    // The blocks that are STAYING are laid out on their own, exactly as they are
    // already rendered, and the preview is then slotted into the first lane none
    // of them occupies at that moment.
    //
    // The preview used to be sorted into the day alongside them and the whole
    // column re-laned from scratch. Because `layoutDay` assigns lanes in start
    // order, nudging the dragged card even one snap step earlier than a card it
    // shares a start with flipped their order — and the card the user was NOT
    // touching visibly jumped from the left lane to the right one. Lane indices
    // for existing blocks are now fixed; only the divisor (`lanes`) can change,
    // so they narrow to make room instead of trading places.
    const rest = eventsOn(day).filter(function (e) { return !e.allDay && e.id !== dragId; });
    const placed = layoutDay(rest);

    // `layoutDay` gives every event at least 15 minutes of height, so overlap is
    // tested against the same floor it used.
    const overlapping = placed.filter(function (p) {
      const s = p.e.start.getTime();
      return s < gEnd && Math.max(p.e.end.getTime(), s + 15 * 60000) > gStart;
    });
    const taken = overlapping.map(function (p) { return p.lane; });
    let gLane = 0;
    while (taken.indexOf(gLane) !== -1) gLane += 1;
    const lanes = overlapping.reduce(function (n, p) { return Math.max(n, p.lanes); }, gLane + 1);
    // Only the cluster the preview actually lands in narrows; a block elsewhere
    // in the day keeps its full width.
    overlapping.forEach(function (p) { p.lanes = lanes; });

    if (!ghostIn(col)) return;
    paintGhost(day, startMins, startMins + durMin, title, "is-move", { lane: gLane, lanes: lanes });
    placed.forEach(function (p) {
      const el = col.querySelector<HTMLElement>('.wg-ev[data-ev="' + p.e.id + '"]');
      if (!el) return;
      if (el.dataset.geo === undefined) el.dataset.geo = el.style.cssText;
      el.style.cssText = geoStyle(p);
      el.classList.toggle("is-short", p.height < 42);
    });
  }
  /** Pointer/drag Y → snapped minutes inside a day column. The column's box is
   *  zoomed exactly like the coordinates, so the ratio is zoom-free. */
  function minsAtY(col: HTMLElement, clientY: number) {
    const box = col.getBoundingClientRect();
    return snapMins(minsOfY(((clientY - box.top) / box.height) * WG_H));
  }
  /** Start time a drop should produce: the cursor minus where the block was
   *  grabbed, which is exactly where the browser's drag image is showing it.
   *  Clamped to the window only — not by duration, so a long job still lands
   *  where it was pointed instead of snapping back to fit. */
  function dropStartMins(col: HTMLElement, clientY: number) {
    const raw = minsAtY(col, clientY) - cal.dragGrabMin;
    return snapMins(Math.max(WG_START * 60, Math.min(WG_END * 60, raw)));
  }

  type Placed = { e: CalEvent; top: number; height: number; lane: number; lanes: number };
  /** Side-by-side lanes for overlapping events, computed per overlap cluster so
   *  a single 8-hour job never narrows the rest of the day. */
  function layoutDay(evs: CalEvent[]): Placed[] {
    const out: Placed[] = [];
    let cluster: Placed[] = [];
    let laneEnds: number[] = [];
    let clusterEnd = -1;
    const flush = () => {
      const lanes = laneEnds.length || 1;
      cluster.forEach(function (p) { p.lanes = lanes; });
      out.push(...cluster);
      cluster = []; laneEnds = []; clusterEnd = -1;
    };
    evs.forEach(function (e) {
      const s = e.start.getTime();
      const en = Math.max(e.end.getTime(), s + 15 * 60000);
      if (clusterEnd !== -1 && s >= clusterEnd) flush();
      let lane = laneEnds.findIndex(function (t) { return t <= s; });
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(en); } else { laneEnds[lane] = en; }
      clusterEnd = Math.max(clusterEnd, en);
      const top = yOfMins(minsOf(e.start));
      const endMins = sameDay(e.start, e.end) ? minsOf(e.end) : WG_END * 60;
      cluster.push({ e: e, top: top, height: Math.max(22, yOfMins(endMins) - top), lane: lane, lanes: 1 });
    });
    if (cluster.length) flush();
    return out;
  }

  /** Gap between two blocks sharing an hour. Only BETWEEN them — a single block,
   *  and the outer edges of a split pair, stay flush with the column's grid
   *  lines, so nothing floats inside its cell. */
  const LANE_GAP = 3;
  function laneStyle(lane: number, lanes: number) {
    if (lanes <= 1) return "left:0;width:100%;";
    const inner = (lanes - 1) * LANE_GAP;
    // w = (100% - inner) / n ; left = lane * (w + gap) = lane * (100% + gap) / n
    return "left:calc((100% + " + LANE_GAP + "px) * " + lane + " / " + lanes + ");" +
      "width:calc((100% - " + inner + "px) / " + lanes + ");";
  }

  /** Width of the week grid's hour hairlines. Mirrors the `1.5px` on `.wg-slot`'s
   *  `border-bottom` in calendar.module.css — the two must move together. */
  const GRID_LINE = 1.5;
  /**
   * A block's own 1.5px top border and the hour line it starts on are two
   * SEPARATE hairlines. `.wg-slot` draws its line at the BOTTOM of its box, so a
   * block starting on the hour begins immediately below that line and the pair
   * abuts into one 3px rule. At the other end the block's bottom border lands
   * exactly ON its last slot's line, the two coincide, and the result is 1.5px —
   * hence the reported "thick on top, thin on the bottom".
   *
   * Shifting a flush block up by one line width makes its top border paint over
   * the hour line, so both edges read at the same 1.5px. The height grows to
   * match, which keeps the block's bottom edge exactly where the time says it
   * is. Row 0 is excluded: the line above it belongs to the head (a 2px ink
   * rule) and is the card's boundary already.
   */
  function flushTop(top: number, height: number) {
    const onLine = top > 0.5 && Math.abs(top % WG_ROW) < 0.5;
    return onLine
      ? { top: top - GRID_LINE, height: height + GRID_LINE, onLine: true }
      : { top: top, height: height, onLine: false };
  }
  function geoStyle(p: Placed) {
    const g = flushTop(p.top, p.height);
    return "top:" + g.top.toFixed(1) + "px;height:" + g.height.toFixed(1) + "px;" + laneStyle(p.lane, p.lanes);
  }
  function weekEvHtml(p: Placed) {
    const short = p.height < 42;
    return '<button class="evc wg-ev ' + statusCls(p.e) + (short ? " is-short" : "") +
      (flushTop(p.top, p.height).onLine ? " is-flush-top" : "") + '" type="button" draggable="true"' +
      ' data-ev="' + p.e.id + '"' +
      ' style="' + geoStyle(p) + '">' +
      '<span class="evc-t"><svg class="ic"><use href="#' + (KIND_IC[p.e.kind] || "i-cal") + '"/></svg>' +
      '<span class="evc-txt">' + esc(p.e.title) + "</span></span>" +
      '<span class="wg-ev-time">' + fmtRange(p.e.start, p.e.end) + "</span>" +
      "</button>";
  }

  /** All-day events overlapping `day` — they span dates, so a same-day test on
   *  the start would hide days 2..n of a multi-day block. */
  function allDayOn(day: Date) {
    const d0 = new Date(day); d0.setHours(0, 0, 0, 0);
    const d1 = d0.getTime() + 86400000;
    return visibleEvents().filter(function (e) {
      if (!e.allDay) return false;
      return e.start.getTime() < d1 && e.end.getTime() >= d0.getTime();
    }).sort(function (a, b) { return a.start.getTime() - b.start.getTime(); });
  }

  function renderWeek() {
    const st = startOfWeek(cal.cursor);
    // Row 1 of `#wgHead`: the gutter corner plus seven day names, as DIRECT
    // children of the grid. No wrapper — see the note in calendar-content.tsx.
    let head = '<span class="wg-corner"><svg class="ic"><use href="#i-clock"/></svg></span>';
    for (let d = 0; d < 7; d++) {
      const day = new Date(st); day.setDate(day.getDate() + d);
      head += '<span class="' + (sameDay(day, TODAY) ? "today" : "") + '">' +
        DOW[d] + ' <b>' + day.getDate() + "</b></span>";
    }

    // All-day band — only when the week actually has all-day events, so a week
    // without any keeps the grid flush against the day names.
    const adCols: string[] = [];
    let adAny = false;
    for (let d = 0; d < 7; d++) {
      const day = new Date(st); day.setDate(day.getDate() + d);
      const evs = allDayOn(day);
      if (evs.length) adAny = true;
      adCols.push('<div class="wg-ad-cell" data-day="' + day.toISOString() + '">' +
        evs.map(function (e) {
          return '<button class="evc wg-ad-ev ' + statusCls(e) + '" type="button" draggable="true" data-ev="' + e.id + '">' +
            '<span class="evc-t"><svg class="ic"><use href="#' + (KIND_IC[e.kind] || "i-cal") + '"/></svg>' +
            '<span class="evc-txt">' + esc(e.title) + "</span></span></button>";
        }).join("") + "</div>");
    }
    // Row 2, when the week has any all-day work: the label lands in the gutter
    // track and the seven cells in the day tracks, on the SAME grid as row 1.
    if (adAny) {
      head += '<div class="wg-ad-lbl">All day</div>' + adCols.join("");
    }
    const wgHead = byId("wgHead");
    // The all-day row needs no state class: its cells carry their own top rule
    // and paper fill, so they simply are not there on a week without all-day work.
    if (wgHead) wgHead.innerHTML = head;

    // Hour gutter — full words ("6 AM", not "6a").
    let gutter = '<div class="wg-gutter">';
    for (let h = WG_START; h < WG_END; h++) {
      const hh = h % 12 || 12;
      gutter += '<div class="wg-hour"><span>' + hh + " " + (h >= 12 ? "PM" : "AM") + "</span></div>";
    }
    gutter += "</div>";

    let body = gutter;
    for (let d = 0; d < 7; d++) {
      const day = new Date(st); day.setDate(day.getDate() + d);
      const isToday = sameDay(day, TODAY);
      let slots = "";
      for (let h = WG_START; h < WG_END; h++) {
        slots += '<div class="wg-slot" data-hour="' + h + '"></div>';
      }
      // All-day events live in the band above, never in the time grid.
      const placed = layoutDay(eventsOn(day).filter(function (e) { return !e.allDay; }));
      body += '<div class="wg-col' + (d === 0 || d === 6 ? " wknd" : "") + (isToday ? " today" : "") + '"' +
        ' data-day="' + day.toISOString() + '" data-timecol="1">' +
        slots +
        '<div class="wg-evs">' + placed.map(weekEvHtml).join("") + "</div>" +
        (isToday ? '<div class="wg-now" data-now></div>' : "") +
        "</div>";
    }
    const wgBody = byId("wgBody");
    if (wgBody) wgBody.innerHTML = body;
    // The preview block lived inside the markup just replaced.
    wgGhost = null;
    syncNowLine();
  }

  /** The "now" marker on today's column: a hairline + dot at the wall clock,
   *  hidden when the current time falls outside the 6:00–20:00 window. */
  function syncNowLine() {
    const line = root.querySelector<HTMLElement>("[data-now]");
    if (!line) return;
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const inside = mins >= WG_START * 60 && mins <= WG_END * 60;
    line.classList.toggle("is-hidden", !inside);
    if (inside) {
      line.style.top = yOfMins(mins).toFixed(1) + "px";
      line.dataset.label = fmtTime(now);
    }
  }

  // ================= RENDER: team =================
  function renderTeam() {
    const st = startOfWeek(cal.cursor);
    let head = "<span>Crew</span>";
    for (let d = 0; d < 7; d++) {
      const day = new Date(st); day.setDate(day.getDate() + d);
      head += "<span>" + DOW[d] + " " + day.getDate() + "</span>";
    }
    const tgHead = byId("tgHead");
    if (tgHead) tgHead.innerHTML = head;
    const tgBody = byId("tgBody");
    if (!tgBody) return;
    tgBody.innerHTML = workersData.map(function (w) {
      let row = '<div class="tg-row">' +
        '<div class="tg-who"><span class="cav">' + w.name.split(" ").map(function (p) { return p[0]; }).join("").slice(0, 2) + "</span>" +
        '<span><span class="tg-name" style="display:block">' + w.name + "</span>" +
        '<span class="tg-role" style="display:block">' + w.role + "</span></span></div>";
      for (let d = 0; d < 7; d++) {
        const day = new Date(st); day.setDate(day.getDate() + d);
        const evs = eventsOn(day, w.id);
        const weekend = d === 0 || d === 6;
        row += '<div class="tg-cell' + (weekend && evs.length === 0 ? " off" : "") + ((d + workersData.indexOf(w)) % 2 ? " alt" : "") + '" data-day="' + day.toISOString() + '" data-worker="' + w.id + '">' +
          evs.map(function (e) { return chipHtml(e, true); }).join("") + "</div>";
      }
      return row + "</div>";
    }).join("");
  }

  // ================= RENDER: tray =================
  function renderTray() {
    const trayList = byId("trayList");
    if (!trayList) return;
    trayList.innerHTML = trayJobs.map(function (j) {
      return '<div class="tray-card" draggable="true" data-job="' + j.id + '">' +
        '<div class="tray-t">' + j.title + "</div>" +
        '<div class="tray-c">' + j.client + " · " + j.city + "</div>" +
        '<div class="tray-m">Est. ' + j.duration + " · drag to a day</div>" +
        "</div>";
    }).join("");
  }

  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function renderCal() {
    renderBar(); renderFilters();
    byId("monthCard")?.classList.toggle("is-hidden", cal.view !== "month");
    byId("weekCard")?.classList.toggle("is-hidden", cal.view !== "week");
    byId("teamCard")?.classList.toggle("is-hidden", cal.view !== "team");
    if (cal.view === "month") renderMonth();
    if (cal.view === "week") renderWeek();
    if (cal.view === "team") renderTeam();
    renderTray();
    playViewAnim();
  }
  /** The view the swap animation last played for — so a re-render that changed
   *  neither the view nor the cursor does not replay it. */
  let animatedView = "";
  /** Installed by the motion module below: replays one list's staggered row
   *  entrance. Stays null under `prefers-reduced-motion`. */
  let staggerRows: ((hostId: string) => void) | null = null;
  /**
   * The active card animates in: from the right/left when the cursor moved
   * next/prev, straight up when the view itself changed.
   *
   * NOT on anything else. This used to fire on every single `renderCal()`, so
   * toggling a worker filter, typing in the search box or opening the tray
   * replayed the whole card's entry animation — the grid flashed and slid on
   * every keystroke and every click, which is what made the filters read as
   * broken rather than merely noisy.
   */
  function playViewAnim() {
    const viewChanged = animatedView !== cal.view;
    animatedView = cal.view;
    if (reduced()) { cal.nav = ""; return; }
    if (!cal.nav && !viewChanged) return;
    // The month's rows cascade on the same signal as the card itself, so a real
    // navigation still reads as a page of the calendar turning.
    staggerRows?.("mgGrid");
    const card = byId(cal.view === "month" ? "monthCard" : cal.view === "week" ? "weekCard" : "teamCard");
    if (!card) { cal.nav = ""; return; }
    const cls = cal.nav === "next" ? "swap-next" : cal.nav === "prev" ? "swap-prev" : "swap-in";
    card.classList.remove("swap-next", "swap-prev", "swap-in");
    void card.offsetWidth;
    card.classList.add(cls);
    card.addEventListener("animationend", function ae() {
      card.classList.remove("swap-next", "swap-prev", "swap-in");
      card.removeEventListener("animationend", ae);
    });
    cal.nav = "";
  }

  // ================= PANELS =================
  // `.content` carries z-index 1 in the shell, which makes it a stacking
  // context BELOW the sticky topbar (z-index 30) — so the panel, fixed and at
  // z-index 111, still painted under the topbar. The CSS lifts `.content` while
  // `.sheet.open` exists; locking `.main` here keeps the page from scrolling
  // underneath the lifted layer.
  let scrollLock = "";
  // Navigating away with the panel open never runs closeSheet, and `.main`
  // belongs to the shell — it would stay locked on the next page.
  disposers.push(() => {
    if (main && scrollLock) main.style.overflowY = scrollLock === "auto" ? "" : scrollLock;
    scrollLock = "";
  });
  function openSheet(title: string, html: string) {
    const sheetTitle = byId("sheetTitle");
    if (sheetTitle) sheetTitle.textContent = title;
    const sheetBody = byId("sheetBody");
    if (sheetBody) sheetBody.innerHTML = html;
    byId("sheet")?.classList.add("open");
    byId("sheetBg")?.classList.add("open");
    if (main && !scrollLock) {
      scrollLock = main.style.overflowY || "auto";
      main.style.overflowY = "hidden";
    }
  }
  function closeSheet() {
    byId("sheet")?.classList.remove("open");
    byId("sheetBg")?.classList.remove("open");
    // Nothing was created, so the span the preview was holding is released.
    dropGhost();
    cal.sheet = null; cal.editing = null; cal.form.pop = null;
    if (main && scrollLock) {
      main.style.overflowY = scrollLock === "auto" ? "" : scrollLock;
      scrollLock = "";
    }
  }
  // ---------- sheet form controls ----------
  // Native <input type="date">/<input type="time"> are replaced by two
  // date-time pickers (Start / End), a crew dropdown and a job-or-proposal
  // picker. All three keep their value in `cal.form` and repaint in place.

  /** Whoever owns the shop — an empty crew on a blocked event means "my time". */
  const OWNER = workersData.find(function (w) { return w.role === "Owner"; }) || workersData[workersData.length - 1];

  const DTP_ICON: Record<string, string> = { start: "i-clock", end: "i-hourglass" };
  const DTP_LABEL: Record<string, string> = { start: "Start", end: "End" };

  function dtpValue(id: string) {
    return id === "start" ? cal.form.start : cal.form.end;
  }
  function dtpCursor(id: string) {
    const stored = cal.form.calCursor[id];
    const d = stored ? new Date(stored) : new Date(dtpValue(id));
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  /** All-day events are stated as dates, so the whole clock half of the picker
   *  (trigger time, time column, duration) drops out of the UI. */
  function allDayLabel() {
    const a = cal.form.start, b = cal.form.end;
    return sameDay(a, b) ? "All day · " + fmtDayShort(a) : "All day · " + fmtDayShort(a) + " – " + fmtDayShort(b);
  }

  /** The month grid + time column inside a picker's pop-over. */
  function dtpPopHtml(id: string) {
    const val = dtpValue(id);
    const cur = dtpCursor(id);
    const gridStart = startOfWeek(cur);
    let days = "";
    for (let i = 0; i < 42; i++) {
      const day = new Date(gridStart); day.setDate(day.getDate() + i);
      const out = day.getMonth() !== cur.getMonth();
      const cls = "dtp-day" + (out ? " out" : "") + (sameDay(day, TODAY) ? " today" : "") + (sameDay(day, val) ? " sel" : "");
      days += '<button class="' + cls + '" type="button" data-dtp-day="' + day.toISOString() + '">' + day.getDate() + "</button>";
    }
    let times = "";
    for (let m = 5 * 60; m <= 22 * 60; m += SNAP_MIN) {
      const t = atMins(val, m);
      const on = minsOf(val) === m;
      times += '<button class="dtp-time' + (on ? " sel" : "") + '" type="button" data-dtp-time="' + m + '">' + fmtTime(t) + "</button>";
    }
    // A drag-created 7:15 start is not on the 15-minute list only if SNAP_MIN
    // changes; the list is generated from SNAP_MIN so the value is always there.
    const dur = cal.form.end.getTime() - cal.form.start.getTime();
    const allDay = cal.form.allDay;
    return '<div class="dtp-pop' + (allDay ? " is-dateonly" : "") + '">' +
        '<div class="dtp-cal">' +
          '<div class="dtp-cal-head">' +
            '<button class="dtp-nav" type="button" data-dtp-nav="-1" aria-label="Previous month"><svg class="ic rot-l"><use href="#i-chev"/></svg></button>' +
            "<span>" + fmtMonthYear(cur) + "</span>" +
            '<button class="dtp-nav" type="button" data-dtp-nav="1" aria-label="Next month"><svg class="ic rot-r"><use href="#i-chev"/></svg></button>' +
          "</div>" +
          '<div class="dtp-dow">' + DOW1.map(function (d) { return "<span>" + d + "</span>"; }).join("") + "</div>" +
          '<div class="dtp-grid">' + days + "</div>" +
        "</div>" +
        (allDay ? "" : '<div class="dtp-times" data-dtp-times>' + times + "</div>") +
        '<div class="dtp-foot">' +
          '<span class="dtp-dur">' + (allDay ? allDayLabel() : dur > 0 ? "Duration " + durLabel(dur) : "Ends before it starts") + "</span>" +
          '<button class="dtp-done" type="button" data-dtp-done="1">Done</button>' +
        "</div>" +
      "</div>";
  }
  /** Trigger + pop for one picker; `.sf` wrapper is written once by the form. */
  function dtpInnerHtml(id: string) {
    const val = dtpValue(id);
    return '<button class="dtp-btn" type="button" data-dtp-toggle="' + id + '" aria-expanded="' + (cal.form.pop === id) + '">' +
        '<svg class="ic dtp-ic"><use href="#' + (cal.form.allDay ? "i-cal" : DTP_ICON[id]) + '"/></svg>' +
        '<span class="dtp-date">' + fmtDayShort(val) + "</span>" +
        (cal.form.allDay ? "" :
          '<span class="dtp-dot"></span><span class="dtp-time-val">' + fmtTime(val) + "</span>") +
        '<svg class="ic dtp-chev"><use href="#i-chev"/></svg>' +
      "</button>" +
      dtpPopHtml(id);
  }
  function dtpFieldHtml(id: string) {
    return '<div class="sf"><span class="sf-lbl">' + DTP_LABEL[id] + "</span>" +
      '<div class="dtp' + (cal.form.pop === id ? " open" : "") + '" data-dtp="' + id + '">' + dtpInnerHtml(id) + "</div>" +
      (id === "end" ? '<span class="sf-hint" data-dur-hint>' + durHintHtml() + "</span>" : "") +
      "</div>";
  }
  function durHintHtml() {
    if (cal.form.allDay) {
      const days = Math.round((atMins(cal.form.end, 0).getTime() - atMins(cal.form.start, 0).getTime()) / 86400000) + 1;
      return '<svg class="ic"><use href="#i-cal"/></svg>' + allDayLabel() + (days > 1 ? " · " + days + " days" : "");
    }
    return '<svg class="ic"><use href="#i-clock"/></svg>' +
      durLabel(cal.form.end.getTime() - cal.form.start.getTime()) + " · " + fmtRange(cal.form.start, cal.form.end);
  }

  /** All-day switch — sits between the two pickers' block and the rest. */
  function allDayFieldHtml() {
    const on = cal.form.allDay;
    return '<div class="sf sf-toggle">' +
      '<button class="tgl' + (on ? " on" : "") + '" type="button" data-allday="1" role="switch" aria-checked="' + on + '">' +
        '<span class="tgl-track"><span class="tgl-knob"></span></span>' +
        '<span class="tgl-txt">All-day event<em>' + (on ? "Runs the whole day — no start or end time" : "Set an exact start and end time") + "</em></span>" +
      "</button>" +
    "</div>";
  }
  function paintDtp(id: string) {
    const host = root.querySelector<HTMLElement>('[data-dtp="' + id + '"]');
    if (!host) return;
    host.innerHTML = dtpInnerHtml(id);
    host.classList.toggle("open", cal.form.pop === id);
    if (cal.form.pop === id) scrollTimeIntoView(host);
  }
  function scrollTimeIntoView(host: HTMLElement) {
    const list = host.querySelector<HTMLElement>("[data-dtp-times]");
    const sel = list?.querySelector<HTMLElement>(".dtp-time.sel");
    if (list && sel) list.scrollTop = sel.offsetTop - list.clientHeight / 2 + sel.offsetHeight / 2;
  }
  /** Repaint the End hint and both triggers after a value change. */
  function paintTimes() {
    paintDtp("start");
    paintDtp("end");
    const hint = root.querySelector<HTMLElement>("[data-dur-hint]");
    if (hint) hint.innerHTML = durHintHtml();
  }

  // ---------- crew dropdown ----------
  function crewSummary() {
    if (!cal.form.crew.length) {
      return cal.kind === "blocked" ? "Just me · " + OWNER.name : "Unassigned";
    }
    const names = cal.form.crew.map(function (id) {
      const w = workersData.find(function (x) { return x.id === id; });
      return w ? w.name : id;
    });
    return names.length > 1 ? names[0] + " +" + (names.length - 1) : names[0];
  }
  function crewInnerHtml() {
    const blocked = cal.kind === "blocked";
    return '<button class="pdd-btn" type="button" data-crew-toggle="1" aria-expanded="' + (cal.form.pop === "crew") + '">' +
        '<svg class="ic pdd-ic"><use href="#' + (cal.form.crew.length ? "i-users" : "i-user") + '"/></svg>' +
        '<span class="pdd-val' + (cal.form.crew.length ? "" : " is-empty") + '">' + esc(crewSummary()) + "</span>" +
        (cal.form.crew.length > 1 ? '<span class="pdd-n">' + cal.form.crew.length + "</span>" : "") +
        '<svg class="ic pdd-chev"><use href="#i-chev"/></svg>' +
      "</button>" +
      '<div class="pdd-menu">' +
        workersData.map(function (w) {
          const on = cal.form.crew.indexOf(w.id) !== -1;
          return '<button class="pdd-opt' + (on ? " on" : "") + '" type="button" data-crew="' + w.id + '" aria-pressed="' + on + '">' +
            '<span class="ckbox"><svg class="ic"><use href="#i-check"/></svg></span>' +
            '<span class="cav">' + initials(w.name) + "</span>" +
            '<span class="pdd-opt-t">' + w.name + "<em>" + w.role + "</em></span>" +
            "</button>";
        }).join("") +
        (blocked
          ? '<div class="pdd-note"><svg class="ic"><use href="#i-ban"/></svg><span>Pick a crew member to block <b>their</b> time. Leave it empty and the block is <b>yours</b> (' + OWNER.name + ").</span></div>"
          : "") +
      "</div>";
  }
  function crewFieldHtml() {
    const blocked = cal.kind === "blocked";
    return '<div class="sf" id="crewRow"><span class="sf-lbl">' + (blocked ? "Block for" : "Crew") + "</span>" +
      '<div class="pdd' + (cal.form.pop === "crew" ? " open" : "") + '" data-pdd="crew">' + crewInnerHtml() + "</div>" +
      (blocked ? '<span class="sf-hint"><svg class="ic"><use href="#i-user"/></svg>' + (cal.form.crew.length ? "Blocks the selected crew" : "Blocks your own calendar") + "</span>" : "") +
      "</div>";
  }
  function paintCrew() {
    const host = root.querySelector<HTMLElement>('[data-pdd="crew"]');
    if (!host) return;
    host.innerHTML = crewInnerHtml();
    host.classList.toggle("open", cal.form.pop === "crew");
    const hint = host.parentElement?.querySelector<HTMLElement>(".sf-hint");
    if (hint && cal.kind === "blocked") {
      hint.innerHTML = '<svg class="ic"><use href="#i-user"/></svg>' +
        (cal.form.crew.length ? "Blocks the selected crew" : "Blocks your own calendar");
    }
  }

  // ---------- job / proposal link picker ----------
  function linkOpt(id: string | null) {
    return LINK_OPTIONS.find(function (o) { return o.id === id; }) || null;
  }
  /** Which record types the current event kind may link to. */
  function linkKinds() {
    return LINK_TABS[cal.kind] || LINK_TABS.job;
  }
  function linkRows() {
    const q = cal.form.linkQuery.trim().toLowerCase();
    const allowed = linkKinds();
    const rows = LINK_OPTIONS.filter(function (o) {
      if (allowed.indexOf(o.kind) === -1) return false;
      if (cal.form.linkTab !== "all" && o.kind !== cal.form.linkTab) return false;
      if (!q) return true;
      return (o.title + " " + o.client + " " + o.meta).toLowerCase().indexOf(q) !== -1;
    });
    if (!rows.length) {
      return '<div class="lnk-none">' +
        (q ? "Nothing matches “" + esc(cal.form.linkQuery) + "”" : "Nothing to link yet") + "</div>";
    }
    return rows.map(function (o: LinkOption) {
      const on = cal.form.link === o.id;
      return '<button class="lnk-row' + (on ? " on" : "") + '" type="button" data-link="' + o.id + '">' +
        '<span class="cav cav--' + o.kind + '">' + initials(o.title) + "</span>" +
        '<span class="lnk-row-t">' + esc(o.title) + "<em>" + LINK_LABEL[o.kind] + " · " + esc(o.meta) + "</em></span>" +
        '<span class="pstatus pstatus--' + o.status + '">' + o.status + "</span>" +
        "</button>";
    }).join("");
  }
  function linkInnerHtml() {
    const picked = linkOpt(cal.form.link);
    return '<button class="pdd-btn" type="button" data-lnk-toggle="1" aria-expanded="' + (cal.form.pop === "link") + '">' +
        '<svg class="ic pdd-ic"><use href="#' + (picked ? (picked.kind === "job" ? "i-jobs" : "i-file") : "i-link") + '"/></svg>' +
        '<span class="pdd-val' + (picked ? "" : " is-empty") + '">' +
          (picked ? esc(picked.title) + " — " + esc(picked.client) : "Search or choose a job / proposal…") +
        "</span>" +
        '<svg class="ic pdd-chev"><use href="#i-chev"/></svg>' +
      "</button>" +
      // A sibling, not a child: a button inside a button is invalid markup and
      // the inner one never gets its own accessible name.
      (picked ? '<button class="pdd-x" type="button" data-link-clear="1" aria-label="Clear link">×</button>' : "") +
      '<div class="pdd-menu pdd-menu--wide">' +
        '<label class="lnk-search"><svg class="ic"><use href="#i-search"/></svg>' +
          '<input type="text" id="lnkQ" placeholder="Search ' +
            linkKinds().map(function (k) { return LINK_LABEL[k].toLowerCase() + "s"; }).join(", ") +
          '…" autocomplete="off" value="' + esc(cal.form.linkQuery) + '"></label>' +
        '<div class="lnk-tabs">' +
          (["all"] as string[]).concat(linkKinds()).map(function (t) {
            return '<button class="lnk-tab' + (cal.form.linkTab === t ? " on" : "") + '" type="button" data-lt="' + t + '">' +
              (t === "all" ? "All" : LINK_LABEL[t as "job"]) + "</button>";
          }).join("") +
        "</div>" +
        '<div class="lnk-list">' + linkRows() + "</div>" +
      "</div>";
  }
  function linkFieldHtml() {
    return '<div class="sf" id="linkRow"><span class="sf-lbl">Link</span>' +
      '<div class="pdd' + (cal.form.pop === "link" ? " open" : "") + '" data-pdd="link">' + linkInnerHtml() + "</div>" +
      "</div>";
  }
  function paintLink(keepFocus?: boolean) {
    const host = root.querySelector<HTMLElement>('[data-pdd="link"]');
    if (!host) return;
    host.innerHTML = linkInnerHtml();
    host.classList.toggle("open", cal.form.pop === "link");
    if (keepFocus) {
      const q = host.querySelector<HTMLInputElement>("#lnkQ");
      if (q) { q.focus(); q.selectionStart = q.selectionEnd = q.value.length; }
    }
  }

  // ---------- status dropdown (job events) ----------
  function statusInnerHtml() {
    const cur = JOB_STATUSES.find(function (s) { return s.value === cal.form.status; }) || JOB_STATUSES[0];
    return '<button class="pdd-btn" type="button" data-status-toggle="1" aria-expanded="' + (cal.form.pop === "status") + '">' +
        '<span class="fdd-dot" style="background:' + STATUS_DOT[cur.value] + '"></span>' +
        '<span class="pdd-val">' + cur.label + "</span>" +
        '<svg class="ic pdd-chev"><use href="#i-chev"/></svg>' +
      "</button>" +
      '<div class="pdd-menu">' +
        JOB_STATUSES.map(function (s) {
          return '<button class="pdd-opt' + (s.value === cal.form.status ? " on" : "") + '" type="button" data-status="' + s.value + '">' +
            '<span class="fdd-dot" style="background:' + STATUS_DOT[s.value] + '"></span>' +
            '<span class="pdd-opt-t">' + s.label + "</span></button>";
        }).join("") +
      "</div>";
  }
  function statusFieldHtml() {
    return '<div class="sf" id="statusRow"><span class="sf-lbl">Status</span>' +
      '<div class="pdd' + (cal.form.pop === "status" ? " open" : "") + '" data-pdd="status">' + statusInnerHtml() + "</div></div>";
  }
  function paintStatus() {
    const host = root.querySelector<HTMLElement>('[data-pdd="status"]');
    if (!host) return;
    host.innerHTML = statusInnerHtml();
    host.classList.toggle("open", cal.form.pop === "status");
  }

  /** One pop-over at a time, inside the sheet as well as in the filter bar. */
  function setPop(id: string | null) {
    const prev = cal.form.pop;
    cal.form.pop = prev === id ? null : id;
    const repaint = function (p: string | null) {
      if (p === "start" || p === "end") paintDtp(p);
      else if (p === "crew") paintCrew();
      else if (p === "link") paintLink(p === cal.form.pop);
      else if (p === "status") paintStatus();
    };
    if (prev && prev !== cal.form.pop) repaint(prev);
    repaint(cal.form.pop);
  }
  function closePops() {
    if (cal.form.pop) setPop(cal.form.pop);
  }
  const KIND_TITLE: Record<string, string> = { job: "Job event", appointment: "Appointment", blocked: "Blocked time" };

  function openDetail(id: string) {
    const e = eventsData.find(function (x) { return x.id === id; });
    if (!e) return;
    cal.sheet = "detail"; cal.editing = id; cal.kind = e.kind;
    cal.form.start = new Date(e.start);
    cal.form.end = new Date(e.end);
    cal.form.crew = e.workers.slice();
    cal.form.status = e.status;
    cal.form.link = null;
    cal.form.pop = null;
    cal.form.calCursor = {};
    cal.form.allDay = !!e.allDay;
    cal.form.linkTab = "all";
    cal.form.linkQuery = "";
    const names = workerNames(e);
    const crewLine = e.kind === "blocked" && e.selfOnly
      ? "Just me · " + OWNER.name
      : names.join(", ") || "Unassigned";
    openSheet(KIND_TITLE[e.kind] || "Job event",
      '<div class="sf-meta">' +
        '<div class="sf-meta-row"><span class="kpi-lbl">When</span><span>' +
          (e.allDay
            ? fmtDate(e.start) + (sameDay(e.start, e.end) ? "" : " – " + fmtDate(e.end))
            : fmtDate(e.start) + " · " + fmtRange(e.start, e.end)) + "</span></div>" +
        '<div class="sf-meta-row"><span class="kpi-lbl">Duration</span><span>' +
          (e.allDay
            ? "All day" + (sameDay(e.start, e.end) ? "" : " · " + (Math.round((atMins(e.end, 0).getTime() - atMins(e.start, 0).getTime()) / 86400000) + 1) + " days")
            : durLabel(e.end.getTime() - e.start.getTime())) + "</span></div>" +
        (e.client ? '<div class="sf-meta-row"><span class="kpi-lbl">Client</span><span>' + esc(e.client) + "</span></div>" : "") +
        (e.phone ? '<div class="sf-meta-row"><span class="kpi-lbl">Phone</span><span>' + esc(e.phone) + "</span></div>" : "") +
        (e.addr ? '<div class="sf-meta-row"><span class="kpi-lbl">Address</span><span>' + esc(e.addr) + "</span></div>" : "") +
        '<div class="sf-meta-row"><span class="kpi-lbl">Crew</span><span>' + esc(crewLine) + "</span></div>" +
        (e.scope ? '<div class="sf-meta-row"><span class="kpi-lbl">Scope</span><span>' + esc(e.scope) + "</span></div>" : "") +
      "</div>" +
      '<label class="sf"><span class="sf-lbl">Title</span><input class="sf-in" data-e="title" value="' + esc(e.title) + '"></label>' +
      allDayFieldHtml() +
      dtpFieldHtml("start") +
      dtpFieldHtml("end") +
      (e.kind === "job" ? statusFieldHtml() : "") +
      crewFieldHtml() +
      '<label class="sf"><span class="sf-lbl">Notes</span><textarea class="sf-area" data-e="notes" placeholder="Anything the crew should know">' + esc(e.notes || "") + "</textarea></label>" +
      '<div class="sf-act">' +
        '<button class="btn btn-primary btn--sm" type="button" data-act="save-event"><svg class="ic"><use href="#i-check"/></svg>Save changes</button>' +
        '<button class="btn btn-ghost btn--sm" type="button" data-act="delete-event"><svg class="ic"><use href="#i-trash"/></svg>Delete</button>' +
      "</div>");
  }

  /** The create form. `start`/`end` come from the drag-to-create preview when
   *  there is one, otherwise from the clicked cell (2h default). */
  function openQuickAdd(start: Date | null, end: Date | null, allDay?: boolean) {
    cal.sheet = "add"; cal.kind = "job"; cal.editing = null;
    const s = start ? new Date(start) : atMins(TODAY, 8 * 60);
    cal.form.start = s;
    cal.form.end = end ? new Date(end) : addMin(s, 120);
    cal.form.crew = [];
    cal.form.link = null;
    cal.form.status = "SCHEDULED";
    cal.form.pop = null;
    cal.form.calCursor = {};
    cal.form.linkTab = "all";
    cal.form.linkQuery = "";
    cal.form.allDay = !!allDay;
    openSheet("New event", quickAddHtml());
    root.querySelector<HTMLInputElement>('[data-e="title"]')?.focus();
  }
  /** Rebuilt whole when the kind tab changes — Blocked drops the link field and
   *  relabels the crew picker, so the field set is not the same form. */
  function quickAddHtml() {
    const blocked = cal.kind === "blocked";
    const ph: Record<string, string> = {
      job: "Roof tear-off — 4812 Maple Ave",
      appointment: "Estimate visit — S. Rao",
      blocked: "Shop maintenance",
    };
    return '<div class="sf-kinds" id="kindTabs">' +
        (["job", "appointment", "blocked"] as const).map(function (k) {
          return '<button class="sf-kind' + (cal.kind === k ? " on" : "") + '" type="button" data-kind="' + k + '">' +
            '<svg class="ic"><use href="#' + KIND_IC[k] + '"/></svg>' +
            (k === "job" ? "Job event" : k === "appointment" ? "Appointment" : "Blocked") + "</button>";
        }).join("") +
      "</div>" +
      '<label class="sf"><span class="sf-lbl">Title</span><input class="sf-in" data-e="title" placeholder="' + ph[cal.kind] + '" value="' + esc(currentTitle()) + '"></label>' +
      allDayFieldHtml() +
      dtpFieldHtml("start") +
      dtpFieldHtml("end") +
      (blocked ? "" : linkFieldHtml()) +
      crewFieldHtml() +
      '<label class="sf"><span class="sf-lbl">Notes</span><textarea class="sf-area" data-e="notes" placeholder="Anything the crew should know">' + esc(currentNotes()) + "</textarea></label>" +
      '<div class="sf-act">' +
        '<button class="btn btn-primary btn--sm" type="button" data-act="create-event"><svg class="ic"><use href="#i-check"/></svg>' +
          (blocked ? "Block time" : "Create event") + "</button>" +
        '<button class="btn btn-ghost btn--sm" type="button" data-sheet="close">Cancel</button>' +
      "</div>";
  }
  /** Typed text survives a kind switch. */
  function currentTitle() {
    return root.querySelector<HTMLInputElement>('[data-e="title"]')?.value || "";
  }
  function currentNotes() {
    return root.querySelector<HTMLTextAreaElement>('[data-e="notes"]')?.value || "";
  }
  function openInbox() {
    cal.sheet = "inbox";
    openSheet("Crew confirmations · " + inboxData.length + " pending",
      inboxData.length ? inboxData.map(function (r) {
        return '<div class="inbox-row" data-inbox="' + r.id + '">' +
          '<div class="inbox-t">' + r.title + "</div>" +
          '<div class="inbox-s">' + r.worker + " · " + r.when + "</div>" +
          '<div class="inbox-act"><span class="pstatus pstatus--pending">pending</span>' +
          '<button class="btn btn-primary btn--sm" type="button" data-act="confirm"><svg class="ic"><use href="#i-check"/></svg>Mark accepted</button></div>' +
          "</div>";
      }).join("") : '<div class="pempty"><b>Everyone has confirmed</b><br>All crew assignments have been accepted.</div>');
  }
  function readCrew() {
    return cal.form.crew.slice();
  }
  /** The span the form should store: whole days when all-day is on, otherwise
   *  the picked times with a 2h fallback if the end never got past the start. */
  function formSpan() {
    if (cal.form.allDay) {
      const s = atMins(cal.form.start, 0);
      const e = atMins(cal.form.end.getTime() < s.getTime() ? s : cal.form.end, 23 * 60 + 59);
      return { start: s, end: e };
    }
    const s = new Date(cal.form.start);
    return { start: s, end: cal.form.end.getTime() > s.getTime() ? new Date(cal.form.end) : addMin(s, 120) };
  }

  // ================= EVENTS =================
  byId("calPrev")?.addEventListener("click", function () {
    const c = new Date(cal.cursor);
    if (cal.view === "month") c.setMonth(c.getMonth() - 1); else c.setDate(c.getDate() - 7);
    cal.cursor = c; cal.nav = "prev"; renderCal();
  });
  byId("calNext")?.addEventListener("click", function () {
    const c = new Date(cal.cursor);
    if (cal.view === "month") c.setMonth(c.getMonth() + 1); else c.setDate(c.getDate() + 7);
    cal.cursor = c; cal.nav = "next"; renderCal();
  });
  byId("calToday")?.addEventListener("click", function () { cal.cursor = new Date(TODAY); renderCal(); });
  byId("calViews")?.addEventListener("click", function (e) {
    const b = asEl(e.target)?.closest<HTMLElement>(".vsw-btn");
    if (!b) return;
    cal.view = (b.dataset.view || "month") as "month" | "week" | "team";
    $$("#calViews .vsw-btn").forEach(function (x) { x.classList.toggle("active", x === b); });
    renderCal();
  });
  byId("trayBtn")?.addEventListener("click", function () { cal.trayOpen = !cal.trayOpen; renderCal(); });
  byId("inboxBtn")?.addEventListener("click", openInbox);
  byId("newEventBtn")?.addEventListener("click", function () { openQuickAdd(null, null); });
  const calSearch = root.querySelector<HTMLInputElement>("#calSearch");
  if (calSearch) {
    // Grid + Clear only. A full `renderCal()` per keystroke rebuilt the entire
    // filter row — including the worker menu — while the user was typing.
    calSearch.addEventListener("input", function () {
      cal.query = calSearch.value;
      syncClear();
      renderGrid();
    });
  }
  byId("calClear")?.addEventListener("click", function () {
    cal.workers = []; cal.statuses = []; cal.query = "";
    if (calSearch) calSearch.value = "";
    closeFdd();
    // Everything is being reset, so the filter chrome does need a full redraw.
    renderFilters();
    renderGrid();
  });

  // ---------- filter dropdowns ----------
  /** Redraw the calendar body for the current filters, and nothing else. Used by
   *  every filter path: a full `renderCal()` would rebuild the filter chrome
   *  itself — including any menu the pointer is still inside. */
  function renderGrid() {
    if (cal.view === "month") renderMonth();
    if (cal.view === "week") renderWeek();
    if (cal.view === "team") renderTeam();
  }

  /** Redraw only what a filter change actually affects: the toggled rows, the
   *  trigger summary, the "Clear N" chip and the grid. */
  function repaintAfterFilter(hostId: string, key: "workers" | "statuses", attr: "w" | "s") {
    const host = byId(hostId);
    if (host) {
      host.querySelectorAll<HTMLElement>("[data-" + attr + "]").forEach(function (b) {
        const on = cal[key].indexOf(b.dataset[attr] as string) !== -1;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
      });
      // Statuses are bare chips with no trigger to summarise; the selectors
      // inside simply find nothing.
      if (host.classList.contains("fdd")) {
        paintFddTrigger(hostId, workerSummary(), cal[key].length);
      }
    }
    syncClear();
    renderGrid();
  }

  function bindFilter(hostId: string, key: "workers" | "statuses", attr: "w" | "s") {
    byId(hostId)?.addEventListener("click", function (e) {
      const t = asEl(e.target);
      if (!t) return;
      const trigger = t.closest<HTMLElement>("[data-fdd]");
      if (trigger) {
        const host = byId(hostId);
        const willOpen = !host?.classList.contains("open");
        closeFdd(); closePops();
        host?.classList.toggle("open", willOpen);
        trigger.setAttribute("aria-expanded", String(willOpen));
        return;
      }
      if (t.closest("[data-fdd-reset]")) {
        cal[key] = [];
        repaintAfterFilter(hostId, key, attr);
        return;
      }
      const opt = t.closest<HTMLElement>("[data-" + attr + "]");
      const v = opt?.dataset[attr];
      if (!v) return;
      const i = cal[key].indexOf(v);
      if (i === -1) cal[key].push(v); else cal[key].splice(i, 1);
      repaintAfterFilter(hostId, key, attr);
    });
  }
  bindFilter("workerFilter", "workers", "w");
  // Statuses are plain toggles, no menu to open or close.
  byId("statusFilter")?.addEventListener("click", function (e) {
    const b = asEl(e.target)?.closest<HTMLElement>("[data-s]");
    if (!b || !b.dataset.s) return;
    closeFdd();
    const i = cal.statuses.indexOf(b.dataset.s);
    if (i === -1) cal.statuses.push(b.dataset.s); else cal.statuses.splice(i, 1);
    repaintAfterFilter("statusFilter", "statuses", "s");
  });

  // calendar clicks: chip → details, empty cell → quick create.
  // Week cells are handled by the drag-to-create pointer flow below, which
  // opens the form on release — so they are skipped here to avoid two opens.
  byId("calWrap")?.addEventListener("click", function (e) {
    const t = asEl(e.target);
    if (!t) return;
    // Before the chip and empty-cell branches: the disclosure sits INSIDE a
    // `[data-day]` cell, so either of them would otherwise swallow it and open
    // the create form instead of expanding the day.
    const more = t.closest<HTMLElement>("[data-more]");
    if (more) { toggleMonthMore(more.dataset.more as string); return; }
    const chip = t.closest<HTMLElement>(".evc");
    if (chip) { if (chip.dataset.ev) openDetail(chip.dataset.ev); return; }
    if (t.closest(".wg-body")) return;
    const cell = t.closest<HTMLElement>("[data-day]");
    if (cell && !t.closest(".tray")) {
      const day = new Date(cell.dataset.day as string);
      // Clicking the all-day band asks for an all-day event, so the form opens
      // with the switch already on.
      if (cell.closest(".wg-ad-cell")) {
        openQuickAdd(atMins(day, 0), atMins(day, 0), true);
        return;
      }
      const start = atMins(day, (cell.dataset.hour ? Number(cell.dataset.hour) : 8) * 60);
      openQuickAdd(start, addMin(start, 120));
    }
  });

  // ---------- week: drag a span to create ----------
  // Press on empty grid, drag, release: a live preview block grows with the
  // pointer and prints the range it covers; the release opens the create form
  // pre-filled with exactly that span. A press without movement stays a click
  // and opens the 2-hour default.
  const wgBody = byId("wgBody");
  if (wgBody) {
    let col: HTMLElement | null = null;
    let anchor = 0;      // minutes since midnight where the press landed
    let day: Date | null = null;
    let moved = false;
    let pid = -1;
    const endDraw = () => { col = null; day = null; moved = false; };

    on(wgBody, "pointerdown", function (ev) {
      const pe = ev as PointerEvent;
      if (pe.button !== 0) return;
      const t = asEl(pe.target);
      if (!t || t.closest(".wg-ev")) return;      // chips keep their own drag
      const c = t.closest<HTMLElement>(".wg-col");
      if (!c) return;
      closeFdd();
      // A pending preview from the previous gesture (form cancelled by clicking
      // straight onto the grid) is replaced, not stacked.
      dropGhost();
      if (!ghostIn(c)) { endDraw(); return; }
      col = c;
      day = new Date(c.dataset.day as string);
      anchor = minsAtY(c, pe.clientY);
      moved = false;
      c.classList.add("is-drawing");
      paintGhost(day, anchor, anchor + 60, "New " + (cal.kind === "blocked" ? "block" : "event"));
      // Suppresses the text selection a drag across the grid would otherwise
      // paint. Safe for the compat mouse events it also cancels: chips returned
      // above, and the week's create runs off pointerup.
      pe.preventDefault();
      pid = pe.pointerId;
      try { wgBody.setPointerCapture(pid); } catch { /* capture is best-effort */ }
    });
    on(wgBody, "pointermove", function (ev) {
      const pe = ev as PointerEvent;
      if (!col || !day) return;
      const cur = minsAtY(col, pe.clientY);
      if (Math.abs(cur - anchor) >= SNAP_MIN) moved = true;
      paintGhost(day, anchor, moved ? cur : anchor + 60, "New " + (cal.kind === "blocked" ? "block" : "event"));
    });
    const finish = (pe: PointerEvent) => {
      if (!col || !day) return;
      const raw = minsAtY(col, pe.clientY);
      const d = day;
      const a = Math.min(anchor, raw);
      const b = moved ? Math.max(Math.max(anchor, raw), a + 30) : anchor + 120;
      try { wgBody.releasePointerCapture(pid); } catch { /* already released */ }
      col.classList.remove("is-drawing");
      endDraw();
      // The preview STAYS: it is the span the form is about to create, so it
      // holds its place on the grid until the event exists or the form closes.
      paintGhost(d, a, b, "New " + (cal.kind === "blocked" ? "block" : "event"), "is-pending");
      openQuickAdd(atMins(d, a), atMins(d, b));
    };
    on(wgBody, "pointerup", function (ev) { finish(ev as PointerEvent); });
    on(wgBody, "pointercancel", function () {
      col?.classList.remove("is-drawing");
      endDraw();
      dropGhost();
    });
    on(document, "keydown", function (ev) {
      if ((ev as KeyboardEvent).key !== "Escape") return;
      col?.classList.remove("is-drawing");
      endDraw();
      closeFdd();
      if (cal.form.pop) { closePops(); return; }
      if (cal.sheet) { closeSheet(); return; }
      dropGhost();
    });
  }

  // dragging: event chips and tray cards.
  // `landed` names the chip that just moved — after the re-render it gets a
  // short landing flash so the eye can follow it (the donor's kanban idea).
  let landed: string | null = null;

  on(document, "dragstart", function (e) {
    const t = asEl(e.target);
    if (!t) return;
    const chip = t.closest<HTMLElement>(".evc");
    if (chip) {
      cal.dragEvent = chip.dataset.ev || null; cal.dragJob = null;
      chip.classList.add("dragging");
      // Where inside the block the grab landed, in minutes. The browser's drag
      // image keeps that offset, so the drop must keep it too — otherwise the
      // block lands with its top at the cursor and the two previews disagree.
      cal.dragGrabMin = 0;
      const col = chip.closest<HTMLElement>(".wg-col");
      const ev = eventsData.find(function (x) { return x.id === cal.dragEvent; });
      if (col && ev && !ev.allDay) {
        const box = chip.getBoundingClientRect();
        const dy = (e as DragEvent).clientY - box.top;
        cal.dragGrabMin = Math.round((dy / Math.max(1, box.height)) *
          Math.max(SNAP_MIN, (ev.end.getTime() - ev.start.getTime()) / 60000));
      }
      return;
    }
    const card = t.closest<HTMLElement>(".tray-card");
    if (card) {
      cal.dragJob = card.dataset.job || null; cal.dragEvent = null;
      // A tray card has no start time to offset from — and a stale offset from a
      // previous chip drag would shift the drop.
      cal.dragGrabMin = 0;
      card.classList.add("dragging");
    }
  });
  on(document, "dragend", function () {
    $$(".dragging").forEach(function (x) { x.classList.remove("dragging"); });
    $$(".dragover").forEach(function (x) { x.classList.remove("dragover"); });
    dropGhost();
    cal.dragEvent = null; cal.dragJob = null; cal.dragGrabMin = 0;
  });
  on(document, "dragover", function (e) {
    const cell = asEl(e.target)?.closest<HTMLElement>("[data-day]");
    if (!cell || (!cal.dragEvent && !cal.dragJob)) return;
    e.preventDefault();
    $$(".dragover").forEach(function (x) { if (x !== cell) x.classList.remove("dragover"); });
    cell.classList.add("dragover");
    // In the week grid, lay the column out as if the card were already dropped.
    if (!cell.dataset.timecol) { dropGhost(); return; }
    const ev = cal.dragEvent ? eventsData.find(function (x) { return x.id === cal.dragEvent; }) : null;
    if (ev && ev.allDay) { dropGhost(); return; }
    const durMin = ev
      ? Math.max(SNAP_MIN, Math.round((ev.end.getTime() - ev.start.getTime()) / 60000))
      : 240;
    const job = cal.dragJob ? trayJobs.find(function (x) { return x.id === cal.dragJob; }) : null;
    const label = ev ? ev.title : job ? job.title : "Move here";
    previewDrop(cell, new Date(cell.dataset.day as string), dropStartMins(cell, (e as DragEvent).clientY),
      durMin, label, cal.dragEvent);
  });
  on(document, "dragleave", function (e) {
    // Leaving the grid entirely (not just crossing between its columns).
    const to = asEl((e as DragEvent).relatedTarget);
    if (!to || !to.closest(".wg-body")) dropGhost();
  });
  on(document, "drop", function (e) {
    const cell = asEl(e.target)?.closest<HTMLElement>("[data-day]");
    if (!cell) return;
    e.preventDefault();
    const day = new Date(cell.dataset.day as string);
    // Week columns are one continuous time axis, so the drop time comes from
    // where the pointer landed inside the column, snapped like drag-to-create.
    let hour = cell.dataset.hour ? Number(cell.dataset.hour) : null;
    let dropMins: number | null = null;
    if (cell.dataset.timecol) {
      // Same formula the preview used, so the block lands exactly where it was
      // shown — grab offset included.
      dropMins = dropStartMins(cell, (e as DragEvent).clientY);
      hour = Math.floor(dropMins / 60);
    }
    if (cal.dragEvent) {
      const ev = eventsData.find(function (x) { return x.id === cal.dragEvent; });
      if (ev) {
        // Crossing between the all-day band and the time grid changes what the
        // event IS, so the flag follows the surface it was dropped on.
        const intoBand = !!cell.closest(".wg-ad-cell");
        if (intoBand && !ev.allDay) {
          ev.allDay = true;
          ev.start = atMins(day, 0);
          ev.end = atMins(day, 23 * 60 + 59);
          landed = ev.id;
          cal.dragEvent = null; cal.dragJob = null;
          renderCal(); flashEvent();
          return;
        }
        if (cell.dataset.timecol && ev.allDay) {
          ev.allDay = undefined;
          const ns0 = atMins(day, dropMins != null ? dropMins : 8 * 60);
          ev.start = ns0; ev.end = addMin(ns0, 120);
          landed = ev.id;
          cal.dragEvent = null; cal.dragJob = null;
          renderCal(); flashEvent();
          return;
        }
        const dur = ev.end.getTime() - ev.start.getTime();
        const ns = dropMins != null
          ? atMins(day, dropMins)
          : (function () {
              const x = new Date(day);
              x.setHours(hour != null ? hour : ev.start.getHours(), hour != null ? 0 : ev.start.getMinutes(), 0, 0);
              return x;
            })();
        ev.start = ns; ev.end = new Date(ns.getTime() + dur);
        if (cell.dataset.worker && ev.workers.indexOf(cell.dataset.worker) === -1) ev.workers = [cell.dataset.worker];
        landed = ev.id;
      }
    } else if (cal.dragJob) {
      const j = trayJobs.find(function (x) { return x.id === cal.dragJob; });
      if (j) {
        const ns = dropMins != null ? atMins(day, dropMins) : (function () {
          const x = new Date(day);
          x.setHours(hour != null ? hour : 8, 0, 0, 0);
          return x;
        })();
        evSeq += 1;
        eventsData.push({
          id: "e" + evSeq, kind: "job", title: j.title + " — " + j.client,
          start: ns, end: new Date(ns.getTime() + 4 * 3600 * 1000),
          status: "SCHEDULED", workers: cell.dataset.worker ? [cell.dataset.worker] : [],
          client: j.client, addr: j.city,
        });
        landed = "e" + evSeq;
        trayJobs = trayJobs.filter(function (x) { return x.id !== j.id; });
      }
    }
    cal.dragEvent = null; cal.dragJob = null;
    renderCal();
    flashEvent();
  });

  function flashEvent() {
    const id = landed;
    landed = null;
    if (!id || reduced()) return;
    const chip = root.querySelector<HTMLElement>('.evc[data-ev="' + id + '"]');
    if (!chip) return;
    chip.classList.add("ev-land");
    chip.addEventListener("animationend", function ae() {
      chip.classList.remove("ev-land");
      chip.removeEventListener("animationend", ae);
    });
  }

  // panel: pickers, kind tabs, save, delete, create
  byId("sheet")?.addEventListener("click", function (e) {
    const t = asEl(e.target);
    if (!t) return;

    // ---- date-time pickers ----
    const dtpToggle = t.closest<HTMLElement>("[data-dtp-toggle]");
    if (dtpToggle) { setPop(dtpToggle.dataset.dtpToggle || null); return; }
    const host = t.closest<HTMLElement>("[data-dtp]");
    if (host) {
      const id = host.dataset.dtp as string;
      const nav = t.closest<HTMLElement>("[data-dtp-nav]");
      if (nav) {
        const cur = dtpCursor(id);
        cur.setMonth(cur.getMonth() + Number(nav.dataset.dtpNav));
        cal.form.calCursor[id] = cur.toISOString();
        paintDtp(id);
        return;
      }
      const dayBtn = t.closest<HTMLElement>("[data-dtp-day]");
      if (dayBtn) {
        const picked = new Date(dayBtn.dataset.dtpDay as string);
        setDatePart(id, picked);
        return;
      }
      const timeBtn = t.closest<HTMLElement>("[data-dtp-time]");
      if (timeBtn) {
        setTimePart(id, Number(timeBtn.dataset.dtpTime));
        return;
      }
      if (t.closest("[data-dtp-done]")) { setPop(null); paintDtp(id); return; }
      return;
    }

    // ---- crew ----
    if (t.closest("[data-crew-toggle]")) { setPop("crew"); return; }
    const crew = t.closest<HTMLElement>("[data-crew]");
    if (crew && crew.dataset.crew) {
      const i = cal.form.crew.indexOf(crew.dataset.crew);
      if (i === -1) cal.form.crew.push(crew.dataset.crew); else cal.form.crew.splice(i, 1);
      paintCrew();
      return;
    }

    // ---- all-day switch ----
    if (t.closest("[data-allday]")) {
      cal.form.allDay = !cal.form.allDay;
      if (cal.form.allDay) {
        // Normalise to whole days so the stored value matches what is shown.
        cal.form.start = atMins(cal.form.start, 0);
        if (cal.form.end.getTime() < cal.form.start.getTime()) cal.form.end = new Date(cal.form.start);
      } else if (minsOf(cal.form.start) === 0 && minsOf(cal.form.end) === 0) {
        // Coming back to a timed event, offer a sensible working slot.
        cal.form.start = atMins(cal.form.start, 8 * 60);
        cal.form.end = addMin(cal.form.start, 120);
      }
      cal.form.pop = null;
      repaintForm();
      return;
    }

    // ---- link ----
    if (t.closest("[data-link-clear]")) { cal.form.link = null; paintLink(); return; }
    if (t.closest("[data-lnk-toggle]")) { setPop("link"); return; }
    const tab = t.closest<HTMLElement>("[data-lt]");
    if (tab) {
      cal.form.linkTab = tab.dataset.lt || "all";
      paintLink(true);
      return;
    }
    const row = t.closest<HTMLElement>("[data-link]");
    if (row) {
      cal.form.link = cal.form.link === row.dataset.link ? null : (row.dataset.link as string);
      cal.form.pop = null;
      paintLink();
      // Borrow the linked record's name when the title is still empty.
      const titleEl = root.querySelector<HTMLInputElement>('[data-e="title"]');
      const opt = linkOpt(cal.form.link);
      if (titleEl && !titleEl.value.trim() && opt) titleEl.value = opt.title + " — " + opt.client;
      return;
    }

    // ---- status ----
    if (t.closest("[data-status-toggle]")) { setPop("status"); return; }
    const stOpt = t.closest<HTMLElement>("[data-status]");
    if (stOpt && stOpt.dataset.status) {
      cal.form.status = stOpt.dataset.status;
      cal.form.pop = null;
      paintStatus();
      return;
    }

    // ---- kind tabs ----
    const kind = t.closest<HTMLElement>("[data-kind]");
    if (kind) {
      const next = (kind.dataset.kind || "job") as CalKind;
      if (next === cal.kind) return;
      cal.kind = next;
      cal.form.pop = null;
      // The tab set differs per kind (an appointment links to leads/clients),
      // so a carried-over tab could name a type this kind cannot link to.
      cal.form.linkTab = "all";
      cal.form.linkQuery = "";
      cal.form.link = null;
      const body = byId("sheetBody");
      if (body) body.innerHTML = quickAddHtml();
      return;
    }

    const act = t.closest<HTMLElement>("[data-act]");
    if (!act) return;
    const val = function (f: string) {
      const field = root.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-e="' + f + '"]');
      return field ? field.value : "";
    };

    if (act.dataset.act === "save-event") {
      const ev = eventsData.find(function (x) { return x.id === cal.editing; });
      if (ev) {
        const span = formSpan();
        ev.title = val("title") || ev.title;
        ev.allDay = cal.form.allDay || undefined;
        ev.start = span.start;
        ev.end = span.end;
        if (ev.kind === "job") ev.status = cal.form.status || ev.status;
        ev.notes = val("notes");
        ev.workers = readCrew();
        if (ev.kind === "blocked") {
          ev.selfOnly = ev.workers.length === 0;
          if (ev.selfOnly) ev.workers = [OWNER.id];
        }
        landed = ev.id;
      }
      closeSheet(); renderCal(); flashEvent(); return;
    }
    if (act.dataset.act === "delete-event") {
      const i = eventsData.findIndex(function (x) { return x.id === cal.editing; });
      if (i > -1) eventsData.splice(i, 1);
      closeSheet(); renderCal(); return;
    }
    if (act.dataset.act === "create-event") {
      const title = val("title").trim();
      if (!title) { root.querySelector<HTMLInputElement>('[data-e="title"]')?.focus(); return; }
      const span = formSpan();
      const st = span.start;
      const en = span.end;
      const crewIds = readCrew();
      // Blocked time with nobody picked is MY time — it lands on the owner's
      // row and reads as "Just me" everywhere it is shown.
      const selfOnly = cal.kind === "blocked" && crewIds.length === 0;
      const opt = linkOpt(cal.form.link);
      evSeq += 1;
      eventsData.push({
        id: "e" + evSeq, kind: cal.kind, title: title, start: st, end: en,
        status: cal.kind === "job" ? cal.form.status : "SCHEDULED",
        workers: selfOnly ? [OWNER.id] : crewIds,
        notes: val("notes"),
        client: opt ? opt.client : undefined,
        selfOnly: selfOnly || undefined,
        allDay: cal.form.allDay || undefined,
      });
      landed = "e" + evSeq;
      if (opt && opt.kind === "job") trayJobs = trayJobs.filter(function (x) { return x.id !== opt.id; });
      closeSheet(); renderCal(); flashEvent(); return;
    }
    if (act.dataset.act === "confirm") {
      const row2 = act.closest<HTMLElement>("[data-inbox]");
      if (row2) inboxData = inboxData.filter(function (x) { return x.id !== row2.dataset.inbox; });
      renderBar(); openInbox(); return;
    }
  });

  /** After the all-day switch flips: update the switch in place (so its knob
   *  slides instead of the node being replaced and re-running the field
   *  cascade) and repaint both pickers. */
  function repaintForm() {
    const btn = root.querySelector<HTMLElement>("[data-allday]");
    if (btn) {
      btn.classList.toggle("on", cal.form.allDay);
      btn.setAttribute("aria-checked", String(cal.form.allDay));
      const em = btn.querySelector("em");
      if (em) {
        em.textContent = cal.form.allDay
          ? "Runs the whole day — no start or end time"
          : "Set an exact start and end time";
      }
    }
    paintTimes();
  }

  /** Move the date, keep the clock time; the end follows to keep the duration. */
  function setDatePart(id: string, picked: Date) {
    const cur = dtpValue(id);
    const next = atMins(picked, minsOf(cur));
    applyValue(id, next);
  }
  function setTimePart(id: string, mins: number) {
    applyValue(id, atMins(dtpValue(id), mins));
  }
  function applyValue(id: string, next: Date) {
    if (cal.form.allDay) {
      // Whole days: the start carries the span along, the end never precedes it.
      const day = atMins(next, 0);
      if (id === "start") {
        const span = Math.max(0, Math.round(
          (atMins(cal.form.end, 0).getTime() - atMins(cal.form.start, 0).getTime()) / 86400000));
        cal.form.start = day;
        cal.form.end = new Date(day.getTime() + span * 86400000);
      } else {
        cal.form.end = day.getTime() < atMins(cal.form.start, 0).getTime()
          ? new Date(cal.form.start)
          : day;
      }
      (["start", "end"] as const).forEach(function (k) {
        const v = dtpValue(k);
        cal.form.calCursor[k] = new Date(v.getFullYear(), v.getMonth(), 1).toISOString();
      });
      paintTimes();
      return;
    }
    if (id === "start") {
      const dur = Math.max(SNAP_MIN * 60000, cal.form.end.getTime() - cal.form.start.getTime());
      cal.form.start = next;
      cal.form.end = new Date(next.getTime() + dur);
    } else {
      // An end at or before the start is meaningless — clamp it forward.
      cal.form.end = next.getTime() <= cal.form.start.getTime()
        ? addMin(cal.form.start, 30)
        : next;
    }
    // Both calendars follow their own (possibly moved) value, so neither opens
    // on a month it no longer contains.
    (["start", "end"] as const).forEach(function (k) {
      const v = dtpValue(k);
      cal.form.calCursor[k] = new Date(v.getFullYear(), v.getMonth(), 1).toISOString();
    });
    paintTimes();
  }

  // Search inside the link picker (delegated: the input is re-rendered often).
  byId("sheet")?.addEventListener("input", function (e) {
    const t = asEl(e.target);
    if (!t || t.id !== "lnkQ") return;
    cal.form.linkQuery = (t as HTMLInputElement).value;
    const list = root.querySelector<HTMLElement>(".lnk-list");
    if (list) list.innerHTML = linkRows();
  });

  on(document, "click", function (e) {
    const t = asEl(e.target);
    if (!t) return;
    if (t.closest('[data-sheet="close"]') || t.id === "sheetBg") { closeSheet(); return; }
    // A target the owning handler already re-rendered away is detached, and
    // `closest()` on it always misses — treating that as an outside click would
    // close the very menu that handler just reopened.
    if (!t.isConnected) return;
    if (!t.closest(".fdd")) closeFdd();
    if (!t.closest(".dtp") && !t.closest(".pdd")) closePops();
  });

  // ================= INITIALIZATION =================
  safe("init", function () { renderCal(); });

  // Keep the week's "now" marker honest while the page stays open (outside the
  // motion block: the marker is information, not decoration).
  const nowTick = window.setInterval(syncNowLine, 30000);
  disposers.push(() => window.clearInterval(nowTick));

  // The mobile nav drawer and FLUID SCALE belong to the persistent chrome and
  // live in components/v3/blueprint-shell/shell-behavior.ts.

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

    // Reveal: load + scroll
    // Reveal adapts to scroll speed: slow scroll — the full 420ms animation;
    // fast — a short one (down to 200ms): never lagging, still visible.
    const vpH = window.innerHeight;
    const scrollHost = main;
    let velLastY = scrollHost ? scrollHost.scrollTop : 0;
    let velLastT = performance.now();
    let scrollVel = 0; // px/ms
    // `.main` is shell-owned and outlives this page, so the listener is
    // tracked for cleanup rather than left to die with the unmounted nodes.
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
    // `.sheet-bg` / `.sheet` are siblings of `.main` in the donor, not
    // `.content` children, so they were never part of its reveal cascade.
    // Inside the app they can only render as `.content` children, so they are
    // excluded here — the remaining blocks keep the donor's 60ms stagger.
    const blocks = $$(".content > *:not(.sheet):not(.sheet-bg)");
    blocks.forEach((el, i) => {
      el.classList.add("rv");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? i * 60 + "ms" : "200ms";
    });
    // Second layer of the arrival — Overview cascades its `.kpi` strip here.
    // This page has no `.kpi`, so the layer was silently absent; its equivalent
    // set of small units is the side cards. Skip anything the block cascade
    // already claimed: no element should carry `rv` and `rv-cell` at once.
    const cells = $$(".cal-card").filter((el) => !el.classList.contains("rv"));
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

    // Row stagger on list (re)render
    function animateRows(list: HTMLElement) {
      const rows = Array.from(list.querySelectorAll<HTMLElement>(".mg-row, .tray-card"));
      rows.forEach((r, i) => {
        r.style.opacity = "0";
        r.style.transform = "translateY(8px)";
        r.style.transition =
          "opacity 300ms " + EASE + " " + i * 45 + "ms, transform 300ms " + EASE + " " + i * 45 + "ms";
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            r.style.opacity = "1";
            r.style.transform = "none";
          }),
        );
        // Drop the inline styles once the stagger lands. Left in place, the
        // inline `transform: none` outranks every stylesheet `:hover` rule,
        // so hover lift on month rows and tray cards silently stops working.
        r.addEventListener("transitionend", function te(e) {
          if (e.propertyName !== "transform") return;
          r.style.opacity = "";
          r.style.transform = "";
          r.style.transition = "";
          r.removeEventListener("transitionend", te);
        });
      });
    }
    // Played on FIRST paint, and from then on only when the view or the week/
    // month actually changes — see `staggerRows` and its single caller in
    // `playViewAnim`.
    //
    // This used to hang off a MutationObserver on `#mgGrid`, which fires on ANY
    // childList change. So toggling a worker filter, typing one character into
    // the search box or expanding a day's "show more" replayed a six-row
    // staggered fade — the whole month blanked to `opacity: 0` and crawled back
    // over ~500ms on every click. The filter was in fact applying; it just
    // looked like the calendar had wiped itself. A chip that genuinely moved
    // still gets its own targeted `ev-land` flash from `flashEvent()`.
    ["mgGrid", "trayList"].forEach((id) => {
      const list = byId(id);
      if (list) animateRows(list);
    });
    staggerRows = (id: string) => {
      const list = byId(id);
      if (list) animateRows(list);
    };

    // Week / team chips cascade on every (re)render — the renderers stay
    // motion-agnostic, exactly like the month rows above.
    function animateChips(host: HTMLElement, sel: string) {
      const chips = Array.from(host.querySelectorAll<HTMLElement>(sel));
      chips.forEach((c, i) => {
        c.style.opacity = "0";
        c.style.transform = "translateY(6px)";
        c.style.transition =
          "opacity 260ms " + EASE + " " + Math.min(i * 26, 320) + "ms, transform 260ms " + EASE + " " + Math.min(i * 26, 320) + "ms";
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            c.style.opacity = "1";
            c.style.transform = "none";
          }),
        );
        c.addEventListener("transitionend", function te(e) {
          if (e.propertyName !== "transform") return;
          c.style.opacity = "";
          c.style.transform = "";
          c.style.transition = "";
          c.removeEventListener("transitionend", te);
        });
      });
    }
    ([["wgBody", ".wg-ev"], ["tgBody", ".evc"]] as const).forEach(([id, sel]) => {
      const host = byId(id);
      if (!host) return;
      const mo = new MutationObserver(() => animateChips(host, sel));
      mo.observe(host, { childList: true });
      disposers.push(() => mo.disconnect());
    });


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
    pressify(".btn, .card-foot-btn, .ptab, .pchip, .pager-btn, .pmenu-item, .photo-box, .pt-open", "pressed");
    pressify(".week-strip .day", "day-pressed");
    // The toolbar, the view switcher and the filter triggers exist from first
    // paint; everything inside a pop-over is injected later, so those press via
    // delegation on `.content` instead of per-node listeners.
    pressify(".cal-nav, .vsw-btn", "pressed");
    root.addEventListener("click", (e) => {
      const el = (e.target instanceof HTMLElement ? e.target : null)?.closest<HTMLElement>(
        ".fdd-btn, .fdd-opt, .dtp-btn, .dtp-day, .dtp-time, .dtp-done, .pdd-btn, .pdd-opt, .lnk-tab, .lnk-row, .sf-kind",
      );
      if (!el) return;
      el.classList.remove("pressed");
      void el.offsetWidth;
      el.classList.add("pressed");
      el.addEventListener("animationend", function ae() {
        el.classList.remove("pressed");
        el.removeEventListener("animationend", ae);
      });
    });

    // (Graph-paper parallax lives in the shell — it owns .main.)
  })();

  // The sliding sidebar indicator lives in the shell — it survives navigation
  // and re-points at whichever item React marks `active`.

  return () => {
    disposers.forEach((d) => d());
  };
}
