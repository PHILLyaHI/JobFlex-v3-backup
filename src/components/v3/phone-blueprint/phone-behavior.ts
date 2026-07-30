// Phone blueprint — runtime behaviors, ported verbatim from the donor file's
// <script> (jobflex-phone-blueprint_1.html). Every duration, easing, stagger,
// interval and template string is the donor's exact value. Adaptations are
// mechanical only:
// - queries are scoped to the mounted `.content` root;
// - document/window listeners, observers, intervals and timeouts are tracked
//   for unmount cleanup;
// - the donor's chrome modules (the `window.matchMedia` polyfill, the mobile
//   nav drawer, FLUID SCALE, the sidebar entry cascade, the sliding active
//   indicator and the graph-paper parallax) are NOT ported here — the shared
//   shell (components/v3/blueprint-shell/shell-behavior.ts) already owns all
//   of them;
// - the donor's `safe(name, fn)` try/catch wrapper is dropped: the modules it
//   guarded are either shell-owned or replaced by the strict null checks below;
// - the fixture is copied per mount, because the donor mutates it (the
//   "Create lead" action writes `c.lead`) and the seed is a module constant;
// - the reveal cascade skips `#sheetBg` / `#sheet`: in the donor those two
//   fixed overlays live OUTSIDE `.content` and therefore never joined the
//   `.content > *` cascade. Excluding them here reproduces the donor exactly
//   (and keeps a `display:none` element from being frozen at `opacity: 0`).

import { CALLS_SEED, type Call } from "./phone-data";

