// Roof estimator blueprint — runtime behaviors, ported verbatim from the donor
// file's <script> (jobflex-roof-estimator-blueprint_3.html). Every duration,
// easing, stagger, formula, price and caption is the donor's exact value.
// Adaptations are mechanical only:
// - queries are scoped to the mounted `.content` root;
// - document/window listeners, timers, intervals and observers are tracked for
//   unmount cleanup;
// - the donor's chrome modules (matchMedia polyfill, mobile nav drawer, FLUID
//   SCALE, the sidebar entry cascade, the sliding active indicator and the
//   graph-paper parallax) are NOT ported here — the shared shell
//   (components/v3/blueprint-shell/shell-behavior.ts) already owns all of them;
// - the donor's `safe(name, fn)` try/catch wrapper is dropped: the modules it
//   guarded are either shell-owned or replaced by strict null checks below;
// - `REPORT` is a per-mount copy of the seed, because the donor mutates it (see
//   roof-estimator-data.ts).

import {
  LINE_COLORS,
  LINE_LABEL,
  MS_STAGES,
  REPORT_SEED,
  SAMPLES,
  STATES,
  edges,
  faces,
  type Edge,
  type Face,
} from "./roof-estimator-data";

export function initRoofEstimatorContent(content: HTMLElement): () => void {
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
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const $$ = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));

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

  // ================= ROOF ESTIMATOR: DATA =================
  // SAMPLES / STATES / LINE_COLORS / LINE_LABEL / faces / edges live in
  // roof-estimator-data.ts, verbatim.
  const REPORT = { ...REPORT_SEED };

  const rf = { view: "2d", label: "shaded", priced: false, built: false, waste: 12 };

  function polyArea(pts: number[][]) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i],
        q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a) / 2;
  }
  function pitchFactor(p: number) {
    return Math.sqrt(1 + (p / 12) * (p / 12));
  }
  function faceArea(f: Face) {
    return polyArea(f.pts) * pitchFactor(f.pitch);
  }
  function edgeLen(e: Edge) {
    return Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
  }
  function num(n: number, d?: number) {
    return Number(n).toLocaleString("en-US", { maximumFractionDigits: d == null ? 0 : d });
  }
  function money(n: number) {
    return "$" + Math.round(n).toLocaleString("en-US");
  }

  const totals = (function () {
    const area = faces.reduce(function (a, f) {
      return a + faceArea(f);
    }, 0);
    const byPitch: Record<string, number> = {};
    faces.forEach(function (f) {
      byPitch[f.pitch] = (byPitch[f.pitch] || 0) + faceArea(f);
    });
    const predominant = Object.keys(byPitch).sort(function (a, b) {
      return byPitch[b] - byPitch[a];
    })[0];
    return {
      area: area,
      squares: area / 100,
      facets: faces.length,
      pitch: Number(predominant),
      byPitch: byPitch,
    };
  })();

  // ================= VIEW GEOMETRY =================
  function project(p: number[], z?: number) {
    if (rf.view === "2d") return [p[0], p[1]];
    // 30° axonometric: x' = (x - y) cos30, y' = (x + y) sin30 - height
    const c = Math.cos(Math.PI / 6),
      s2 = Math.sin(Math.PI / 6);
    return [(p[0] - p[1]) * c, (p[0] + p[1]) * s2 - (z || 0)];
  }
  function heightAt(pt: number[]) {
    // ridge height: points on the y=18 line inside the outline are raised
    const onMainRidge = pt[1] === 18 && pt[0] >= 14 && pt[0] <= 42;
    const onWingRidge = pt[1] === 18 && pt[0] >= 56;
    if (onMainRidge) return (18 * 6) / 12;
    if (onWingRidge) return (12 * 8) / 12;
    if (pt[1] === 18) return 14; // where the wing ridge meets the main hip
    return 0;
  }
  function faceLabel(f: Face): string[] {
    if (rf.label === "pitch") return [String(f.pitch), "rise / 12"];
    if (rf.label === "area") return [num(faceArea(f)), "sq ft"];
    if (rf.label === "length") return [num(Math.sqrt(polyArea(f.pts)), 0) + "'", "run"];
    return [f.id, f.dir];
  }
  function renderCanvas() {
    const proj: number[][] = [];
    faces.forEach(function (f) {
      f.pts.forEach(function (p) {
        proj.push(project(p, heightAt(p)));
      });
    });
    edges.forEach(function (e) {
      proj.push(project(e.a, heightAt(e.a)));
      proj.push(project(e.b, heightAt(e.b)));
    });
    const xs = proj.map(function (p) {
        return p[0];
      }),
      ys = proj.map(function (p) {
        return p[1];
      });
    const minX = Math.min.apply(null, xs),
      maxX = Math.max.apply(null, xs);
    const minY = Math.min.apply(null, ys),
      maxY = Math.max.apply(null, ys);
    const pad = 8;
    const vb = [minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2];

    let svg = '<svg viewBox="' + vb.join(" ") + '" role="img" aria-label="Roof diagram">';
    faces.forEach(function (f, i) {
      const pts = f.pts
        .map(function (p) {
          const q = project(p, heightAt(p));
          return q[0].toFixed(2) + "," + q[1].toFixed(2);
        })
        .join(" ");
      const c = f.pts.reduce(
        function (a, p) {
          return [a[0] + p[0] / f.pts.length, a[1] + p[1] / f.pts.length];
        },
        [0, 0],
      );
      const cz = project(c, heightAt([c[0], Math.round(c[1])]) * 0.55);
      const lbl = faceLabel(f);
      svg +=
        '<g><polygon class="facet f' +
        ((i % 4) + 1) +
        '" points="' +
        pts +
        '">' +
        "<title>" +
        f.name +
        " · " +
        num(faceArea(f)) +
        " sq ft · " +
        f.pitch +
        "/12 · faces " +
        f.dir +
        "</title></polygon>" +
        '<text class="fl" x="' +
        cz[0].toFixed(1) +
        '" y="' +
        cz[1].toFixed(1) +
        '">' +
        lbl[0] +
        "</text>" +
        '<text class="fl-sub" x="' +
        cz[0].toFixed(1) +
        '" y="' +
        (cz[1] + 6).toFixed(1) +
        '">' +
        lbl[1] +
        "</text></g>";
    });
    edges.forEach(function (e) {
      const a = project(e.a, heightAt(e.a)),
        b = project(e.b, heightAt(e.b));
      svg +=
        '<line class="edge" x1="' +
        a[0].toFixed(2) +
        '" y1="' +
        a[1].toFixed(2) +
        '" x2="' +
        b[0].toFixed(2) +
        '" y2="' +
        b[1].toFixed(2) +
        '" stroke="' +
        (LINE_COLORS[e.type] || "#475569") +
        '"/>';
      if (rf.label === "length") {
        const mx = (a[0] + b[0]) / 2,
          my = (a[1] + b[1]) / 2;
        svg +=
          '<text class="edge-lbl" x="' +
          mx.toFixed(1) +
          '" y="' +
          (my - 2).toFixed(1) +
          '">' +
          num(edgeLen(e)) +
          "'</text>";
      }
    });
    svg += "</svg>";
    const canvas = $("#rfCanvas");
    if (canvas) canvas.innerHTML = svg;
    const vwTitle = $("#vwTitle");
    if (vwTitle) vwTitle.textContent = rf.view === "2d" ? "Roof plan" : "Roof model";
    const vwSub = $("#vwSub");
    if (vwSub) vwSub.textContent = REPORT.address + " · report #" + REPORT.id;
    const legend = $("#rfLegend");
    if (legend)
      legend.innerHTML = Object.keys(LINE_COLORS)
        .map(function (k) {
          return (
            '<span class="lg"><i style="background:' + LINE_COLORS[k] + '"></i>' + LINE_LABEL[k] + "</span>"
          );
        })
        .join("");
  }

  // ================= REPORT PANELS =================
  function renderHero() {
    const cells: Array<{ l: string; v: string; h: string; accent?: boolean }> = [
      { l: "Total area", v: num(totals.area), h: "sq ft" },
      { l: "Roofing squares", v: num(totals.squares, 1), h: "× 100 sq ft", accent: true },
      { l: "Predominant pitch", v: totals.pitch + "/12", h: "rise / 12" },
      { l: "Roof facets", v: String(totals.facets), h: "planes" },
    ];
    const hero = $("#rfHero");
    if (!hero) return;
    hero.innerHTML = cells
      .map(function (c) {
        return (
          '<div class="hero-cell"><div class="kpi-lbl">' +
          c.l +
          "</div>" +
          '<div class="hero-v' +
          (c.accent ? " accent" : "") +
          '">' +
          c.v +
          "</div>" +
          '<div class="hero-h">' +
          c.h +
          "</div></div>"
        );
      })
      .join("");
  }
  function renderLinear() {
    const by: Record<string, number> = {};
    edges.forEach(function (e) {
      by[e.type] = (by[e.type] || 0) + edgeLen(e);
    });
    const list = $("#lfList");
    if (!list) return;
    list.innerHTML = Object.keys(by)
      .map(function (k) {
        return (
          '<li><span class="lf-k"><i style="background:' +
          (LINE_COLORS[k] || "#475569") +
          '"></i>' +
          LINE_LABEL[k] +
          "</span>" +
          '<span class="lf-v">' +
          num(by[k]) +
          "<span>ft</span></span></li>"
        );
      })
      .join("");
  }
  function renderPitchMix() {
    const groups = Object.keys(totals.byPitch)
      .map(function (p) {
        return {
          pitch: Number(p),
          area: totals.byPitch[p],
          pct: (totals.byPitch[p] / totals.area) * 100,
        };
      })
      .sort(function (a, b) {
        return b.area - a.area;
      });
    const pmSub = $("#pmSub");
    if (pmSub) pmSub.textContent = totals.facets + " facets · " + num(totals.area) + " sq ft";
    const pmBody = $("#pmBody");
    if (pmBody)
      pmBody.innerHTML = groups
        .map(function (g) {
          const cls = g.pitch >= 8 ? "steep" : g.pitch <= 2 ? "low" : "";
          return (
            '<div class="pm-row"><div class="pm-top"><span class="pm-p">' +
            g.pitch +
            "/12</span>" +
            '<span class="pm-a">' +
            num(g.area) +
            " sq ft · " +
            g.pct.toFixed(0) +
            "%</span></div>" +
            '<div class="pm-track"><span class="pm-fill ' +
            cls +
            '" data-w="' +
            g.pct.toFixed(1) +
            '"></span></div></div>'
          );
        })
        .join("");
    const steep = groups
      .filter(function (g) {
        return g.pitch >= 8;
      })
      .reduce(function (a, g) {
        return a + g.area;
      }, 0);
    const low = groups
      .filter(function (g) {
        return g.pitch <= 2;
      })
      .reduce(function (a, g) {
        return a + g.area;
      }, 0);
    let calls = "";
    if (steep > 0)
      calls +=
        '<div class="call warn">' +
        num(steep) +
        " sq ft at 8/12 or steeper — plan for roof jacks and a steep-pitch labor rate.</div>";
    if (low > 0)
      calls +=
        '<div class="call info">' +
        num(low) +
        " sq ft of low slope — shingles are out of spec; price a membrane instead.</div>";
    if (!calls)
      calls = '<div class="call info">All facets are walkable — standard labor rate applies.</div>';
    const pmCalls = $("#pmCalls");
    if (pmCalls) pmCalls.innerHTML = calls;
    requestAnimationFrame(function () {
      $$(".pm-fill").forEach(function (f) {
        f.style.width = String(f.dataset.w) + "%";
      });
    });
  }
  function renderBuild() {
    const waste = rf.waste / 100;
    const sq = totals.squares * (1 + waste);
    const ridgeFt = edges
      .filter(function (e) {
        return e.type === "RIDGE";
      })
      .reduce(function (a, e) {
        return a + edgeLen(e);
      }, 0);
    const eaveFt = edges
      .filter(function (e) {
        return e.type === "EAVE";
      })
      .reduce(function (a, e) {
        return a + edgeLen(e);
      }, 0);
    const valleyFt = edges
      .filter(function (e) {
        return e.type === "VALLEY";
      })
      .reduce(function (a, e) {
        return a + edgeLen(e);
      }, 0);
    const materials = [
      { n: "Architectural shingles", q: Math.ceil(sq), u: "square", p: 128 },
      { n: "Synthetic underlayment", q: Math.ceil(sq / 4), u: "roll", p: 92 },
      { n: "Ice & water shield", q: Math.ceil((eaveFt + valleyFt) / 65), u: "roll", p: 118 },
      { n: "Ridge vent", q: Math.ceil(ridgeFt / 4), u: "each", p: 21 },
      { n: "Drip edge", q: Math.ceil(eaveFt / 10), u: "each", p: 14 },
      { n: "Hip & ridge cap", q: Math.ceil(ridgeFt / 20), u: "bundle", p: 64 },
    ];
    const labor = [
      { n: "Tear-off and disposal", q: Math.round(totals.squares), u: "square", p: 62 },
      { n: "Underlayment and flashing", q: Math.round(totals.squares), u: "square", p: 34 },
      { n: "Shingle installation", q: Math.round(totals.squares), u: "square", p: 118 },
      {
        n: "Steep-pitch surcharge",
        q: Math.round(totals.byPitch[8] ? totals.byPitch[8] / 100 : 0),
        u: "square",
        p: 28,
      },
    ].filter(function (l) {
      return l.q > 0;
    });

    function table(title: string, rows: Array<{ n: string; q: number; u: string; p: number }>) {
      const sum = rows.reduce(function (a, r) {
        return a + r.q * r.p;
      }, 0);
      return (
        '<div class="bo-sec"><div class="bo-head"><span class="kpi-lbl">' +
        title +
        "</span>" +
        '<span class="bo-sum">' +
        money(sum) +
        "</span></div>" +
        '<table class="bo-table"><thead><tr><th>Item</th><th class="num">Qty</th><th>Unit</th><th class="num">Unit</th><th class="num">Total</th></tr></thead><tbody>' +
        rows
          .map(function (r) {
            return (
              "<tr><td>" +
              r.n +
              '</td><td class="num">' +
              r.q +
              "</td><td>" +
              r.u +
              "</td>" +
              '<td class="num">' +
              money(r.p) +
              '</td><td class="num"><b>' +
              money(r.q * r.p) +
              "</b></td></tr>"
            );
          })
          .join("") +
        "</tbody></table></div>"
      );
    }
    const matSum = materials.reduce(function (a, r) {
      return a + r.q * r.p;
    }, 0);
    const labSum = labor.reduce(function (a, r) {
      return a + r.q * r.p;
    }, 0);
    const out = $("#buildOut");
    if (!out) return;
    out.innerHTML =
      table("Materials · " + rf.waste + "% waste", materials) +
      table("Labor", labor) +
      '<div class="bo-total"><span class="kpi-lbl">Estimate total</span>' +
      '<span class="bo-total-v">' +
      money(matSum + labSum) +
      "</span>" +
      '<button class="btn btn-primary btn--sm" type="button" id="convertBtn"><svg class="ic"><use href="#i-file"/></svg>Convert to proposal</button></div>';
    out.classList.remove("is-hidden");
  }
  function renderReport() {
    renderHero();
    renderCanvas();
    renderLinear();
    renderPitchMix();
  }

  // ================= SCREENS =================
  function show(panel: string) {
    $$(".ppanel").forEach(function (p) {
      p.classList.toggle("is-hidden", p.dataset.panel !== panel);
    });
    $("#againBtn")?.classList.toggle("is-hidden", panel !== "report");
  }
  // MS_STAGES lives in roof-estimator-data.ts, verbatim.
  function runMeasure(reportId: number) {
    show("measuring");
    REPORT.id = reportId;
    const msReport = $("#msReport");
    if (msReport) msReport.textContent = "#" + reportId;
    let i = 0;
    const msStage = $("#msStage");
    if (msStage) msStage.textContent = MS_STAGES[0];
    const msFill = $("#msFill");
    if (msFill) msFill.style.width = "8%";
    const t = setInterval(function () {
      i += 1;
      if (msStage) msStage.textContent = MS_STAGES[Math.min(i, MS_STAGES.length - 1)];
      if (msFill) msFill.style.width = Math.min(100, 8 + i * 24) + "%";
      if (i >= MS_STAGES.length - 1) {
        clearInterval(t);
        const done = setTimeout(function () {
          show("report");
          renderReport();
        }, 420);
        disposers.push(() => clearTimeout(done));
      }
    }, 650);
    disposers.push(() => clearInterval(t));
  }

  // ================= INTAKE RENDER =================
  function renderIntake() {
    const samples = $("#samples");
    if (samples)
      samples.innerHTML = SAMPLES.map(function (s2) {
        return (
          '<button class="sample" type="button" data-sample="' +
          s2.id +
          '" data-addr="' +
          s2.detail +
          '">' +
          '<span class="sample-t">' +
          s2.label +
          "</span>" +
          '<span class="sample-d">' +
          s2.detail +
          "</span></button>"
        );
      }).join("");
    const sel = $<HTMLSelectElement>("#state");
    if (sel && !sel.options.length) {
      sel.innerHTML =
        '<option value="" selected>State…</option>' +
        STATES.map(function (st) {
          return "<option>" + st + "</option>";
        }).join("");
    }
  }

  // ================= EVENTS =================
  on(document, "click", function (e) {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const smp = target.closest<HTMLElement>("[data-sample]");
    if (smp) {
      // `data-addr` / `data-sample` are always written by renderIntake; the
      // guards only keep the donor's plain assignment type-safe.
      const dsAddr = smp.dataset.addr;
      if (dsAddr !== undefined) REPORT.address = dsAddr;
      runMeasure(Number(smp.dataset.sample));
      return;
    }
    if (target.closest("#priceBtn")) {
      const addrEl = $<HTMLInputElement>("#addr");
      const addr = (addrEl?.value || "").trim();
      if (!addr) {
        addrEl?.focus();
        return;
      }
      rf.priced = true;
      const el = $("#rfPrice");
      if (el) {
        el.innerHTML = "Report price <b>$24</b> · delivered in minutes";
        el.classList.remove("is-hidden");
      }
      $("#orderBtn")?.classList.remove("is-hidden");
      return;
    }
    if (target.closest("#orderBtn")) {
      const addr = ($<HTMLInputElement>("#addr")?.value || "").trim();
      const city = ($<HTMLInputElement>("#city")?.value || "").trim();
      REPORT.address = [addr, city].filter(Boolean).join(", ") || REPORT.address;
      runMeasure(Math.floor(69000000 + Math.random() * 900000));
      return;
    }
    if (target.closest("#againBtn")) {
      show("intake");
      $("#buildOut")?.classList.add("is-hidden");
      rf.built = false;
      return;
    }
    const vb = target.closest<HTMLElement>("[data-view]");
    if (vb) {
      const view = vb.dataset.view;
      if (view !== undefined) rf.view = view;
      $$("#viewSwitch .vsw-btn").forEach(function (b) {
        b.classList.toggle("active", b === vb);
      });
      renderCanvas();
      return;
    }
    const lb = target.closest<HTMLElement>("[data-label]");
    if (lb) {
      const label = lb.dataset.label;
      if (label !== undefined) rf.label = label;
      $$("#labelSwitch .vsw-btn").forEach(function (b) {
        b.classList.toggle("active", b === lb);
      });
      renderCanvas();
      return;
    }
    if (target.closest("#buildBtn")) {
      rf.built = true;
      renderBuild();
      return;
    }
    const conv = target.closest<HTMLElement>("#convertBtn");
    if (conv && !conv.dataset.busy) {
      conv.dataset.busy = "1";
      const old = conv.innerHTML;
      conv.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>Proposal created';
      const revert = setTimeout(function () {
        conv.innerHTML = old;
        delete conv.dataset.busy;
      }, 1800);
      disposers.push(() => clearTimeout(revert));
    }
  });
  on(document, "change", function (e) {
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (!target) return;
    if (target.id === "waste") {
      rf.waste = parseInt((target as HTMLSelectElement).value, 10) || 12;
      if (rf.built) renderBuild();
    }
  });

  // ================= INITIALIZATION =================
  renderIntake();

  // The matchMedia polyfill, mobile nav drawer and FLUID SCALE belong to the
  // persistent chrome and live in
  // components/v3/blueprint-shell/shell-behavior.ts.

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
    const blocks = $$(".content > *");
    blocks.forEach((el, i) => {
      el.classList.add("rv");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? i * 60 + "ms" : "200ms";
    });
    // Second layer of the arrival — the donor cascades `.kpi` here. This page
    // has none (its figures are `.hero-cell` inside `#rfHero`, staggered by
    // animateRows below), so the layer is empty, exactly as in the donor.
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
      const rows = Array.from(list.querySelectorAll<HTMLElement>(".hero-cell, .sample"));
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
        // inline `transform: none` outranks every stylesheet `:hover` rule, so
        // hover lift on cards silently stops working.
        r.addEventListener("transitionend", function te(e) {
          if (e.propertyName !== "transform") return;
          r.style.opacity = "";
          r.style.transform = "";
          r.style.transition = "";
          r.removeEventListener("transitionend", te);
        });
      });
    }
    ["rfHero", "lfList"].forEach((id) => {
      const list = $("#" + id);
      if (!list) return;
      animateRows(list);
      const mo = new MutationObserver(() => animateRows(list));
      mo.observe(list, { childList: true });
      disposers.push(() => mo.disconnect());
    });

    // Numeral count-up — the donor targets `.kpi-val`, which this page does not
    // use; kept verbatim so the module matches the donor block for block.
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
        if (pr < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });

    // Press effects. The donor's selector also names shell controls
    // (.icon-btn, .sb-foot-ic, .sb-foot-acc); scoping the query to `.content`
    // leaves those to the shell module, which presses them itself.
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
    pressify(
      ".btn, .icon-btn, .card-foot-btn, .ptab, .pchip, .pager-btn, .pmenu-item, .photo-box, .pt-open, .sb-foot-ic, .sb-foot-acc",
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
