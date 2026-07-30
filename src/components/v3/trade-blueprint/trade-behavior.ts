// Trade board blueprint — runtime behaviors, ported verbatim from the donor
// file's <script> (jobflex-trade-board-blueprint.html). Every duration, easing,
// stagger, formula and string is the donor's exact value. Adaptations are
// mechanical only:
// - queries are scoped to the mounted `.content` root;
// - document/window listeners and observers are tracked for unmount cleanup;
// - the donor's chrome modules (matchMedia polyfill, mobile nav drawer, FLUID
//   SCALE, the sidebar entry cascade, the sliding active indicator and the
//   graph-paper parallax) are NOT ported here — the shared shell
//   (components/v3/blueprint-shell/shell-behavior.ts) already owns all of them;
// - the donor's `safe(name, fn)` try/catch wrapper is dropped: the modules it
//   guarded are either shell-owned or replaced by strict null checks below.

import {
  CATEGORIES,
  INF_PERIOD,
  PAYOUTS,
  POSTS_SEED,
  POST_SEQ_START,
  STATEMENTS,
  type TradePost,
} from "./trade-data";

export function initTradeContent(content: HTMLElement): () => void {
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

  // ================= TRADE BOARD: DATA =================
  // A per-mount COPY of the fixture. The publish flow below unshifts into this
  // array, and the seed is a module-level constant — mutating it directly would
  // leak every published post into the next visit to the page (and into any
  // other importer of POSTS_SEED).
  let postSeq = POST_SEQ_START;
  const postsData: TradePost[] = POSTS_SEED.map((p) => ({ ...p }));

  const statements = STATEMENTS;
  const payouts = PAYOUTS;

  const td = { tab: "posts", cat: "all" };

  function money(n: number) {
    return "$" + Math.round(n).toLocaleString("en-US");
  }
  function initials(n: string) {
    const p = n.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
    return p.length === 1
      ? p[0].slice(0, 2).toUpperCase()
      : (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }
  function catLabel(k: string) {
    const c = CATEGORIES.find(function (x) {
      return x.key === k;
    });
    return c ? c.label.toLowerCase() : k.replace("-", " ");
  }

  // ================= RENDER: POSTS =================
  function renderCats() {
    const cats = $("#cats");
    const postsN = $("#postsN");
    if (!cats || !postsN) return;
    cats.innerHTML = CATEGORIES.map(function (c) {
      const n =
        c.key === "all"
          ? postsData.length
          : postsData.filter(function (p) {
              return p.cat === c.key;
            }).length;
      return (
        '<button class="cat' +
        (td.cat === c.key ? " on" : "") +
        '" type="button" data-cat="' +
        c.key +
        '">' +
        (c.tone ? '<span class="cat-dot" style="background:' + c.tone + '"></span>' : "") +
        c.label +
        '<span class="cat-n">' +
        n +
        "</span></button>"
      );
    }).join("");
    postsN.textContent = String(postsData.length);
  }
  function renderPosts() {
    const list = $("#postList");
    const empty = $("#postEmpty");
    if (!list || !empty) return;
    const rows =
      td.cat === "all"
        ? postsData
        : postsData.filter(function (p) {
            return p.cat === td.cat;
          });
    list.innerHTML = rows
      .map(function (p) {
        const closed = p.status === "CLOSED";
        return (
          '<article class="post' +
          (closed ? " closed" : "") +
          '" data-post="' +
          p.id +
          '">' +
          '<div class="post-top">' +
          '<span class="pstatus cat--' +
          p.cat +
          '">' +
          catLabel(p.cat) +
          "</span>" +
          (closed ? '<span class="pstatus cat--closed">closed</span>' : "") +
          "</div>" +
          '<h3 class="post-t">' +
          p.title +
          "</h3>" +
          '<p class="post-b">' +
          p.body +
          "</p>" +
          '<div class="post-foot">' +
          '<span class="post-av">' +
          initials(p.author) +
          "</span>" +
          '<span class="post-who">' +
          p.author +
          "</span>" +
          '<span class="post-when">' +
          p.when +
          "</span>" +
          '<span class="post-rep"><svg class="ic"><use href="#i-msg"/></svg>' +
          p.replies +
          "</span>" +
          "</div></article>"
        );
      })
      .join("");
    empty.classList.toggle("is-hidden", rows.length !== 0);
    list.classList.toggle("is-hidden", rows.length === 0);
  }

  // ================= RENDER: PARTNERS =================
  function renderInfluencers() {
    const infStats = $("#infStats");
    const periodLabel = $("#periodLabel");
    const stmtBody = $("#stmtBody");
    const payBody = $("#payBody");
    if (!infStats || !periodLabel || !stmtBody || !payBody) return;
    const clicks = statements.reduce(function (a, s2) {
      return a + s2.clicks;
    }, 0);
    const conv = statements.reduce(function (a, s2) {
      return a + s2.conv;
    }, 0);
    const earn = statements.reduce(function (a, s2) {
      return a + s2.earn;
    }, 0);
    const rate = clicks ? (conv / clicks) * 100 : 0;
    infStats.innerHTML =
      '<div class="stat"><div class="kpi-lbl">Clicks · this period</div><div class="stat-val">' +
      clicks.toLocaleString("en-US") +
      '</div><div class="stat-hint">' +
      INF_PERIOD +
      "</div></div>" +
      '<div class="stat"><div class="kpi-lbl">Conversions</div><div class="stat-val">' +
      conv +
      '</div><div class="stat-hint">Signed accounts</div></div>' +
      '<div class="stat"><div class="kpi-lbl">Conversion rate</div><div class="stat-val">' +
      rate.toFixed(1) +
      '%</div><div class="stat-hint">Of tracked clicks</div></div>' +
      '<div class="stat"><div class="kpi-lbl">Earnings</div><div class="stat-val accent">' +
      money(earn) +
      '</div><div class="stat-hint">Owed this period</div></div>';

    periodLabel.textContent = INF_PERIOD;
    stmtBody.innerHTML = statements
      .map(function (s2) {
        const r = s2.clicks ? (s2.conv / s2.clicks) * 100 : 0;
        return (
          '<tr class="prow">' +
          '<td><div class="inf-name"><span class="inf-av">' +
          initials(s2.name) +
          "</span>" +
          '<span><span class="inf-n" style="display:block">' +
          s2.name +
          "</span>" +
          '<span class="inf-h" style="display:block">' +
          s2.handle +
          "</span></span></div></td>" +
          '<td class="num"><span class="pt-mono">' +
          s2.clicks.toLocaleString("en-US") +
          "</span></td>" +
          '<td class="num"><span class="pt-mono">' +
          s2.conv +
          "</span></td>" +
          '<td class="num"><span class="pt-mono">' +
          r.toFixed(1) +
          "%</span></td>" +
          '<td class="num"><span class="pt-money">' +
          money(s2.earn) +
          "</span></td>" +
          "</tr>"
        );
      })
      .join("");

    payBody.innerHTML = payouts
      .map(function (p) {
        return (
          '<tr class="prow">' +
          '<td><span class="inf-n">' +
          p.name +
          "</span></td>" +
          '<td><span class="pt-mono">' +
          p.period +
          "</span></td>" +
          '<td><span class="pt-mono">' +
          p.method +
          "</span></td>" +
          '<td><span class="pstatus pay--' +
          p.status.toLowerCase() +
          '">' +
          p.status.toLowerCase() +
          "</span></td>" +
          '<td class="num"><span class="pt-money' +
          (p.status === "PAID" ? " banked" : "") +
          '">' +
          money(p.amount) +
          "</span></td>" +
          "</tr>"
        );
      })
      .join("");
  }
  function renderTrade() {
    renderCats();
    renderPosts();
    renderInfluencers();
  }

  // ================= EVENTS =================
  const inp = (sel: string) => root.querySelector<HTMLInputElement>(sel);
  const postMdl = $("#postMdl");
  const postBodyEl = root.querySelector<HTMLTextAreaElement>("#postBody");
  const postCatEl = root.querySelector<HTMLSelectElement>("#postCat");

  function openDialog() {
    const title = inp("#postTitle");
    if (!title || !postBodyEl || !postCatEl || !postMdl) return;
    title.value = "";
    postBodyEl.value = "";
    postCatEl.value = "question";
    postMdl.classList.add("open");
    title.focus();
  }

  const tdTabs = $("#tdTabs");
  if (tdTabs) {
    on(tdTabs, "click", function (e) {
      const b = (e.target as HTMLElement).closest<HTMLElement>(".td-tab");
      if (!b || b.classList.contains("active")) return;
      td.tab = b.dataset.tab || "";
      $$("#tdTabs .td-tab").forEach(function (t) {
        t.classList.toggle("active", t === b);
      });
      $$(".ppanel").forEach(function (p) {
        p.classList.toggle("is-hidden", p.dataset.panel !== td.tab);
      });
    });
  }
  on(document, "click", function (e) {
    const t = e.target as HTMLElement;
    const c = t.closest<HTMLElement>("[data-cat]");
    if (c) {
      td.cat = c.dataset.cat || "all";
      renderCats();
      renderPosts();
      return;
    }
    if (t.closest("#newPostBtn") || t.closest("#emptyPostBtn")) {
      openDialog();
      return;
    }
    if (t.closest('[data-mdl="close"]')) {
      postMdl?.classList.remove("open");
      return;
    }
    if (t.closest("#publishPost")) {
      const titleEl = inp("#postTitle");
      if (!titleEl || !postBodyEl || !postCatEl) return;
      const title = titleEl.value.trim();
      const body = postBodyEl.value.trim();
      if (!title) {
        titleEl.focus();
        return;
      }
      if (!body) {
        postBodyEl.focus();
        return;
      }
      postSeq += 1;
      postsData.unshift({
        id: "p" + postSeq,
        cat: postCatEl.value,
        status: "OPEN",
        title: title,
        body: body,
        author: "Ivan Petrov",
        when: "just now",
        replies: 0,
      });
      postMdl?.classList.remove("open");
      td.cat = "all";
      renderCats();
      renderPosts();
    }
  });

  // ================= INITIALIZATION =================
  renderTrade();

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
    // `.mdl` is skipped: it is a `.content` child only because the port moved
    // the dialog inside the mounted root (the donor mounted it beside `.main`),
    // and `.rv` would strand the fixed overlay at `opacity: 0` — a
    // `display: none` element never intersects, so it would never get `rv-in`.
    const blocks = $$(".content > *").filter((el) => !el.classList.contains("mdl"));
    blocks.forEach((el, i) => {
      el.classList.add("rv");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? i * 60 + "ms" : "200ms";
    });
    // Second layer of the arrival — the donor cascades a `.kpi` strip here.
    // The trade board has no `.kpi` cells, so this layer is inert by donor
    // construction; kept verbatim rather than re-pointed at `.stat`, which
    // would add motion the donor never plays.
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
      const rows = Array.from(list.querySelectorAll<HTMLElement>(".post, .prow"));
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
        // so the `.post` hover lift silently stops working.
        r.addEventListener("transitionend", function te(e) {
          if (e.propertyName !== "transform") return;
          r.style.opacity = "";
          r.style.transform = "";
          r.style.transition = "";
          r.removeEventListener("transitionend", te);
        });
      });
    }
    ["postList", "stmtBody"].forEach((id) => {
      const list = $("#" + id);
      if (!list) return;
      animateRows(list);
      const mo = new MutationObserver(() => animateRows(list));
      mo.observe(list, { childList: true });
      disposers.push(() => mo.disconnect());
    });

    // Numeral count-up on `.kpi-val` — the donor's selector, kept verbatim.
    // The trade board renders its figures as `.stat-val`, so this pass is
    // inert here exactly as it is in the donor file.
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
  };
}
