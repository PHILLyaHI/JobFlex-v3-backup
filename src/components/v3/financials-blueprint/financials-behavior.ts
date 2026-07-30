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

import {
  MONTHLY,
  ROLLUP,
  EXPENSE_CATEGORIES,
  STAGE_JOBS,
  EXPENSES_SEED,
  ORDERS_SEED,
  INVOICES,
  EXP_SEQ_START,
  type Expense,
  type ChangeOrder,
} from "./financials-data";

type Staged = { vendor: string; total: number; category: string; job: string };

export function initFinancialsContent(content: HTMLElement): () => void {
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

  // Runtime mutations (save / delete / send) — clone the seeds per mount so a
  // remount starts from the donor's load-time state.
  let expensesData: Expense[] = EXPENSES_SEED.map((e) => ({ ...e }));
  let ordersData: ChangeOrder[] = ORDERS_SEED.map((o) => ({ ...o }));
  const invoicesData = INVOICES;
  const monthly = MONTHLY;
  const rollup = ROLLUP;
  let expSeq = EXP_SEQ_START;

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

  const fin: { tab: string; staged: Staged | null } = { tab: "overview", staged: null };

  function money(n: number) {
    return "$" + Math.round(n).toLocaleString("en-US");
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
    const max = Math.max.apply(
      null,
      monthly.map(function (m) {
        return Math.max(m.revenue, m.expenses);
      }),
    );
    const step = Math.ceil(max / 4 / 10000) * 10000;
    const top = step * 4;
    const iw = W - padL - padR,
      ih = H - padT - padB;
    const gw = iw / monthly.length;
    const bw = Math.min(13, (gw - 8) / 2);
    const base = padT + ih;

    let svg =
      '<svg viewBox="0 0 ' +
      W +
      " " +
      H +
      '" role="img" aria-label="Revenue versus expenses by month">' +
      '<defs><pattern id="hatchExp" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="5" height="5" fill="var(--warning-soft)"/>' +
      '<line x1="0" y1="0" x2="0" y2="5" stroke="var(--warning)" stroke-width="2.6"/></pattern></defs>';

    // grid and scale
    for (let i = 0; i <= 4; i++) {
      const y = base - (ih * i) / 4;
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
        shortMoney(step * i) +
        "</text>";
    }

    const pts: Array<[number, number]> = [];
    monthly.forEach(function (m, i) {
      const x = padL + gw * i;
      const cx = x + gw / 2;
      const rh = (m.revenue / top) * ih,
        eh = (m.expenses / top) * ih;
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
      pts.push([cx, base - ((m.revenue - m.expenses) / top) * ih]);
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
    const chart = $("#revChart");
    if (chart) chart.innerHTML = svg;

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
      l: string;
      v: string;
      h: string;
      d?: { txt: string; up: boolean };
    }> = [
      { l: "Revenue · 30d", v: money(rollup.revenue30d), h: "Paid invoices" },
      { l: "Expenses · 30d", v: money(rollup.expenses30d), h: "Job-level" },
      {
        l: "Profit · 30d",
        v: money(rollup.profit30d),
        h: "Revenue − expenses",
        d: { txt: rollup.marginPct.toFixed(1) + "%", up: rollup.marginPct >= 0 },
      },
      { l: "Pipeline value", v: money(rollup.pipelineValue), h: "Open proposals" },
    ];
    const grid = $("#statGrid");
    if (!grid) return;
    grid.innerHTML = cards
      .map(function (c) {
        return (
          '<div class="stat"><div class="kpi-lbl">' +
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
  function renderExpenses() {
    const total = expensesData.reduce(function (a, e) {
      return a + e.amount;
    }, 0);
    const totalEl = $("#expTotal");
    if (totalEl) totalEl.textContent = money(total) + " · " + expensesData.length + " items";
    const body = $("#expBody");
    if (body)
      body.innerHTML = expensesData
        .map(function (e) {
          return (
            '<tr class="prow" data-exp="' +
            e.id +
            '">' +
            '<td><div class="fi-title">' +
            e.job +
            "</div></td>" +
            '<td><span class="pstatus cat">' +
            e.category +
            "</span></td>" +
            '<td><span class="fi-note">' +
            (e.note || "—") +
            "</span></td>" +
            '<td><span class="pt-mono">' +
            e.when +
            "</span></td>" +
            '<td class="num"><span class="pt-money">' +
            money(e.amount) +
            "</span></td>" +
            '<td class="num"><span class="row-act">' +
            (e.receipt
              ? '<button class="icon-sq" type="button" data-flash-icon aria-label="Open receipt"><svg class="ic"><use href="#i-ext"/></svg></button>'
              : "") +
            '<button class="icon-sq danger" type="button" data-act="del-exp" aria-label="Delete expense"><svg class="ic"><use href="#i-trash"/></svg></button>' +
            "</span></td></tr>"
          );
        })
        .join("");
    const empty = $("#expEmpty");
    if (empty) empty.classList.toggle("is-hidden", expensesData.length !== 0);
  }
  function renderOrders() {
    const total = ordersData.reduce(function (a, o) {
      return a + o.amount;
    }, 0);
    const totalEl = $("#coTotal");
    if (totalEl) totalEl.textContent = money(total) + " · " + ordersData.length + " orders";
    const body = $("#coBody");
    if (body)
      body.innerHTML = ordersData
        .map(function (o) {
          return (
            '<tr class="prow" data-co="' +
            o.id +
            '">' +
            '<td><div class="fi-title">' +
            o.title +
            "</div></td>" +
            '<td><span class="fi-note">' +
            o.job +
            "</span></td>" +
            '<td><span class="pstatus co--' +
            lower(o.status) +
            '">' +
            lower(o.status) +
            "</span></td>" +
            '<td><span class="pt-mono">' +
            o.when +
            "</span></td>" +
            '<td class="num"><span class="pt-money">' +
            money(o.amount) +
            "</span></td>" +
            '<td class="num"><span class="row-act">' +
            (o.status === "DRAFT"
              ? '<button class="icon-sq" type="button" data-act="send-co" aria-label="Send"><svg class="ic"><use href="#i-send"/></svg></button>'
              : "") +
            '<button class="icon-sq danger" type="button" data-act="del-co" aria-label="Delete"><svg class="ic"><use href="#i-trash"/></svg></button>' +
            "</span></td></tr>"
          );
        })
        .join("");
    const empty = $("#coEmpty");
    if (empty) empty.classList.toggle("is-hidden", ordersData.length !== 0);
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
            '<td><div class="fi-title">' +
            i.num +
            "</div></td>" +
            '<td><span class="fi-note">' +
            i.client +
            "</span></td>" +
            '<td><span class="pstatus inv--' +
            lower(i.status) +
            '">' +
            lower(i.status) +
            "</span></td>" +
            '<td><span class="pt-mono">' +
            i.provider +
            "</span></td>" +
            '<td><span class="pt-mono">' +
            i.due +
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

  // receipt recognition: fill in the parsed fields for review
  function stageReceipt() {
    const staged: Staged = {
      vendor: "Bothell Building Supply",
      total: 1284.4,
      category: "Materials",
      job: expensesData[0].job,
    };
    fin.staged = staged;
    const box = $("#rcStaged");
    if (!box) return;
    box.classList.remove("is-hidden");
    box.innerHTML =
      '<div class="kpi-lbl">Staged from receipt — check before saving</div>' +
      '<div class="rc-row" style="margin-top:10px">' +
      '<div><label class="rc-lbl">Vendor</label><input class="rc-in" data-r="vendor" value="' +
      staged.vendor +
      '"></div>' +
      '<div><label class="rc-lbl">Total</label><input class="rc-in" data-r="total" value="' +
      staged.total.toFixed(2) +
      '"></div>' +
      "</div>" +
      '<div class="rc-row">' +
      '<div><label class="rc-lbl">Category</label><select class="rc-in" data-r="category">' +
      EXPENSE_CATEGORIES.map(function (c) {
        return "<option" + (c === staged.category ? " selected" : "") + ">" + c + "</option>";
      }).join("") +
      "</select></div>" +
      '<div><label class="rc-lbl">Job</label><select class="rc-in" data-r="job">' +
      STAGE_JOBS.map(function (j) {
        return "<option>" + j + "</option>";
      }).join("") +
      "</select></div>" +
      "</div>" +
      '<div class="rc-act">' +
      '<button class="btn btn-primary btn--sm" type="button" data-act="save-exp"><svg class="ic"><use href="#i-check"/></svg>Save expense</button>' +
      '<button class="btn btn-ghost btn--sm" type="button" data-act="discard-exp">Discard</button>' +
      "</div>";
  }

  on(root, "click", function (e) {
    const target = e.target as Element;
    const goto = target.closest<HTMLElement>("[data-goto]");
    if (goto) {
      if (goto.dataset.goto) switchTab(goto.dataset.goto);
      return;
    }
    if (target.closest("#rcDrop")) {
      stageReceipt();
      return;
    }
    const iconFlash = target.closest<HTMLElement>("[data-flash-icon]");
    if (iconFlash && !iconFlash.dataset.busy) {
      iconFlash.dataset.busy = "1";
      const html = iconFlash.innerHTML;
      iconFlash.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>';
      const t = setTimeout(function () {
        timers.delete(t);
        iconFlash.innerHTML = html;
        delete iconFlash.dataset.busy;
      }, 1200);
      timers.add(t);
      return;
    }
    const act = target.closest<HTMLElement>("[data-act]");
    if (!act) return;
    const kind = act.dataset.act;

    if (kind === "save-exp") {
      const val = function (f: string) {
        const el = root.querySelector<HTMLInputElement | HTMLSelectElement>('[data-r="' + f + '"]');
        return el ? el.value : "";
      };
      expSeq += 1;
      expensesData.unshift({
        id: "x" + expSeq,
        job: val("job"),
        category: val("category"),
        amount: parseFloat(val("total")) || 0,
        note: val("vendor"),
        when: "Jul 22",
        receipt: true,
      });
      $("#rcStaged")?.classList.add("is-hidden");
      fin.staged = null;
      renderExpenses();
      switchTab("expenses");
      return;
    }
    if (kind === "discard-exp") {
      $("#rcStaged")?.classList.add("is-hidden");
      fin.staged = null;
      return;
    }
    if (kind === "del-exp") {
      const row = act.closest<HTMLElement>("[data-exp]");
      if (!row) return;
      const id = row.dataset.exp;
      strikeRowOut(row, () => {
        expensesData = expensesData.filter(function (x) {
          return x.id !== id;
        });
        // Totals and the empty state only — NOT renderExpenses(). A full tbody
        // rebuild is what made every surviving row re-animate, which is exactly
        // what buried the one row that actually left.
        syncExpenseTotals();
      });
      return;
    }
    if (kind === "send-co") {
      const row = act.closest<HTMLElement>("[data-co]");
      if (!row) return;
      const o = ordersData.find(function (x) {
        return x.id === row.dataset.co;
      });
      if (o) o.status = "SENT";
      renderOrders();
      return;
    }
    if (kind === "del-co") {
      const row = act.closest<HTMLElement>("[data-co]");
      if (!row) return;
      const id = row.dataset.co;
      strikeRowOut(row, () => {
        ordersData = ordersData.filter(function (x) {
          return x.id !== id;
        });
        syncOrderTotals();
      });
      return;
    }
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
    const raw = getComputedStyle(document.documentElement).zoom;
    const z = parseFloat(raw);
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
      stageReceipt();
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
    const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

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
    const blocks = $$(".content > *");
    blocks.forEach((el, i) => {
      el.classList.add("rv");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? i * 60 + "ms" : "200ms";
    });
    // Second layer of the arrival — Overview cascades its `.kpi` strip here.
    // This page has no `.kpi`, so the layer was silently absent; its equivalent
    // small units are the section cards (`.stat` already staggers through
    // animateRows below, so it stays out of this). Skip anything the block
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

    // Row stagger on list (re)render.
    //
    // Only rows that have never been staggered are animated. The observer fires
    // on ANY childList change, so a surgical single-row removal (see
    // strikeRowOut) used to replay the entrance cascade across every survivor —
    // which is what made a delete look like the whole table redrawing and hid
    // which line had actually gone. A full `innerHTML` re-render produces fresh
    // unflagged nodes, so genuine repaints still cascade as authored.
    function animateRows(list: HTMLElement) {
      const rows = Array.from(list.querySelectorAll<HTMLElement>(".prow, .stat")).filter(
        (r) => !r.dataset.rvRow,
      );
      rows.forEach((r, i) => {
        r.dataset.rvRow = "1";
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
        // so hover lift on rows and stat cells silently stops working.
        r.addEventListener("transitionend", function te(e) {
          if (e.propertyName !== "transform") return;
          r.style.opacity = "";
          r.style.transform = "";
          r.style.transition = "";
          r.removeEventListener("transitionend", te);
        });
      });
    }
    ["statGrid", "expBody", "invBody"].forEach((id) => {
      const list = $("#" + id);
      if (!list) return;
      animateRows(list);
      const mo = new MutationObserver(() => animateRows(list));
      mo.observe(list, { childList: true });
      disposers.push(() => mo.disconnect());
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
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    disposers.forEach((d) => d());
  };
}
