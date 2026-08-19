// Blueprint dashboard — runtime behaviors, ported from the donor file's
// <script> (jobflex-dashboard-blueprint.html). Every duration, easing, stagger,
// threshold and formula is the donor's exact value. Adaptations:
//
// - queries are scoped to the mounted root; document/window listeners, timers
//   and observers are tracked for unmount cleanup;
// - the donor's `window load` re-layout gains a `document.fonts.ready`
//   equivalent (in an SPA the load event may already have fired before mount);
// - the persistent chrome (mobile nav drawer, FLUID SCALE, sidebar cascade,
//   sliding indicator, graph-paper parallax) lives in
//   components/v3/blueprint-shell/shell-behavior.ts and is not re-implemented;
// - EVERY region is filled from `data`, the org's real aggregates read in
//   src/app/dashboard/page.tsx. The donor's demo arrays are gone;
// - the Lead Flow board PERSISTS: a drop calls `updateLeadStatus`, the same
//   action the classic kanban used, and rolls the card back with the server's
//   own message if the write is refused;
// - the donor's row-stagger MutationObserver is replaced by `staggerIn` called
//   where a list genuinely ARRIVES (first paint, a day switch). The observer
//   fired on every render, so a repaint replayed the whole entrance and read as
//   "the list wiped itself" (see references/decisions.md, Session 3).

