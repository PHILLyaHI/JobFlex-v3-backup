// Financials blueprint — runtime behaviors, ported verbatim from the donor
// file's <script> (jobflex-financials-blueprint_7.html). Every duration,
// easing, stagger, geometry constant and formula is the donor's exact value.
//
// Adaptations are mechanical only:
// - queries are scoped to the mounted `.content` root instead of `document`;
// - listeners, timers and observers are tracked for unmount cleanup;
// - the donor's shell-owned modules are NOT ported here — the mobile nav
//   drawer, FLUID SCALE (zoom + --app-h + eff-* classes), the sidebar entry
//   cascade, the sliding sidebar indicator, the topbar/search controls and the
//   graph-paper parallax all live in
//   components/v3/blueprint-shell/shell-behavior.ts;
// - the donor's `safe(name, fn)` try/catch wrapper and its `window.matchMedia`
//   polyfill are environment shims, not behavior, and are dropped (the app
//   always runs in a browser that has matchMedia).

import { scanReceipt, saveReceiptExpense } from "@/actions/receiptOcr";
import { deleteJobExpense } from "@/actions/expenses";
import { safeHref } from "@/lib/safeHref";
import { deleteChangeOrder, sendChangeOrder } from "@/actions/changeOrders";
import { closeMdl, openMdl } from "@/components/v3/blueprint-shell/mdl-motion";
import { staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import {
  EXPENSE_CATEGORIES,
  type ChangeOrder,
  type Expense,
  type Invoice,
  type MonthPoint,
  type OverheadMonth,
  type OverheadSheet,
  type Rollup,
} from "./financials-data";
import { initOverheadPanel } from "./overhead-behavior";

/** `job` holds a real Job ID once a receipt is staged — it is submitted as-is. */
type Staged = { vendor: string; total: number; category: string; job: string };

/** A job a receipt can be charged to. */
export type FinancialsJob = { id: string; title: string; status: string };

/**
 * Everything on this page is read from the database in
 * src/app/dashboard/financials/page.tsx and handed in here. There are no
 * defaults worth having: an absent book is an EMPTY book, which the page's
 * empty states already say out loud — a fixture fallback would quietly show
 * somebody else's numbers.
 */
export type FinancialsOptions = {
  /** The org's real jobs. Empty is handled: the drop zone says so rather than
   *  staging a receipt that cannot be saved. */
  jobs?: FinancialsJob[];
  monthly?: MonthPoint[];
  rollup?: Rollup;
  expenses?: Expense[];
  orders?: ChangeOrder[];
  invoices?: Invoice[];
  /** Twelve months of job money, oldest first, and every saved overhead sheet.
   *  Both belong to the Overhead tab (overhead-behavior.ts); they pass through
   *  here only because one init call owns the whole page. */
  overheadMonths?: OverheadMonth[];
  overheadSheets?: Record<string, OverheadSheet>;
};

const EMPTY_ROLLUP: Rollup = {
  revenue30d: 0,
  expenses30d: 0,
  profit30d: 0,
  marginPct: 0,
  pipelineValue: 0,
  invoicesPending: 0,
  invoicesOverdue: 0,
  changeOrdersPending: 0,
};

/** Server actions reject with an Error whose message is written for the user
 *  ("Only drafts can be deleted.", "Not found"). Surface that text; fall back
 *  to a generic line for anything unrecognisable. */
function actionError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  if (!msg || msg.toLowerCase().includes("fetch failed")) {
    return "Something went wrong. Check your connection and try again.";
  }
  return msg;
}

