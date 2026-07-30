// Reviews blueprint — runtime behaviors, ported verbatim from the donor file's
// <script> (jobflex-reviews-blueprint_3.html). Every duration, easing, stagger
// and formula is the donor's exact value. Adaptations are mechanical only:
// - queries are scoped to the mounted `.content` root;
// - document/window listeners, timers and observers are tracked for unmount
//   cleanup;
// - the donor's chrome modules (matchMedia polyfill, mobile nav drawer, FLUID
//   SCALE, the sidebar entry cascade, the sliding active indicator and the
//   graph-paper parallax) are NOT ported here — the shared shell
//   (components/v3/blueprint-shell/shell-behavior.ts) already owns all of them;
// - the donor's `safe(name, fn)` try/catch wrapper is dropped: the modules it
//   guarded are either shell-owned or replaced by strict null checks below.

import { REVIEWS_SEED, type ReviewRequest } from "./reviews-data";

/** A COMPLETED request that carries a score — what the feed, stats and spread
 *  all work from. The donor's `completed()` filter is the same predicate; this
 *  type just lets TypeScript see the narrowing. */
type CompletedReview = ReviewRequest & { rating: number };

export function initReviewsContent(content: HTMLElement): () => void {
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
  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (fn: () => void, ms: number) => {
    timers.push(setTimeout(fn, ms));
  };
  const $ = (sel: string) => root.querySelector<HTMLElement>(sel);
  const $$ = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));

  // A per-mount COPY of the fixture. The "nudge" action below rewrites
  // `status` and `when` in place, and the seed is a module-level constant —
  // mutating it directly would leak a nudged request into the next visit to
  // the page (and into any other importer of REVIEWS_SEED).
  const reviewData: ReviewRequest[] = REVIEWS_SEED.map((r) => ({ ...r }));

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

  // ================= REVIEWS: STATE + HELPERS =================
  const rv: { filter: string } = { filter: "ALL" };

  function completed(): CompletedReview[] {
    return reviewData.filter(function (r): r is CompletedReview {
      return r.status === "COMPLETED" && !!r.rating;
    });
  }
  function pending() {
    return reviewData.filter(function (r) {
      return r.status !== "COMPLETED";
    });
  }
  function starsHtml(n: number, size?: number) {
    let out = '<span class="stars">';
    for (let i = 1; i <= 5; i++) {
      out += '<svg class="star ' + (i <= n ? "star--on" : "star--off") + '"' + (size ? ' style="width:' + size + 'px;height:' + size + 'px"' : "") +
        '><use href="#i-star"/></svg>';
    }
    return out + "</span>";
  }

  // ================= RENDER =================
  function renderStats() {
    const done = completed();
    const avg = done.length ? done.reduce(function (a, r) { return a + r.rating; }, 0) / done.length : 0;
    const requested = reviewData.length;
    const rate = requested ? Math.round((done.length / requested) * 100) : 0;
    const el = $("#statGrid");
    if (!el) return;
    el.innerHTML =
      '<div class="stat"><div class="kpi-lbl">Average rating</div>' +
        '<div class="stat-val">' + (avg ? avg.toFixed(2) : "—") + starsHtml(Math.round(avg)) + "</div>" +
        '<div class="stat-hint">' + done.length + " review" + (done.length === 1 ? "" : "s") + "</div></div>" +
      '<div class="stat"><div class="kpi-lbl">Total reviews</div>' +
        '<div class="stat-val">' + done.length + "</div>" +
        '<div class="stat-hint">All time</div></div>' +
      '<div class="stat"><div class="kpi-lbl">Response rate</div>' +
        '<div class="stat-val accent">' + rate + "%</div>" +
        '<div class="stat-hint">' + done.length + " of " + requested + " requested</div></div>";
  }
  function renderFilters() {
    const done = completed();
    const star = '<svg class="ic rv-chip-star"><use href="#i-star"/></svg>';
    let html = '<button class="rv-chip' + (rv.filter === "ALL" ? " on" : "") +
      '" type="button" data-f="ALL">All<span class="rv-chip-n">' + done.length + "</span></button>";
    [5, 4, 3, 2, 1].forEach(function (n) {
      const c = done.filter(function (r) { return r.rating === n; }).length;
      html += '<button class="rv-chip' + (rv.filter === String(n) ? " on" : "") + (c === 0 ? " empty" : "") +
        '" type="button" data-f="' + n + '" aria-label="' + n + ' star reviews">' +
        '<span class="rv-chip-stars">' + star.repeat(n) + "</span>" +
        '<span class="rv-chip-n">' + c + "</span></button>";
    });
    const el = $("#rvFilters");
    if (el) el.innerHTML = html;
  }
  function renderList() {
    let rows = completed();
    if (rv.filter !== "ALL") {
      const n = Number(rv.filter);
      rows = rows.filter(function (r) { return r.rating === n; });
    }
    const el = $("#rvList");
    if (el) {
      el.innerHTML = rows.map(function (r) {
        const tone = r.rating >= 5 ? "hi" : r.rating <= 2 ? "low" : "";
        return "<li>" +
          '<span class="rv-score ' + tone + '">' + r.rating + "</span>" +
          '<div class="rv-main">' +
            '<div class="rv-top">' + starsHtml(r.rating) + '<span class="rv-when">' + r.when + "</span></div>" +
            '<div class="rv-who">' + r.client + '<span> · <a href="#">' + r.job + "</a></span></div>" +
            (r.comment ? '<blockquote class="rv-quote">"' + r.comment + '"</blockquote>' : "") +
          "</div></li>";
      }).join("");
    }
    $("#rvEmpty")?.classList.toggle("is-hidden", rows.length !== 0);
  }
  function renderSpread() {
    const done = completed();
    const max = Math.max(1, Math.max.apply(null, [5, 4, 3, 2, 1].map(function (n) {
      return done.filter(function (r) { return r.rating === n; }).length;
    })));
    const el = $("#spread");
    if (!el) return;
    el.innerHTML = [5, 4, 3, 2, 1].map(function (n) {
      const c = done.filter(function (r) { return r.rating === n; }).length;
      const cls = n === 5 ? "top" : n === 4 ? "good" : n === 3 ? "mid" : "bad";
      return '<div class="sp-row"><span class="sp-k">' + n + '<svg class="ic"><use href="#i-star"/></svg></span>' +
        '<span class="sp-track"><span class="sp-fill ' + cls + '" data-w="' + ((c / max) * 100).toFixed(1) + '"></span></span>' +
        '<span class="sp-n">' + c + "</span></div>";
    }).join("");
    requestAnimationFrame(function () {
      $$(".sp-fill").forEach(function (f) { f.style.width = (f.dataset.w ?? "") + "%"; });
    });
  }
  function renderPending() {
    const rows = pending();
    const countEl = $("#pendCount");
    if (countEl) countEl.textContent = String(rows.length);
    const el = $("#pendList");
    if (el) {
      el.innerHTML = rows.map(function (r) {
        return '<li data-req="' + r.id + '"><div class="pend-main">' +
          '<div class="pend-t">' + r.client + "</div>" +
          '<div class="pend-s">' + r.job + " · " + r.when + "</div></div>" +
          '<span class="pstatus st--' + r.status.toLowerCase() + '">' + r.status.toLowerCase() + "</span>" +
          '<button class="pend-btn" type="button" data-act="nudge"><svg class="ic"><use href="#i-send"/></svg>' +
            (r.status === "SENT" ? "Resend" : "Send") + "</button></li>";
      }).join("");
    }
    $("#pendEmpty")?.classList.toggle("is-hidden", rows.length !== 0);
  }
  function renderReviews() { renderStats(); renderFilters(); renderList(); renderSpread(); renderPending(); }

  // ================= EVENTS =================
  on(document, "click", function (e) {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const f = target.closest<HTMLElement>("[data-f]");
    if (f) { rv.filter = f.dataset.f ?? "ALL"; renderFilters(); renderList(); return; }
    const act = target.closest<HTMLElement>("[data-act]");
    if (act && act.dataset.act === "nudge") {
      const li = act.closest<HTMLElement>("[data-req]");
      const r = li ? reviewData.find(function (x) { return x.id === li.dataset.req; }) : undefined;
      if (r) { r.status = "SENT"; r.when = "just now"; }
      act.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>Sent';
      later(function () { renderPending(); renderStats(); }, 1200);
    }
  });

  // ================= INIT =================
  renderReviews();

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

    // Reveal: load + scroll.
    // Reveal adapts to scroll speed: a slow scroll gets the full 420ms
    // animation; a fast one a short pass — never lagging, still visible.
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
          const el = en.target as HTMLElement;
          if (el.dataset.rvScroll) {
            // below the fold: duration from the current scroll speed
            const dur = Math.round(Math.max(550, 900 - scrollVel * 160));
            el.style.transitionDuration = dur + "ms";
          }
          el.classList.add("rv-in");
          io.unobserve(el);
          el.addEventListener("transitionend", function te() {
            el.style.transitionDelay = "";
            el.style.transitionDuration = "";
            el.removeEventListener("transitionend", te);
          });
        });
      },
      { threshold: 0, rootMargin: "0px 0px 60px 0px" },
    );
    blocks.concat(cells).forEach((el) => io.observe(el));
    disposers.push(() => io.disconnect());

    // (The sidebar entry cascade lives in the shell — it owns .sb.)

    // Row stagger on (re)render of the lists
    function animateRows(list: HTMLElement) {
      const rows = Array.from(list.querySelectorAll<HTMLElement>(".rv-list li, .stat"));
      rows.forEach((r, i) => {
        r.style.opacity = "0";
        r.style.transform = "translateY(8px)";
        r.style.transition = "opacity 300ms " + EASE + " " + i * 45 + "ms, transform 300ms " + EASE + " " + i * 45 + "ms";
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            r.style.opacity = "1";
            r.style.transform = "none";
          }),
        );
      });
    }
    ["rvList", "statGrid"].forEach((id) => {
      const list = $("#" + id);
      if (!list) return;
      animateRows(list);
      const mo = new MutationObserver(() => animateRows(list));
      mo.observe(list, { childList: true });
      disposers.push(() => mo.disconnect());
    });

    // Numeral count-up — Overview's `.kpi-val`. This page's figures render as
    // `.stat-val`, so the donor's selector matches nothing here; kept verbatim
    // so the shared motion block does not drift between pages.
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
    timers.forEach((t) => clearTimeout(t));
    disposers.forEach((d) => d());
  };
}
