// Reviews blueprint — runtime behaviors, ported from the donor file's <script>
// (jobflex-reviews-blueprint_3.html). Every duration, easing, stagger and
// formula is the donor's exact value. Adaptations are mechanical only:
// - queries are scoped to the mounted `.content` root;
// - document/window listeners, timers and observers are tracked for unmount
//   cleanup;
// - the donor's chrome modules (matchMedia polyfill, mobile nav drawer, FLUID
//   SCALE, the sidebar entry cascade, the sliding active indicator and the
//   graph-paper parallax) are NOT ported here — the shared shell
//   (components/v3/blueprint-shell/shell-behavior.ts) already owns all of them;
// - the donor's `safe(name, fn)` try/catch wrapper is dropped: the modules it
//   guarded are either shell-owned or replaced by strict null checks below.
//
// TWO BEHAVIOURAL DEPARTURES FROM THE DONOR, both deliberate:
//
// 1. The rows are REAL. `initReviewsContent` takes the org's `ReviewRequest`
//    records (read in src/app/dashboard/reviews/page.tsx) and the request
//    dialog calls `createReviewRequest` from src/actions/reviewRequests.ts —
//    the same action the rest of the app uses. The donor's "nudge" button
//    rewrote a fixture's status in memory and flashed "Sent" on a 1.2s timer
//    while nothing was sent; there is no re-send action anywhere in
//    src/actions, so that control is now "Copy link", which puts the client's
//    real /review/<publicToken> URL on the clipboard.
//
// 2. The donor's row stagger hung off a `MutationObserver({childList:true})` on
//    #rvList and #statGrid, so every filter click wiped the feed to opacity 0
//    and crawled it back. The observer is gone; the callers that know a list is
//    genuinely ARRIVING play blueprint-shell/list-motion's `staggerIn`.

