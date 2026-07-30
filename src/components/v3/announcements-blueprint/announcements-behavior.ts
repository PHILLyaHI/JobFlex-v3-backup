// Announcements blueprint — runtime behaviors, ported verbatim from the donor
// file's <script> (jobflex-announcements-blueprint_1.html). Every duration,
// easing, stagger, string and formula is the donor's exact value. Adaptations
// are mechanical only:
// - queries are scoped to the mounted `.content` root (the donor delegated its
//   click / input / change handlers on `document`; every target it looks for —
//   #newAnnBtn, [data-mdl="close"], [data-retire], #publishBtn and the dialog
//   fields — lives inside `.content` in this port, so the delegation root moves
//   with them and nothing else on the page can be hit);
// - document/window listeners and observers are tracked for unmount cleanup;
// - the donor's chrome modules (matchMedia polyfill, mobile nav drawer, FLUID
//   SCALE, the sidebar entry cascade, the sliding active indicator and the
//   graph-paper parallax) are NOT ported here — the shared shell
//   (components/v3/blueprint-shell/shell-behavior.ts) already owns all of them;
// - the donor's `safe(name, fn)` try/catch wrapper is dropped: the modules it
//   guarded are either shell-owned or replaced by strict null checks below;
// - the dialog opens/closes through the shell's `openMdl` / `closeMdl`. The
//   enter animation is published app-wide from blueprint-global.css
//   (`.jf-blueprint .content .mdl.open > .mdl-box`) and lands on this dialog
//   whether or not the module asks for it; routing the close through
//   `closeMdl` is what keeps the matching 190ms exit instead of a hard cut,
//   which is the contract every sibling page's `.mdl` already follows.

