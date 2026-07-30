// Blueprint dashboard — runtime behaviors, ported verbatim from the donor
// file's <script> (jobflex-dashboard-blueprint.html). Every duration, easing,
// stagger, threshold and formula is the donor's exact value. Adaptations are
// mechanical only: queries are scoped to the mounted root, document/window
// listeners and observers are tracked for unmount cleanup, and the donor's
// `window load` re-layout gains a `document.fonts.ready` equivalent (in an
// SPA the load event may already have fired before mount).

import {
  TODAY,
  weekEvents,
  jobsData,
  activities,
  LEADS_SEED,
  LEAD_STAGES,
  chartDatasets,
  type Lead,
} from "./blueprint-data";

const SVGNS = "http://www.w3.org/2000/svg";

export function initDashboardContent(content: HTMLElement): () => void {
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
  // Scoped to `.content`, which the shared shell owns and re-fills on every
  // navigation. `.main` lives in the shell, above this element.
  const $ = (sel: string) => content.querySelector<HTMLElement>(sel);
  const $$ = (sel: string) => Array.from(content.querySelectorAll<HTMLElement>(sel));
  const main = content.closest<HTMLElement>(".main");

  // Drag & drop mutates stages — clone the seed so a remount starts fresh.
  const leadsData: Lead[] = LEADS_SEED.map((l) => ({ ...l }));

  // Dismiss Lead Center banners (smooth height + gap collapse)
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

  // ================= RENDER =================
  function renderWeek(day: number) {
    const list = $("#weekList");
    if (!list) return;
    const evs = (weekEvents[day] || []).slice().sort((a, b) => a.m - b.m);
    let html = evs.length
      ? evs
          .map(
            (e) =>
              '<div class="sched-row"><span class="tag">' +
              e.t +
              '</span><span class="sched-title">' +
              e.title +
              "</span></div>",
          )
          .join("")
      : '<div class="empty">Nothing scheduled for this day.</div>';
    html +=
      '<a class="card-foot-btn" href="#">Go to Calendar<svg class="ic"><use href="#i-arrow"/></svg></a>';
    list.innerHTML = html;
    list.classList.add("scrollable");
    list.classList.toggle("has-more", evs.length > 10);
  }

  function renderJobs() {
    const list = $("#jobsList");
    if (!list) return;
    const sorted = jobsData.slice().sort((a, b) => a.k - b.k); // nearest first
    let html = sorted
      .map(
        (j) =>
          '<div class="job-row"><span class="job-date' +
          (j.k === 700 + TODAY ? " today" : "") +
          '">' +
          j.date +
          "</span>" +
          '<div class="job-info"><div class="job-title">' +
          j.title +
          '</div><div class="job-sub">' +
          j.sub +
          "</div></div>" +
          '<span class="chip ' +
          (j.st === "ok" ? "ok" : "wait") +
          '">' +
          (j.st === "ok" ? "Confirmed" : "Pending") +
          "</span></div>",
      )
      .join("");
    html +=
      '<a class="card-foot-btn" href="#">Go to Jobs<svg class="ic"><use href="#i-arrow"/></svg></a>';
    list.innerHTML = html;
    list.classList.add("scrollable");
    list.classList.toggle("has-more", sorted.length > 10);
  }

  function renderActivity() {
    const list = $("#actList");
    if (!list) return;
    const shown = activities.slice(0, 10); // limit: max 10 even if 15
    list.innerHTML = shown
      .map(
        (a) =>
          '<div class="act-row"><div class="act-ic"><svg class="ic"><use href="#' +
          a.i +
          '"/></svg></div>' +
          '<div><div class="act-title">' +
          a.t +
          '</div><div class="act-meta">' +
          a.m +
          "</div></div></div>",
      )
      .join("");
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
  function leadCardHtml(l: Lead) {
    return (
      '<div class="lead-card" draggable="true" data-id="' +
      l.id +
      '">' +
      '<div class="lead-name">' +
      l.name +
      "</div>" +
      '<div class="lead-job">' +
      l.job +
      " · " +
      l.city +
      "</div>" +
      '<div class="lead-meta"><span class="lead-val">$' +
      l.val.toLocaleString("en-US") +
      '</span><span class="lead-age">' +
      l.age +
      " ago</span></div>" +
      "</div>"
    );
  }
  function bindCards(wrap: HTMLElement) {
    wrap.querySelectorAll<HTMLElement>(".lead-card").forEach((card) => {
      card.addEventListener("dragstart", (e) => {
        const lead = leadsData.find((l) => String(l.id) === card.dataset.id);
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
    setTimeout(() => {
      if (slot.parentNode) slot.remove();
    }, 300);
  }
  function renderStage(st: string, opts?: { animateAll?: boolean; highlightId?: number | null }) {
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
      const el = wrap.querySelector<HTMLElement>('.lead-card[data-id="' + opts.highlightId + '"]');
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
          setTimeout(() => {
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
          }, 230);
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
        const idx = leadsData.findIndex((l) => String(l.id) === id);
        if (idx === -1) return;
        const lead = leadsData[idx];
        if (lead.stage === col.dataset.stage) return;
        const from = lead.stage;
        leadsData.splice(idx, 1);
        lead.stage = col.dataset.stage || lead.stage;
        leadsData.push(lead); // lands at the end of the column — exactly where the preview slot was
        renderStage(from);
        renderStage(lead.stage, { highlightId: lead.id });
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
  let selectedDay = TODAY;
  $$(".week-strip .day").forEach((d) => {
    d.addEventListener("click", () => {
      selectedDay = parseInt(d.dataset.day || "0", 10);
      $$(".week-strip .day").forEach((x) => x.classList.toggle("selected", x === d));
      renderWeek(selectedDay);
      layoutSync();
    });
  });

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

  function renderChart(range: string) {
    const ds = chartDatasets[range];
    const gY = $("#chY");
    const gX = $("#chX");
    const gD = $("#chData");
    if (!ds || !gY || !gX || !gD) return;
    gY.innerHTML = "";
    gX.innerHTML = "";
    gD.innerHTML = "";
    const n = ds.values.length;
    chartPts = ds.values.map((v, i) => ({
      x: 70 + i * (720 / (n - 1)),
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
            setTimeout(
              () => {
                d.style.transition = "opacity 180ms ease";
                d.style.opacity = "1";
              },
              Math.round(850 * (i / Math.max(1, dots.length - 1))),
            );
          });
          setTimeout(() => {
            area.style.opacity = "1";
            note.style.opacity = "1";
          }, 950);
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
    if (chartEls) {
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
        dd.querySelectorAll(".dd-item").forEach((i) => i.classList.remove("active"));
        item.classList.add("active");
        label.textContent = item.textContent;
        if (item.dataset.range) renderChart(item.dataset.range);
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
  renderWeek(selectedDay);
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
    const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

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
    const blocks = $$(".content > *");
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

    // Row stagger on list (re)render
    function animateRows(list: HTMLElement) {
      const rows = Array.from(list.querySelectorAll<HTMLElement>(".sched-row, .job-row, .act-row, .empty"));
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
    ["weekList", "jobsList", "actList"].forEach((id) => {
      const list = $("#" + id);
      if (!list) return;
      animateRows(list);
      const mo = new MutationObserver(() => animateRows(list));
      mo.observe(list, { childList: true });
      disposers.push(() => mo.disconnect());
    });

    // Numeral count-up. The digits-only rebuild below is safe for this page's
    // plain "$12,400"/"18", but the other blueprint pages count values that
    // carry a unit ("68%") or wrap an inline icon, so the pack now keeps
    // whatever frames the number, skips decimals (digits-only mangles them)
    // and skips nodes that hold elements rather than bare text.
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
    pressify(".page-actions .btn, .card-foot-btn, .dd-item", "pressed");
    pressify(".week-strip .day", "day-pressed");

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
