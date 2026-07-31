// Trade board blueprint — runtime behaviors, ported verbatim from the donor
// file's <script> (jobflex-trade-board-blueprint.html). Every duration, easing,
// stagger, formula and string is the donor's exact value. Adaptations are
// mechanical only:
// - queries are scoped to the mounted `.content` root;
// - document/window listeners, timers and observers are tracked for unmount
//   cleanup;
// - the donor's chrome modules (matchMedia polyfill, mobile nav drawer, FLUID
//   SCALE, the sidebar entry cascade, the sliding active indicator and the
//   graph-paper parallax) are NOT ported here — the shared shell
//   (components/v3/blueprint-shell/shell-behavior.ts) already owns all of them;
// - the donor's `safe(name, fn)` try/catch wrapper is dropped: the modules it
//   guarded are either shell-owned or replaced by strict null checks below.

import {
  closeTradePost,
  createTradePost,
  deleteTradePost,
} from "@/actions/tradePosts";
import { leaveRow, staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import { closeMdl, openMdl } from "@/components/v3/blueprint-shell/mdl-motion";
import { CATEGORIES, POSTS_SEED, type TradePost } from "./trade-data";

export type TradeContentOptions = {
  /** The org's real board, read server-side. Omit to fall back to the donor
   *  fixture (the standalone mock routes have no session to read from). */
  entries?: TradePost[];
  /** The signed-in contractor's display name, so a just-published card carries
   *  the byline the server already wrote instead of waiting for a reload. */
  viewer?: string;
};

/** The trade actions reject with an Error whose message is written for the user
 *  ("Only the author can close this post.", "This thread is closed."). Surface
 *  that text; fall back to a generic line for anything unrecognisable. */
function actionError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  // A Next.js server-action transport failure has no useful message.
  if (!msg || msg.toLowerCase().includes("fetch failed")) {
    return "Something went wrong. Check your connection and try again.";
  }
  // requireManager() throws the framework's own role refusal.
  if (/forbidden|unauthor/i.test(msg)) {
    return "You don't have permission to post on this board.";
  }
  return msg;
}

/** Text interpolated into an innerHTML string. The donor could inline its
 *  fixture copy raw; these are database rows a contractor typed. */
function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** The post detail lives under the (dashboard) route group, which keeps the
 *  classic layout — a real page with the reply thread on it. */
function postHref(id: string): string {
  return "/dashboard/trade/" + encodeURIComponent(id);
}

