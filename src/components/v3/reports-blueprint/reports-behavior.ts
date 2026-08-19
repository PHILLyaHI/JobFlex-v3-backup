// Reports blueprint — runtime behaviors, ported verbatim from the donor file's
// <script> (jobflex-reports-blueprint.html). Every duration, easing, stagger,
// geometry constant and formula is the donor's exact value, and every HTML
// string the page injects is character-for-character the donor's.
//
// Adaptations are mechanical only:
// - queries are scoped to the mounted `.content` root instead of `document`;
// - document listeners, timers, animation frames and observers are tracked for
//   unmount cleanup;
// - the donor's shell-owned modules are NOT ported here — the mobile nav
//   drawer, FLUID SCALE (zoom + --app-h + eff-* classes), the sidebar entry
//   cascade, the sliding sidebar indicator, the topbar/search controls and the
//   graph-paper parallax all live in
//   components/v3/blueprint-shell/shell-behavior.ts;
// - the donor's `safe(name, fn)` try/catch wrapper and its `window.matchMedia`
//   polyfill are environment shims, not behavior, and are dropped (the app
//   always runs in a browser that has matchMedia).

import { closeMdl, openMdl } from "@/components/v3/blueprint-shell/mdl-motion";
import { staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import { toCsv } from "@/lib/csv";
import {
  FIXTURE_ROLLUP,
  FORMATS,
  type RangeKey,
  type ReportsRollup,
} from "./reports-data";

export type ReportsContentOptions = {
  /** The org's real aggregates, read server-side with getReportsRollup(). Omit
   *  to fall back to the donor fixture (the standalone mock routes have no
   *  session to read from). */
  rollup?: ReportsRollup;
};

export function initReportsContent(
  content: HTMLElement,
  options: ReportsContentOptions = {},
): () => void {
  // Scoped to `.content`, which the shared shell owns and re-fills on every
  // navigation. `.main` lives in the shell, above this element.
  const root = content;
  const main = content.closest<HTMLElement>(".main");
  const disposers: Array<() => void> = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const frames = new Set<number>();

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
  /** requestAnimationFrame, tracked so a pending frame cannot outlive the page. */
  const raf = (fn: FrameRequestCallback) => {
    const id = requestAnimationFrame((t) => {
      frames.delete(id);
      fn(t);
    });
    frames.add(id);
    return id;
  };
  /**
   * setTimeout, tracked so a pending timer cannot outlive the page. The export
   * dialog's exit animation runs on one of these, so an unmount mid-close must
   * not fire the class cleanup into a detached tree. The returned cleanup
   * drains `timers`.
   */
  const after = (ms: number, fn: () => void) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
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
      raf(() =>
        raf(() => {
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

  // ================= REPORTS: STATE =================
  // The sheet's numbers: the org's real aggregates when the page supplies them
  // (src/app/dashboard/reports), the donor fixture otherwise. All four ranges
  // are computed server-side in one pass, so switching a range chip is a pure
  // repaint — no round trip, nothing to load.
  const data = options.rollup ?? FIXTURE_ROLLUP;
  // Only the two selections are per mount, which is what the donor's
  // module-level `rp` amounted to on a fresh page load.
  const rp: { range: RangeKey; format: string } = { range: "q", format: "csv" };

  function money(n: number) {
    return "$" + Math.round(n).toLocaleString("en-US");
  }
  function shortMoney(n: number) {
    // The donor's axis only ever saw $10k multiples. A real org's first months
    // land in the hundreds, where `Math.round(n/1000)+"k"` collapses every
    // gridline to "$0k" — so keep one decimal until the ticks are whole k.
    if (n >= 1000) {
      const k = n / 1000;
      return "$" + (k >= 10 || Number.isInteger(k) ? Math.round(k) : k.toFixed(1)) + "k";
    }
    return "$" + Math.round(n);
  }
  /** A 1 / 2 / 2.5 / 5 × 10ⁿ gridline step, so the axis fits the org's actual
   *  numbers instead of the donor's hardcoded $10k ladder. */
  function niceStep(v: number) {
    if (!isFinite(v) || v <= 0) return 100;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return m * mag;
  }
  function initials(n: string) {
    // Real display names can be a single word, or (briefly, mid-invite) empty —
    // the donor's `p[0][0]` would throw on the latter.
    const p = n.trim().split(/\s+/).filter(Boolean);
    if (!p.length) return "–";
    return ((p[0][0] ?? "") + (p[1] ? p[1][0] : "")).toUpperCase();
  }
  /** Text is injected as HTML strings (donor architecture), so every value that
   *  can come from the database has to be escaped on the way in. */
  function esc(s: string) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function months() {
    const n = Math.min(data.months.length, Math.max(1, data.rangeMonths[rp.range]));
    return data.months.slice(data.months.length - n);
  }
  function crewRows() {
    return data.crew[rp.range] ?? [];
  }

  // ================= RENDER =================
  function renderRanges() {
    const host = $("#ranges");
    if (host)
      host.innerHTML = data.ranges.map(function (r) {
        return (
          '<button class="range' +
          (rp.range === r.key ? " on" : "") +
          '" type="button" data-r="' +
          r.key +
          '">' +
          r.label +
          "</button>"
        );
      }).join("");
    const cur = data.ranges.find(function (r) {
      return r.key === rp.range;
    });
    const note = $("#rangeNote");
    // `cur` is always found — `rp.range` is only ever one of the four keys.
    if (note && cur) note.textContent = cur.note;
  }
  function renderSummary() {
    const host = $("#summary");
    if (!host) return;
    const ms = months();
    const collected = ms.reduce(function (a, m) {
      return a + m.collected;
    }, 0);
    const invoiced = ms.reduce(function (a, m) {
      return a + m.invoiced;
    }, 0);
    const f = data.funnel[rp.range];
    const jobs = f[3][1];
    const win = f[1][1] ? (f[2][1] / f[1][1]) * 100 : 0;
    const avg = jobs ? collected / jobs : 0;
    const outstanding = invoiced - collected;
    // A real org can have nothing invoiced in a range; the donor's bare
    // `collected / invoiced` printed NaN% there.
    const collectedPct = invoiced ? Math.round((collected / invoiced) * 100) : 0;
    host.innerHTML =
      '<div class="stat"><div class="kpi-lbl">Collected</div><div class="stat-val accent">' +
      money(collected) +
      "</div>" +
      '<div class="stat-delta up">▲ ' +
      collectedPct +
      "% of invoiced</div></div>" +
      '<div class="stat"><div class="kpi-lbl">Outstanding</div><div class="stat-val">' +
      money(outstanding) +
      "</div>" +
      '<div class="stat-hint">Invoiced, not yet paid</div></div>' +
      '<div class="stat"><div class="kpi-lbl">Jobs completed</div><div class="stat-val">' +
      jobs +
      "</div>" +
      '<div class="stat-hint">In this range</div></div>' +
      '<div class="stat"><div class="kpi-lbl">Win rate</div><div class="stat-val">' +
      win.toFixed(0) +
      "%</div>" +
      '<div class="stat-hint">Avg job ' +
      money(avg) +
      "</div></div>";
  }
  function renderChart() {
    const host = $("#revChart");
    if (!host) return;
    const ms = months();
    // The chart is one SVG scaled by `.rp-chart svg { width: 100%; height: auto }`,
    // so the viewBox is not a pixel size — it is the chart's ASPECT RATIO plus
    // the scale factor that every unit inside it (bar widths, `.axis-txt`'s
    // 8.5px, the 42-unit y-gutter) gets multiplied by on screen.
    //
    // The donor's 660×220 was drawn for a card spanning the whole `.content`
    // column (~950px of SVG once `.rp-chart`'s 18px sides are removed), i.e. a
    // ~1.44× scale. In the 70% column of `.rp-split` that same box only gets
    // ~645px, which would drop the scale to ~0.98 — the plot would lose a third
    // of its height and the axis labels would render at ~8px, unreadable.
    //
    // Narrowing the viewBox to 450 restores the donor's on-screen scale
    // (645 / 450 ≈ 1.43): identical rendered height (~315px) and identical
    // rendered type size, on a 2:1 box that suits the narrower column. Height
    // and paddings are the donor's, untouched. The `bw` cap below now binds on
    // every range except 12-month, where bars land ~17px instead of ~23px —
    // correct for the densest view in the narrowest card.
    const W = 450,
      H = 220,
      padL = 42,
      padR = 10,
      padT = 12,
      padB = 26;
    // The taller of the two series sets the ceiling — with real data a month
    // can collect more than it invoiced (last month's invoice paid this month),
    // and the donor's invoiced-only max clipped that bar off the top.
    const max = ms.reduce(function (a, m) {
      return Math.max(a, m.invoiced, m.collected);
    }, 0);
    const step = niceStep(max / 4);
    const top = step * 4;
    const iw = W - padL - padR,
      ih = H - padT - padB;
    const gw = iw / ms.length;
    const bw = Math.min(16, (gw - 10) / 2);
    const base = padT + ih;

    let svg =
      '<svg viewBox="0 0 ' +
      W +
      " " +
      H +
      '" role="img" aria-label="Revenue by month">' +
      '<defs><pattern id="hatchInv" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="5" height="5" fill="var(--paper-deep)"/>' +
      '<line x1="0" y1="0" x2="0" y2="5" stroke="var(--muted-light)" stroke-width="2.4"/></pattern></defs>';
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
    ms.forEach(function (m, i) {
      const x = padL + gw * i,
        cx = x + gw / 2;
      const ih1 = (m.invoiced / top) * ih,
        ch = (m.collected / top) * ih;
      svg +=
        '<g class="mo-g">' +
        '<rect class="mo-hit" x="' +
        x +
        '" y="' +
        padT +
        '" width="' +
        gw +
        '" height="' +
        ih +
        '"/>' +
        '<rect class="bar-inv" x="' +
        (cx - bw - 1) +
        '" y="' +
        (base - ih1) +
        '" width="' +
        bw +
        '" height="' +
        ih1 +
        '"/>' +
        '<rect class="bar-col" x="' +
        (cx + 1) +
        '" y="' +
        (base - ch) +
        '" width="' +
        bw +
        '" height="' +
        ch +
        '"/>' +
        '<text class="axis-txt" x="' +
        cx +
        '" y="' +
        (H - 8) +
        '" text-anchor="middle">' +
        m.m +
        "</text>" +
        "<title>" +
        m.m +
        " · invoiced " +
        money(m.invoiced) +
        " · collected " +
        money(m.collected) +
        "</title></g>";
    });
    svg +=
      '<line class="axis-line" x1="' +
      padL +
      '" y1="' +
      base +
      '" x2="' +
      (W - padR) +
      '" y2="' +
      base +
      '"/></svg>';
    host.innerHTML = svg;
  }
  function renderFunnel() {
    const host = $("#funnel");
    if (!host) return;
    const f = data.funnel[rp.range];
    const top = f[0][1];
    host.innerHTML = f
      .map(function (row, i) {
        // An org with no leads yet has top === 0; the donor divided by it.
        const pct = top ? (row[1] / top) * 100 : 0;
        const prev = i > 0 ? f[i - 1][1] : null;
        const drop = prev ? ((prev - row[1]) / prev) * 100 : null;
        return (
          '<div class="fn-row"><div class="fn-top"><span class="fn-l">' +
          row[0] +
          "</span>" +
          '<span class="fn-v">' +
          row[1] +
          " · " +
          pct.toFixed(0) +
          "%</span></div>" +
          '<div class="fn-track"><span class="fn-fill' +
          (i ? " s" + (i + 1) : "") +
          '" data-w="' +
          pct.toFixed(1) +
          '"></span></div>' +
          (drop !== null
            ? '<div class="fn-drop' +
              (drop > 40 ? " bad" : "") +
              '">Drop-off <b>' +
              drop.toFixed(0) +
              "%</b> from " +
              f[i - 1][0].toLowerCase() +
              "</div>"
            : "") +
          "</div>"
        );
      })
      .join("");
    raf(function () {
      $$(".fn-fill").forEach(function (el) {
        el.style.width = String(el.dataset.w) + "%";
      });
    });
  }
  function renderConversion() {
    const host = $("#convBody");
    if (!host) return;
    const f = data.funnel[rp.range];
    const quoteRate = f[0][1] ? (f[1][1] / f[0][1]) * 100 : 0;
    const closeRate = f[1][1] ? (f[2][1] / f[1][1]) * 100 : 0;
    const deliverRate = f[2][1] ? (f[3][1] / f[2][1]) * 100 : 0;
    const rows = [
      {
        l: "Lead to quote",
        s: f[1][1] + " of " + f[0][1] + " leads quoted",
        v: quoteRate,
        tone: quoteRate >= 60 ? "ok" : "warn",
      },
      {
        l: "Quote to close",
        s: f[2][1] + " of " + f[1][1] + " quotes accepted",
        v: closeRate,
        tone: closeRate >= 50 ? "ok" : "warn",
      },
      {
        l: "Close to delivered",
        s: f[3][1] + " of " + f[2][1] + " jobs finished",
        v: deliverRate,
        tone: deliverRate >= 85 ? "ok" : "warn",
      },
    ];
    const avgDays = data.avgDaysToClose[rp.range];
    host.innerHTML =
      rows
        .map(function (r) {
          return (
            '<div class="conv-row"><div><div class="conv-l">' +
            r.l +
            '</div><div class="conv-s">' +
            r.s +
            "</div></div>" +
            '<div class="conv-v ' +
            r.tone +
            '">' +
            r.v.toFixed(0) +
            "%</div></div>"
          );
        })
        .join("") +
      '<div class="conv-row"><div><div class="conv-l">Average time to close</div>' +
      '<div class="conv-s">Proposal sent to signature</div></div>' +
      '<div class="conv-v">' +
      (avgDays === null
        ? "—"
        : avgDays.toFixed(1) + '<span style="font-size:13px"> days</span>') +
      "</div></div>";
  }
  function renderCrew() {
    const host = $("#crewBody");
    if (!host) return;
    const rows = crewRows();
    if (!rows.length) {
      // A real range can have no delivered jobs at all. An empty <tbody> under
      // a header row reads as a broken table, so say what's missing.
      host.innerHTML =
        '<tr class="rp-empty-row"><td colspan="6">No jobs delivered in this range.</td></tr>';
      return;
    }
    host.innerHTML = rows
      .map(function (c) {
        return (
          '<tr class="prow">' +
          '<td><div class="crew-name"><span class="crew-av">' +
          esc(initials(c.name)) +
          "</span>" +
          '<span><span class="crew-n" style="display:block">' +
          esc(c.name) +
          "</span>" +
          '<span class="crew-r" style="display:block">' +
          esc(c.role) +
          "</span></span></div></td>" +
          '<td class="num"><span class="pt-mono">' +
          c.jobs +
          "</span></td>" +
          '<td class="num"><span class="pt-mono">' +
          c.hours +
          "</span></td>" +
          '<td class="num"><span class="pt-money">' +
          money(c.revenue) +
          "</span></td>" +
          '<td class="num"><span class="pt-mono">' +
          (c.hours ? money(c.revenue / c.hours) : "—") +
          "</span></td>" +
          '<td class="num"><span class="rate">' +
          (c.rating === null
            ? "—"
            : c.rating.toFixed(1) + '<svg class="ic"><use href="#i-star"/></svg>') +
          "</span></td>" +
          "</tr>"
        );
      })
      .join("");
  }
  /**
   * Repaint the whole sheet for the current range.
   *
   * Every figure for all four ranges is already in memory, so this is a pure
   * repaint — but a range switch IS the sheet arriving with different numbers,
   * which is the one case list-motion's contract says to stagger. (The donor
   * drove this from a MutationObserver on the two containers; that fires on
   * every write and is the pattern list-motion exists to replace.)
   */
  function renderReports(arriving = false) {
    renderRanges();
    renderSummary();
    renderChart();
    renderFunnel();
    renderConversion();
    renderCrew();
    if (arriving) {
      staggerIn($$("#summary .stat"));
      staggerIn($$("#crewBody .prow"));
    }
  }

  // ================= EXPORT =================
  function currentRange() {
    return data.ranges.find(function (r) {
      return r.key === rp.range;
    });
  }
  function renderExport() {
    const cur = currentRange();
    const note = $("#expRange");
    if (note && cur) note.textContent = cur.note;
    const list = $("#expList");
    if (list)
      list.innerHTML = FORMATS.map(function (f) {
        return (
          '<button class="exp-opt' +
          (rp.format === f.id ? " on" : "") +
          (f.available ? "" : " is-soon") +
          '" type="button" data-fmt="' +
          f.id +
          '"' +
          (f.available ? "" : " disabled aria-disabled=\"true\"") +
          ">" +
          '<span class="exp-mark"></span>' +
          '<span><span class="exp-t" style="display:block">' +
          f.t +
          "</span>" +
          '<span class="exp-h" style="display:block">' +
          f.h +
          "</span></span></button>"
        );
      }).join("");
  }

  /**
   * The CSV the Download button hands over: the same five blocks that are on
   * screen, for the selected range, built from the same numbers the sheet just
   * rendered. Sections are stacked with a blank line between them — the shape
   * every spreadsheet reads as separate tables.
   *
   * Rows are encoded by `@/lib/csv`'s `toCsv`, which is what the three existing
   * /api/exports/*.csv routes use; it also carries the formula-injection guard
   * that matters here, because crew names are free text.
   */
  function buildCsv(): string {
    const cur = currentRange();
    const ms = months();
    const f = data.funnel[rp.range];
    const collected = ms.reduce((a, m) => a + m.collected, 0);
    const invoiced = ms.reduce((a, m) => a + m.invoiced, 0);
    const jobs = f[3][1];
    const avgDays = data.avgDaysToClose[rp.range];
    const sections: string[] = [];

    sections.push(
      toCsv(
        [
          { metric: "Range", value: cur ? cur.label : rp.range },
          { metric: "Period", value: cur ? cur.note : "" },
          { metric: "Collected", value: Math.round(collected) },
          { metric: "Invoiced", value: Math.round(invoiced) },
          { metric: "Outstanding", value: Math.round(invoiced - collected) },
          { metric: "Jobs completed", value: jobs },
          { metric: "Win rate %", value: f[1][1] ? Math.round((f[2][1] / f[1][1]) * 100) : 0 },
          { metric: "Avg job value", value: jobs ? Math.round(collected / jobs) : 0 },
          { metric: "Avg days to close", value: avgDays === null ? "" : avgDays.toFixed(1) },
        ],
        ["metric", "value"],
      ),
    );
    sections.push(
      "Revenue by month\n" +
        toCsv(
          ms.map((m) => ({
            month: m.m,
            invoiced: Math.round(m.invoiced),
            collected: Math.round(m.collected),
          })),
          ["month", "invoiced", "collected"],
        ),
    );
    sections.push(
      "Pipeline\n" + toCsv(f.map((s) => ({ stage: s[0], count: s[1] })), ["stage", "count"]),
    );
    sections.push(
      "Crew performance\n" +
        toCsv(
          crewRows().map((c) => ({
            crew: c.name,
            role: c.role,
            jobs: c.jobs,
            hours: c.hours,
            revenue: Math.round(c.revenue),
            revenuePerHour: c.hours ? Math.round(c.revenue / c.hours) : "",
            rating: c.rating === null ? "" : c.rating.toFixed(1),
          })),
          ["crew", "role", "jobs", "hours", "revenue", "revenuePerHour", "rating"],
        ),
    );
    return sections.join("\n\n");
  }

  /** Hand the file to the browser. The URL is revoked on the next tick, which
   *  is after the synthetic click has already started the download. */
  function downloadCsv(csv: string, filename: string) {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    after(0, () => URL.revokeObjectURL(url));
  }

  // ================= EVENTS =================
  // The donor delegates from `document`; kept there (the dialog's own controls
  // are inside `.content` either way) and tracked for removal on unmount.
  on(document, "click", function (e) {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const r = target.closest<HTMLElement>("[data-r]");
    if (r) {
      const next = r.dataset.r as RangeKey;
      if (next === rp.range) return;
      rp.range = next;
      renderReports(true);
      return;
    }
    // The dialog's enter AND exit both come from mdl-motion / blueprint-global.
    // A bare `classList.add("open")` / `.remove("open")` pair — which this page
    // used to carry — plays the 280ms arrival and then cuts the box out of the
    // frame instantly, because `.mdl` is `display: none` without `.open`. That
    // asymmetry is what reads as "there is no close animation".
    if (target.closest("#exportBtn")) {
      renderExport();
      const mdl = $("#expMdl");
      if (mdl) openMdl(mdl);
      return;
    }
    if (target.closest('[data-mdl="close"]')) {
      const mdl = $("#expMdl");
      if (mdl) closeMdl(mdl, after);
      return;
    }
    const fmt = target.closest<HTMLElement>("[data-fmt]");
    if (fmt) {
      const picked = FORMATS.find((f) => f.id === fmt.dataset.fmt);
      // The unavailable formats render `disabled`, so this is belt and braces.
      if (!picked || !picked.available) return;
      rp.format = picked.id;
      renderExport();
      return;
    }
    const dl = target.closest<HTMLElement>("#downloadBtn");
    if (dl && !dl.dataset.busy) {
      // The donor faked this: a 1.4s "Preparing…" and no file. It now builds
      // the CSV from the sheet on screen and hands it to the browser.
      dl.dataset.busy = "1";
      const old = dl.innerHTML;
      dl.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>Preparing…';
      let failed = "";
      try {
        downloadCsv(buildCsv(), "jobflex-report-" + rp.range + ".csv");
      } catch {
        failed = "Couldn't build the file. Try again.";
      }
      after(600, function () {
        dl.innerHTML = old;
        delete dl.dataset.busy;
        if (failed) {
          const note = $("#expRange");
          if (note) note.textContent = failed;
          return;
        }
        const mdl = $("#expMdl");
        if (mdl) closeMdl(mdl, after);
      });
    }
  });

  // ================= INITIALIZATION =================
  renderReports(true);

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

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
    // `.mdl` is skipped: it is a `.content` child only because the port moved
    // the export dialog inside the mounted root, and `.rv` would strand the
    // fixed overlay at `opacity: 0` until it happened to intersect the
    // viewport. It sits after every donor block, so the cascade indices of the
    // real blocks are the donor's.
    const blocks = $$(".content > *").filter((el) => !el.classList.contains("mdl"));
    blocks.forEach((el, i) => {
      el.classList.add("rv");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? i * 60 + "ms" : "200ms";
    });
    // Second layer of the arrival — Overview cascades its `.kpi` strip here.
    // This page renders `.stat` cards instead, so the layer is silently empty,
    // exactly as in the donor: the summary tiles arrive through the row
    // stagger below, not through `rv-cell`.
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

    // Row stagger on list (re)render — now owned by renderReports(), which
    // calls blueprint-shell/list-motion's staggerIn when the sheet genuinely
    // ARRIVES (first paint, a new range). The donor drove it from a
    // MutationObserver on #summary / #crewBody with { childList: true }, which
    // replays the whole 45ms-per-row cascade on EVERY write to those
    // containers; list-motion exists to replace exactly that pattern.

    // Numeral count-up — the donor targets `.kpi-val`, which Overview renders.
    // This page's figures are `.stat-val`, so the layer is inert here too; the
    // selector is kept literal so the two pages cannot drift.
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
        if (pr < 1) raf(frame);
      }
      raf(frame);
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
      ".btn, .card-foot-btn, .ptab, .pchip, .pager-btn, .pmenu-item, .photo-box, .pt-open, .range, .exp-opt:not(.is-soon), .mdl-x",
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
    frames.forEach((id) => cancelAnimationFrame(id));
    frames.clear();
  };
}
