// Hire blueprint — runtime behaviors, ported verbatim from the donor file's
// <script> (jobflex-hire-blueprint_4.html). Every duration, easing, stagger,
// threshold and template string is the donor's exact value. Adaptations are
// mechanical only:
// - queries are scoped to the mounted `.content` root;
// - document/window listeners, observers and timers are tracked for unmount
//   cleanup;
// - the donor's mobile nav drawer, FLUID SCALE, sidebar entry cascade, sliding
//   sidebar indicator and graph-paper parallax are NOT ported: the persistent
//   shell (components/v3/blueprint-shell/shell-behavior.ts) already owns all of
//   them;
// - the `window.matchMedia` polyfill for preview shells is dropped (the app
//   only targets browsers that ship it);
// - the reveal cascade skips `#sheetBg` / `#sheet`: in the donor those two
//   fixed overlays live OUTSIDE `.content` and therefore never joined the
//   `.content > *` cascade. Excluding them here reproduces the donor exactly
//   (and keeps a `display:none` element from being frozen at `opacity: 0`).

import {
  HK_COLUMNS,
  SOURCES,
  APPLICANTS_SEED,
  AP_SEQ_START,
  HUB_DOORS,
  HUB_TALLY,
  HUB_LINKS,
  type Applicant,
  type HireColumnKey,
} from "./hire-data";