export function initPhoneContent(content: HTMLElement): () => void {
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
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };
  const $ = (sel: string) => root.querySelector<HTMLElement>(sel);
  const $$ = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));

  // A per-mount COPY of the fixture. `make-lead` writes `c.lead`, and the seed
  // is a module-level constant — mutating it directly would leak every created
  // lead into the next visit to the page. `script` is never written, so a
  // shallow record copy is enough.
  const callsData: Call[] = CALLS_SEED.map((c) => ({ ...c }));

  // Dismiss Lead Center banners (smooth height + gap collapse) — inert on this
  // page (no `.banner` in the markup), kept for donor parity with shared shells.
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

  // ================= PHONE: STATE =================
  // (The donor's SHOP_NUMBER + callsData fixture lives in ./phone-data.)
  const ph = {
    filter: "ALL",
    selected: null as string | null,
    playing: false,
    timer: null as ReturnType<typeof setInterval> | null,
  };

  function fmtDur(sec: number | null) {
    if (sec == null) return "—";
    const m = Math.floor(sec / 60),
      s2 = sec % 60;
    return m + ":" + String(s2).padStart(2, "0");
  }
  function statusLabel(v: string) {
    return v.toLowerCase().replace("_", " ");
  }

  // ================= RENDER =================
  function renderStats() {
    const today = callsData.filter(function (c) {
      return /m ago|h ago/.test(c.when);
    }).length;
    const week = callsData.length;
    const leads = callsData.filter(function (c) {
      return c.lead;
    }).length;
    const cards: Array<{ l: string; v: number; h: string; accent?: boolean }> = [
      { l: "Calls today", v: today, h: "Since midnight" },
      { l: "Calls · 7d", v: week, h: "Inbound and outbound" },
      { l: "Auto-leads · 7d", v: leads, h: "Created from transcripts", accent: true },
    ];
    const grid = $("#statGrid");
    if (!grid) return;
    grid.innerHTML = cards
      .map(function (c) {
        return (
          '<div class="stat"><div class="kpi-lbl">' +
          c.l +
          "</div>" +
          '<div class="stat-val' +
          (c.accent ? " accent" : "") +
          '">' +
          c.v +
          "</div>" +
          '<div class="stat-hint">' +
          c.h +
          "</div></div>"
        );
      })
      .join("");
  }
  function filtered() {
    if (ph.filter === "ALL") return callsData;
    if (ph.filter === "LEADS")
      return callsData.filter(function (c) {
        return c.lead;
      });
    return callsData.filter(function (c) {
      return c.dir === ph.filter;
    });
  }
  function renderFilters() {
    const defs = [
      { k: "ALL", l: "All", n: callsData.length },
      {
        k: "INBOUND",
        l: "Inbound",
        n: callsData.filter(function (c) {
          return c.dir === "INBOUND";
        }).length,
      },
      {
        k: "OUTBOUND",
        l: "Outbound",
        n: callsData.filter(function (c) {
          return c.dir === "OUTBOUND";
        }).length,
      },
      {
        k: "LEADS",
        l: "Became leads",
        n: callsData.filter(function (c) {
          return c.lead;
        }).length,
      },
    ];
    const box = $("#phFilters");
    if (!box) return;
    box.innerHTML = defs
      .map(function (d) {
        return (
          '<button class="ph-chip' +
          (ph.filter === d.k ? " on" : "") +
          '" type="button" data-f="' +
          d.k +
          '">' +
          d.l +
          " " +
          d.n +
          "</button>"
        );
      })
      .join("");
  }
  function renderCalls() {
    const body = $("#callBody");
    const empty = $("#callEmpty");
    if (!body || !empty) return;
    const rows = filtered();
    body.innerHTML = rows
      .map(function (c) {
        return (
          '<tr class="prow" data-call="' +
          c.id +
          '">' +
          '<td><div class="ph-num">' +
          c.from +
          '</div><div class="ph-to">to ' +
          c.to +
          "</div></td>" +
          '<td><span class="pstatus dir--' +
          (c.dir === "INBOUND" ? "in" : "out") +
          '">' +
          c.dir.toLowerCase() +
          "</span>" +
          (c.lead ? '<span class="pstatus lead-flag">lead</span>' : "") +
          "</td>" +
          '<td><span class="ph-dur">' +
          fmtDur(c.dur) +
          "</span></td>" +
          "<td>" +
          (c.summary
            ? '<span class="ph-sum">' + c.summary + "</span>"
            : '<span class="ph-sum none">No transcript yet</span>') +
          "</td>" +
          '<td><span class="ph-when">' +
          c.when +
          "</span></td>" +
          '<td class="num"><span class="pt-open"><svg class="ic"><use href="#i-arrow"/></svg></span></td>' +
          "</tr>"
        );
      })
      .join("");
    empty.classList.toggle("is-hidden", rows.length !== 0);
  }
  function renderPhone() {
    renderStats();
    renderFilters();
    renderCalls();
  }

  // ================= PANEL =================
  function openCall(id: string) {
    const c = callsData.find(function (x) {
      return x.id === id;
    });
    if (!c) return;
    ph.selected = id;
    stopPlay();
    const title = $("#sheetTitle");
    const body = $("#sheetBody");
    const sheet = $("#sheet");
    const bg = $("#sheetBg");
    if (!title || !body || !sheet || !bg) return;
    title.textContent = "Call from " + c.from;
    body.innerHTML =
      '<div class="sh-badges">' +
      '<span class="pstatus dir--' +
      (c.dir === "INBOUND" ? "in" : "out") +
      '">' +
      c.dir.toLowerCase() +
      "</span>" +
      '<span class="pstatus st--' +
      c.status.toLowerCase() +
      '">' +
      statusLabel(c.status) +
      "</span>" +
      '<span class="pstatus">' +
      fmtDur(c.dur) +
      "</span>" +
      (c.lead ? '<span class="pstatus lead-flag">lead ' + c.lead + "</span>" : "") +
      "</div>" +
      (c.rec
        ? '<div class="sh-sec"><div class="kpi-lbl">Recording</div>' +
          '<div class="player"><button class="play-btn" type="button" id="playBtn" aria-label="Play recording">' +
          '<svg class="ic"><use href="#i-arrow"/></svg></button>' +
          '<span class="play-track"><span class="play-fill" id="playFill"></span></span>' +
          '<span class="play-time" id="playTime">0:00 / ' +
          fmtDur(c.dur) +
          "</span></div></div>"
        : "") +
      '<div class="sh-sec"><div class="kpi-lbl">Call summary</div>' +
      (c.summary
        ? '<div class="sh-summary">' + c.summary + "</div>"
        : '<div class="sh-none">No summary yet — it is written once the recording finishes processing.</div>') +
      "</div>" +
      '<div class="sh-sec"><div class="kpi-lbl">Transcript</div>' +
      (c.script.length
        ? '<div class="script">' +
          c.script
            .map(function (l) {
              return (
                '<div class="script-line ' +
                (l[0] === "agent" ? "agent" : "") +
                '">' +
                '<span class="script-who">' +
                (l[0] === "agent" ? "Shop" : "Caller") +
                "</span>" +
                "<span>" +
                l[1] +
                "</span></div>"
              );
            })
            .join("") +
          "</div>"
        : '<div class="sh-none">No transcript yet — it is posted once the recording completes.</div>') +
      "</div>" +
      '<div class="sh-act">' +
      (c.lead
        ? '<button class="btn btn-ghost btn--sm" type="button" data-flash="Opened"><svg class="ic"><use href="#i-ext"/></svg>Open lead</button>'
        : '<button class="btn btn-primary btn--sm" type="button" data-act="make-lead"><svg class="ic"><use href="#i-target"/></svg>Create lead</button>') +
      '<button class="btn btn-ghost btn--sm" type="button" data-flash="Calling"><svg class="ic"><use href="#i-phone"/></svg>Call back</button>' +
      "</div>";
    sheet.classList.add("open");
    bg.classList.add("open");
  }
  function closeSheet() {
    stopPlay();
    $("#sheet")?.classList.remove("open");
    $("#sheetBg")?.classList.remove("open");
    ph.selected = null;
  }
  function stopPlay() {
    if (ph.timer) {
      clearInterval(ph.timer);
      ph.timer = null;
    }
    ph.playing = false;
  }
  function togglePlay() {
    const c = callsData.find(function (x) {
      return x.id === ph.selected;
    });
    if (!c || !c.dur) return;
    const dur = c.dur;
    const fill = $("#playFill");
    const time = $("#playTime");
    if (ph.playing) {
      stopPlay();
      return;
    }
    ph.playing = true;
    let t = 0;
    ph.timer = setInterval(function () {
      t += 1;
      if (t >= dur) {
        stopPlay();
        t = dur;
      }
      if (fill) fill.style.width = (t / dur) * 100 + "%";
      if (time) time.textContent = fmtDur(t) + " / " + fmtDur(dur);
    }, 40);
  }
  // The player interval is the one long-lived timer on this page.
  disposers.push(() => stopPlay());

  // ================= EVENTS =================
  on(document, "click", function (e) {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const f = target.closest<HTMLElement>("[data-f]");
    if (f) {
      ph.filter = f.dataset.f || "ALL";
      renderFilters();
      renderCalls();
      return;
    }
    const row = target.closest<HTMLElement>("[data-call]");
    if (row) {
      if (row.dataset.call) openCall(row.dataset.call);
      return;
    }
    if (target.closest('[data-sheet="close"]') || target.id === "sheetBg") {
      closeSheet();
      return;
    }
    if (target.closest("#playBtn")) {
      togglePlay();
      return;
    }
    if (target.closest("#hookCopy")) {
      const b = $("#hookCopy");
      if (!b || b.dataset.busy) return;
      b.dataset.busy = "1";
      const html = b.innerHTML;
      b.classList.add("done");
      b.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>Copied';
      later(function () {
        b.classList.remove("done");
        b.innerHTML = html;
        delete b.dataset.busy;
      }, 1400);
      return;
    }
    const act = target.closest<HTMLElement>("[data-act]");
    if (act && act.dataset.act === "make-lead") {
      const c = callsData.find(function (x) {
        return x.id === ph.selected;
      });
      if (c) {
        c.lead = "L-" + (6100 + Math.floor(Math.random() * 90));
      }
      const keep = ph.selected;
      renderPhone();
      if (keep) openCall(keep);
      return;
    }
    const fl = target.closest<HTMLElement>("[data-flash]");
    if (fl && !fl.dataset.busy) {
      fl.dataset.busy = "1";
      const old = fl.innerHTML;
      fl.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>' + (fl.dataset.flash ?? "");
      later(function () {
        fl.innerHTML = old;
        delete fl.dataset.busy;
      }, 1500);
    }
  });

  // ================= INITIALIZATION =================
  renderPhone();

  // The matchMedia polyfill, mobile nav drawer and FLUID SCALE belong to the
  // persistent chrome and live in
  // components/v3/blueprint-shell/shell-behavior.ts.

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

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
    // `#sheetBg` / `#sheet` are excluded: in the donor they are not `.content`
    // children, so the cascade never touched them.
    const blocks = $$(".content > *").filter(
      (el) => !el.classList.contains("sheet") && !el.classList.contains("sheet-bg"),
    );
    blocks.forEach((el, i) => {
      el.classList.add("rv");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? i * 60 + "ms" : "200ms";
    });
    // Second layer of the arrival — Overview cascades its `.kpi` strip here.
    // This page ships no `.kpi` element (its tiles are `.stat`, staggered by
    // animateRows below), so the donor's layer is silently empty. Kept
    // verbatim rather than re-pointed: the donor plays no `rv-cell` pass here.
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
            // below the fold: duration from the current scroll speed
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
      const rows = Array.from(list.querySelectorAll<HTMLElement>(".prow, .stat"));
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
      });
    }
    ["callBody", "statGrid"].forEach((id) => {
      const list = $("#" + id);
      if (!list) return;
      animateRows(list);
      const mo = new MutationObserver(() => animateRows(list));
      mo.observe(list, { childList: true });
      disposers.push(() => mo.disconnect());
    });

    // KPI count-up. Like the donor, this targets `.kpi-val`; the phone page
    // has none (its figures are `.stat-val`), so no number counts up here —
    // that is the donor's own behavior, preserved.
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
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    disposers.forEach((d) => d());
  };
}
