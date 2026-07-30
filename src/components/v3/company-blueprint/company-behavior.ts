// Company blueprint — runtime behaviors, ported from the donor file's <script>
// (jobflex-company-blueprint_3.html). Every duration, easing, stagger, page
// size and string is the donor's exact value. Adaptations are mechanical only:
//
// - queries are scoped to the mounted `.content` root;
// - the donor's three document-level delegated listeners (input / change /
//   click) keep delegation but ignore events raised outside `.content`, which
//   is where every element they target lives in the donor anyway;
// - every document/window/`.main` listener, timer, rAF and observer is tracked
//   and torn down by the returned cleanup;
// - SKIPPED, because blueprint-shell/shell-behavior.ts already owns them: the
//   matchMedia polyfill, the mobile nav drawer, FLUID SCALE, the sidebar entry
//   cascade, the sliding active indicator and the graph-paper parallax.
//
// The donor creates no DOM outside `.content`; `#pMenu` (position: fixed) is
// the only fixed-position overlay and it ships inline in the markup, empty and
// display:none, exactly as the donor leaves it on this page.

import {
  COLOR_PRESETS,
  TRADE_TYPES,
  ACT_CATS,
  MEMBERS,
  ACTIVITY_DATA,
} from "./company-data";

export function initCompanyContent(content: HTMLElement): () => void {
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

  // Tracked timers / animation frames — cleared on unmount.
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };
  const frames = new Set<number>();
  const raf = (fn: FrameRequestCallback) => {
    const id = requestAnimationFrame((t) => {
      frames.delete(id);
      fn(t);
    });
    frames.add(id);
    return id;
  };
  const raf2 = (fn: () => void) => raf(() => raf(() => fn()));

  // ================= SAFETY: module isolation =================
  // Each block is wrapped so a failure in one does not disable the rest.
  const safe = (name: string, fn: () => void) => {
    try {
      fn();
    } catch (err) {
      console.error("[JobFlex] module failed: " + name, err);
    }
  };

  // Dismiss Lead Center banners (smooth height + gap collapse) — inert on this
  // page (no banner in the markup), kept for donor parity.
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
      raf2(() => {
        b.classList.add("closing");
        b.style.height = "0px";
      });
      b.addEventListener("transitionend", function te(e) {
        if (e.propertyName !== "height") return;
        b.classList.add("hidden");
        b.removeEventListener("transitionend", te);
      });
    });
  });

  // ================= COMPANY: STATE =================
  const co = {
    tab: "branding",
    color: "#1F7A52",
    trades: ["Roofing", "Fencing", "Decking", "Siding"] as string[],
    leadsOn: true,
    publicOn: false,
    actCat: "all",
    actQuery: "",
    actPerson: "Everyone",
    actVisible: 6,
    timers: {} as Record<string, ReturnType<typeof setTimeout> | undefined>,
  };

  function monogram(n: string) {
    const p = n.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
    return p.length === 1
      ? p[0].slice(0, 2).toUpperCase()
      : (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }
  // Autosave as in the original: "Saving…" → "All changes saved"
  function autosave(which: string) {
    const el = $("#" + which);
    if (!el) return;
    el.classList.remove("saved");
    el.textContent = "Saving…";
    const prev = co.timers[which];
    if (prev !== undefined) {
      clearTimeout(prev);
      timers.delete(prev);
    }
    co.timers[which] = later(() => {
      el.textContent = "All changes saved";
      el.classList.add("saved");
    }, 700);
  }

  // ================= RENDER =================
  function renderSwatches() {
    const host = $("#swatches");
    if (!host) return;
    host.innerHTML =
      COLOR_PRESETS.map(function (c) {
        return (
          '<button class="sw' +
          (co.color.toLowerCase() === c.toLowerCase() ? " on" : "") +
          '" type="button" data-color="' +
          c +
          '" style="background:' +
          c +
          '" aria-label="Pick color ' +
          c +
          '"></button>'
        );
      }).join("") +
      '<input class="sw-hex" id="hexInput" value="' + co.color + '" aria-label="Brand color hex">';
  }
  function renderPreview() {
    const val = function (f: string) {
      const el = $<HTMLInputElement>('[data-b="' + f + '"]');
      return el ? el.value.trim() : "";
    };
    const name = val("name") || "Your company";
    const sub = val("site") || val("phone") || val("email") || "—";
    const prev = $("#mailPrev");
    if (!prev) return;
    prev.style.borderLeftColor = co.color;
    prev.innerHTML =
      '<span class="mail-mark" style="background:' + co.color + '">' +
      name.charAt(0).toUpperCase() +
      "</span>" +
      '<span style="min-width:0"><span class="mail-name" style="display:block">' + name + "</span>" +
      '<span class="mail-sub" style="display:block">' + sub + "</span></span>";
  }
  function renderTrades() {
    const host = $("#trades");
    if (host) {
      host.innerHTML = TRADE_TYPES.map(function (t) {
        return (
          '<button class="trade' +
          (co.trades.indexOf(t) !== -1 ? " on" : "") +
          '" type="button" data-trade="' +
          t +
          '">' +
          t +
          "</button>"
        );
      }).join("");
    }
    const badge = $("#leadState");
    if (!badge) return;
    const ready = co.trades.length > 0 && co.leadsOn;
    badge.className = "pstatus " + (ready ? "lead-ok" : "lead-wait");
    badge.textContent = ready ? "Matching on" : co.trades.length === 0 ? "Pick a trade" : "Paused";
  }
  function renderActivity() {
    const cats = $("#actCats");
    if (cats) {
      cats.innerHTML = ACT_CATS.map(function (c) {
        return (
          '<button class="act-cat' +
          (co.actCat === c.key ? " on" : "") +
          '" type="button" data-cat="' +
          c.key +
          '">' +
          c.label +
          "</button>"
        );
      }).join("");
    }
    const sel = $<HTMLSelectElement>("#actPerson");
    if (sel && !sel.options.length) {
      sel.innerHTML = MEMBERS.map(function (m) {
        return "<option>" + m + "</option>";
      }).join("");
    }
    const q = co.actQuery.trim().toLowerCase();
    const rows = ACTIVITY_DATA.filter(function (a) {
      if (co.actCat !== "all" && a.cat !== co.actCat) return false;
      if (co.actPerson !== "Everyone" && a.actor !== co.actPerson) return false;
      if (!q) return true;
      return (
        (a.actor + " " + a.summary + " " + a.meta)
          .toLowerCase()
          .replace(/<[^>]+>/g, "")
          .indexOf(q) !== -1
      );
    });
    const shown = rows.slice(0, co.actVisible);
    let html = "";
    let lastDay: string | null = null;
    shown.forEach(function (a) {
      if (a.day !== lastDay) {
        html += '<div class="act-day">' + a.day + "</div>";
        lastDay = a.day;
      }
      html +=
        '<div class="act-row">' +
        '<span class="act-av">' +
        monogram(a.actor) +
        (a.tone
          ? '<span class="act-bead" style="background:' + a.tone + '"></span>'
          : '<span class="act-bead"></span>') +
        "</span>" +
        '<span class="act-txt"><span class="act-sum" style="display:block"><b>' +
        a.actor +
        "</b> " +
        a.summary +
        "</span>" +
        '<span class="act-meta" style="display:block">' +
        a.meta +
        "</span></span>" +
        '<span class="act-time">' +
        a.time +
        "</span>" +
        "</div>";
    });
    const feed = $("#actFeed");
    if (feed) feed.innerHTML = html;
    $("#actEmpty")?.classList.toggle("is-hidden", rows.length !== 0);
    $("#actMore")?.classList.toggle("is-hidden", rows.length <= co.actVisible);
  }
  function renderCompany() {
    renderSwatches();
    renderPreview();
    renderTrades();
    renderActivity();
  }

  // ================= EVENTS =================
  const coTabs = $("#coTabs");
  if (coTabs) {
    on(coTabs, "click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>(".co-tab");
      if (!b || b.classList.contains("active")) return;
      co.tab = b.dataset.tab ?? "";
      $$("#coTabs .co-tab").forEach(function (t) {
        t.classList.toggle("active", t === b);
      });
      $$(".ppanel").forEach(function (p) {
        p.classList.toggle("is-hidden", p.dataset.panel !== co.tab);
      });
    });
  }

  // Branding: field edits -> preview + autosave
  on(document, "input", (e) => {
    const t = e.target as HTMLElement | null;
    if (!t || !root.contains(t)) return;
    if (t.matches("[data-b]")) {
      renderPreview();
      autosave("saveBranding");
    }
    if (t.matches("[data-l]")) {
      autosave("saveLead");
    }
    if (t.matches("[data-g]")) {
      autosave("saveLanding");
    }
    if (t.id === "hexInput") {
      const v = (t as HTMLInputElement).value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        co.color = v;
        $$(".sw").forEach(function (b) {
          b.classList.toggle("on", (b.dataset.color ?? "").toLowerCase() === v.toLowerCase());
        });
        renderPreview();
        autosave("saveBranding");
      }
    }
    if (t.id === "actSearch") {
      co.actQuery = (t as HTMLInputElement).value;
      co.actVisible = 6;
      renderActivity();
    }
  });
  on(document, "change", (e) => {
    const t = e.target as HTMLElement | null;
    if (!t || !root.contains(t)) return;
    if (t.id === "actPerson") {
      co.actPerson = (t as HTMLSelectElement).value;
      co.actVisible = 6;
      renderActivity();
    }
  });

  on(document, "click", (e) => {
    const t = e.target as HTMLElement | null;
    if (!t || !root.contains(t)) return;

    const sw = t.closest<HTMLElement>("[data-color]");
    if (sw) {
      co.color = sw.dataset.color ?? co.color;
      renderSwatches();
      renderPreview();
      autosave("saveBranding");
      return;
    }
    const tr = t.closest<HTMLElement>("[data-trade]");
    if (tr) {
      const trade = tr.dataset.trade ?? "";
      const i = co.trades.indexOf(trade);
      if (i === -1) co.trades.push(trade);
      else co.trades.splice(i, 1);
      renderTrades();
      autosave("saveLead");
      return;
    }
    if (t.closest("#leadToggle")) {
      co.leadsOn = !co.leadsOn;
      $("#leadToggle")?.classList.toggle("on", co.leadsOn);
      renderTrades();
      autosave("saveLead");
      return;
    }
    if (t.closest("#publicToggle")) {
      co.publicOn = !co.publicOn;
      $("#publicToggle")?.classList.toggle("on", co.publicOn);
      autosave("saveLanding");
      return;
    }
    const cat = t.closest<HTMLElement>("[data-cat]");
    if (cat) {
      co.actCat = cat.dataset.cat ?? "all";
      co.actVisible = 6;
      renderActivity();
      return;
    }
    if (t.closest("#actMoreBtn")) {
      co.actVisible += 6;
      renderActivity();
      return;
    }
    if (t.closest("#logoDrop")) {
      const d = $("#logoDrop");
      if (d) {
        d.classList.add("over");
        later(function () {
          d.classList.remove("over");
        }, 600);
      }
      autosave("saveBranding");
      return;
    }
    const fl = t.closest<HTMLElement>("[data-flash]");
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

  const logoDrop = $("#logoDrop");
  if (logoDrop) {
    ["dragenter", "dragover"].forEach(function (ev) {
      on(logoDrop, ev, function (e) {
        e.preventDefault();
        logoDrop.classList.add("over");
      });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      on(logoDrop, ev, function (e) {
        e.preventDefault();
        logoDrop.classList.remove("over");
      });
    });
  }

  // ================= INITIALIZATION =================
  safe("init", function () {
    renderCompany();
  });

  // The mobile nav drawer and FLUID SCALE belong to the persistent chrome and
  // live in components/v3/blueprint-shell/shell-behavior.ts.

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

    // Reveal: load + scroll.
    // Reveal adapts to scroll speed: slow scroll gets the full 420ms
    // animation; fast scroll a short one — it keeps up but stays visible.
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
    // small units are the settings cards. Skip anything the block cascade
    // already claimed: no element should carry `rv` and `rv-cell` at once.
    const cells = $$(".co-card").filter((el) => !el.classList.contains("rv"));
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
            // element below the fold: duration follows the current scroll speed
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
      const rows = Array.from(list.querySelectorAll<HTMLElement>(".act-row"));
      rows.forEach((r, i) => {
        r.style.opacity = "0";
        r.style.transform = "translateY(8px)";
        r.style.transition =
          "opacity 300ms " + EASE + " " + i * 45 + "ms, transform 300ms " + EASE + " " + i * 45 + "ms";
        raf2(() => {
          r.style.opacity = "1";
          r.style.transform = "none";
        });
        // Drop the inline styles once the stagger lands. Left in place, the
        // inline `transform: none` outranks every stylesheet `:hover` rule,
        // so hover lift on activity rows silently stops working.
        r.addEventListener("transitionend", function te(e) {
          if (e.propertyName !== "transform") return;
          r.style.opacity = "";
          r.style.transform = "";
          r.style.transition = "";
          r.removeEventListener("transitionend", te);
        });
      });
    }
    ["actFeed", "trades"].forEach((id) => {
      const list = $("#" + id);
      if (!list) return;
      animateRows(list);
      const mo = new MutationObserver(() => animateRows(list));
      mo.observe(list, { childList: true });
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
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    frames.forEach((id) => cancelAnimationFrame(id));
    frames.clear();
  };
}
