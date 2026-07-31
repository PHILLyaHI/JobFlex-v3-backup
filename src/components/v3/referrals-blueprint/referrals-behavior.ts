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

import { staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import type { Conversion } from "./referrals-data";

export type ReferralsContentOptions = {
  /** The org's real conversions (most recent 40), newest first. */
  conversions: Conversion[];
  /** Every conversion ever recorded — the list is capped, this is not. */
  uses: number;
  /** CONVERTED + PAID. */
  convertedCount: number;
  pendingCount: number;
  /** CONVERTED-but-not-yet-credited. */
  onTheWayCount: number;
  /** Sum of `rewardCents` across PAID conversions. */
  creditedCents: number;
  /** `ReferralCode.code`, for the share sheet's message. */
  code: string;
  /** Contractor signup link — what Share sends and what it copies on fallback. */
  signupUrl: string;
};

/** Emails are typed by whoever signed up, and they land in an innerHTML string
 *  join. Everything interpolated goes through here. */
function escapeText(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function initReferralsContent(
  content: HTMLElement,
  options: ReferralsContentOptions,
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
  // The donor's eight-row fixture is gone. These are the org's real
  // `ReferralConversion` rows, read in src/app/dashboard/referrals/page.tsx.
  // Nothing on this page writes to them (there is no create flow — rows appear
  // when someone signs up with the code, via recordReferralConversion), so the
  // array is read-only for the life of the mount.
  const conversions: Conversion[] = options.conversions;

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
  // The three tiles read the org-wide totals, not the loaded page: the list is
  // capped at 40 rows, so counting it would quietly under-report "All time" for
  // anyone whose code has done well.
  function renderStats() {
    const grid = $("#statGrid");
    if (!grid) return;
    const onTheWay = options.onTheWayCount;
    grid.innerHTML =
      '<div class="stat"><div class="kpi-lbl">Code uses</div><div class="stat-val">' + options.uses + "</div>" +
        '<div class="stat-hint">All time</div></div>' +
      '<div class="stat"><div class="kpi-lbl">Converted signups</div><div class="stat-val">' + options.convertedCount + "</div>" +
        '<div class="stat-hint">' + options.pendingCount + " pending</div></div>" +
      '<div class="stat"><div class="kpi-lbl">Credit earned</div><div class="stat-val accent">' + money(options.creditedCents) + "</div>" +
        '<div class="stat-hint">' + (onTheWay ? onTheWay + " credit" + (onTheWay === 1 ? "" : "s") + " on the way" : "Nothing pending") + "</div></div>";
  }
  // The chips count the LOADED rows, because that is what filtering them can
  // reveal. Built once: their labels never change, so switching filters toggles
  // `.on` instead of rebuilding the strip — a rebuild would destroy the button
  // the user just pressed, taking its focus and its press animation with it.
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
  function paintFilters() {
    $$("#rfFilters .rf-chip").forEach(function (chip) {
      chip.classList.toggle("on", chip.dataset.f === rfState.filter);
    });
  }
  function renderConversions() {
    const rows = rfState.filter === "ALL"
      ? conversions
      : conversions.filter(function (c) { return c.status === rfState.filter; });
    const list = $("#convList");
    if (list) {
      list.innerHTML = rows.map(function (c) {
        return "<li>" +
          '<span class="conv-av">' + escapeText(initials(c.email)) + "</span>" +
          '<span class="conv-main"><span class="conv-t" style="display:block">' + escapeText(c.email) + "</span>" +
          '<span class="conv-s" style="display:block">' + escapeText(c.when) + "</span></span>" +
          (c.reward > 0 ? '<span class="conv-amt">' + money(c.reward) + "</span>" : "") +
          '<span class="pstatus cs--' + c.status.toLowerCase() + '">' + label(c.status) + "</span>" +
          "</li>";
      }).join("");
    }
    $("#convEmpty")?.classList.toggle("is-hidden", rows.length !== 0);
  }
  function renderReferrals() { renderStats(); renderFilters(); renderConversions(); }

  // ================= CLIPBOARD =================
  // The donor flashed a checkmark on every copy button and never touched the
  // clipboard — the code and the two links are the entire point of this page,
  // so they are written for real, and the checkmark only appears when the write
  // resolved. A refusal (insecure origin, denied permission) selects the text
  // instead so ⌘C still works, rather than claiming a copy that never happened.
  function selectFallback(srcId: string | undefined) {
    if (!srcId) return;
    const node = $("#" + srcId);
    const sel = window.getSelection();
    if (!node || !sel) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  async function copyFrom(btn: HTMLElement) {
    if (btn.dataset.busy) return;
    const text = btn.dataset.copy ?? "";
    if (!text) return;
    btn.dataset.busy = "1";
    const html = btn.innerHTML;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      selectFallback(btn.dataset.copySrc);
    }
    btn.classList.toggle("done", ok);
    btn.innerHTML = ok
      ? '<svg class="ic"><use href="#i-check"/></svg>'
      : '<svg class="ic"><use href="#i-x"/></svg>';
    later(function () {
      btn.classList.remove("done");
      btn.innerHTML = html;
      delete btn.dataset.busy;
    }, 1400);
  }

  // ================= EVENTS =================
  on(document, "click", function (e) {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const cp = target.closest<HTMLElement>("[data-copy]");
    if (cp) { void copyFrom(cp); return; }
    // Clicking the code plate is the same gesture as its copy button.
    if (target.closest("#codeVal")) {
      const cc = $(".code-copy");
      if (cc) void copyFrom(cc);
      return;
    }
    const f = target.closest<HTMLElement>("[data-f]");
    if (f) {
      rfState.filter = f.dataset.f ?? rfState.filter;
      paintFilters();
      renderConversions();
      return;
    }
    const share = target.closest<HTMLElement>("#shareBtn");
    if (share) { void shareLink(share); return; }
  });

  // Share: the OS sheet where there is one (that is the whole point on a phone),
  // the clipboard everywhere else. Either way the button reports what actually
  // happened — a cancelled share sheet says nothing at all.
  async function shareLink(btn: HTMLElement) {
    if (btn.dataset.busy) return;
    const old = btn.innerHTML;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Try JobFlex",
          text:
            "Use my code " + options.code +
            " to sign up on JobFlex — each contractor who upgrades to a paid plan knocks 50% off a month of your subscription.",
          url: options.signupUrl,
        });
      } catch {
        return; // cancelled, or the sheet refused — say nothing
      }
      btn.dataset.busy = "1";
      btn.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>Shared';
      later(function () { btn.innerHTML = old; delete btn.dataset.busy; }, 1600);
      return;
    }
    btn.dataset.busy = "1";
    let ok = false;
    try {
      await navigator.clipboard.writeText(options.signupUrl);
      ok = true;
    } catch {
      selectFallback("signupUrl");
    }
    btn.innerHTML = ok
      ? '<svg class="ic"><use href="#i-check"/></svg>Link copied'
      : '<svg class="ic"><use href="#i-x"/></svg>Press ⌘C';
    later(function () { btn.innerHTML = old; delete btn.dataset.busy; }, 1600);
  }

  // ================= INITIALIZATION =================
  renderReferrals();

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // (The donor's local EASE constant lived here for its hand-rolled row
    // stagger; that stagger now comes from blueprint-shell/list-motion, which
    // owns the same curve.)

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

    // Row stagger — ONCE, on arrival.
    //
    // The donor wired this to a MutationObserver on both containers, so every
    // filter click wiped the conversion list to opacity 0 and crawled it back
    // in: the chip read as "the list reset and my click did nothing". The list
    // genuinely arrives exactly once per mount (nothing on this page creates or
    // deletes a conversion — rows appear when someone signs up with the code),
    // so it plays here and the filter repaints silently.
    ["convList", "statGrid"].forEach((id) => {
      const list = $("#" + id);
      if (!list) return;
      staggerIn(Array.from(list.querySelectorAll<HTMLElement>(".conv li, .stat")));
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