export function initHireContent(content: HTMLElement): () => void {
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

  // ================= HIRE: DATA =================
  // Runtime mutations (drag, save, convert, delete, add) — clone the seed per
  // mount so nothing leaks across navigations.
  let apSeq = AP_SEQ_START;
  let applicantsData: Applicant[] = APPLICANTS_SEED.map((a) => ({ ...a }));

  const hire = {
    tab: "hub",
    dragId: null as string | null,
    picked: null as string | null,
    sheet: null as string | null,
    editing: null as string | null,
    status: "APPLIED" as HireColumnKey,
  };

  function monogram(name: string) {
    const p = name.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
    return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }

  // ================= RENDER =================
  function renderBoard() {
    const empty = $("#hkEmpty");
    const board = $("#hkBoard");
    if (!empty || !board) return;
    empty.classList.toggle("is-hidden", applicantsData.length !== 0);
    board.classList.toggle("is-hidden", applicantsData.length === 0);
    board.innerHTML = HK_COLUMNS.map(function (col) {
      const list = applicantsData.filter(function (a) { return a.status === col.key; });
      return '<div class="hk-col" data-col="' + col.key + '">' +
        '<div class="hk-head"><span class="hk-lbl"><span class="hk-dot" style="background:' + col.tone + '"></span>' + col.label + '</span>' +
        '<span class="hk-n">' + list.length + '</span></div>' +
        '<div class="hk-body">' +
          (list.length ? list.map(function (a) {
            return '<button class="hk-card' + (hire.picked === a.id ? ' picked' : '') + '" type="button" draggable="true" data-id="' + a.id + '">' +
              '<span class="hk-top">' +
                '<span class="hk-av">' + monogram(a.name) + '</span>' +
                '<span style="min-width:0;flex:1">' +
                  '<span class="hk-name" style="display:block">' + a.name + '</span>' +
                  '<span class="hk-role" style="display:block">' + a.role + '</span>' +
                '</span>' +
                '<svg class="ic hk-grip"><use href="#i-dots"/></svg>' +
              '</span>' +
              '<span class="hk-foot">' +
                '<span class="hk-meta">' +
                  (a.email ? '<svg class="ic"><use href="#i-msg"/></svg>' : '') +
                  (a.phone ? '<svg class="ic"><use href="#i-phone"/></svg>' : '') +
                  (a.source ? a.source : '') +
                '</span>' +
                '<span class="hk-age">' + a.age + '</span>' +
              '</span>' +
            '</button>';
          }).join('') : '<div class="hk-drop">Drop here</div>') +
        '</div></div>';
    }).join('');
  }

  function renderHub() {
    const doors = $("#hubDoors");
    const tally = $("#tallyRow");
    const links = $("#hubList");
    if (doors) {
      doors.innerHTML = HUB_DOORS.map(function (d) {
        return '<button class="door" type="button" data-flash-door>' +
          '<span class="door-kicker">' + d.kicker + '</span>' +
          '<span class="door-ic"><svg class="ic"><use href="#' + d.icon + '"/></svg></span>' +
          '<span class="door-t" style="display:block">' + d.title + '</span>' +
          '<span class="door-b" style="display:block">' + d.body + '</span>' +
          '<span class="door-cta">' + d.cta + '<svg class="ic"><use href="#i-arrow"/></svg></span>' +
          '</button>';
      }).join('');
    }
    if (tally) {
      tally.innerHTML = HUB_TALLY.map(function (t) {
        return '<div class="tally-cell"><div class="kpi-lbl">' + t.label + '</div>' +
          '<div class="tally-v">' + t.value + '</div></div>';
      }).join('');
    }
    if (links) {
      links.innerHTML = HUB_LINKS.map(function (l) {
        return '<li><button class="hub-row" type="button"' + (l.goto ? ' data-goto="' + l.goto + '"' : ' data-flash-door') + '>' +
          '<span class="hub-row-ic"><svg class="ic"><use href="#' + l.icon + '"/></svg></span>' +
          '<span class="hub-row-t">' + l.label + '</span>' +
          '<svg class="ic hub-go"><use href="#i-arrow"/></svg>' +
          '</button></li>';
      }).join('');
    }
  }

  function renderHire() { renderBoard(); renderHub(); }

  // ================= PANELS =================
  function openSheet(title: string, html: string) {
    const t = $("#sheetTitle");
    const b = $("#sheetBody");
    const s = $("#sheet");
    const bg = $("#sheetBg");
    if (t) t.textContent = title;
    if (b) b.innerHTML = html;
    if (s) s.classList.add("open");
    if (bg) bg.classList.add("open");
  }
  function closeSheet() {
    $("#sheet")?.classList.remove("open");
    $("#sheetBg")?.classList.remove("open");
    hire.sheet = null;
    hire.editing = null;
  }
  function openApplicant(id: string) {
    const a = applicantsData.find(function (x) { return x.id === id; });
    if (!a) return;
    hire.sheet = 'detail'; hire.editing = id; hire.status = a.status;
    openSheet(a.name,
      '<div class="sf-meta">' +
        '<div class="sf-meta-row"><span class="kpi-lbl">Role</span><span>' + a.role + '</span></div>' +
        '<div class="sf-meta-row"><span class="kpi-lbl">Email</span><span>' + (a.email || '—') + '</span></div>' +
        '<div class="sf-meta-row"><span class="kpi-lbl">Phone</span><span>' + (a.phone || '—') + '</span></div>' +
        '<div class="sf-meta-row"><span class="kpi-lbl">Source</span><span>' + (a.source || 'Other') + '</span></div>' +
        '<div class="sf-meta-row"><span class="kpi-lbl">Applied</span><span>' + a.age + '</span></div>' +
      '</div>' +
      '<div class="sf"><span class="sf-lbl">Pipeline status</span><div class="pipe" id="pipeBox">' +
        HK_COLUMNS.map(function (c) {
          return '<button class="pipe-btn' + (a.status === c.key ? ' on' : '') + '" type="button" data-st="' + c.key + '">' + c.label + '</button>';
        }).join('') +
      '</div></div>' +
      '<label class="sf"><span class="sf-lbl">Notes</span><textarea class="sf-area" data-a="notes" placeholder="Interview observations, follow-ups, decisions.">' + (a.notes || '') + '</textarea></label>' +
      '<div class="sf-act">' +
        '<button class="btn btn-primary btn--sm" type="button" data-act="save-applicant"><svg class="ic"><use href="#i-check"/></svg>Save</button>' +
        '<button class="btn btn-ghost btn--sm" type="button" data-act="convert"><svg class="ic"><use href="#i-hardhat"/></svg>Convert to worker</button>' +
      '</div>' +
      '<div class="sf-act" style="border:none;padding-top:0;margin-top:9px">' +
        '<button class="btn btn-ghost btn--sm" type="button" data-act="delete-applicant"><svg class="ic"><use href="#i-trash"/></svg>Delete applicant</button>' +
      '</div>');
  }
  function openAddForm() {
    hire.sheet = 'add'; hire.editing = null; hire.status = 'APPLIED';
    openSheet('Add applicant',
      '<label class="sf"><span class="sf-lbl">Full name</span><input class="sf-in" data-a="name" placeholder="Casey Stone"></label>' +
      '<label class="sf"><span class="sf-lbl">Role</span><input class="sf-in" data-a="role" placeholder="Roofer, Estimator, Foreman…"></label>' +
      '<div class="sf sf-row">' +
        '<label><span class="sf-lbl">Email</span><input class="sf-in" type="email" data-a="email" placeholder="casey@example.com"></label>' +
        '<label><span class="sf-lbl">Phone</span><input class="sf-in" data-a="phone" placeholder="(425) 555-0199"></label>' +
      '</div>' +
      '<label class="sf"><span class="sf-lbl">Source</span><select class="sf-sel" data-a="source">' +
        SOURCES.map(function (s2) { return '<option>' + s2 + '</option>'; }).join('') +
      '</select></label>' +
      '<label class="sf"><span class="sf-lbl">Notes</span><textarea class="sf-area" data-a="notes" placeholder="Years of experience, specialties, schedule constraints…"></textarea></label>' +
      '<div class="sf-act">' +
        '<button class="btn btn-primary btn--sm" type="button" data-act="create-applicant"><svg class="ic"><use href="#i-check"/></svg>Add applicant</button>' +
        '<button class="btn btn-ghost btn--sm" type="button" data-sheet="close">Cancel</button>' +
      '</div>');
  }
  function moveCard(id: string, status: HireColumnKey) {
    const a = applicantsData.find(function (x) { return x.id === id; });
    if (!a || a.status === status) return;
    a.status = status;
    renderBoard();
  }

  // ================= EVENTS =================
  function switchTab(name: string) {
    hire.tab = name;
    $$(".ppanel").forEach(function (p) { p.classList.toggle("is-hidden", p.dataset.panel !== name); });
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  const addBtn = $("#addApplicantBtn");
  if (addBtn) on(addBtn, "click", () => openAddForm());

  // Card drag-and-drop between columns
  const board = $("#hkBoard");
  if (board) {
    on(board, "dragstart", (ev) => {
      const e = ev as DragEvent;
      const card = (e.target as HTMLElement | null)?.closest<HTMLElement>(".hk-card");
      if (!card) return;
      hire.dragId = card.dataset.id ?? null;
      card.classList.add("dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", card.dataset.id ?? "");
      }
    });
    on(board, "dragend", () => {
      board.querySelectorAll<HTMLElement>(".dragging").forEach(function (c) { c.classList.remove("dragging"); });
      board.querySelectorAll<HTMLElement>(".dragover").forEach(function (c) { c.classList.remove("dragover"); });
      hire.dragId = null;
    });
    on(board, "dragover", (ev) => {
      const col = (ev.target as HTMLElement | null)?.closest<HTMLElement>(".hk-col");
      if (!col || !hire.dragId) return;
      ev.preventDefault();
      board.querySelectorAll<HTMLElement>(".dragover").forEach(function (c) { if (c !== col) c.classList.remove("dragover"); });
      col.classList.add("dragover");
    });
    on(board, "drop", (ev) => {
      const col = (ev.target as HTMLElement | null)?.closest<HTMLElement>(".hk-col");
      if (!col || !hire.dragId) return;
      ev.preventDefault();
      moveCard(hire.dragId, col.dataset.col as HireColumnKey);
      hire.dragId = null;
    });
    // Touch: tap a card -> tap a column header
    on(board, "click", (ev) => {
      const card = (ev.target as HTMLElement | null)?.closest<HTMLElement>(".hk-card");
      if (card) {
        const id = card.dataset.id;
        if (!id) return;
        if (window.innerWidth > 860) { openApplicant(id); return; }
        const same = hire.picked === id;
        hire.picked = same ? null : id;
        renderBoard();
        if (same) openApplicant(id);
        return;
      }
      const head = (ev.target as HTMLElement | null)?.closest<HTMLElement>(".hk-head");
      if (head && hire.picked) {
        const col = head.closest<HTMLElement>(".hk-col");
        if (!col) return;
        moveCard(hire.picked, col.dataset.col as HireColumnKey);
        hire.picked = null;
        renderBoard();
      }
    });
  }

  on(document, "click", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('[data-sheet="close"]') || target.id === "sheetBg") { closeSheet(); return; }
    const goto = target.closest<HTMLElement>("[data-goto]");
    if (goto) { switchTab(goto.dataset.goto ?? ""); return; }
    const door = target.closest<HTMLElement>("[data-flash-door]");
    if (door) {
      if (!door.dataset.busy) {
        door.dataset.busy = "1";
        door.classList.add("tapped");
        later(function () { door.classList.remove("tapped"); delete door.dataset.busy; }, 700);
      }
      return;
    }
    const st = target.closest<HTMLElement>("[data-st]");
    if (st) {
      hire.status = st.dataset.st as HireColumnKey;
      $$("#pipeBox .pipe-btn").forEach(function (b) { b.classList.toggle("on", b === st); });
      return;
    }
    const act = target.closest<HTMLElement>("[data-act]");
    if (!act) return;
    const kind = act.dataset.act;
    const val = function (f: string) {
      const el = root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-a="' + f + '"]');
      return el ? el.value.trim() : "";
    };

    if (kind === "add") { openAddForm(); return; }
    if (kind === "save-applicant") {
      const a = applicantsData.find(function (x) { return x.id === hire.editing; });
      if (a) { a.status = hire.status; a.notes = val("notes"); }
      closeSheet(); renderBoard(); return;
    }
    if (kind === "convert") {
      const a = applicantsData.find(function (x) { return x.id === hire.editing; });
      if (a) { a.status = "HIRED"; }
      act.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>Converted';
      later(function () { closeSheet(); renderBoard(); }, 900);
      return;
    }
    if (kind === "delete-applicant") {
      applicantsData = applicantsData.filter(function (x) { return x.id !== hire.editing; });
      closeSheet(); renderBoard(); return;
    }
    if (kind === "create-applicant") {
      const name = val("name");
      if (!name) { root.querySelector<HTMLInputElement>('[data-a="name"]')?.focus(); return; }
      apSeq += 1;
      applicantsData.unshift({
        id: "a" + apSeq, name: name, role: val("role") || "Crew",
        email: val("email") || null, phone: val("phone") || null,
        source: val("source") || "Other", status: "APPLIED", age: "now", notes: val("notes"),
      });
      closeSheet(); renderBoard(); return;
    }
  });

  // ================= INITIALIZATION =================
  safe("init", function () { renderHire(); });

  // The mobile nav drawer and FLUID SCALE belong to the persistent chrome and
  // live in components/v3/blueprint-shell/shell-behavior.ts.

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
      const rows = Array.from(list.querySelectorAll<HTMLElement>(".hk-card, .door"));
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
    ["hkBoard", "hubList"].forEach((id) => {
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
    pressify(".btn, .card-foot-btn, .ptab, .pchip, .pager-btn, .pmenu-item, .photo-box, .pt-open", "pressed");
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
