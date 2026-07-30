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

import {
  RANGES,
  MONTHS,
  RANGE_MONTHS,
  FUNNEL,
  CREW,
  FORMATS,
  type RangeKey,
} from "./reports-data";

export function initReportsContent(content: HTMLElement): () => void {
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
  // The fixtures (RANGES / MONTHS / RANGE_MONTHS / FUNNEL / CREW / FORMATS)
  // live in ./reports-data. Only the two selections are per mount, which is
  // what the donor's module-level `rp` amounted to on a fresh page load.
  const rp: { range: RangeKey; format: string } = { range: "q", format: "csv" };

  function money(n: number) {
    return "$" + Math.round(n).toLocaleString("en-US");
  }
  function shortMoney(n: number) {
    return n >= 1000 ? "$" + Math.round(n / 1000) + "k" : "$" + n;
  }
  function initials(n: string) {
    const p = n.split(" ");
    return (p[0][0] + (p[1] ? p[1][0] : "")).toUpperCase();
  }
  function months() {
    return MONTHS.slice(MONTHS.length - RANGE_MONTHS[rp.range]);
  }
  function scale() {
    return RANGE_MONTHS[rp.range] / 12;
  }

  // ================= RENDER =================
  function renderRanges() {
    const host = $("#ranges");
    if (host)
      host.innerHTML = RANGES.map(function (r) {
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
    const cur = RANGES.find(function (r) {
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
    const f = FUNNEL[rp.range];
    const jobs = f[3][1];
    const win = f[1][1] ? (f[2][1] / f[1][1]) * 100 : 0;
    const avg = jobs ? collected / jobs : 0;
    const outstanding = invoiced - collected;
    host.innerHTML =
      '<div class="stat"><div class="kpi-lbl">Collected</div><div class="stat-val accent">' +
      money(collected) +
      "</div>" +
      '<div class="stat-delta up">▲ ' +
      Math.round((collected / invoiced) * 100) +
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
    const W = 660,
      H = 220,
      padL = 42,
      padR = 10,
      padT = 12,
      padB = 26;
    const max = Math.max.apply(
      null,
      ms.map(function (m) {
        return m.invoiced;
      }),
    );
    const step = Math.ceil(max / 4 / 10000) * 10000 || 10000;
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
    const f = FUNNEL[rp.range];
    const top = f[0][1];
    host.innerHTML = f
      .map(function (row, i) {
        const pct = (row[1] / top) * 100;
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
    const f = FUNNEL[rp.range];
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
      (rp.range === "mtd" ? "4.2" : rp.range === "q" ? "5.1" : "5.8") +
      '<span style="font-size:13px"> days</span></div></div>';
  }
  function renderCrew() {
    const host = $("#crewBody");
    if (!host) return;
    const k = scale();
    host.innerHTML = CREW.map(function (c) {
      const jobs = Math.max(1, Math.round(c.jobs * k * 1.6));
      const hours = Math.round(c.hours * k * 1.6);
      const rev = Math.round(c.revenue * k * 1.6);
      return (
        '<tr class="prow">' +
        '<td><div class="crew-name"><span class="crew-av">' +
        initials(c.name) +
        "</span>" +
        '<span><span class="crew-n" style="display:block">' +
        c.name +
        "</span>" +
        '<span class="crew-r" style="display:block">' +
        c.role +
        "</span></span></div></td>" +
        '<td class="num"><span class="pt-mono">' +
        jobs +
        "</span></td>" +
        '<td class="num"><span class="pt-mono">' +
        hours +
        "</span></td>" +
        '<td class="num"><span class="pt-money">' +
        money(rev) +
        "</span></td>" +
        '<td class="num"><span class="pt-mono">' +
        money(hours ? rev / hours : 0) +
        "</span></td>" +
        '<td class="num"><span class="rate">' +
        c.rating.toFixed(1) +
        '<svg class="ic"><use href="#i-star"/></svg></span></td>' +
        "</tr>"
      );
    }).join("");
  }
  function renderReports() {
    renderRanges();
    renderSummary();
    renderChart();
    renderFunnel();
    renderConversion();
    renderCrew();
  }

  // ================= EXPORT =================
  function renderExport() {
    const cur = RANGES.find(function (r) {
      return r.key === rp.range;
    });
    const note = $("#expRange");
    if (note && cur) note.textContent = cur.note;
    const list = $("#expList");
    if (list)
      list.innerHTML = FORMATS.map(function (f) {
        return (
          '<button class="exp-opt' +
          (rp.format === f.id ? " on" : "") +
          '" type="button" data-fmt="' +
          f.id +
          '">' +
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

  // ================= EVENTS =================
  // The donor delegates from `document`; kept there (the dialog's own controls
  // are inside `.content` either way) and tracked for removal on unmount.
  on(document, "click", function (e) {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const r = target.closest<HTMLElement>("[data-r]");
    if (r) {
      rp.range = r.dataset.r as RangeKey;
      renderReports();
      return;
    }
    if (target.closest("#exportBtn")) {
      renderExport();
      $("#expMdl")?.classList.add("open");
      return;
    }
    if (target.closest('[data-mdl="close"]')) {
      $("#expMdl")?.classList.remove("open");
      return;
    }
    const fmt = target.closest<HTMLElement>("[data-fmt]");
    if (fmt) {
      rp.format = fmt.dataset.fmt as string;
      renderExport();
      return;
    }
    const dl = target.closest<HTMLElement>("#downloadBtn");
    if (dl && !dl.dataset.busy) {
      dl.dataset.busy = "1";
      const old = dl.innerHTML;
      dl.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>Preparing…';
      const t = setTimeout(function () {
        timers.delete(t);
        dl.innerHTML = old;
        delete dl.dataset.busy;
        $("#expMdl")?.classList.remove("open");
      }, 1400);
      timers.add(t);
    }
  });

  // ================= INITIALIZATION =================
  renderReports();

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

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

    // Row stagger on list (re)render
    function animateRows(list: HTMLElement) {
      const rows = Array.from(list.querySelectorAll<HTMLElement>(".stat, .prow"));
      rows.forEach((r, i) => {
        r.style.opacity = "0";
        r.style.transform = "translateY(8px)";
        r.style.transition =
          "opacity 300ms " + EASE + " " + i * 45 + "ms, transform 300ms " + EASE + " " + i * 45 + "ms";
        raf(() =>
          raf(() => {
            r.style.opacity = "1";
            r.style.transform = "none";
          }),
        );
        // Drop the inline styles once the stagger lands. Left in place, the
        // inline `transform: none` outranks every stylesheet `:hover` rule,
        // so hover lift on rows and cards silently stops working.
        r.addEventListener("transitionend", function te(e) {
          if (e.propertyName !== "transform") return;
          r.style.opacity = "";
          r.style.transform = "";
          r.style.transition = "";
          r.removeEventListener("transitionend", te);
        });
      });
    }
    ["summary", "crewBody"].forEach((id) => {
      const list = $("#" + id);
      if (!list) return;
      animateRows(list);
      const mo = new MutationObserver(() => animateRows(list));
      mo.observe(list, { childList: true });
      disposers.push(() => mo.disconnect());
    });

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
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    frames.forEach((id) => cancelAnimationFrame(id));
    frames.clear();
  };
}