export function initTradeContent(
  content: HTMLElement,
  options: TradeContentOptions = {},
): () => void {
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
  // Tracked timeouts — the dialog's exit animation runs on one, so an unmount
  // mid-close must not fire the cleanup into a detached tree.
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const after = (ms: number, fn: () => void) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  disposers.push(() => {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
  });
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

  // An unmount mid-write must not paint into a detached tree.
  let alive = true;
  disposers.push(() => {
    alive = false;
  });

  // ================= TRADE BOARD: DATA =================
  // The org's real board when the page supplies one (src/app/dashboard/trade),
  // the donor fixture otherwise. Either way it is CLONED: publish / close /
  // delete mutate it in place. The server actions are the source of truth and
  // this array mirrors them, so the board repaints the moment one returns
  // instead of waiting on a round trip through the router — and mutating the
  // module-level seed would leak every published post into the next visit.
  const postsData: TradePost[] = (options.entries ?? POSTS_SEED).map((p) => ({ ...p }));
  const authorName = options.viewer || "You";

  // Only the board is left, so the page's view state is the category filter
  // plus whichever post's row menu is open. `td.tab` went with the tab strip.
  const td: { cat: string; menuId: string | null } = { cat: "all", menuId: null };

  /**
   * Installed by the motion module below; null under reduced motion.
   *
   * Still takes a list id even though #postList is the only list: the two
   * moments it fires from (first paint, a publish) are far apart in this file,
   * and naming the target at the call site is what kept them readable.
   */
  let playStagger: ((listId: "postList") => void) | null = null;

  function initials(n: string) {
    const p = n.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
    // Real rows can carry a name the donor's fixtures never did — an email-only
    // author, a handle with no Latin letters — which leaves nothing to slice.
    if (p.length === 0) return "—";
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
    if (!cats) return;
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
    // The board's total used to be echoed on the Posts tab (#postsN). With the
    // tab strip gone the "All" chip above is the only place it belongs.
  }
  /** The category / closed plates a card opens with. Broken out so closing a
   *  thread can patch THAT ONE strip instead of re-rendering the board. */
  function postTop(p: TradePost) {
    const closed = p.status === "CLOSED";
    return (
      '<span class="pstatus cat--' +
      esc(p.cat) +
      '">' +
      esc(catLabel(p.cat)) +
      "</span>" +
      (closed ? '<span class="pstatus cat--closed">closed</span>' : "") +
      // The donor left `.pmenu` in the markup with nothing to open it. This is
      // the trigger: the two items behind it (close, delete) are the trade
      // actions that already exist end to end, and the third opens the thread.
      '<button class="pt-open" type="button" data-menu="' +
      esc(p.id) +
      '" aria-haspopup="menu" aria-label="Post actions"><svg class="ic"><use href="#i-dots"/></svg></button>'
    );
  }

  function postCard(p: TradePost) {
    const closed = p.status === "CLOSED";
    return (
      '<article class="post' +
      (closed ? " closed" : "") +
      '" data-post="' +
      esc(p.id) +
      '">' +
      '<div class="post-top" data-cell="top">' +
      postTop(p) +
      "</div>" +
      // The title is the link to the thread, so the detail page is reachable by
      // keyboard as well as by pointer. The donor's card went nowhere.
      '<h3 class="post-t"><a href="' +
      esc(postHref(p.id)) +
      '">' +
      esc(p.title) +
      "</a></h3>" +
      '<p class="post-b">' +
      esc(p.body) +
      "</p>" +
      '<div class="post-foot">' +
      '<span class="post-av">' +
      esc(initials(p.author)) +
      "</span>" +
      '<span class="post-who">' +
      esc(p.author) +
      "</span>" +
      '<span class="post-when">' +
      esc(p.when) +
      "</span>" +
      '<span class="post-rep"><svg class="ic"><use href="#i-msg"/></svg>' +
      p.replies +
      "</span>" +
      "</div></article>"
    );
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
    list.innerHTML = rows.map(postCard).join("");
    empty.classList.toggle("is-hidden", rows.length !== 0);
    list.classList.toggle("is-hidden", rows.length === 0);
  }

  // The donor's second renderer — renderInfluencers(), which painted the stat
  // tiles, the statements rollup and the payouts table — is gone with the
  // panel it filled. Influencer numbers are real, per-account data now and are
  // served by /influencer behind requireInfluencer().

  function renderTrade() {
    renderCats();
    renderPosts();
  }

  // ================= EVENTS =================
  const inp = (sel: string) => root.querySelector<HTMLInputElement>(sel);
  const postMdl = $("#postMdl");
  const postBodyEl = root.querySelector<HTMLTextAreaElement>("#postBody");
  const postCatEl = root.querySelector<HTMLSelectElement>("#postCat");

  // The dialog's enter AND exit both come from mdl-motion / blueprint-global.
  // A bare `classList.add("open")` / `.remove("open")` pair — which this page
  // used to carry — plays the 280ms arrival and then cuts the box out of the
  // frame instantly, because `.mdl` is `display: none` without `.open`. That
  // asymmetry is what reads as "there is no close animation".
  function openDialog() {
    const title = inp("#postTitle");
    if (!title || !postBodyEl || !postCatEl || !postMdl) return;
    if (publishing) return;
    title.value = "";
    postBodyEl.value = "";
    postCatEl.value = "question";
    dlgError(null);
    openMdl(postMdl);
    title.focus();
  }

  function closeDialog() {
    if (!postMdl) return;
    closeMdl(postMdl, after);
  }

  /** The action's own message, or nothing. */
  function dlgError(msg: string | null) {
    const box = $("#postErr");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-hidden", !msg);
  }

  /** Submit label + disabled state while the write is in flight. */
  let publishing = false;
  function setPublishing(onNow: boolean) {
    publishing = onNow;
    const btn = root.querySelector<HTMLButtonElement>("#publishPost");
    if (!btn) return;
    btn.disabled = onNow;
    btn.classList.toggle("is-busy", onNow);
    const lbl = btn.querySelector<HTMLElement>("[data-save-lbl]");
    if (lbl) lbl.textContent = onNow ? "Posting…" : "Post";
  }

  async function publish() {
    if (publishing) return;
    const titleEl = inp("#postTitle");
    if (!titleEl || !postBodyEl || !postCatEl) return;
    const title = titleEl.value.trim();
    const body = postBodyEl.value.trim();
    if (!title) {
      dlgError("Give the post a title — one line is enough.");
      titleEl.focus();
      return;
    }
    if (!body) {
      dlgError("Add the details: condition, price, location, who to call.");
      postBodyEl.focus();
      return;
    }
    const cat = postCatEl.value;
    dlgError(null);
    setPublishing(true);
    try {
      // The real write. Same action, same payload shape and same org scope the
      // classic NewTradePostSheet posted with — only the frame is different.
      const res = await createTradePost({ title, body, category: cat });
      if (!alive) return;
      postsData.unshift({
        id: res.id,
        cat,
        status: "OPEN",
        title,
        body,
        author: authorName,
        when: "just now",
        replies: 0,
        mine: true,
      });
      closeDialog();
      td.cat = "all";
      renderCats();
      renderPosts();
      // A publish genuinely re-lists the board — a new post at the top and the
      // category reset back to All — so the cascade belongs here.
      playStagger?.("postList");
    } catch (err) {
      if (!alive) return;
      dlgError(actionError(err));
    } finally {
      if (alive) setPublishing(false);
    }
  }

  // ================= ROW MENU (#pMenu) =================
  const pMenu = $("#pMenu");

  function menuItem(icon: string, title: string, sub: string, act: string, danger?: boolean) {
    return (
      '<button class="pmenu-item' +
      (danger ? " is-danger" : "") +
      '" type="button" role="menuitem" data-mact="' +
      act +
      '"><svg class="ic"><use href="#' +
      icon +
      '"/></svg>' +
      '<span><span class="pmenu-item-t">' +
      esc(title) +
      '</span><span class="pmenu-item-s" style="display:block">' +
      esc(sub) +
      "</span></span></button>"
    );
  }

  function menuError(msg: string) {
    const box = pMenu?.querySelector<HTMLElement>("[data-menu-err]");
    if (!box) return;
    box.textContent = msg;
    box.classList.toggle("is-hidden", !msg);
  }

  function openMenu(id: string, btn: HTMLElement) {
    const p = postsData.find((x) => x.id === id);
    if (!p || !pMenu) return;
    td.menuId = id;
    const closed = p.status === "CLOSED";
    pMenu.setAttribute("role", "menu");
    pMenu.innerHTML =
      '<div class="pmenu-head"><div class="pmenu-title">' +
      esc(p.title) +
      '</div><div class="pmenu-sub">' +
      esc(p.author + " · " + p.when) +
      "</div></div>" +
      menuItem(
        "i-msg",
        "Open thread",
        p.replies === 1 ? "1 reply" : p.replies + " replies",
        "open",
      ) +
      // closeTradePost / deleteTradePost both refuse a non-author, so the two
      // items only appear on the signed-in contractor's own posts rather than
      // being offered and then refused.
      (p.mine && !closed
        ? menuItem("i-ban", "Close thread", "Stops new replies", "close")
        : "") +
      (p.mine ? menuItem("i-trash", "Delete post", "Removes it for everyone", "del", true) : "") +
      '<div class="pmenu-err is-hidden" data-menu-err role="alert"></div>';
    pMenu.classList.add("open");
    // FLUID SCALE zooms the shell root, so viewport maths has to be un-zoomed
    // before it can be compared with a zoomed getBoundingClientRect.
    const host = root.closest<HTMLElement>(".jf-blueprint");
    const zRaw = host ? parseFloat(getComputedStyle(host).zoom) : 1;
    const z = isFinite(zRaw) && zRaw > 0 ? zRaw : 1;
    const vw = window.innerWidth / z;
    const vh = window.innerHeight / z;
    const r = btn.getBoundingClientRect();
    const mw = 254;
    let left = Math.min(r.right - mw, vw - mw - 12);
    left = Math.max(12, left);
    pMenu.style.left = left + "px";
    pMenu.style.top = "0px";
    const mh = pMenu.offsetHeight;
    let top = r.bottom + 6;
    if (top + mh > vh - 12) top = Math.max(12, r.top - mh - 6);
    pMenu.style.top = top + "px";
  }

  function closeMenu() {
    td.menuId = null;
    pMenu?.classList.remove("open");
  }
  if (main) on(main, "scroll", closeMenu, { passive: true });

  let menuBusy = false;

  /** Closing a thread changed ONE post. Patch that card's plate strip; a
   *  renderPosts() here would destroy every card the user is looking at and
   *  replay the board's entrance. */
  function applyClosed(p: TradePost) {
    p.status = "CLOSED";
    const card = $('[data-post="' + CSS.escape(p.id) + '"]');
    if (!card) return;
    card.classList.add("closed");
    const top = card.querySelector<HTMLElement>('[data-cell="top"]');
    if (top) top.innerHTML = postTop(p);
  }

  async function runMenu(act: string, id: string, item: HTMLElement) {
    if (menuBusy) return;
    const p = postsData.find((x) => x.id === id);
    if (!p) return;
    menuBusy = true;
    menuError("");
    const label = item.querySelector<HTMLElement>(".pmenu-item-t");
    const idle = label?.textContent || "";
    if (label) label.textContent = "Working…";
    pMenu?.classList.add("is-busy");
    try {
      if (act === "close") {
        await closeTradePost(id);
        if (!alive) return;
        applyClosed(p);
        closeMenu();
      } else {
        await deleteTradePost(id);
        if (!alive) return;
        const i = postsData.indexOf(p);
        if (i >= 0) postsData.splice(i, 1);
        closeMenu();
        const card = $('[data-post="' + CSS.escape(id) + '"]');
        // That row leaves and the rest of the grid closes the gap. Rebuilding
        // the list instead would blink every other card.
        if (card) {
          leaveRow(
            card,
            () => {
              const list = $("#postList");
              const empty = $("#postEmpty");
              const gone = !list?.querySelector(".post");
              empty?.classList.toggle("is-hidden", !gone);
              list?.classList.toggle("is-hidden", gone);
            },
            after,
          );
        }
        renderCats();
      }
    } catch (err) {
      if (!alive) return;
      if (label) label.textContent = idle;
      menuError(actionError(err));
    } finally {
      menuBusy = false;
      pMenu?.classList.remove("is-busy");
    }
  }

  // The `#tdTabs` delegate that swapped `.td-tab.active` / `.ppanel.is-hidden`
  // and played the statements cascade on first reveal is gone: with Posts the
  // only view there is nothing to switch to. `.is-hidden` itself is still in
  // use — renderPosts() toggles it on the board and its empty state.
  on(document, "click", function (e) {
    const t = e.target as HTMLElement;
    if (!root.contains(t) && !pMenu?.contains(t)) {
      closeMenu();
      return;
    }
    const trigger = t.closest<HTMLElement>("[data-menu]");
    if (trigger) {
      if (td.menuId === trigger.dataset.menu) closeMenu();
      else openMenu(trigger.dataset.menu || "", trigger);
      return;
    }
    const item = t.closest<HTMLElement>(".pmenu-item");
    if (item && pMenu?.contains(item)) {
      const act = item.dataset.mact || "";
      const id = td.menuId;
      if (!id) return;
      if (act === "open") {
        closeMenu();
        window.location.assign(postHref(id));
        return;
      }
      void runMenu(act, id, item);
      return;
    }
    if (td.menuId) closeMenu();
    const c = t.closest<HTMLElement>("[data-cat]");
    if (c) {
      td.cat = c.dataset.cat || "all";
      renderCats();
      renderPosts();
      // No cascade: narrowing the board to a category is a REPAINT of posts the
      // user is already looking at. Replaying the entrance here — which the old
      // MutationObserver did — drops the whole board to opacity 0 and crawls it
      // back on every chip click.
      return;
    }
    if (t.closest("#newPostBtn") || t.closest("#emptyPostBtn")) {
      openDialog();
      return;
    }
    if (t.closest('[data-mdl="close"]')) {
      closeDialog();
      return;
    }
    if (t.closest("#publishPost")) {
      void publish();
    }
  });

  on(document, "keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape" && td.menuId) closeMenu();
  });

  // ================= INITIALIZATION =================
  renderTrade();

  // The matchMedia polyfill, mobile nav drawer and FLUID SCALE belong to the
  // persistent chrome and live in
  // components/v3/blueprint-shell/shell-behavior.ts.

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // The row cascade's curve now lives in blueprint-shell/list-motion, which
    // owns both halves of list motion for every blueprint page.

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

    // Entrance cascade — on ARRIVAL only.
    //
    // This used to hang off a MutationObserver on #postList, so every category
    // chip replayed the whole board's entrance — every post blanked to opacity
    // 0 and crawled back because the user narrowed the list. The two arrivals
    // that are real are wired by hand instead: first paint and a publish. See
    // blueprint-shell/list-motion for the reasoning.
    playStagger = (listId) => {
      const list = $("#" + listId);
      if (!list) return;
      staggerIn(Array.from(list.querySelectorAll<HTMLElement>(".post")));
    };
    playStagger("postList");

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