export function initFinancialsContent(
  content: HTMLElement,
  options: FinancialsOptions = {},
): () => void {
  // Scoped to `.content`, which the shared shell owns and re-fills on every
  // navigation. `.main` lives in the shell, above this element.
  const root = content;
  const main = content.closest<HTMLElement>(".main");
  const disposers: Array<() => void> = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const on = (
    target: EventTarget,
    ev: string,
    fn: EventListener,
    opts?: AddEventListenerOptions,
  ) => {
    target.addEventListener(ev, fn, opts);
    disposers.push(() => target.removeEventListener(ev, fn, opts));
  };
  const $ = (sel: string) => root.querySelector<HTMLElement>(sel);
  const $$ = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
  /** Tracked `setTimeout` — the row-removal choreography runs on these, so an
   *  unmount mid-animation must not fire into a detached tree. */
  const after = (ms: number, fn: () => void) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };

  // The server's rows, copied so the local edits made after a successful write
  // (an appended expense, a change order that just went out) cannot mutate the
  // props React is still holding.
  let expensesData: Expense[] = (options.expenses ?? []).map((e) => ({ ...e }));
  let ordersData: ChangeOrder[] = (options.orders ?? []).map((o) => ({ ...o }));
  const invoicesData: Invoice[] = options.invoices ?? [];
  const monthly: MonthPoint[] = options.monthly ?? [];
  const rollup: Rollup = { ...EMPTY_ROLLUP, ...(options.rollup ?? {}) };

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

  // What the Overhead tab last computed for the month it is showing. Seeded
  // from the newest month's saved sheet so the Overview card is right on first
  // paint, then kept live by `onTotals` as the sheet is edited.
  let overheadLeft = 0;
  let overheadCovered = true;
  let overheadEmpty = true;

  const fin: { tab: string; staged: Staged | null } = { tab: "overview", staged: null };
  const jobs: FinancialsJob[] = options.jobs ?? [];
  /** Blocks a double submit while the expense is on the wire. */
  let savingExpense = false;

  /** Attribute-safe text for the option/vendor strings written into markup. */
  function esc(s: string) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n: number) {
    return "$" + Math.round(n).toLocaleString("en-US");
  }
  /** money() on a negative prints "$-5,100"; the minus belongs in front of the
   *  dollar sign, not after it. Only the overhead card can go negative. */
  function signedMoney(n: number) {
    return (n < 0 ? "-" : "") + money(Math.abs(n));
  }
  function shortMoney(n: number) {
    return n >= 1000 ? "$" + Math.round(n / 1000) + "k" : "$" + n;
  }
  function lower(v: string) {
    return v.toLowerCase();
  }

  // ================= CHART =================
  function renderChart() {
    const W = 660,
      H = 226,
      padL = 40,
      padR = 10,
      padT = 12,
      padB = 26;
    // A brand-new org has no months and no money. The donor never had to draw
    // that: `gw` would divide by zero and `step` would collapse to 0, so every
    // bar height became NaN and the SVG rendered as a blank box with no
    // explanation in it.
    const chartEl = $("#revChart");
    if (!monthly.length) {
      if (chartEl)
        chartEl.innerHTML =
          '<div class="fi-chart-empty">No paid invoices or job expenses yet — the last twelve months will draw here.</div>';
      paintHeadStats(null);
      return;
    }
    const max = Math.max.apply(
      null,
      monthly.map(function (m) {
        return Math.max(m.revenue, m.expenses);
      }),
    );
    // A month can close in the red (expenses above revenue). The donor's scale
    // stopped at $0, so a negative net point was plotted below the axis and
    // walked out of the card. When any month's net is negative the scale now
    // grows a negative field: same $-step, up to four extra divisions below
    // zero, each with its own gridline and a "−$10k"-style label. With no red
    // months negDivs is 0 and the chart renders exactly as before.
    const minNet = Math.min.apply(
      null,
      [0].concat(
        monthly.map(function (m) {
          return m.revenue - m.expenses;
        }),
      ),
    );
    // Floor the scale at $10k a division so a quiet month still has a readable
    // axis instead of a zero-height grid. The step must also cover the deepest
    // red month in ≤4 divisions, so a catastrophic month widens the step
    // rather than stacking rows until the grid is unreadable.
    const step = Math.max(
      10000,
      Math.ceil(max / 4 / 10000) * 10000,
      Math.ceil(-minNet / 4 / 10000) * 10000,
    );
    const top = step * 4;
    const negDivs = Math.ceil(-minNet / step); // 0..4 by construction of step
    const range = top + negDivs * step;
    const iw = W - padL - padR,
      ih = H - padT - padB;
    const gw = iw / monthly.length;
    const bw = Math.min(13, (gw - 8) / 2);
    // The $0 baseline. With no red months this is the plot bottom (the donor's
    // `base`); with them it rises to make room for the negative field.
    const base = padT + (ih * top) / range;

    let svg =
      '<svg viewBox="0 0 ' +
      W +
      " " +
      H +
      '" role="img" aria-label="Revenue versus expenses by month">' +
      '<defs><pattern id="hatchExp" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="5" height="5" fill="var(--warning-soft)"/>' +
      '<line x1="0" y1="0" x2="0" y2="5" stroke="var(--warning)" stroke-width="2.6"/></pattern></defs>';

    // grid and scale — negative divisions (if any) carry a typographic minus,
    // same as the head-stats net readout.
    for (let i = -negDivs; i <= 4; i++) {
      const y = base - (ih * i * step) / range;
      svg +=
        '<line class="grid-line" x1="' +
        padL +
        '" y1="' +
        y +
        '" x2="' +
        (W - padR) +
        '" y2="' +
        y +
        '"/>' +
        '<text class="axis-txt" x="' +
        (padL - 8) +
        '" y="' +
        (y + 3) +
        '" text-anchor="end">' +
        (i < 0 ? "−" : "") +
        shortMoney(step * Math.abs(i)) +
        "</text>";
    }

    const pts: Array<[number, number]> = [];
    monthly.forEach(function (m, i) {
      const x = padL + gw * i;
      const cx = x + gw / 2;
      const rh = (m.revenue / range) * ih,
        eh = (m.expenses / range) * ih;
      const rx = cx - bw - 1,
        ex = cx + 1;
      svg +=
        '<g class="mo-group" data-mo="' +
        i +
        '">' +
        '<rect class="mo-hit" x="' +
        x +
        '" y="' +
        padT +
        '" width="' +
        gw +
        '" height="' +
        ih +
        '"/>' +
        '<rect class="bar-rev" x="' +
        rx +
        '" y="' +
        (base - rh) +
        '" width="' +
        bw +
        '" height="' +
        rh +
        '"/>' +
        '<rect class="bar-exp" x="' +
        ex +
        '" y="' +
        (base - eh) +
        '" width="' +
        bw +
        '" height="' +
        eh +
        '"/>' +
        '<text class="axis-txt mo-lbl" x="' +
        cx +
        '" y="' +
        (H - 8) +
        '" text-anchor="middle">' +
        m.m +
        "</text>" +
        "<title>" +
        m.m +
        " · revenue " +
        money(m.revenue) +
        " · expenses " +
        money(m.expenses) +
        " · net " +
        money(m.revenue - m.expenses) +
        "</title>" +
        "</g>";
      pts.push([cx, base - ((m.revenue - m.expenses) / range) * ih]);
    });

    // net-profit line above the bars + dots
    svg +=
      '<polyline class="net-line" points="' +
      pts
        .map(function (p) {
          return p[0].toFixed(1) + "," + p[1].toFixed(1);
        })
        .join(" ") +
      '"/>';
    pts.forEach(function (p) {
      svg +=
        '<rect class="net-dot" x="' +
        (p[0] - 2.5).toFixed(1) +
        '" y="' +
        (p[1] - 2.5).toFixed(1) +
        '" width="5" height="5"/>';
    });
    // axis
    svg +=
      '<line class="axis-line" x1="' +
      padL +
      '" y1="' +
      base +
      '" x2="' +
      (W - padR) +
      '" y2="' +
      base +
      '"/>';
    svg += "</svg>";
    if (chartEl) chartEl.innerHTML = svg;

    paintHeadStats(null);
  }

  // ================= CHART HEAD STATS + MONTH HOVER =================
  // The head strip used to be a static 12-month total. Pointing at a month's
  // column now retargets it at THAT month, and the scope line under the card
  // title says which one you are reading — so the bars stop being a shape you
  // have to estimate off the axis.
  //
  // The three figures are rewritten in place (not re-created) so each value can
  // crossfade on its own; rebuilding the strip's innerHTML would restart the
  // labels and swatches too and read as a flicker.
  const FULL_SCOPE = "Last 12 months · paid invoices against job expenses";

  function chartTotals() {
    return monthly.reduce(
      function (a, m) {
        return { r: a.r + m.revenue, e: a.e + m.expenses };
      },
      { r: 0, e: 0 },
    );
  }

  /** @param index the hovered month, or null for the 12-month roll-up. */
  function paintHeadStats(index: number | null) {
    const host = $("#chartTotals");
    if (!host) return;
    const point = index === null ? null : monthly[index];
    const rev = point ? point.revenue : chartTotals().r;
    const exp = point ? point.expenses : chartTotals().e;
    const net = rev - exp;

    if (!host.querySelector(".hs")) {
      host.innerHTML =
        '<div class="hs"><div class="hs-l"><i class="sw-rev"></i>Revenue</div><div class="hs-v" data-hs="rev"></div></div>' +
        '<div class="hs"><div class="hs-l"><i class="sw-exp"></i>Expenses</div><div class="hs-v" data-hs="exp"></div></div>' +
        '<div class="hs"><div class="hs-l"><i class="sw-net"></i>Net</div><div class="hs-v" data-hs="net"></div></div>';
    }
    host.classList.toggle("is-month", point !== null);

    setHsValue(host.querySelector('[data-hs="rev"]'), money(rev));
    setHsValue(host.querySelector('[data-hs="exp"]'), money(exp));
    const netEl = host.querySelector<HTMLElement>('[data-hs="net"]');
    if (netEl) {
      // A single month can run a loss where the 12-month roll-up does not, so
      // the tone is read off the figure rather than pinned to "ok".
      netEl.classList.toggle("tone-ok", net >= 0);
      netEl.classList.toggle("tone-bad", net < 0);
      setHsValue(netEl, (net < 0 ? "−" : "") + money(Math.abs(net)));
    }

    const scope = $("#chartScope");
    if (scope) scope.textContent = point ? point.m + " · one month" : FULL_SCOPE;
  }

  /** Writes a figure and replays the 150ms swap so the change is legible even
   *  when two months happen to read alike. */
  function setHsValue(el: Element | null, text: string) {
    if (!el || el.textContent === text) return;
    el.textContent = text;
    el.classList.remove("hs-v--swap");
    void (el as HTMLElement).offsetWidth;
    el.classList.add("hs-v--swap");
  }

  function wireChartHover() {
    const chart = $("#revChart");
    if (!chart) return;
    let hot: number | null = null;

    const focus = (index: number | null) => {
      if (hot === index) return;
      hot = index;
      chart.classList.toggle("is-hot", index !== null);
      chart.querySelectorAll<SVGGElement>(".mo-group").forEach((g) => {
        g.classList.toggle("on", index !== null && g.dataset.mo === String(index));
      });
      paintHeadStats(index);
    };

    // Delegated on the chart box: renderChart() replaces the whole <svg>, so
    // per-group listeners would have to be re-bound on every repaint.
    on(chart, "pointermove", (e) => {
      const g = (e.target as Element | null)?.closest?.(".mo-group") as HTMLElement | null;
      focus(g?.dataset.mo != null ? Number(g.dataset.mo) : null);
    });
    on(chart, "pointerleave", () => focus(null));
    // A tap on a touch screen lands as pointerdown with no matching leave.
    on(chart, "pointercancel", () => focus(null));
  }

  // ================= MARGIN GAUGE =================
  function renderGauge() {
    const pct = rollup.marginPct;
    const tone = pct >= 35 ? "ok" : pct >= 15 ? "warn" : "bad";
    const color =
      tone === "ok" ? "var(--success)" : tone === "warn" ? "var(--warning)" : "var(--danger)";
    const label = tone === "ok" ? "Healthy" : tone === "warn" ? "Tight" : "Losing money";
    const TARGET = 35;

    // semicircular scale: cx/cy — arc centre, r — mid-line radius
    const cx = 124,
      cy = 134,
      r = 94,
      sw = 18;
    const circ = Math.PI * r;
    const clamped = Math.max(0, Math.min(100, pct));
    const off = circ - (circ * clamped) / 100;
    const arc = "M " + (cx - r) + " " + cy + " A " + r + " " + r + " 0 0 1 " + (cx + r) + " " + cy;

    function pointAt(p: number, dist: number): [number, number] {
      const a = Math.PI - (Math.PI * p) / 100;
      return [cx + Math.cos(a) * dist, cy - Math.sin(a) * dist];
    }
    // ticks every 10% in paper colour + the target mark
    let ticks = "";
    for (let i = 10; i < 100; i += 10) {
      const o = pointAt(i, r + sw / 2),
        inn = pointAt(i, r - sw / 2);
      ticks +=
        '<line class="g-tick" x1="' +
        o[0].toFixed(1) +
        '" y1="' +
        o[1].toFixed(1) +
        '" x2="' +
        inn[0].toFixed(1) +
        '" y2="' +
        inn[1].toFixed(1) +
        '"/>';
    }
    const t1 = pointAt(TARGET, r + sw / 2 + 5),
      t2 = pointAt(TARGET, r - sw / 2 - 3);
    const tl = pointAt(TARGET, r + sw / 2 + 15);

    const gauge = $("#gauge");
    if (gauge)
      gauge.innerHTML =
        '<svg viewBox="0 0 248 168" role="img" aria-label="Profit margin gauge">' +
        '<path class="g-track" style="stroke-width:' +
        sw +
        '" d="' +
        arc +
        '"/>' +
        '<path class="g-fill" style="stroke:' +
        color +
        ";stroke-width:" +
        sw +
        ";stroke-dasharray:" +
        circ.toFixed(1) +
        ";stroke-dashoffset:" +
        off.toFixed(1) +
        '" d="' +
        arc +
        '"/>' +
        ticks +
        '<line class="g-target" x1="' +
        t1[0].toFixed(1) +
        '" y1="' +
        t1[1].toFixed(1) +
        '" x2="' +
        t2[0].toFixed(1) +
        '" y2="' +
        t2[1].toFixed(1) +
        '"/>' +
        '<text class="g-tlbl" x="' +
        tl[0].toFixed(1) +
        '" y="' +
        tl[1].toFixed(1) +
        '" text-anchor="middle">' +
        TARGET +
        "%</text>" +
        '<text class="g-val" x="' +
        cx +
        '" y="' +
        (cy + 2) +
        '" style="fill:' +
        color +
        '">' +
        pct.toFixed(1) +
        "%</text>" +
        '<text class="g-cap" x="' +
        cx +
        '" y="' +
        (cy + 19) +
        '">MARGIN · 30D</text>' +
        '<text class="g-end" x="' +
        (cx - r) +
        '" y="' +
        (cy + 17) +
        '" text-anchor="middle">0%</text>' +
        '<text class="g-end" x="' +
        (cx + r) +
        '" y="' +
        (cy + 17) +
        '" text-anchor="middle">100%</text>' +
        "</svg>";

    const badge = $("#marginTone");
    if (badge) {
      badge.className = "pstatus mt--" + tone;
      badge.textContent = label;
    }
    const foot = $("#gaugeFoot");
    if (foot)
      foot.innerHTML =
        '<div class="gf"><div class="kpi-lbl">Revenue</div><div class="gf-v">' +
        money(rollup.revenue30d) +
        "</div></div>" +
        '<div class="gf"><div class="kpi-lbl">Expenses</div><div class="gf-v">' +
        money(rollup.expenses30d) +
        "</div></div>" +
        '<div class="gf"><div class="kpi-lbl">Profit</div><div class="gf-v tone-' +
        tone +
        '">' +
        money(rollup.profit30d) +
        "</div></div>";
  }

  // ================= STAT CARDS AND ATTENTION =================
  function renderStats() {
    const cards: Array<{
      k: string;
      l: string;
      v: string;
      h: string;
      d?: { txt: string; up: boolean };
    }> = [
      { k: "revenue", l: "Revenue · 30d", v: money(rollup.revenue30d), h: "Paid invoices" },
      { k: "expenses", l: "Expenses · 30d", v: money(rollup.expenses30d), h: "Job-level" },
      {
        k: "profit",
        l: "Profit · 30d",
        v: money(rollup.profit30d),
        h: "Revenue − expenses",
        d: { txt: rollup.marginPct.toFixed(1) + "%", up: rollup.marginPct >= 0 },
      },
      { k: "pipeline", l: "Pipeline value", v: money(rollup.pipelineValue), h: "Open proposals" },
      // The whole point of the Overhead tab, restated where the money is read:
      // a month of profitable jobs can still be a losing month once rent, the
      // truck and the software are paid. Live — the Overhead tab patches this
      // card as the sheet is typed, without a reload.
      {
        k: "overhead",
        l: "After overhead",
        v: signedMoney(overheadLeft),
        h: overheadEmpty ? "No overhead entered yet" : "This month's bills paid",
        // No verdict on an unfilled sheet — "COVERED" against zero bills is a
        // lie the Overhead tab itself refuses to tell.
        d: overheadEmpty ? undefined : { txt: overheadCovered ? "COVERED" : "SHORT", up: overheadCovered },
      },
    ];
    const grid = $("#statGrid");
    if (!grid) return;
    grid.innerHTML = cards
      .map(function (c) {
        return (
          '<div class="stat" data-stat="' +
          c.k +
          '"><div class="kpi-lbl">' +
          c.l +
          "</div>" +
          '<div class="stat-val">' +
          c.v +
          "</div>" +
          (c.d
            ? '<div class="stat-delta ' +
              (c.d.up ? "tone-ok" : "tone-bad") +
              '">' +
              (c.d.up ? "▲" : "▼") +
              " " +
              c.d.txt +
              "</div>"
            : "") +
          '<div class="stat-hint">' +
          c.h +
          "</div></div>"
        );
      })
      .join("");
  }
  /**
   * Rewrite the figures the roll-up owns, in place.
   *
   * NOT renderStats(): rebuilding `#statGrid`'s innerHTML throws away all four
   * cards to change two numbers, which replays their entrance stagger and
   * re-runs the count-up on values that did not move.
   */
  function patchStats() {
    const set = (key: string, text: string) => {
      const el = root.querySelector<HTMLElement>('[data-stat="' + key + '"] .stat-val');
      if (el && el.textContent !== text) el.textContent = text;
    };
    set("overhead", signedMoney(overheadLeft));
    const ohCard = root.querySelector<HTMLElement>('[data-stat="overhead"]');
    if (ohCard) {
      const hint = ohCard.querySelector<HTMLElement>(".stat-hint");
      if (hint) hint.textContent = overheadEmpty ? "No overhead entered yet" : "This month's bills paid";
      let ohDelta = ohCard.querySelector<HTMLElement>(".stat-delta");
      if (overheadEmpty) {
        ohDelta?.remove();
      } else {
        if (!ohDelta) {
          ohDelta = document.createElement("div");
          ohCard.insertBefore(ohDelta, hint);
        }
        ohDelta.className = "stat-delta " + (overheadCovered ? "tone-ok" : "tone-bad");
        ohDelta.textContent = (overheadCovered ? "▲ " : "▼ ") + (overheadCovered ? "COVERED" : "SHORT");
      }
    }
    set("expenses", money(rollup.expenses30d));
    set("profit", money(rollup.profit30d));
    const delta = root.querySelector<HTMLElement>('[data-stat="profit"] .stat-delta');
    if (delta) {
      const up = rollup.marginPct >= 0;
      delta.className = "stat-delta " + (up ? "tone-ok" : "tone-bad");
      delta.textContent = (up ? "▲" : "▼") + " " + rollup.marginPct.toFixed(1) + "%";
    }
  }

  function renderAttention() {
    const rows = [
      {
        label: "Invoices pending",
        count: rollup.invoicesPending,
        hint: rollup.invoicesOverdue > 0 ? rollup.invoicesOverdue + " overdue" : "all current",
        tone: rollup.invoicesOverdue > 0 ? "danger" : "",
        go: "invoices",
      },
      {
        label: "Change orders awaiting",
        count: rollup.changeOrdersPending,
        hint: "DRAFT or SENT",
        tone: rollup.changeOrdersPending > 0 ? "accent" : "",
        go: "orders",
      },
    ];
    const list = $("#attList");
    if (!list) return;
    list.innerHTML = rows
      .map(function (r) {
        return (
          '<li><div><div class="att-t">' +
          r.label +
          '</div><div class="att-h">' +
          r.hint +
          "</div></div>" +
          '<div class="att-r"><span class="att-n ' +
          r.tone +
          '">' +
          r.count +
          "</span>" +
          '<button class="btn btn-ghost btn--sm" type="button" data-goto="' +
          r.go +
          '"><svg class="ic"><use href="#i-arrow"/></svg>Open</button></div></li>'
        );
      })
      .join("");
  }

  // ================= TABLES =================
  /** The job cell is a real destination now — the same link the classic
   *  expenses table used. */
  function jobCell(jobId: string | null, title: string) {
    if (!jobId) return '<div class="fi-title">' + esc(title) + "</div>";
    return (
      '<a class="fi-title fi-link" href="/dashboard/jobs/' +
      esc(jobId) +
      '">' +
      esc(title) +
      "</a>"
    );
  }

  /** One expense row. Extracted so a receipt just saved can be inserted on its
   *  own instead of the whole tbody being rebuilt around it. */
  function expenseRowHtml(e: Expense) {
    return (
      '<tr class="prow" data-exp="' +
      esc(e.id) +
      '">' +
      "<td>" +
      jobCell(e.jobId, e.job) +
      "</td>" +
      '<td><span class="pstatus cat">' +
      esc(e.category) +
      "</span></td>" +
      '<td><span class="fi-note">' +
      (e.note ? esc(e.note) : "—") +
      "</span></td>" +
      '<td><span class="pt-mono">' +
      esc(e.when) +
      "</span></td>" +
      '<td class="num"><span class="pt-money">' +
      money(e.amount) +
      "</span></td>" +
      '<td class="num"><span class="row-act">' +
      // The receipt button used to flash a tick and put itself back (the donor's
      // `data-flash-icon`). It is the stored image now — blob URL when a token
      // is configured, the data URL otherwise — opened in a new tab.
      (safeHref(e.receiptUrl)
        ? '<a class="icon-sq" href="' +
          esc(safeHref(e.receiptUrl) ?? "") +
          '" target="_blank" rel="noreferrer" aria-label="Open receipt"><svg class="ic"><use href="#i-ext"/></svg></a>'
        : "") +
      '<button class="icon-sq danger" type="button" data-act="del-exp" aria-label="Delete expense"><svg class="ic"><use href="#i-trash"/></svg></button>' +
      "</span></td></tr>"
    );
  }

  function renderExpenses() {
    syncExpenseTotals();
    const body = $("#expBody");
    if (body) body.innerHTML = expensesData.map(expenseRowHtml).join("");
  }

  /** The row actions a change order's CURRENT status allows.
   *
   *  Both server actions refuse anything that is not a DRAFT
   *  (`sendChangeOrder`: "Only draft change orders can be sent.";
   *  `deleteChangeOrder`: "Only drafts can be deleted."). The donor offered
   *  Delete on every row, so three rows in four presented a button that could
   *  only ever fail — the classic table showed them on drafts alone, and so
   *  does this. */
  function orderActs(o: ChangeOrder) {
    if (o.status !== "DRAFT") return "";
    return (
      '<button class="icon-sq" type="button" data-act="send-co" aria-label="Send change order"><svg class="ic"><use href="#i-send"/></svg></button>' +
      '<button class="icon-sq danger" type="button" data-act="del-co" aria-label="Delete change order"><svg class="ic"><use href="#i-trash"/></svg></button>'
    );
  }

  function renderOrders() {
    syncOrderTotals();
    const body = $("#coBody");
    if (body)
      body.innerHTML = ordersData
        .map(function (o) {
          return (
            '<tr class="prow" data-co="' +
            esc(o.id) +
            '">' +
            '<td><div class="fi-title">' +
            esc(o.title) +
            "</div></td>" +
            "<td>" +
            (o.jobId
              ? '<a class="fi-note fi-link" href="/dashboard/jobs/' +
                esc(o.jobId) +
                '">' +
                esc(o.job) +
                "</a>"
              : '<span class="fi-note">' + esc(o.job) + "</span>") +
            "</td>" +
            '<td><span class="pstatus co--' +
            lower(o.status) +
            '">' +
            lower(o.status) +
            "</span></td>" +
            '<td><span class="pt-mono">' +
            esc(o.when) +
            "</span></td>" +
            '<td class="num"><span class="pt-money">' +
            (o.amount < 0 ? "−" : "") +
            money(Math.abs(o.amount)) +
            "</span></td>" +
            '<td class="num"><span class="row-act">' +
            orderActs(o) +
            "</span></td></tr>"
          );
        })
        .join("");
  }
  function renderInvoices() {
    const paid = invoicesData
      .filter(function (i) {
        return i.status === "PAID";
      })
      .reduce(function (a, i) {
        return a + i.amount;
      }, 0);
    const totalEl = $("#invTotal");
    if (totalEl)
      totalEl.textContent =
        money(paid) + " collected · " + invoicesData.length + " invoices";
    const body = $("#invBody");
    if (body)
      body.innerHTML = invoicesData
        .map(function (i) {
          return (
            '<tr class="prow">' +
            "<td>" +
            // An invoice is billed off a proposal, so the number opens the
            // contract behind it — the classic invoices table's link.
            (i.proposalId
              ? '<a class="fi-title fi-link" href="/dashboard/proposals/' +
                esc(i.proposalId) +
                '">' +
                esc(i.num) +
                "</a>"
              : '<div class="fi-title">' + esc(i.num) + "</div>") +
            "</td>" +
            '<td><span class="fi-note">' +
            esc(i.client) +
            "</span></td>" +
            '<td><span class="pstatus inv--' +
            lower(i.status) +
            '">' +
            lower(i.status) +
            "</span>" +
            // Pending is not the same problem as pending-and-late; the classic
            // table flagged it and the attention list counts it.
            (i.overdue ? '<span class="inv-late">overdue</span>' : "") +
            "</td>" +
            '<td><span class="pt-mono">' +
            esc(i.provider) +
            "</span></td>" +
            '<td><span class="pt-mono">' +
            esc(i.due) +
            "</span></td>" +
            '<td class="num"><span class="pt-money' +
            (i.status === "PAID" ? " banked" : "") +
            '">' +
            money(i.amount) +
            "</span></td>" +
            "</tr>"
          );
        })
        .join("");
    const empty = $("#invEmpty");
    if (empty) empty.classList.toggle("is-hidden", invoicesData.length !== 0);
  }

  // The Overhead tab boots BEFORE the first render batch: its opening
  // computation is what seeds `overheadLeft`, so the Overview strip's "After
  // overhead" card is correct on first paint rather than a frame later. After
  // that, `onTotals` keeps it live while the sheet is typed.
  disposers.push(
    initOverheadPanel(root, {
      months: options.overheadMonths ?? [],
      sheets: options.overheadSheets ?? {},
      onTotals: (t) => {
        overheadLeft = t.left;
        overheadCovered = t.covered;
        overheadEmpty = t.empty;
        // Nothing to patch until the strip exists; renderStats reads the same
        // two variables when it builds the cards.
        if (root.querySelector('[data-stat="overhead"]')) patchStats();
      },
    }),
  );

  function renderFin() {
    renderChart();
    renderGauge();
    renderStats();
    renderAttention();
    renderExpenses();
    renderOrders();
    renderInvoices();
  }

  // ================= EVENTS =================
  function switchTab(name: string) {
    fin.tab = name;
    $$("#fiTabs .fi-tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.tab === name);
    });
    $$(".ppanel").forEach(function (p) {
      p.classList.toggle("is-hidden", p.dataset.panel !== name);
    });
  }
  const fiTabs = $("#fiTabs");
  if (fiTabs)
    on(fiTabs, "click", function (e) {
      const b = (e.target as Element).closest<HTMLElement>(".fi-tab");
      if (b && !b.classList.contains("active") && b.dataset.tab) switchTab(b.dataset.tab);
    });

  // ================= RECEIPT CAPTURE (real) =================
  // The donor staged a hardcoded "Bothell Building Supply · $1,284.40" the
  // moment you clicked the box — nothing was uploaded and nothing was saved.
  // The whole server side already existed and was simply never called:
  //   scanReceipt({ jobId, dataUrl })        → OCR (returns a stub when OpenAI is off)
  //   saveReceiptExpense({ …, dataUrl, … })  → Vercel Blob upload + JobExpense create
  // Both are org-scoped and manager-gated on the server.

  /** The picked file, held between the scan and the save so the SAME bytes are
   *  the ones uploaded — re-reading the input can miss (the user may have
   *  cleared it) and would upload a different file than the one reviewed. */
  let rcDataUrl: string | null = null;
  let rcFilename = "receipt.jpg";

  function jobOptions(selected: string) {
    if (!jobs.length) {
      return '<option value="">No jobs yet — create one first</option>';
    }
    return jobs
      .map(function (j) {
        return (
          '<option value="' + esc(j.id) + '"' + (j.id === selected ? " selected" : "") + ">" +
          esc(j.title) +
          "</option>"
        );
      })
      .join("");
  }

  function rcNote(msg: string, tone?: "bad") {
    const el = $("#rcNote");
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("is-hidden", !msg);
    el.classList.toggle("rc-note--bad", tone === "bad");
  }

  /** Read the picked file, run it past the OCR, and stage the result for review. */
  async function captureReceipt(file: File) {
    if (!jobs.length) {
      rcNote("A receipt is charged to a job, and this org has none yet.", "bad");
      return;
    }
    if (!/^image\//.test(file.type)) {
      rcNote("That is not an image — receipts upload as JPG, PNG or WebP.", "bad");
      return;
    }
    // 8MB: comfortably above a phone photo, below anything that would stall the
    // vision call or the blob upload.
    if (file.size > 8 * 1024 * 1024) {
      rcNote("That image is over 8MB — try a smaller photo.", "bad");
      return;
    }

    rcFilename = file.name || "receipt.jpg";
    rcNote("Reading the receipt…");
    $("#rcDrop")?.classList.add("is-busy");

    try {
      rcDataUrl = await new Promise<string>(function (resolve, reject) {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ""));
        fr.onerror = () => reject(new Error("Could not read that file"));
        fr.readAsDataURL(file);
      });

      // scanReceipt is job-scoped on the server (it checks the job belongs to
      // the org before spending a vision call), so it needs a job up front. The
      // first live job is the default; the reviewer can change it before saving.
      const res = await scanReceipt({ jobId: jobs[0].id, dataUrl: rcDataUrl });
      if (!res.ok) {
        rcNote(res.error || "Could not read that receipt.", "bad");
        return;
      }
      const ocr = res.ocr;
      fin.staged = {
        vendor: ocr.vendor || "",
        total: Number(ocr.total) || 0,
        category: ocr.category || EXPENSE_CATEGORIES[0],
        job: jobs[0].id,
      };
      rcNote(
        res.disabled
          ? "Vision is off, so these are placeholder values — check every field."
          : "",
      );
      paintStaged();
    } catch (err) {
      console.error("[financials] receipt capture failed:", err);
      rcNote("Could not read that file.", "bad");
    } finally {
      $("#rcDrop")?.classList.remove("is-busy");
    }
  }

  function paintStaged() {
    const staged = fin.staged;
    const box = $("#rcStaged");
    if (!box || !staged) return;
    box.classList.remove("is-hidden");
    box.innerHTML =
      '<div class="kpi-lbl">Staged from receipt — check before saving</div>' +
      '<div class="rc-row" style="margin-top:10px">' +
      '<div><label class="rc-lbl">Vendor</label><input class="rc-in" data-r="vendor" value="' +
      esc(staged.vendor) +
      '"></div>' +
      '<div><label class="rc-lbl">Total</label><input class="rc-in" type="number" step="0.01" min="0" data-r="total" value="' +
      staged.total.toFixed(2) +
      '"></div>' +
      "</div>" +
      '<div class="rc-row">' +
      '<div><label class="rc-lbl">Category</label><span class="bp-sel"><select class="rc-in bp-sel-in" data-r="category">' +
      // The vision model is free to answer with something outside the list; if
      // it does, keep its answer as an option rather than silently re-filing
      // the receipt under whatever happens to be first.
      (EXPENSE_CATEGORIES.indexOf(staged.category) === -1 && staged.category
        ? EXPENSE_CATEGORIES.concat([staged.category])
        : EXPENSE_CATEGORIES
      )
        .map(function (c) {
          return (
            "<option" + (c === staged.category ? " selected" : "") + ">" + esc(c) + "</option>"
          );
        })
        .join("") +
      "</select></span></div>" +
      // The job picker is the whole point of "charge it to a job": its value is
      // a real Job id, and it is what saveReceiptExpense books against.
      '<div><label class="rc-lbl">Charge to job</label><span class="bp-sel"><select class="rc-in bp-sel-in" data-r="job">' +
      jobOptions(staged.job) +
      "</select></span></div>" +
      "</div>" +
      '<div class="rc-act">' +
      '<button class="btn btn-primary btn--sm" type="button" data-act="save-exp"><svg class="ic"><use href="#i-check"/></svg><span data-save-lbl>Save expense</span></button>' +
      '<button class="btn btn-ghost btn--sm" type="button" data-act="discard-exp">Discard</button>' +
      "</div>";
  }

  /**
   * Book the staged receipt against the picked job.
   *
   * Writes for real: `saveReceiptExpense` uploads the image to Vercel Blob when
   * a token is configured (falling back to the data URL otherwise) and creates
   * the JobExpense with its `receiptUrl` — which is what makes the receipt
   * ATTACHED to the job rather than merely mentioned in a note.
   */
  async function saveStagedExpense(btn: HTMLElement) {
    if (savingExpense) return;
    const val = function (f: string) {
      const el = root.querySelector<HTMLInputElement | HTMLSelectElement>('[data-r="' + f + '"]');
      return el ? el.value : "";
    };
    const jobId = val("job");
    const total = parseFloat(val("total"));
    if (!jobId) {
      rcNote("Pick the job this receipt belongs to.", "bad");
      return;
    }
    if (!isFinite(total) || total <= 0) {
      rcNote("Enter the receipt total.", "bad");
      return;
    }
    if (!rcDataUrl) {
      rcNote("The image is gone — upload the receipt again.", "bad");
      return;
    }

    savingExpense = true;
    const lbl = btn.querySelector<HTMLElement>("[data-save-lbl]");
    const idle = lbl?.textContent || "Save expense";
    if (lbl) lbl.textContent = "Saving…";
    btn.classList.add("is-busy");
    rcNote("");

    try {
      const saved = await saveReceiptExpense({
        jobId,
        dataUrl: rcDataUrl,
        filename: rcFilename,
        vendor: val("vendor"),
        total,
        category: val("category"),
        note: null,
        ocrJson: null,
      });
      // Mirror it into the on-screen book so the Expenses tab shows it at once.
      // The id is the DATABASE id the action just created — which is what makes
      // the new row's own Delete button work without a reload; a made-up local
      // id would have been rejected as "Not found".
      const job = jobs.find(function (j) { return j.id === jobId; });
      const entry: Expense = {
        id: saved.id,
        jobId,
        job: job ? job.title : jobId,
        category: val("category"),
        amount: total,
        // saveReceiptExpense stores "Vendor: …" when no note is given; match it
        // so the row reads the same before and after a reload.
        note: val("vendor") ? "Vendor: " + val("vendor") : "",
        when: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit" }),
        receiptUrl: saved.receiptUrl,
      };
      expensesData.unshift(entry);
      rcDataUrl = null;
      fin.staged = null;
      $("#rcStaged")?.classList.add("is-hidden");
      const fileEl = root.querySelector<HTMLInputElement>("#rcFile");
      if (fileEl) fileEl.value = "";

      // ONE row is inserted and staggered in. Re-rendering the tbody would
      // replace every surviving node and replay the whole entrance cascade for
      // the sake of a single new line.
      const body = $("#expBody");
      if (body) {
        body.insertAdjacentHTML("afterbegin", expenseRowHtml(entry));
        const fresh = body.firstElementChild as HTMLElement | null;
        if (fresh) staggerIn([fresh]);
      }
      syncExpenseTotals();
      // The 30-day figures move with it: an expense booked today is inside the
      // window the gauge and the stat strip read.
      rollup.expenses30d += total;
      rollup.profit30d = rollup.revenue30d - rollup.expenses30d;
      rollup.marginPct = rollup.revenue30d > 0 ? (rollup.profit30d / rollup.revenue30d) * 100 : 0;
      patchStats();
      renderGauge();
      switchTab("expenses");
    } catch (err) {
      // The action's messages are written for people ("Not found" when the job
      // is not yours), so show them rather than a generic failure.
      const msg = err instanceof Error && err.message ? err.message : "Could not save that expense.";
      rcNote(msg, "bad");
    } finally {
      savingExpense = false;
      btn.classList.remove("is-busy");
      if (lbl) lbl.textContent = idle;
    }
  }

  // ================= BOOK WRITES (real server actions) =================
  // The donor spliced its in-memory arrays and called that a delete. These are
  // the same actions the classic financials tables call
  // (src/components/financials/{ExpensesTable,ChangeOrdersTable}.tsx): they are
  // org-scoped and manager-gated on the server, `sendChangeOrder` sends the
  // actual approval email, and each one revalidates the classic routes. The
  // on-screen book is patched from the result, so a reload reads it back the
  // same.

  /** A note under a book's head strip — used for a refused write that has no
   *  dialog open to carry it (the change-order Send). */
  function tableNote(which: "exp" | "co", msg: string) {
    const el = $(which === "exp" ? "#expNote" : "#coNote");
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("is-hidden", !msg);
  }

  /** The row whose delete is waiting on the confirmation dialog. */
  let pendingDelete: { kind: "exp" | "co"; id: string; row: HTMLElement } | null = null;
  let deleting = false;

  function confirmErr(msg: string) {
    const el = $("#fiConfirmErr");
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("is-hidden", !msg);
  }

  function askDelete(kind: "exp" | "co", id: string, row: HTMLElement, title: string) {
    const mdl = $("#fiConfirm");
    if (!mdl) return;
    pendingDelete = { kind, id, row };
    confirmErr("");
    const head = $("#fiConfirmTitle");
    const txt = $("#fiConfirmTxt");
    if (kind === "exp") {
      if (head) head.textContent = "Delete this expense?";
      if (txt)
        txt.textContent =
          "“" +
          title +
          "” comes off the job and off the 30-day figures. The receipt image is not recoverable from here.";
    } else {
      if (head) head.textContent = "Delete this draft?";
      if (txt)
        txt.textContent =
          "“" + title + "” has not been sent, so the client never sees it. This cannot be undone.";
    }
    setDeleting(false);
    openMdl(mdl);
  }

  function closeConfirm() {
    const mdl = $("#fiConfirm");
    if (mdl) closeMdl(mdl, after);
    pendingDelete = null;
  }

  /** Button label + disabled state while the delete is on the wire. */
  function setDeleting(on: boolean) {
    deleting = on;
    const btn = root.querySelector<HTMLButtonElement>("#fiConfirmOk");
    if (!btn) return;
    btn.disabled = on;
    btn.classList.toggle("is-busy", on);
    const lbl = btn.querySelector<HTMLElement>("[data-save-lbl]");
    if (lbl) lbl.textContent = on ? "Deleting…" : "Delete";
  }

  async function runDelete() {
    if (deleting || !pendingDelete) return;
    const { kind, id, row } = pendingDelete;
    confirmErr("");
    setDeleting(true);
    try {
      if (kind === "exp") await deleteJobExpense(id);
      else await deleteChangeOrder(id);
    } catch (err) {
      // The row stays exactly where it is: nothing was deleted, and the reason
      // belongs in the dialog the user is still looking at.
      setDeleting(false);
      confirmErr(actionError(err));
      return;
    }
    setDeleting(false);
    pendingDelete = null;
    const mdl = $("#fiConfirm");
    if (mdl) closeMdl(mdl, after);
    // Only now does the row leave — the strike/lift/close beats report a write
    // that has already landed, not one that is being attempted.
    strikeRowOut(row, () => {
      if (kind === "exp") {
        expensesData = expensesData.filter(function (x) {
          return x.id !== id;
        });
        // Totals and the empty state only — NOT renderExpenses(). A full tbody
        // rebuild is what made every surviving row re-animate, which is exactly
        // what buried the one row that actually left.
        syncExpenseTotals();
      } else {
        ordersData = ordersData.filter(function (x) {
          return x.id !== id;
        });
        syncOrderTotals();
      }
    });
  }

  /** Send a DRAFT change order. On success only the ONE row is repainted — the
   *  status pill flips and the two draft-only buttons go, because they no
   *  longer apply. */
  async function sendOrder(btn: HTMLElement, row: HTMLElement, id: string) {
    if (row.dataset.busy) return;
    const o = ordersData.find(function (x) {
      return x.id === id;
    });
    if (!o) return;
    row.dataset.busy = "1";
    tableNote("co", "");
    try {
      await sendChangeOrder(id);
    } catch (err) {
      delete row.dataset.busy;
      tableNote("co", actionError(err));
      return;
    }
    o.status = "SENT";
    delete row.dataset.busy;
    const pill = row.querySelector<HTMLElement>(".pstatus");
    if (pill) {
      pill.className = "pstatus co--sent";
      pill.textContent = "sent";
    }
    const acts = btn.closest<HTMLElement>(".row-act");
    if (acts) acts.innerHTML = orderActs(o);
    syncOrderTotals();
  }

  on(root, "click", function (e) {
    const target = e.target as Element;
    if (target.closest("[data-mdl-close]")) {
      if (!deleting) closeConfirm();
      return;
    }
    const goto = target.closest<HTMLElement>("[data-goto]");
    if (goto) {
      if (goto.dataset.goto) switchTab(goto.dataset.goto);
      return;
    }
    if (target.closest("#rcDrop")) {
      root.querySelector<HTMLInputElement>("#rcFile")?.click();
      return;
    }
    if (target.closest("#fiConfirmOk")) {
      void runDelete();
      return;
    }
    const act = target.closest<HTMLElement>("[data-act]");
    if (!act) return;
    const kind = act.dataset.act;

    if (kind === "save-exp") {
      void saveStagedExpense(act);
      return;
    }
    if (kind === "discard-exp") {
      $("#rcStaged")?.classList.add("is-hidden");
      fin.staged = null;
      return;
    }
    if (kind === "del-exp") {
      const row = act.closest<HTMLElement>("[data-exp]");
      const id = row?.dataset.exp;
      if (!row || !id) return;
      const entry = expensesData.find(function (x) {
        return x.id === id;
      });
      askDelete("exp", id, row, entry ? entry.job : "This expense");
      return;
    }
    if (kind === "send-co") {
      const row = act.closest<HTMLElement>("[data-co]");
      const id = row?.dataset.co;
      if (!row || !id) return;
      void sendOrder(act, row, id);
      return;
    }
    if (kind === "del-co") {
      const row = act.closest<HTMLElement>("[data-co]");
      const id = row?.dataset.co;
      if (!row || !id) return;
      const entry = ordersData.find(function (x) {
        return x.id === id;
      });
      askDelete("co", id, row, entry ? entry.title : "This change order");
      return;
    }
  });

  // Escape closes the confirmation, the way every other blueprint dialog does —
  // but not while the delete is in flight, or the user would be left unsure
  // whether it went through.
  on(document, "keydown", function (e) {
    if ((e as KeyboardEvent).key !== "Escape") return;
    if (deleting) return;
    if ($("#fiConfirm")?.classList.contains("open")) closeConfirm();
  });

  // ================= TARGETED ROW REMOVAL =================
  // Deleting a row used to mean "mutate the array, re-render the tbody" — and
  // the tbody's MutationObserver then replayed the 45ms-per-row entrance
  // stagger across every REMAINING row. So a delete looked like the whole
  // ledger animating, with no signal at all about which line had gone.
  //
  // The row now leaves on its own, in three legible beats, and nothing else
  // moves except to close the gap:
  //   1. STRIKE (240ms) — the row is struck through in danger red over a danger
  //      wash and nudged out of its column, the way a line is voided on a paper
  //      ledger. This is the beat that identifies WHICH row is going.
  //   2. LIFT   (150ms) — it fades and slides out to the left.
  //   3. CLOSE  (260ms) — the rows below FLIP up into the space instead of
  //      snapping, so the eye can follow where the gap went.
  //
  // Beats 1–2 keep the row in the layout, so nothing below it moves until the
  // row is actually gone: ~390ms to read the void, then the list settles.
  const ROW_STRIKE_MS = 240;
  const ROW_LIFT_MS = 150;
  const ROW_CLOSE_MS = 260;

  /** FLUID SCALE zooms the document, so `getBoundingClientRect` returns ZOOMED
   *  pixels while `transform: translateY()` is applied in the element's own
   *  unzoomed space. Every measured delta has to be divided by this. */
  function currentZoom(): number {
    // The SHELL ROOT, not documentElement: FLUID SCALE moved zoom onto the shell
    // root so it could not leak into the rest of the app, and documentElement
    // has reported `normal` ever since — which made this silently return 1 and
    // left every FLIP delta below un-corrected at any width but 1728px.
    const host = root.closest<HTMLElement>(".jf-blueprint") ?? document.documentElement;
    const z = parseFloat(getComputedStyle(host).zoom);
    return isFinite(z) && z > 0 ? z : 1;
  }

  function strikeRowOut(row: HTMLElement, commit: () => void) {
    if (row.dataset.leaving) return;
    row.dataset.leaving = "1";

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      row.remove();
      commit();
      return;
    }

    // The row is mid-flight: nothing about it should still respond to input.
    row.classList.add("prow--strike");
    row.querySelectorAll<HTMLButtonElement>("button").forEach((b) => (b.disabled = true));

    after(ROW_STRIKE_MS, () => {
      if (!row.isConnected) return;
      // Measure the followers BEFORE the row leaves the layout.
      const followers: HTMLElement[] = [];
      let next = row.nextElementSibling;
      while (next) {
        followers.push(next as HTMLElement);
        next = next.nextElementSibling;
      }
      const beforeTop = followers.map((el) => el.getBoundingClientRect().top);

      row.classList.add("prow--lift");
      after(ROW_LIFT_MS, () => {
        const zoom = currentZoom();
        row.remove();
        commit();

        followers.forEach((el, i) => {
          const dy = (beforeTop[i] - el.getBoundingClientRect().top) / zoom;
          if (Math.abs(dy) < 0.5) return;
          el.style.transition = "none";
          el.style.transform = "translateY(" + dy + "px)";
          requestAnimationFrame(() => {
            el.style.transition = "transform " + ROW_CLOSE_MS + "ms cubic-bezier(0.22,0.61,0.36,1)";
            el.style.transform = "";
          });
          // Inline styles must come off, or `transform: none` outranks the
          // stylesheet's :hover lift and the row silently stops reacting.
          el.addEventListener("transitionend", function te(e) {
            if (e.propertyName !== "transform") return;
            el.style.transition = "";
            el.style.transform = "";
            el.removeEventListener("transitionend", te);
          });
        });
      });
    });
  }

  /** The parts of renderExpenses that are NOT the row markup. */
  function syncExpenseTotals() {
    const total = expensesData.reduce(function (a, e) {
      return a + e.amount;
    }, 0);
    const totalEl = $("#expTotal");
    if (totalEl) totalEl.textContent = money(total) + " · " + expensesData.length + " items";
    const empty = $("#expEmpty");
    if (empty) empty.classList.toggle("is-hidden", expensesData.length !== 0);
  }

  /** The parts of renderOrders that are NOT the row markup. */
  function syncOrderTotals() {
    const total = ordersData.reduce(function (a, o) {
      return a + o.amount;
    }, 0);
    const totalEl = $("#coTotal");
    if (totalEl) totalEl.textContent = money(total) + " · " + ordersData.length + " orders";
    const empty = $("#coEmpty");
    if (empty) empty.classList.toggle("is-hidden", ordersData.length !== 0);
  }

  const rcDrop = $("#rcDrop");
  if (rcDrop) {
    (["dragenter", "dragover"] as const).forEach(function (ev) {
      on(rcDrop, ev, function (e) {
        e.preventDefault();
        rcDrop.classList.add("over");
      });
    });
    (["dragleave"] as const).forEach(function (ev) {
      on(rcDrop, ev, function (e) {
        e.preventDefault();
        rcDrop.classList.remove("over");
      });
    });
    on(rcDrop, "drop", function (e) {
      e.preventDefault();
      rcDrop.classList.remove("over");
      // A real file now, not a hardcoded fixture.
      const file = (e as DragEvent).dataTransfer?.files?.[0];
      if (file) void captureReceipt(file);
      else rcNote("Drop an image file.", "bad");
    });
  }

  // Clicking the zone opens the file picker; picking a file runs the same
  // capture path a drop does, so the two can never diverge.
  const rcFile = root.querySelector<HTMLInputElement>("#rcFile");
  if (rcFile) {
    on(rcFile, "change", function () {
      const file = rcFile.files?.[0];
      if (file) void captureReceipt(file);
    });
  }

  // ================= INITIALIZATION =================
  renderFin();
  // Delegated, so it survives every renderChart() repaint.
  wireChartHover();

  // The mobile nav drawer and FLUID SCALE belong to the persistent chrome and
  // live in components/v3/blueprint-shell/shell-behavior.ts.

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Reveal: load + scroll. The reveal adapts to scroll speed: slow scroll —
    // full 420ms animation; fast — shorter (down to 200ms): never lagging, but
    // still visible.
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
    // `:not(.mdl)` — the confirmation dialog is rendered inside `.content` (it
    // is position:fixed, so layout is unaffected), and the donor's block
    // cascade must keep the same member set, and therefore the same i*60ms
    // indices, that it had before the dialog existed. Same treatment as the
    // Workers dialogs.
    const blocks = $$(".content > *:not(.mdl)");
    blocks.forEach((el, i) => {
      el.classList.add("rv");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? i * 60 + "ms" : "200ms";
    });
    // Second layer of the arrival — Overview cascades its `.kpi` strip here.
    // This page has no `.kpi`, so the layer was silently absent; its equivalent
    // small units are the section cards (`.stat` already staggers through
    // staggerIn below, so it stays out of this). Skip anything the block
    // cascade claimed: no element should carry `rv` and `rv-cell` at once.
    const cells = $$(".fi-card").filter((el) => !el.classList.contains("rv"));
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

    // Row stagger — played ONCE, here, because this is the only moment the
    // books genuinely arrive.
    //
    // This used to be a MutationObserver on each tbody with `{childList:true}`.
    // It fired on ANY change, so a single-row delete replayed the 45ms-per-row
    // entrance across every survivor and buried the one line that had actually
    // gone. Everything that changes a list after load now patches its own node
    // (see patchStats, sendOrder, strikeRowOut) or staggers exactly the row it
    // inserted (saveStagedExpense) — see blueprint-shell/list-motion.
    ["statGrid", "expBody", "coBody", "invBody"].forEach((id) => {
      const list = $("#" + id);
      if (!list) return;
      staggerIn(Array.from(list.querySelectorAll<HTMLElement>(".prow, .stat")));
    });

    // Numeral count-up — Overview's `.kpi-val`; here the stat grid and the
    // collection gauge. The donor rebuilt the text from digits alone, safe only
    // for its own plain "$12,400"/"18": it drops any trailing unit — which
    // matters here, where the gauge reads "68%" — and would wipe an inline
    // icon. So keep whatever frames the number, skip decimals (digits-only
    // mangles them), and skip nodes holding elements rather than bare text.
    $$(".stat-val, .g-val").forEach((el) => {
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
      ".btn, .card-foot-btn, .ptab, .pchip, .pager-btn, .pmenu-item, .photo-box, .pt-open, .fi-tab, .icon-sq, .mdl-x",
      "pressed",
    );
    pressify(".week-strip .day", "day-pressed");

    // (Graph-paper parallax lives in the shell — it owns .main.)
  })();

  // The sliding sidebar indicator lives in the shell — it survives navigation
  // and re-points at whichever item React marks `active`.

  return () => {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    disposers.forEach((d) => d());
  };
}