import { updateLeadStatus } from "@/actions/leads";
import { staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import {
  LEAD_STAGES,
  leadProfileMissing,
  type BoardLead,
  type ChartRange,
  type DashboardData,
} from "./blueprint-data";

const SVGNS = "http://www.w3.org/2000/svg";

/** The week strip's picked day, announced to the React layer that renders the
 *  card footer. `detail` is the day's ISO key ("2026-08-13"). */
export const WEEK_DAY_EVENT = "jf:dashboard-weekday";

/** The day the strip opens on: today when the week contains it, otherwise the
 *  first cell. Shared with the content component so the footer's link is
 *  already pointing at the right day on the very first paint. */
export function initialWeekIso(data: DashboardData): string {
  return data.week.days.some((d) => d.iso === data.week.todayIso)
    ? data.week.todayIso
    : (data.week.days[0]?.iso ?? "");
}

/** The classic CompleteLeadProfileBanner snoozed the Lead Center nudge for a
 *  week in localStorage, deliberately not in the schema. Same key, same window,
 *  so a dismissal made on either edition is honoured by both. */
const SNOOZE_KEY = "jf.leadProfileNag";
const SNOOZE_DAYS = 7;

/** Every string below comes from the database — client names, job titles,
 *  activity summaries. They are injected as HTML, so they are escaped. */
function escapeText(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(v: string): string {
  return escapeText(v).replace(/"/g, "&quot;");
}

/** `updateLeadStatus` rejects with a message written for the user ("You can
 *  only update your own leads"). Surface that text; fall back to a generic line
 *  for a transport failure, which carries nothing useful. */
function actionError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  if (!msg || msg.toLowerCase().includes("fetch failed")) {
    return "Something went wrong. Check your connection and try again.";
  }
  return msg;
}

export function initDashboardContent(content: HTMLElement, data: DashboardData): () => void {
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
  // Donor `setTimeout` calls, tracked so an unmount mid-animation cannot fire
  // into a detached tree.
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const after = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };
  disposers.push(() => {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
  });

  // Scoped to `.content`, which the shared shell owns and re-fills on every
  // navigation. `.main` lives in the shell, above this element.
  const $ = (sel: string) => content.querySelector<HTMLElement>(sel);
  const $$ = (sel: string) => Array.from(content.querySelectorAll<HTMLElement>(sel));
  const main = content.closest<HTMLElement>(".main");

  // The board mutates stages locally before the server confirms — clone so a
  // remount starts from the server rows again.
  const leadsData: BoardLead[] = data.leads.map((l) => ({ ...l }));
  /** Cards with a stage write still in flight; a second drop would race its own
   *  rollback. */
  const busyLeads = new Set<string>();

  // ================= TOAST =================
  // The only channel a refused board move has: it owns no dialog.
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  function toast(msg: string) {
    const el = $("#dToast");
    const txt = $("#dToastText");
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
  const toastEl = $("#dToast");
  if (toastEl) {
    on(toastEl, "click", (ev) => {
      const t = ev.target as HTMLElement | null;
      if (t?.closest('[data-toast="close"]')) toastEl.classList.add("is-hidden");
    });
  }

  // ================= LEAD CENTER BANNER =================
  // Rendered only when the org genuinely cannot receive platform leads. The
  // dismissal snoozes for a week, exactly as the classic banner did.
  const banner = $("#leadBanner");
  if (banner && data.leadProfile) {
    let snoozed = false;
    try {
      snoozed = Date.now() < Number(window.localStorage.getItem(SNOOZE_KEY) ?? 0);
    } catch {
      snoozed = false;
    }
    if (snoozed) {
      // Removed rather than hidden: this runs inside the mount's layout effect,
      // before the first paint, so the banner never flashes — and a removed node
      // is not part of the reveal cascade's block list below.
      banner.remove();
    } else {
      const missing = $("#bannerMissing");
      if (missing) missing.textContent = leadProfileMissing(data.leadProfile);
      const close = banner.querySelector<HTMLElement>(".banner-close");
      close?.addEventListener("click", () => {
        try {
          window.localStorage.setItem(
            SNOOZE_KEY,
            String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000),
          );
        } catch {
          /* still collapse for this visit */
        }
        if (banner.classList.contains("closing")) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          banner.classList.add("hidden");
          return;
        }
        banner.style.height = banner.offsetHeight + "px";
        banner.style.transitionDelay = "0ms";
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            banner.classList.add("closing");
            banner.style.height = "0px";
          }),
        );
        banner.addEventListener("transitionend", function te(e) {
          if (e.propertyName !== "height") return;
          banner.classList.add("hidden");
          banner.removeEventListener("transitionend", te);
        });
      });
    }
  }

  // ================= HEAD + KPI STRIP =================
  // Written before the motion pack runs, so its count-up animates the real
  // figure rather than a placeholder.
  const greet = $("#greetKicker");
  if (greet) greet.textContent = data.greeting;
  const kpiTargets: Array<[string, string]> = [
    ["#kpiRevenue", data.kpis.revenue],
    ["#kpiPipeline", data.kpis.pipeline],
    ["#kpiOpen", data.kpis.openProposals],
    ["#kpiLeads", data.kpis.newLeads],
  ];
  kpiTargets.forEach(([sel, val]) => {
    const el = $(sel);
    if (el) el.textContent = val;
  });

  // ================= RENDER =================
  let selectedIso = initialWeekIso(data);

  function renderWeekHead() {
    const range = $("#weekRange");
    if (!range) return;
    const n = data.week.scheduled;
    range.innerHTML =
      escapeText(data.week.range) + " · <b>" + n + " scheduled</b>";
  }

  function renderWeekStrip() {
    const strip = $("#weekStrip");
    if (!strip) return;
    strip.innerHTML = data.week.days
      .map(
        (d) =>
          '<div class="day' +
          (d.today ? " today" : "") +
          (d.iso === selectedIso ? " selected" : "") +
          '" data-iso="' +
          escapeAttr(d.iso) +
          '"><div class="day-lbl">' +
          escapeText(d.lbl) +
          '</div><div class="day-num">' +
          d.num +
          '</div><div class="day-dot' +
          (d.has ? "" : " off") +
          '"></div></div>',
      )
      .join("");
  }

  /** @param arriving true when a different day was picked — a genuinely new set
   *   of blocks is being put in front of the user, so the rows come in. */
  function renderWeek(iso: string, arriving?: boolean) {
    const list = $("#weekList");
    if (!list) return;
    const evs = (data.week.events[iso] || []).slice().sort((a, b) => a.m - b.m);
    list.innerHTML = evs.length
      ? evs
          .map(
            (e) =>
              '<div class="sched-row"><span class="tag">' +
              escapeText(e.t) +
              '</span><span class="sched-title">' +
              escapeText(e.title) +
              "</span></div>",
          )
          .join("")
      : '<div class="empty">Nothing scheduled for this day.</div>';
    list.classList.add("scrollable");
    // No `has-more` here: the card's own footer carries "Go to Calendar" on
    // every state now, so the >10-rows inline copy the other lists grow past
    // ten rows would only say it a second time.
    renderWeekFoot(iso);
    if (arriving) staggerIn(Array.from(list.querySelectorAll<HTMLElement>(".sched-row, .empty")));
  }

  /** Tell the React layer which day the strip is on, so the card footer's
   *  "Schedule a job" opens the calendar ON that day with the new-event
   *  composer up — a picked day the link dropped was a day the user had to find
   *  again. */
  function renderWeekFoot(iso: string) {
    window.dispatchEvent(new CustomEvent(WEEK_DAY_EVENT, { detail: iso }));
  }

  function renderJobs() {
    const list = $("#jobsList");
    if (!list) return;
    let html = data.jobs.length
      ? data.jobs
          .map(
            (j) =>
              '<div class="job-row"><span class="job-date' +
              (j.today ? " today" : "") +
              '">' +
              escapeText(j.date) +
              "</span>" +
              '<div class="job-info"><div class="job-title">' +
              escapeText(j.title) +
              '</div><div class="job-sub">' +
              escapeText(j.sub) +
              "</div></div>" +
              '<span class="chip ' +
              (j.st === "ok" ? "ok" : "wait") +
              '">' +
              (j.st === "ok" ? "Confirmed" : "Pending") +
              "</span></div>",
          )
          .join("")
      : '<div class="empty">Your calendar is clear.</div>';
    html +=
      '<a class="card-foot-btn" href="/dashboard/jobs">Go to Jobs<svg class="ic"><use href="#i-arrow"/></svg></a>';
    list.innerHTML = html;
    list.classList.add("scrollable");
    list.classList.toggle("has-more", data.jobs.length > 10);
  }

  function renderActivity() {
    const list = $("#actList");
    if (!list) return;
    list.innerHTML = data.activities.length
      ? data.activities
          .map(
            (a) =>
              '<div class="act-row"><div class="act-ic"><svg class="ic"><use href="#' +
              escapeAttr(a.i) +
              '"/></svg></div>' +
              '<div><div class="act-title">' +
              escapeText(a.t) +
              '</div><div class="act-meta">' +
              escapeText(a.m) +
              "</div></div></div>",
          )
          .join("")
      : '<div class="empty">No activity yet.</div>';
    list.classList.add("scrollable");
  }

  // ================= LEAD FLOW: COLUMNS + DRAG & DROP =================
  // Every card in a column stays visible — the board grows with content.
  // Dragging over another column smoothly opens a preview slot at the bottom,
  // sized to the dragged card, showing where the drop will land.
  let dragH = 0;
  let dragSrcStage: string | null = null;

  function stageItems(st: string) {
    return leadsData.filter((l) => l.stage === st);
  }
  function leadCardHtml(l: BoardLead) {
    return (
      '<div class="lead-card" draggable="true" data-id="' +
      escapeAttr(l.id) +
      '">' +
      '<div class="lead-name">' +
      escapeText(l.name) +
      "</div>" +
      '<div class="lead-job">' +
      escapeText(l.job) +
      " · " +
      escapeText(l.city) +
      "</div>" +
      '<div class="lead-meta"><span class="lead-val' +
      (l.owner ? "" : " none") +
      '">' +
      escapeText(l.owner || "Unassigned") +
      '</span><span class="lead-age">' +
      escapeText(l.age) +
      "</span></div>" +
      "</div>"
    );
  }
  function bindCards(wrap: HTMLElement) {
    wrap.querySelectorAll<HTMLElement>(".lead-card").forEach((card) => {
      card.addEventListener("dragstart", (e) => {
        const lead = leadsData.find((l) => l.id === card.dataset.id);
        dragH = card.offsetHeight;
        dragSrcStage = lead ? lead.stage : null;
        if (e.dataTransfer) {
          e.dataTransfer.setData("text/plain", card.dataset.id || "");
          e.dataTransfer.effectAllowed = "move";
        }
        requestAnimationFrame(() => card.classList.add("dragging"));
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        dragSrcStage = null;
        $$(".stage-col").forEach((c) => {
          c.classList.remove("dragover");
          collapseSlot(c);
        });
      });
    });
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
    after(300, () => {
      if (slot.parentNode) slot.remove();
    });
  }
  function renderStage(st: string, opts?: { animateAll?: boolean; highlightId?: string | null }) {
    opts = opts || {};
    const col = $('.stage-col[data-stage="' + st + '"]');
    if (!col) return;
    const wrap = col.querySelector<HTMLElement>(".stage-cards");
    if (!wrap) return;
    const items = stageItems(st);
    wrap.innerHTML = items.length
      ? items.map(leadCardHtml).join("")
      : '<div class="lead-empty">No leads</div>';
    const count = col.querySelector<HTMLElement>(".stage-count");
    if (count) count.textContent = String(items.length);
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (opts.animateAll && !rm) {
      Array.from(wrap.children).forEach((child, i) => {
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
    if (opts.highlightId != null && !rm) {
      const el = wrap.querySelector<HTMLElement>(
        '.lead-card[data-id="' + CSS.escape(opts.highlightId) + '"]',
      );
      if (el) {
        el.classList.add("landed");
        el.addEventListener("animationend", () => el.classList.remove("landed"), { once: true });
      }
    }
    bindCards(wrap);
  }
  function renderBoard() {
    LEAD_STAGES.forEach((st) => renderStage(st, { animateAll: true }));
  }

  /**
   * The card lands at the END of the target column — exactly where the preview
   * slot sat — and only the two touched columns repaint, so the rest of the
   * board never flickers.
   */
  function applyMove(id: string, to: string, highlight: boolean) {
    const idx = leadsData.findIndex((l) => l.id === id);
    if (idx === -1) return;
    const lead = leadsData[idx];
    const from = lead.stage;
    leadsData.splice(idx, 1);
    lead.stage = to;
    leadsData.push(lead);
    renderStage(from);
    renderStage(to, { highlightId: highlight ? lead.id : null });
  }

  /**
   * OPTIMISTIC, then PERSISTED with `updateLeadStatus` — the same action the
   * classic kanban board used. The server is org-scoped and gates sales reps to
   * their own slice, so a refusal is real and has to be honoured: the card goes
   * back to the column it came from and the action's own message is shown.
   */
  async function moveLead(id: string, to: string) {
    if (!to) return;
    const lead = leadsData.find((l) => l.id === id);
    if (!lead || lead.stage === to) return;
    if (busyLeads.has(id)) return;
    const from = lead.stage;
    busyLeads.add(id);
    applyMove(id, to, true);
    try {
      await updateLeadStatus(id, to.toUpperCase());
      busyLeads.delete(id);
    } catch (err) {
      busyLeads.delete(id);
      applyMove(id, from, false);
      toast(actionError(err));
    }
  }

  (function bindBoardColumns() {
    $$(".stage-col").forEach((col) => {
      col.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        col.classList.add("dragover");
        if (!dragSrcStage || col.dataset.stage === dragSrcStage) return;
        const wrap = col.querySelector<HTMLElement>(".stage-cards");
        if (!wrap) return;
        if (!wrap.querySelector(".drop-slot")) {
          const slot = document.createElement("div");
          slot.className = "drop-slot";
          wrap.appendChild(slot);
          wrap.classList.add("previewing");
          requestAnimationFrame(() => {
            slot.classList.add("open");
            slot.style.height = (dragH || 64) + "px";
          });
          // If the open slot pushed the board past the bottom edge — scroll it into view
          after(230, () => {
            if (!wrap.querySelector(".drop-slot")) return;
            const board = $(".stage-board");
            const mainEl = main;
            if (!board || !mainEl) return;
            const over =
              board.getBoundingClientRect().bottom - mainEl.getBoundingClientRect().bottom + 24;
            if (over > 0) {
              const rmq = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              mainEl.scrollBy({ top: over, behavior: rmq ? "auto" : "smooth" });
            }
          });
        }
      });
      col.addEventListener("dragleave", (e) => {
        if (col.contains((e as DragEvent).relatedTarget as Node)) return;
        col.classList.remove("dragover");
        collapseSlot(col);
      });
      col.addEventListener("drop", (e) => {
        e.preventDefault();
        col.classList.remove("dragover");
        collapseSlot(col, true);
        const id = e.dataTransfer ? e.dataTransfer.getData("text/plain") : "";
        if (!id) return;
        void moveLead(id, col.dataset.stage || "");
      });
    });
  })();

  // ================= HEIGHTS =================
  function layoutSync() {
    if (window.innerWidth <= 860) {
      // mobile layout: CSS controls the heights
      ["jobsCard", "actCard"].forEach((id) => {
        const el = $("#" + id);
        if (el) el.style.height = "";
      });
      const wl = $("#weekList");
      if (wl) wl.style.height = "";
      return;
    }
    const weekList = $("#weekList");
    if (!weekList) return;
    const row = weekList.querySelector<HTMLElement>(".sched-row");
    if (row && !weekList.dataset.h) weekList.dataset.h = String(Math.round(row.offsetHeight * 4 + 2));
    if (weekList.dataset.h) weekList.style.height = weekList.dataset.h + "px";
    const weekCard = $("#weekCard");
    const jobsCard = $("#jobsCard");
    if (weekCard && jobsCard) {
      jobsCard.style.height = "auto";
      jobsCard.style.height = weekCard.offsetHeight + "px";
    }
    const chartCard = $("#chartCard");
    const actCard = $("#actCard");
    if (chartCard && actCard) {
      actCard.style.height = "auto";
      actCard.style.height = chartCard.offsetHeight + "px";
    }
  }

  // ================= DAY SELECTION =================
  // Delegated: the strip's cells are rendered from the real week, so there is
  // nothing to bind to until after the first paint.
  const strip = $("#weekStrip");
  if (strip) {
    on(strip, "click", (ev) => {
      const d = (ev.target as HTMLElement | null)?.closest<HTMLElement>(".day");
      if (!d || !d.dataset.iso || d.dataset.iso === selectedIso) return;
      selectedIso = d.dataset.iso;
      strip.querySelectorAll<HTMLElement>(".day").forEach((x) => x.classList.toggle("selected", x === d));
      renderWeek(selectedIso, true);
      layoutSync();
    });
  }

  // ================= CHART: DATA, RENDER, FILTER, HOVER =================
  type ChartPt = { x: number; y: number; v: number; d: string };
  let chartPts: ChartPt[] = [];
  let chartEls: {
    line: SVGPolylineElement;
    area: SVGPathElement;
    dots: SVGRectElement[];
    note: SVGTextElement;
  } | null = null;
  let hoverUI: {
    guide: SVGLineElement;
    tipg: SVGGElement;
    tipBox: SVGRectElement;
    tipText: SVGTextElement;
  } | null = null;

  function svgEl<T extends SVGElement>(
    tag: string,
    attrs: Record<string, string | number>,
    cls?: string,
    parent?: Element,
  ): T {
    const el = document.createElementNS(SVGNS, tag) as T;
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    if (cls) el.setAttribute("class", cls);
    if (parent) parent.appendChild(el);
    return el;
  }
  function fmtK(v: number) {
    let k = (Math.round(v / 100) / 10).toString();
    if (k.slice(-2) === ".0") k = k.slice(0, -2);
    return "$" + k + "K";
  }

  function renderChart(range: ChartRange) {
    const ds = data.chart[range];
    const gY = $("#chY");
    const gX = $("#chX");
    const gD = $("#chData");
    if (!ds || !gY || !gX || !gD) return;
    gY.innerHTML = "";
    gX.innerHTML = "";
    gD.innerHTML = "";
    const n = ds.values.length;
    if (!n) return;
    chartPts = ds.values.map((v, i) => ({
      x: n === 1 ? 430 : 70 + i * (720 / (n - 1)),
      y: 288 - (v / ds.yMax) * 272,
      v: v,
      d: ds.labels[i],
    }));
    [16, 84, 152, 220, 288].forEach((y, i) => {
      svgEl<SVGTextElement>("text", { x: 58, y: y + 4, "text-anchor": "end" }, "ch-lbl", gY).textContent =
        ds.ticks[i];
    });
    chartPts.forEach((pt) => {
      svgEl<SVGTextElement>("text", { x: pt.x, y: 318, "text-anchor": "middle" }, "ch-lbl", gX).textContent =
        pt.d;
    });
    const area = svgEl<SVGPathElement>(
      "path",
      { d: "M70,288 " + chartPts.map((pt) => "L" + pt.x + "," + pt.y).join(" ") + " L790,288 Z" },
      "ch-area",
      gD,
    );
    const line = svgEl<SVGPolylineElement>(
      "polyline",
      { points: chartPts.map((pt) => pt.x + "," + pt.y).join(" ") },
      "ch-line",
      gD,
    );
    const dots = chartPts.map((pt) =>
      svgEl<SVGRectElement>("rect", { x: pt.x - 5, y: pt.y - 5, width: 10, height: 10 }, "ch-dot", gD),
    );
    dots[dots.length - 1].classList.add("on"); // current day filled by default
    // Peak — always the maximum of the current dataset
    let maxI = 0;
    chartPts.forEach((pt, i) => {
      if (pt.v > chartPts[maxI].v) maxI = i;
    });
    const mp = chartPts[maxI];
    const note = svgEl<SVGTextElement>(
      "text",
      {
        x: Math.min(Math.max(mp.x, 100), 760),
        y: Math.max(mp.y - 18, 30),
        "text-anchor": "middle",
      },
      "ch-note",
      gD,
    );
    note.textContent = fmtK(mp.v);
    chartEls = { line, area, dots, note };
    // Draw (Balanced): the line draws itself, dots along the way, fill and peak after
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const len = line.getTotalLength();
      line.style.strokeDasharray = String(len);
      line.style.strokeDashoffset = String(len);
      area.style.opacity = "0";
      note.style.opacity = "0";
      dots.forEach((d) => {
        d.style.opacity = "0";
      });
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          line.style.transition = "stroke-dashoffset 850ms cubic-bezier(0.4, 0, 0.2, 1)";
          line.style.strokeDashoffset = "0";
          dots.forEach((d, i) => {
            after(Math.round(850 * (i / Math.max(1, dots.length - 1))), () => {
              d.style.transition = "opacity 180ms ease";
              d.style.opacity = "1";
            });
          });
          after(950, () => {
            area.style.opacity = "1";
            note.style.opacity = "1";
          });
        }),
      );
    }
    hoverHide();
  }

  function hoverShow(i: number) {
    if (!hoverUI || !chartEls) return;
    const pt = chartPts[i];
    hoverUI.guide.style.opacity = "0.55";
    hoverUI.guide.style.transform = "translateX(" + pt.x + "px)";
    hoverUI.tipText.textContent = pt.d + " · $" + pt.v.toLocaleString("en-US");
    const bb = hoverUI.tipText.getBBox();
    const w = bb.width + 22;
    hoverUI.tipBox.setAttribute("width", String(w));
    const tx = Math.min(Math.max(pt.x - w / 2, 72), 788 - w);
    let ty = pt.y - 46;
    if (ty < 20) ty = pt.y + 18;
    hoverUI.tipg.style.opacity = "1";
    hoverUI.tipg.style.transform = "translate(" + tx + "px, " + ty + "px)";
    chartEls.dots.forEach((d, di) => d.classList.toggle("on", di === i));
    chartEls.note.style.opacity = "0"; // peak hides during hover
  }
  function hoverHide() {
    if (!hoverUI) return;
    hoverUI.guide.style.opacity = "0";
    hoverUI.tipg.style.opacity = "0";
    if (chartEls && chartEls.dots.length) {
      chartEls.dots.forEach((d) => d.classList.remove("on"));
      chartEls.dots[chartEls.dots.length - 1].classList.add("on");
      chartEls.note.style.opacity = "1";
    }
  }

  (function initChartHover() {
    const svg = content.querySelector<SVGSVGElement>("#revChart");
    const gH = content.querySelector<SVGGElement>("#chHover");
    if (!svg || !gH) return;
    const guide = svgEl<SVGLineElement>("line", { x1: 0, y1: 16, x2: 0, y2: 288 }, "ch-guide", gH);
    const tipg = svgEl<SVGGElement>("g", {}, "ch-tipg", gH);
    const tipBox = svgEl<SVGRectElement>("rect", { rx: 2, height: 30, x: 0, y: 0 }, "ch-tip-box", tipg);
    const tipText = svgEl<SVGTextElement>("text", { x: 11, y: 20 }, "ch-tip-text", tipg);
    const overlay = svgEl<SVGRectElement>(
      "rect",
      { x: 70, y: 10, width: 720, height: 292, fill: "transparent" },
      "ch-overlay",
      gH,
    );
    hoverUI = { guide, tipg, tipBox, tipText };
    let lastI = -1;
    overlay.addEventListener("mousemove", (e) => {
      if (!chartPts.length) return;
      const r = svg.getBoundingClientRect();
      const sx = ((e.clientX - r.left) / r.width) * 860;
      let best = 0,
        bd = Infinity;
      chartPts.forEach((pt, i) => {
        const dd = Math.abs(pt.x - sx);
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      });
      if (best !== lastI) {
        lastI = best;
        hoverShow(best);
      }
    });
    overlay.addEventListener("mouseleave", () => {
      lastI = -1;
      hoverHide();
    });
  })();

  // ================= CHART DROPDOWN =================
  (function initDropdown() {
    const dd = $("#rangeDd");
    if (!dd) return;
    const btn = dd.querySelector<HTMLElement>(".dd-btn");
    const label = dd.querySelector<HTMLElement>(".dd-label");
    if (!btn || !label) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      dd.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(dd.classList.contains("open")));
    });
    dd.querySelectorAll<HTMLElement>(".dd-item").forEach((item) => {
      item.addEventListener("click", () => {
        // `aria-selected` moves with `.active`. The class is what the eye reads
        // and the attribute is what a screen reader reads; they describe the
        // same fact, so they are never set apart.
        dd.querySelectorAll(".dd-item").forEach((i) => {
          i.classList.remove("active");
          i.setAttribute("aria-selected", "false");
        });
        item.classList.add("active");
        item.setAttribute("aria-selected", "true");
        const text = (item.textContent || "").trim();
        label.textContent = text;
        if (item.dataset.range) {
          renderChart(item.dataset.range as ChartRange);
          // The chart is `role="img"`: its label has to name the range it is
          // actually drawing, or it keeps announcing the first one forever.
          content
            .querySelector("#revChart")
            ?.setAttribute("aria-label", "Revenue trend for the " + text.toLowerCase());
        }
        dd.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      });
    });
    on(document, "click", () => {
      dd.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    });
  })();

  // ================= INITIALIZATION =================
  renderWeekHead();
  renderWeekStrip();
  renderWeek(selectedIso);
  renderJobs();
  renderActivity();
  renderChart("7d");
  renderBoard();
  layoutSync();
  on(window, "load", layoutSync);
  on(window, "resize", layoutSync);
  // SPA equivalent of the donor's window-load re-layout. The donor caches the
  // 4-row week-list height on first measure; in the app that first paint can
  // happen before the web fonts resolve, freezing fallback metrics into the
  // card heights. Clear the cached measure and re-sync once fonts are in, so
  // the ×4 height uses the same final Inter metrics as the donor file.
  document.fonts?.ready.then(() => {
    const wl = $("#weekList");
    if (wl) delete wl.dataset.h;
    layoutSync();
  });

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Reveal: load + scroll
    // Reveal adapts to scroll speed: slow scroll — the full 420ms animation;
    // fast — shorter (down to 200ms): keeps up, stays visible.
    const vpH = window.innerHeight;
    const scrollHost = main;
    let velLastY = scrollHost ? scrollHost.scrollTop : 0;
    let velLastT = performance.now();
    let scrollVel = 0; // px/ms
    if (scrollHost)
      scrollHost.addEventListener(
        "scroll",
        () => {
          const now = performance.now();
          scrollVel = Math.abs(scrollHost.scrollTop - velLastY) / Math.max(1, now - velLastT);
          velLastY = scrollHost.scrollTop;
          velLastT = now;
        },
        { passive: true },
      );
    // `.d-toast` is a fixed, display:none overlay — it never intersects, so the
    // cascade would strand it at opacity 0 the first time a refusal shows it.
    const blocks = $$(".content > *:not(.d-toast)");
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
            // element below the fold: duration follows current scroll speed
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

    // Row stagger on ARRIVAL only. The donor wired this to a MutationObserver,
    // which replayed the whole entrance on every repaint; `staggerIn` is played
    // by whoever knows a list genuinely arrived (here: first paint, and the day
    // switch in renderWeek).
    ["weekList", "jobsList", "actList"].forEach((id) => {
      const list = $("#" + id);
      if (!list) return;
      staggerIn(Array.from(list.querySelectorAll<HTMLElement>(".sched-row, .job-row, .act-row, .empty")));
    });

    // Numeral count-up over the real figures written above. Keeps whatever
    // frames the number, skips decimals (digits-only mangles them) and skips
    // nodes that hold elements rather than bare text.
    $$(".kpi-val").forEach((el) => {
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

    // Press effects — delegated to `content` so nodes injected after init
    // (menu items, JS-rendered buttons, innerHTML re-renders) still press.
    function pressify(sel: string, cls: string) {
      on(content, "click", (e) => {
        const el = (e.target as Element).closest<HTMLElement>(sel);
        if (!el || !content.contains(el)) return;
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
      });
      on(content, "animationend", (e) => {
        const el = e.target as HTMLElement;
        if (el.matches && el.matches(sel)) el.classList.remove(cls);
      });
    }
    // Shell controls (.icon-btn, .sb-foot-*) press from the shell module.
    pressify(".page-actions .btn, .card-foot-btn, .dd-item", "pressed");
    // The week strip is re-rendered from real data, so its press is delegated.
    const stripEl = $("#weekStrip");
    if (stripEl) {
      on(stripEl, "click", (ev) => {
        const d = (ev.target as HTMLElement | null)?.closest<HTMLElement>(".day");
        if (!d) return;
        d.classList.remove("day-pressed");
        void d.offsetWidth;
        d.classList.add("day-pressed");
      });
      on(stripEl, "animationend", (ev) => {
        (ev.target as HTMLElement | null)
          ?.closest<HTMLElement>(".day")
          ?.classList.remove("day-pressed");
      });
    }

    // (Graph-paper parallax lives in the shell — it owns .main.)
  })();

  // The sliding sidebar indicator, the mobile nav drawer and FLUID SCALE all
  // belong to the persistent chrome and now live in
  // components/v3/blueprint-shell/shell-behavior.ts. They run once for the
  // whole shell instead of re-initialising on every navigation — which is
  // what stopped the sidebar from re-cascading each time a page loaded.
  // FLUID SCALE still drives card heights here: it fires a resize, and the
  // `on(window, "resize", layoutSync)` above re-syncs them.

  return () => {
    disposers.forEach((d) => d());
  };
}