import { closeMdl, openMdl } from "@/components/v3/blueprint-shell/mdl-motion";
import { leaveRow, staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import { ANN_SEED, ANN_SEQ_START, PRIORITY, type Announcement, type BannerModel } from "./announcements-data";

export function initAnnouncementsContent(content: HTMLElement): () => void {
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
  const $$ = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
  const byId = (id: string) => root.querySelector<HTMLElement>("#" + id);
  const fieldById = (id: string) =>
    root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("#" + id);

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

  // ================= ANNOUNCEMENTS: DATA =================
  // Announcement: title, body, priority (0 normal | 1 warn | 2 high),
  // expiresAt, createdAt.
  //
  // A per-mount COPY of the fixture. Retiring a banner and publishing a new one
  // both write into this array, and the seed is a module-level constant —
  // mutating it directly would leak every edit into the next visit to the page
  // (and into any other importer of ANN_SEED).
  let annSeq = ANN_SEQ_START;
  const annData: Announcement[] = ANN_SEED.map((a) => ({ ...a }));

  function active() {
    return annData.filter(function (a) {
      return !a.expired;
    });
  }
  function archived() {
    return annData.filter(function (a) {
      return a.expired;
    });
  }

  function bannerHtml(a: BannerModel, preview: boolean) {
    return '<div class="bnr bnr--p' + a.priority + '"' + (preview ? '' : ' data-ann="' + a.id + '"') + '>' +
      '<svg class="ic bnr-ic"><use href="#i-megaphone"/></svg>' +
      '<div class="bnr-main">' +
        '<span class="bnr-t">' + (a.title || 'Your announcement title') + '</span>' +
        '<span class="bnr-b">' + (a.body || 'Body text shows here beside the title.') + '</span>' +
        '<div class="bnr-meta">' +
          '<span class="pri-tag">' + PRIORITY[a.priority] + '</span>' +
          (a.created ? '<span>Posted ' + a.created + '</span>' : '') +
          '<span>' + (a.expires ? 'Expires ' + a.expires : 'No expiry') + '</span>' +
        '</div>' +
      '</div>' +
      (preview ? '' : '<button class="bnr-x" type="button" data-retire aria-label="Retire announcement">×</button>') +
      '</div>';
  }

  // ================= RENDER =================
  /** The count and empty state for the live board — the parts of renderActive
   *  that are NOT the banner markup, so a surgical retire can update them
   *  without replacing the nodes its gap-closing FLIP is still animating. */
  function syncActiveCount() {
    const rows = active();
    const count = byId("activeCount");
    const empty = byId("activeEmpty");
    if (count) count.textContent = String(rows.length);
    if (empty) empty.classList.toggle('is-hidden', rows.length !== 0);
  }
  function renderActive() {
    const rows = active().slice().sort(function (a, b) { return b.priority - a.priority; });
    const list = byId("activeList");
    if (!list) return;
    list.innerHTML = rows.map(function (a) { return bannerHtml(a, false); }).join('');
    syncActiveCount();
  }
  function renderArchive() {
    const rows = archived();
    const card = byId("archiveCard");
    const sub = byId("archiveSub");
    const list = byId("archiveList");
    if (!card || !sub || !list) return;
    card.classList.toggle('is-hidden', rows.length === 0);
    sub.textContent = rows.length + ' past announcement' + (rows.length === 1 ? '' : 's') + '.';
    list.innerHTML = rows.map(function (a) {
      return '<li><div class="arch-t">' + a.title + '</div>' +
        '<div class="arch-b">' + a.body + '</div>' +
        '<div class="arch-m">' + PRIORITY[a.priority] + ' · expired ' + (a.expires || '—') + '</div></li>';
    }).join('');
  }
  function renderPreview() {
    const target = byId("annPreview");
    const title = fieldById("annTitle");
    const body = fieldById("annBody");
    const priority = fieldById("annPriority");
    const expires = fieldById("annExpires");
    if (!target || !title || !body || !priority || !expires) return;
    target.innerHTML = bannerHtml({
      title: title.value.trim(),
      body: body.value.trim(),
      priority: Number(priority.value),
      created: null,
      expires: expires.value || null
    }, true);
  }
  function renderAnn() { renderActive(); renderArchive(); }
  /** Installed by the motion module below; null under reduced motion. */
  let playStagger: (() => void) | null = null;

  // ================= EVENTS =================
  function openDialog() {
    ['annTitle', 'annBody', 'annExpires'].forEach(function (id) {
      const el = fieldById(id);
      if (el) el.value = '';
    });
    const priority = fieldById("annPriority");
    if (priority) priority.value = '0';
    renderPreview();
    const dlg = byId("annMdl");
    if (dlg) openMdl(dlg);
    fieldById("annTitle")?.focus();
  }
  function closeDialog() {
    const dlg = byId("annMdl");
    if (dlg) closeMdl(dlg, after);
  }

  on(root, 'click', function (e) {
    const t = e.target as HTMLElement;
    if (t.closest('#newAnnBtn')) { openDialog(); return; }
    if (t.closest('[data-mdl="close"]')) { closeDialog(); return; }
    const retire = t.closest<HTMLElement>('[data-retire]');
    if (retire) {
      const card = retire.closest<HTMLElement>('[data-ann]');
      if (!card) return;
      const a = annData.find(function (x) { return x.id === card.dataset.ann; });
      // ONLY this card animates. It used to call renderAnn(), which rebuilt
      // #activeList's innerHTML — and the observer on that list then replayed the
      // entrance cascade across every surviving banner, so a retire looked like
      // the whole board redrawing with no clue which announcement had gone.
      leaveRow(card, function () {
        if (a) { a.expired = true; a.expires = a.expires || 'Jul 22, 2026'; }
        // The count and the empty state, plus the archive card the banner just
        // moved INTO — but not #activeList's markup, whose surviving nodes the
        // gap-closing FLIP is still holding.
        syncActiveCount();
        renderArchive();
      }, after, { leaveClass: 'bnr--leaving' });
      return;
    }
    if (t.closest('#publishBtn')) {
      const titleEl = fieldById("annTitle");
      const bodyEl = fieldById("annBody");
      const priorityEl = fieldById("annPriority");
      const expiresEl = fieldById("annExpires");
      if (!titleEl || !bodyEl || !priorityEl || !expiresEl) return;
      const title = titleEl.value.trim();
      const body = bodyEl.value.trim();
      if (!title) { titleEl.focus(); return; }
      if (!body) { bodyEl.focus(); return; }
      annSeq += 1;
      annData.unshift({
        id: 'a' + annSeq, title: title, body: body,
        priority: Number(priorityEl.value),
        created: 'Jul 22, 2026',
        expires: expiresEl.value || null,
        expired: false
      });
      closeDialog();
      renderAnn();
      // A publish genuinely re-lists the board, so the cascade is right here —
      // unlike a retire, which is one card leaving.
      playStagger?.();
    }
  });
  on(root, 'input', function (e) {
    const t = e.target as HTMLElement;
    if (['annTitle', 'annBody', 'annExpires'].indexOf(t.id) !== -1) renderPreview();
  });
  on(root, 'change', function (e) {
    const t = e.target as HTMLElement;
    if (t.id === 'annPriority' || t.id === 'annExpires') renderPreview();
  });

  // ================= INITIALIZATION =================
  renderAnn();

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
    // the dialog inside the mounted root, and `.rv` would strand the fixed
    // overlay at `opacity: 0` until it happened to intersect the viewport.
    const blocks = $$(".content > *").filter((el) => !el.classList.contains("mdl"));
    blocks.forEach((el, i) => {
      el.classList.add("rv");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? i * 60 + "ms" : "200ms";
    });
    // Second layer of the arrival — Overview cascades its `.kpi` strip here.
    // This page has no `.kpi`, so the layer stays empty, exactly as in the
    // donor. Skip anything the block cascade already claimed: no element
    // should carry `rv` and `rv-cell` at once.
    const cells = $$(".kpi").filter((el) => !el.classList.contains("rv"));
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

    // Entrance cascade — on FIRST paint only.
    //
    // This used to hang off a MutationObserver on both lists, so retiring one
    // announcement replayed the cascade across every banner that stayed. A
    // publish still cascades (renderActive rebuilds the list and calls this);
    // a retire animates only the card that left. See blueprint-shell/list-motion.
    playStagger = () => {
      ['activeList', 'archiveList'].forEach((id) => {
        const list = byId(id);
        if (!list) return;
        staggerIn(Array.from(list.querySelectorAll<HTMLElement>('.bnr, .arch li')));
      });
    };
    playStagger();

    // Numeral count-up — Overview's `.kpi-val`. This page has none, so the
    // pass is a no-op, exactly as in the donor.
    $$(".kpi-val").forEach((el) => {
      const raw = (el.textContent || "").trim();
      const money = raw.charAt(0) === '$';
      const target = parseInt(raw.replace(/[^0-9]/g, ''), 10);
      if (!isFinite(target)) return;
      let t0: number | null = null;
      function frame(t: number) {
        if (!t0) t0 = t;
        const pr = Math.min(1, (t - t0) / 750);
        const e = 1 - Math.pow(1 - pr, 3);
        el.textContent = (money ? '$' : '') + Math.round(target * e).toLocaleString('en-US');
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
