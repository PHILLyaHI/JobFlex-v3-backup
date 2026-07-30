// Referrals blueprint — runtime behaviors, ported verbatim from the donor
// file's <script> (jobflex-referrals-blueprint_1.html). Every duration, easing,
// stagger, template string and formula is the donor's exact value. Adaptations
// are mechanical only:
// - queries are scoped to the mounted `.content` root;
// - document/window listeners, timers and observers are tracked for unmount
//   cleanup;
// - the donor's chrome modules (the `window.matchMedia` polyfill for preview
//   shells, the mobile nav drawer, FLUID SCALE, the sidebar entry cascade, the
//   sliding sidebar indicator and the graph-paper parallax) are NOT ported —
//   the shared shell (components/v3/blueprint-shell/shell-behavior.ts) already
//   owns all of them;
// - the donor's `safe(name, fn)` try/catch wrapper is dropped: the modules it
//   guarded are either shell-owned or replaced by strict null checks below.

import { CONVERSIONS, type Conversion } from "./referrals-data";

export function initReferralsContent(content: HTMLElement): () => void {
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

  // ================= REFERRALS: DATA =================
  // The fixture lives in ./referrals-data.ts, verbatim from the donor. Nothing
  // on this page writes to it (no create flow), so it is aliased, not copied.
  const conversions: Conversion[] = CONVERSIONS;

  const rfState = { filter: "ALL" };

  function money(n: number) {
    return "$" + (n / 100).toLocaleString("en-US", { minimumFractionDigits: 0 });
  }
  function initials(email: string) {
    return email.slice(0, 2).toUpperCase();
  }
  function label(st: Conversion["status"]) {
    return st === "PAID" ? "credited" : st.toLowerCase();
  }

  // ================= RENDER =================
  function renderStats() {
    const uses = conversions.length;
    const paid = conversions.filter(function (c) { return c.status === "PAID"; });
    const conv = conversions.filter(function (c) { return c.status === "CONVERTED"; });
    const pending = conversions.filter(function (c) { return c.status === "PENDING"; }).length;
    const credited = paid.reduce(function (a, c) { return a + c.reward; }, 0);
    const grid = $("#statGrid");
    if (!grid) return;
    grid.innerHTML =
      '<div class="stat"><div class="kpi-lbl">Code uses</div><div class="stat-val">' + uses + "</div>" +
        '<div class="stat-hint">All time</div></div>' +
      '<div class="stat"><div class="kpi-lbl">Converted signups</div><div class="stat-val">' + (paid.length + conv.length) + "</div>" +
        '<div class="stat-hint">' + pending + " pending</div></div>" +
      '<div class="stat"><div class="kpi-lbl">Credit earned</div><div class="stat-val accent">' + money(credited) + "</div>" +
        '<div class="stat-hint">' + (conv.length ? conv.length + " credit" + (conv.length === 1 ? "" : "s") + " on the way" : "Nothing pending") + "</div></div>";
  }
  function renderFilters() {
    const defs = [
      { k: "ALL", l: "All", n: conversions.length },
      { k: "PAID", l: "Credited", n: conversions.filter(function (c) { return c.status === "PAID"; }).length },
      { k: "CONVERTED", l: "Converted", n: conversions.filter(function (c) { return c.status === "CONVERTED"; }).length },
      { k: "PENDING", l: "Pending", n: conversions.filter(function (c) { return c.status === "PENDING"; }).length },
    ];
    const box = $("#rfFilters");
    if (!box) return;
    box.innerHTML = defs.map(function (d) {
      return '<button class="rf-chip' + (rfState.filter === d.k ? " on" : "") + '" type="button" data-f="' + d.k + '">' + d.l + " " + d.n + "</button>";
    }).join("");
  }
  function renderConversions() {
    const rows = rfState.filter === "ALL"
      ? conversions
      : conversions.filter(function (c) { return c.status === rfState.filter; });
    const list = $("#convList");
    if (list) {
      list.innerHTML = rows.map(function (c) {
        return "<li>" +
          '<span class="conv-av">' + initials(c.email) + "</span>" +
          '<span class="conv-main"><span class="conv-t" style="display:block">' + c.email + "</span>" +
          '<span class="conv-s" style="display:block">' + c.when + "</span></span>" +
          (c.reward > 0 ? '<span class="conv-amt">' + money(c.reward) + "</span>" : "") +
          '<span class="pstatus cs--' + c.status.toLowerCase() + '">' + label(c.status) + "</span>" +
          "</li>";
      }).join("");
    }
    $("#convEmpty")?.classList.toggle("is-hidden", rows.length !== 0);
  }
  function renderReferrals() { renderStats(); renderFilters(); renderConversions(); }

  // ================= EVENTS =================
  function flashCopy(btn: HTMLElement) {
    if (btn.dataset.busy) return;
    btn.dataset.busy = "1";
    const html = btn.innerHTML;
    btn.classList.add("done");
    btn.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>';
    later(function () { btn.classList.remove("done"); btn.innerHTML = html; delete btn.dataset.busy; }, 1400);
  }
  on(document, "click", function (e) {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const cp = target.closest<HTMLElement>("[data-copy]");
    if (cp) { flashCopy(cp); return; }
    if (target.closest("#codeVal")) {
      const cc = $(".code-copy");
      if (cc) flashCopy(cc);
      return;
    }
    const f = target.closest<HTMLElement>("[data-f]");
    if (f) { rfState.filter = f.dataset.f ?? rfState.filter; renderFilters(); renderConversions(); return; }
    const share = target.closest<HTMLElement>("#shareBtn");
    if (share && !share.dataset.busy) {
      share.dataset.busy = "1";
      const old = share.innerHTML;
      share.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>Link copied';
      later(function () { share.innerHTML = old; delete share.dataset.busy; }, 1600);
    }
  });

  // ================= INITIALIZATION =================
  renderReferrals();

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
    // Second layer of the arrival — Overview cascades its `.kpi` strip here.
    // This page has no `.kpi` element, so the donor's layer is silently empty;
    // the selector ships unchanged so the port stays donor-exact.
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
      const rows = Array.from(list.querySelectorAll<HTMLElement>(".conv li, .stat"));
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
    ["convList", "statGrid"].forEach((id) => {
      const list = $("#" + id);
      if (!list) return;
      animateRows(list);
      const mo = new MutationObserver(() => animateRows(list));
      mo.observe(list, { childList: true });
      disposers.push(() => mo.disconnect());
    });

    // Numeral count-up — Overview's `.kpi-val`. This page renders none (its
    // headline figures are `.stat-val`), so the loop is a no-op; kept verbatim.
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