import { createReviewRequest } from "@/actions/reviewRequests";
import { closeMdl, openMdl } from "@/components/v3/blueprint-shell/mdl-motion";
import { staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import { isPlanLimitError } from "@/lib/planLimits";
import { REVIEWS_SEED, type EligibleJob, type ReviewEntry } from "./reviews-data";

/** A COMPLETED request that carries a score — what the feed, stats and spread
 *  all work from. The `completed()` filter is the same predicate; this type
 *  just lets TypeScript see the narrowing. */
type CompletedReview = ReviewEntry & { rating: number };

export type ReviewsContentOptions = {
  /** The org's real review requests, read server-side. Omit to fall back to the
   *  donor fixture (the standalone mock routes have no session to read from). */
  entries?: ReviewEntry[];
  /** Jobs with no review request yet — the request dialog's option list. */
  jobs?: EligibleJob[];
};

/** Server actions reject with an Error whose message is written for the user
 *  ("Not found", the plan-cap refusal). Surface that text; fall back to a
 *  generic line for anything unrecognisable. */
function actionError(err: unknown): string {
  // A cap refusal throws the stable "Plan limit reached" string, which on its
  // own tells a contractor nothing about what to do. Nothing in the blueprint
  // shell renders the upgrade dialog, so the way out is spelled out where they
  // are looking.
  if (isPlanLimitError(err)) {
    return "Plan limit reached — you have used this cycle's review requests. Upgrade under Settings → Billing to send more.";
  }
  const msg = err instanceof Error ? err.message.trim() : "";
  // A Next.js server-action transport failure has no useful message.
  if (!msg || msg.toLowerCase().includes("fetch failed")) {
    return "Something went wrong. Check your connection and try again.";
  }
  return msg;
}

function escapeAttr(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Text interpolated into an innerHTML string. The donor could inline its
 *  fixture names raw; these are database rows a manager typed, so every
 *  user-supplied value goes through here. */
const escapeText = escapeAttr;

export function initReviewsContent(
  content: HTMLElement,
  options: ReviewsContentOptions = {},
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
  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (fn: () => void, ms: number) => {
    timers.push(setTimeout(fn, ms));
  };
  /** `(ms, fn)` — the shape blueprint-shell's motion helpers expect. */
  const after = (ms: number, fn: () => void) => later(fn, ms);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const $$ = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));

  // A per-mount COPY of the server's rows: the request flow appends to this
  // array, and the arrays handed in by React must not be mutated in place.
  let reviewData: ReviewEntry[] = (options.entries ?? REVIEWS_SEED).map((r) => ({ ...r }));
  let eligibleJobs: EligibleJob[] = (options.jobs ?? []).map((j) => ({ ...j }));

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
  const rv: { filter: string; saving: boolean } = { filter: "ALL", saving: false };

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
  /**
   * @param arriving true only when a genuinely different set of reviews is
   *   being put in front of the user (first paint, a filter switch). Any other
   *   repaint is silent — see blueprint-shell/list-motion.ts.
   */
  function renderList(arriving = false) {
    let rows = completed();
    if (rv.filter !== "ALL") {
      const n = Number(rv.filter);
      rows = rows.filter(function (r) { return r.rating === n; });
    }
    const el = $("#rvList");
    if (el) {
      el.innerHTML = rows.map(function (r) {
        const tone = r.rating >= 5 ? "hi" : r.rating <= 2 ? "low" : "";
        // The job title links to the job it came off, exactly like the classic
        // page did (old-design-pages/dashboard/reviews/page.tsx).
        const job = r.jobId
          ? '<a href="/dashboard/jobs/' + escapeAttr(r.jobId) + '">' + escapeText(r.job) + "</a>"
          : escapeText(r.job);
        return "<li>" +
          '<span class="rv-score ' + tone + '">' + r.rating + "</span>" +
          '<div class="rv-main">' +
            '<div class="rv-top">' + starsHtml(r.rating) + '<span class="rv-when">' + escapeText(r.when) + "</span></div>" +
            '<div class="rv-who">' + escapeText(r.client) + "<span> · " + job + "</span></div>" +
            (r.comment ? '<blockquote class="rv-quote">"' + escapeText(r.comment) + '"</blockquote>' : "") +
          "</div></li>";
      }).join("");
      if (arriving) staggerIn(Array.from(el.querySelectorAll<HTMLElement>("li")));
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
        // No re-send action exists in src/actions, so the button hands over the
        // link instead of pretending an email went out. A row with no token
        // (the fixture fallback) gets no button at all.
        const copy = r.token
          ? '<button class="pend-btn" type="button" data-act="copy" data-token="' + escapeAttr(r.token) + '">' +
            '<svg class="ic"><use href="#i-link"/></svg><span data-copy-lbl>Copy link</span></button>'
          : "";
        return '<li data-req="' + escapeAttr(r.id) + '"><div class="pend-main">' +
          '<div class="pend-t">' + escapeText(r.client) + "</div>" +
          '<div class="pend-s">' + escapeText(r.job) + " · " + escapeText(r.when) + "</div></div>" +
          '<span class="pstatus st--' + escapeAttr(r.status.toLowerCase()) + '">' + escapeText(r.status.toLowerCase()) + "</span>" +
          copy + "</li>";
      }).join("");
    }
    $("#pendEmpty")?.classList.toggle("is-hidden", rows.length !== 0);
  }
  function renderReviews(arriving = false) {
    renderStats(); renderFilters(); renderList(arriving); renderSpread(); renderPending();
  }

  // ================= REQUEST DIALOG =================
  function reqError(msg: string | null) {
    const box = $("#rvReqErr");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-hidden", !msg);
  }

  /** Button label + disabled state while the write is in flight. */
  function setSaving(busy: boolean, busyLabel: string, idleLabel: string) {
    rv.saving = busy;
    const btn = $<HTMLButtonElement>("#rvReqOk");
    if (!btn) return;
    btn.disabled = busy;
    btn.classList.toggle("is-busy", busy);
    const lbl = btn.querySelector<HTMLElement>("[data-save-lbl]");
    if (lbl) lbl.textContent = busy ? busyLabel : idleLabel;
  }

  function renderReqBody() {
    const body = $("#rvReqBody");
    if (!body) return;
    const ok = $<HTMLButtonElement>("#rvReqOk");
    if (!eligibleJobs.length) {
      body.innerHTML =
        '<div class="mf-note">Every job on the books already has a review request. ' +
        "Complete another job and its client gets asked automatically.</div>";
      if (ok) ok.disabled = true;
      return;
    }
    if (ok) ok.disabled = false;
    body.innerHTML =
      '<div class="mf"><label class="mf-lbl" for="rvReqJob">Job</label>' +
      // The shared blueprint select: `.bp-sel` wrapper draws the caret,
      // `.bp-sel-in` carries the appearance reset — both published once in
      // dashboard-blueprint/blueprint-global.css.
      '<span class="bp-sel"><select class="bp-sel-in" id="rvReqJob">' +
      eligibleJobs.map(function (j) {
        return '<option value="' + escapeAttr(j.id) + '">' +
          escapeText(j.title) + " — " + escapeText(j.client) +
          " · " + escapeText(j.status.toLowerCase()) + "</option>";
      }).join("") +
      "</select></span></div>" +
      '<div class="mf-note">The client is emailed their own review link. It appears under ' +
      "Awaiting response until they submit a score.</div>";
  }

  function openReq() {
    reqError(null);
    // Order matters: `setSaving` clears `disabled`, `renderReqBody` sets it
    // when there is nothing left to request against.
    setSaving(false, "", "Send request");
    renderReqBody();
    const mdl = $("#rvReqMdl");
    if (mdl) openMdl(mdl);
    $<HTMLSelectElement>("#rvReqJob")?.focus();
  }

  function closeReq() {
    const mdl = $("#rvReqMdl");
    if (mdl) closeMdl(mdl, after);
  }

  async function submitReq() {
    const sel = $<HTMLSelectElement>("#rvReqJob");
    const jobId = sel?.value;
    if (!jobId) return;
    const job = eligibleJobs.find(function (j) { return j.id === jobId; });
    reqError(null);
    setSaving(true, "Sending…", "");
    try {
      const res = await createReviewRequest(jobId);
      setSaving(false, "", "Send request");
      closeReq();

      // The job has a request now, so it leaves the option list, and the new
      // request joins Awaiting response.
      eligibleJobs = eligibleJobs.filter(function (j) { return j.id !== jobId; });
      reviewData = [
        {
          id: res.id,
          jobId,
          status: "SENT",
          rating: null,
          client: job?.client ?? "Client",
          job: job?.title ?? "Job",
          when: "just now",
          comment: null,
          token: res.publicToken,
        },
        ...reviewData,
      ];
      // Awaiting response gained exactly one row: repaint it silently, then
      // play the entrance on the ONE row that arrived.
      renderPending();
      const fresh = root.querySelector<HTMLElement>(
        '.pend li[data-req="' + CSS.escape(res.id) + '"]',
      );
      if (fresh) staggerIn([fresh]);
      // The denominator of the response rate moved. The chips count COMPLETED
      // reviews only, so they are left alone rather than repainted for nothing.
      renderStats();
    } catch (err) {
      setSaving(false, "", "Send request");
      reqError(actionError(err));
    }
  }

  // ================= EVENTS =================
  const filters = $("#rvFilters");
  if (filters) {
    on(filters, "click", (ev) => {
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const f = target.closest<HTMLElement>("[data-f]");
      if (!f) return;
      const next = f.dataset.f ?? "ALL";
      if (next === rv.filter) return;
      rv.filter = next;
      renderFilters();
      // A filter switch IS an arrival: a different set of reviews is being put
      // in front of the user, so the rows come in.
      renderList(true);
    });
  }

  const pendList = $("#pendList");
  if (pendList) {
    on(pendList, "click", (ev) => {
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const btn = target.closest<HTMLButtonElement>('[data-act="copy"]');
      if (!btn) return;
      const token = btn.dataset.token;
      if (!token) return;
      const url = window.location.origin + "/review/" + token;
      const lbl = btn.querySelector<HTMLElement>("[data-copy-lbl]");
      // Patch THIS button only — the rest of the list is untouched.
      const settle = (text: string) => {
        if (!lbl) return;
        lbl.textContent = text;
        later(() => {
          if (lbl.isConnected) lbl.textContent = "Copy link";
        }, 1600);
      };
      // `navigator.clipboard` is undefined on an insecure origin; say so rather
      // than reporting a copy that did not happen.
      const clip = navigator.clipboard;
      if (!clip) { settle("Copy failed"); return; }
      clip.writeText(url).then(
        () => settle("Copied"),
        () => settle("Copy failed"),
      );
    });
  }

  const reqBtn = $("#rvReqBtn");
  if (reqBtn) on(reqBtn, "click", () => { openReq(); });

  const reqOk = $("#rvReqOk");
  if (reqOk) {
    on(reqOk, "click", () => {
      if (rv.saving) return;
      void submitReq();
    });
  }

  on(root, "click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-mdl="req"]')) closeReq();
  });

  on(document, "keydown", (ev) => {
    if (!(ev instanceof KeyboardEvent) || ev.key !== "Escape") return;
    if ($("#rvReqMdl")?.classList.contains("open")) closeReq();
  });

  // ================= INIT =================
  renderReviews();

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

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
    // `:not(.mdl)` — the request dialog is a position:fixed overlay rendered
    // inside `.content`; the donor's block set (and therefore its i*60ms
    // stagger indices) must stay exactly as authored.
    const blocks = $$(".content > *:not(.mdl)");
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

    // Row stagger — FIRST PAINT ONLY. The donor drove this from a
    // `MutationObserver({childList:true})` on both containers, which fired on
    // every render: a filter click wiped the feed to opacity 0 and crawled it
    // back. That is the exact failure blueprint-shell/list-motion.ts was
    // written to end, so the observer is gone and the callers that know a list
    // is genuinely ARRIVING play `staggerIn` themselves.
    ["rvList", "statGrid"].forEach((id) => {
      const list = $("#" + id);
      if (!list) return;
      staggerIn(Array.from(list.querySelectorAll<HTMLElement>("li, .stat")));
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
