// Projects blueprint — runtime behaviors, ported verbatim from the donor
// file's <script> (jobflex-projects-blueprint_2.html). Every duration, easing,
// stagger and formula is the donor's exact value. Adaptations are mechanical
// only:
// - queries are scoped to the mounted `.content` root;
// - listeners on shell-owned nodes (`.main` scroll) plus observers and timers
//   are tracked for unmount cleanup;
// - the donor blocks that drive the PERSISTENT chrome are omitted, because
//   components/v3/blueprint-shell/shell-behavior.ts already owns them: the
//   mobile nav drawer, FLUID SCALE, the sidebar entry cascade, the sliding
//   active-item indicator, the graph-paper parallax and press feedback on
//   shell controls.

import { createProject } from "@/actions/projects";
import { closeMdl, openMdl, MDL_EXIT_MS } from "@/components/v3/blueprint-shell/mdl-motion";
import { staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import { initDatePopovers } from "@/components/v3/shared/date-popover";
import { STATUSES, type Project } from "./projects-data";

export type ProjectsContentOptions = {
  /** The org's real project book, read server-side in
   *  src/app/dashboard/projects/page.tsx. REQUIRED — there is no fixture to
   *  fall back to, and an empty book renders the empty state rather than
   *  demo rows. */
  projects: Project[];
};

/** `createProject` rejects with an Error whose message is written for the user
 *  (the plan-limit refusal, the role refusal). Surface that text; fall back to
 *  a generic line for anything unrecognisable. */
function actionError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  // A Next.js server-action transport failure has no useful message.
  if (!msg || msg.toLowerCase().includes("fetch failed")) {
    return "Something went wrong. Check your connection and try again.";
  }
  return msg;
}

/** Project names and scope notes are user text and the grid is built from HTML
 *  strings — everything interpolated has to be escaped. */
function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The date popover writes this exact shape into the two schedule fields. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function initProjectsContent(
  content: HTMLElement,
  options: ProjectsContentOptions,
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
  const $ = (sel: string) => root.querySelector<HTMLElement>(sel);
  const $$ = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  /** Tracked `setTimeout` — the teardown at the bottom clears the whole list,
   *  so an unmount mid-animation cannot fire into a detached tree. */
  const after = (ms: number, fn: () => void) => {
    timers.push(setTimeout(fn, ms));
  };

  // ================= SAFETY: module isolation =================
  // Each block is wrapped so a failure in one does not disable the rest.
  function safe(name: string, fn: () => void) {
    try {
      fn();
    } catch (err) {
      console.error("[JobFlex] module failed: " + name, err);
    }
  }

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

  // ================= PROJECTS: DATA =================
  // The org's real project book, read in the page's server component. Copied
  // per mount because the create dialog unshifts the created row onto it —
  // mutating the array React handed down would leave a stale row behind on the
  // next render pass.
  const projectsData: Project[] = options.projects.map((p) => ({ ...p }));

  const pjstate = { filter: "ALL" };

  function money(n: number) {
    return "$" + n.toLocaleString("en-US");
  }
  function statusLabel(s: string) {
    return s.toLowerCase().replace("_", " ");
  }
  function progress(p: Project) {
    return p.jobCount > 0 ? Math.round((p.completedJobs / p.jobCount) * 100) : 0;
  }
  function rmOk() {
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // ================= PROJECTS: RENDER =================
  function chipCount(f: string) {
    return f === "ALL"
      ? projectsData.length
      : projectsData.filter(function (p) {
          return p.status === f;
        }).length;
  }

  /** Built ONCE. A filter click patches the four chips in place (see
   *  `paintChips`) rather than rebuilding the row — rebuilding destroys the
   *  very button the user just pressed, taking its focus and its press
   *  animation with it, and drops the reveal cascade's `rv-cell` classes. */
  function buildChips() {
    const chips = $("#pjChips");
    if (!chips) return;
    chips.innerHTML = ["ALL"]
      .concat(STATUSES)
      .map(function (f) {
        return (
          '<button class="pchip' +
          (pjstate.filter === f ? " active" : "") +
          '" type="button" data-f="' +
          f +
          '">' +
          (f === "ALL" ? "All" : statusLabel(f)) +
          " <b>" +
          chipCount(f) +
          "</b></button>"
        );
      })
      .join("");
  }

  function paintChips() {
    $$("#pjChips .pchip").forEach(function (c) {
      const f = c.dataset.f || "ALL";
      c.classList.toggle("active", f === pjstate.filter);
      const b = c.querySelector("b");
      if (b) b.textContent = String(chipCount(f));
    });
  }

  /** One card's markup. Shared by the full grid render and the single-card
   *  insert the create dialog does, so both stay identical by construction.
   *  The card is a real link into the classic project detail route — the grid
   *  used to render `href="#"`, so opening a project was a no-op. */
  function cardHTML(p: Project) {
    const pct = progress(p);
    const done = pct >= 100;
    return (
      '<a class="pjc" href="/dashboard/projects/' +
      encodeURIComponent(p.id) +
      '" data-id="' +
      esc(p.id) +
      '" aria-label="Open ' +
      esc(p.name) +
      '">' +
      '<div class="pjc-head">' +
      '<div style="min-width:0">' +
      // `title` carries the untruncated name — .pjc-name is clamped to 2 lines.
      '<div class="pjc-name" title="' +
      esc(p.name) +
      '">' +
      esc(p.name) +
      "</div>" +
      (p.description ? '<p class="pjc-desc">' + esc(p.description) + "</p>" : "") +
      "</div>" +
      '<span class="pstatus pjs--' +
      esc(p.status.toLowerCase()) +
      '">' +
      esc(statusLabel(p.status)) +
      "</span>" +
      "</div>" +
      '<div class="pjc-stats">' +
      '<div class="pjc-cell"><div class="kpi-lbl">Jobs</div>' +
      '<div class="pjc-val"><svg class="ic"><use href="#i-jobs"/></svg>' +
      p.jobCount +
      "</div></div>" +
      '<div class="pjc-cell"><div class="kpi-lbl">Budget</div>' +
      '<div class="pjc-val">' +
      money(p.budget) +
      "</div></div>" +
      '<div class="pjc-cell"><div class="kpi-lbl">Window</div>' +
      '<div class="pjc-val date"><svg class="ic"><use href="#i-cal"/></svg>' +
      esc(p.startsAt || "—") +
      "</div></div>" +
      "</div>" +
      '<div class="pjc-prog">' +
      '<div class="pjc-prog-top"><span class="pjc-prog-lbl">Progress</span>' +
      '<span class="pjc-prog-val' +
      (done ? " done" : "") +
      '">' +
      pct +
      "%</span></div>" +
      '<div class="pjc-track"><div class="pjc-fill' +
      (done ? " done" : "") +
      '" data-w="' +
      pct +
      '"></div></div>' +
      '<div class="pjc-sub">' +
      p.completedJobs +
      " of " +
      p.jobCount +
      " jobs complete" +
      (p.endsAt ? " · due " + esc(p.endsAt) : "") +
      "</div>" +
      "</div>" +
      "</a>"
    );
  }

  /** Progress bars grow from zero on the frame after they land. */
  function paintFills(scope: ParentNode) {
    const fills = Array.from(scope.querySelectorAll<HTMLElement>(".pjc-fill"));
    const set = function () {
      fills.forEach(function (f) {
        f.style.width = String(f.dataset.w) + "%";
      });
    };
    if (rmOk()) {
      requestAnimationFrame(function () {
        requestAnimationFrame(set);
      });
    } else {
      set();
    }
  }

  function visibleRows() {
    return pjstate.filter === "ALL"
      ? projectsData
      : projectsData.filter(function (p) {
          return p.status === pjstate.filter;
        });
  }

  function renderGrid() {
    const rows = visibleRows();
    const grid = $("#pjGrid");
    if (grid) grid.innerHTML = rows.map(cardHTML).join("");
    const empty = $("#pjEmpty");
    if (empty) empty.classList.toggle("is-hidden", rows.length !== 0);
    if (grid) paintFills(grid);
  }

  /** Add ONE card to the top of the grid without touching the others. A full
   *  re-render would replay every card's entrance for a change that affects a
   *  single row. */
  function insertCard(p: Project) {
    const grid = $("#pjGrid");
    if (!grid) return;
    const holder = document.createElement("div");
    holder.innerHTML = cardHTML(p);
    const node = holder.firstElementChild as HTMLElement | null;
    if (!node) return;
    grid.prepend(node);
    $("#pjEmpty")?.classList.add("is-hidden");
    paintFills(node);
    staggerIn([node]);
  }

  function renderProjects() {
    buildChips();
    renderGrid();
  }

  // ================= PROJECTS: EVENTS =================
  const chipsHost = $("#pjChips");
  if (chipsHost)
    chipsHost.addEventListener("click", function (e) {
      const chip = (e.target as HTMLElement).closest<HTMLElement>(".pchip");
      if (!chip) return;
      const next = chip.dataset.f || "ALL";
      if (next === pjstate.filter) return;
      pjstate.filter = next;
      // The chip row is patched, not rebuilt; the grid's set genuinely changed,
      // so it repaints — silently. A filter toggle must NOT replay the row
      // cascade (see blueprint-shell/list-motion for why).
      paintChips();
      renderGrid();
    });

  // ================= CREATE DIALOG (new project) =================
  // Replaces the donor's placeholder button (a 1.6s "New project form" flash)
  // with a real dialog. The frame is the one the Leads page uses for its delete
  // confirmation (`.mdl`), extended with a form body. Submitting calls the same
  // `createProject` server action the classic /dashboard/projects/new form
  // calls — org-scoped, plan-limit enforced, revalidating /dashboard/projects —
  // so the row the grid gains is the database row, id included.
  const newProjectBtn = $("#newProjectBtn");
  const pjDlg = $("#pjNew");
  const pjForm = root.querySelector<HTMLFormElement>("#pjNewForm");
  if (pjDlg && pjForm) {
    const inp = (sel: string) => root.querySelector<HTMLInputElement>(sel);
    const descEl = root.querySelector<HTMLTextAreaElement>("#pjfDesc");
    let draftStatus = STATUSES[0];
    let restoreFocus: HTMLElement | null = null;
    let saving = false;

    /** "2026-08-04" → "Aug 04" — the grid's own display format. Parsed field
     *  by field on purpose: `new Date("2026-08-04")` is read as UTC midnight and
     *  renders as the previous day in every negative-offset timezone. */
    function shortDate(v: string): string | null {
      const m = ISO_DATE.exec(v);
      if (!m) return null;
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
    }

    // Schedule fields: the blueprint month-grid popover replaces the two native
    // date inputs. Both used to draw the SAME grey browser calendar glyph, so
    // Starts and Ends were indistinguishable at a glance; they now carry the
    // calendar page's own pairing — a clock for the start, an hourglass for the
    // end (DTP_ICON there) — and the same two icons mean the same two things on
    // both surfaces. `shortDate` above still reads "YYYY-MM-DD" off `.value`.
    disposers.push(
      initDatePopovers(root, [
        { sel: "#pjfStart", icon: "i-clock", label: "Starts" },
        { sel: "#pjfEnd", icon: "i-hourglass", label: "Ends" },
      ]),
    );

    function markErr(on: boolean) {
      pjDlg!.querySelector<HTMLElement>('[data-fld="name"]')?.classList.toggle("is-err", on);
    }

    /** The server action's own refusal text — the plan-limit message and the
     *  role refusal are both written for the user. */
    function setDlgErr(msg: string | null) {
      const box = $("#pjNewErr");
      if (!box) return;
      box.textContent = msg || "";
      box.classList.toggle("is-hidden", !msg);
    }

    function setBusy(on: boolean) {
      saving = on;
      const btn = root.querySelector<HTMLButtonElement>("#pjNewOk");
      if (btn) {
        btn.disabled = on;
        btn.classList.toggle("is-busy", on);
        const lbl = btn.querySelector<HTMLElement>("[data-save-lbl]");
        if (lbl) lbl.textContent = on ? "Creating…" : "Create project";
      }
      // A write on the wire must not be cancelled out from under itself.
      pjDlg!.querySelectorAll<HTMLButtonElement>('[data-mdl="close"]').forEach((b) => {
        b.disabled = on;
      });
    }

    function paintStatus() {
      $$("#pjfStatus .fseg-btn").forEach((b) => {
        const on = b.dataset.v === draftStatus;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }

    function openDlg() {
      restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      openMdl(pjDlg!);
      // land on the first field, not on the dialog frame
      requestAnimationFrame(() => inp("#pjfName")?.focus());
    }

    function closeDlg() {
      // The dialog animates out over MDL_EXIT_MS (see mdl-motion). Focus goes
      // back to the opener immediately — waiting for the exit would leave the
      // keyboard stranded inside a dialog that is already on its way out.
      if (saving) return;
      if (!closeMdl(pjDlg!, after)) return;
      markErr(false);
      restoreFocus?.focus();
    }

    function resetDlg() {
      pjForm!.reset();
      draftStatus = STATUSES[0];
      paintStatus();
      markErr(false);
      setDlgErr(null);
    }

    if (newProjectBtn) on(newProjectBtn, "click", openDlg);

    on(pjDlg, "click", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-mdl="close"]')) {
        closeDlg();
        return;
      }
      if (saving) return;
      const seg = t.closest<HTMLElement>("#pjfStatus .fseg-btn");
      if (seg) {
        draftStatus = seg.dataset.v || STATUSES[0];
        paintStatus();
      }
    });

    on(document, "keydown", (e) => {
      const ev = e as KeyboardEvent;
      if (!pjDlg.classList.contains("open")) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        closeDlg();
        return;
      }
      // aria-modal: Tab must not walk out of the dialog and into the page behind
      if (ev.key !== "Tab") return;
      const items = Array.from(
        pjDlg.querySelectorAll<HTMLElement>("button, input, textarea, select, [href]"),
      ).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (ev.shiftKey && (active === first || !pjDlg.contains(active))) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && active === last) {
        ev.preventDefault();
        first.focus();
      }
    });

    on(pjForm, "input", () => markErr(false));

    on(pjForm, "submit", (e) => {
      e.preventDefault();
      void submitNew();
    });

    async function submitNew() {
      if (saving) return;
      const nameEl = inp("#pjfName");
      const name = (nameEl?.value || "").trim();
      if (!name) {
        markErr(true);
        nameEl?.focus();
        return;
      }
      setDlgErr(null);

      const startRaw = (inp("#pjfStart")?.value || "").trim();
      const endRaw = (inp("#pjfEnd")?.value || "").trim();
      const description = (descEl?.value || "").trim() || null;
      const status = draftStatus;
      const budget = Math.round(
        Number((inp("#pjfBudget")?.value || "").replace(/[^\d.]/g, "")) || 0,
      );

      setBusy(true);
      try {
        // The action's schema coerces the dates; "YYYY-MM-DD" is read as UTC
        // midnight, which is exactly what the page formats back for display.
        const res = await createProject({
          name,
          description,
          status,
          startsAt: ISO_DATE.test(startRaw) ? startRaw : null,
          endsAt: ISO_DATE.test(endRaw) ? endRaw : null,
          budget,
        });
        projectsData.unshift({
          id: res.id,
          name,
          description,
          status,
          startsAt: shortDate(startRaw),
          endsAt: shortDate(endRaw),
          budget,
          jobCount: 0,
          completedJobs: 0,
        });
        setBusy(false);
        if (pjstate.filter === "ALL") {
          // One row arrived — add that one card. Rebuilding the grid would
          // replay every other card's entrance for a change none of them saw.
          insertCard(projectsData[0]);
        } else {
          // Drop back to All, so a project created while a status filter was
          // active is actually visible. The whole visible set changes here, so
          // the grid does repaint — silently.
          pjstate.filter = "ALL";
          renderGrid();
        }
        paintChips();
        closeDlg();
        // Clear the form only once the box has finished animating out — reset it
        // on the same frame and you watch the fields blank while the dialog is
        // still visible.
        after(MDL_EXIT_MS, resetDlg);
      } catch (err) {
        setBusy(false);
        setDlgErr(actionError(err));
      }
    }
  }

  // ================= INITIALIZATION =================
  safe("init", function () {
    renderProjects();
  });

  // FLUID SCALE and the mobile nav drawer belong to the persistent chrome and
  // live in components/v3/blueprint-shell/shell-behavior.ts.

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // (The Balanced ease itself now lives in blueprint-shell/list-motion, which
    // owns the row stagger below.)

    // Reveal: load + scroll.
    // Reveal adapts to scroll speed: slow scroll — the full 420ms animation;
    // fast — a short one (down to 200ms): it does not lag, but stays visible.
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
    // Overview cascades its `.kpi` strip as the second layer of the arrival.
    // This page has no `.kpi`, so the selector matched nothing and the layer
    // was silently missing; its equivalent strip is the filter chip row.
    // Elements the block cascade already claimed are skipped — nothing should
    // carry `rv` and `rv-cell` at once.
    const cells = $$(".pchip").filter((el) => !el.classList.contains("rv"));
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

    // Row stagger — played ONCE, when the grid first arrives.
    //
    // The donor drove this from a `MutationObserver` on `#pjGrid` with
    // `{ childList: true }`, which fired on every render: toggling a status
    // chip dropped all eight cards to `opacity: 0` and crawled them back, and
    // creating a project replayed the entrance of every card that had not
    // changed. `staggerIn` moves the decision to the caller — first paint here,
    // and the single new card in `insertCard`.
    const grid = $("#pjGrid");
    if (grid) staggerIn(Array.from(grid.querySelectorAll<HTMLElement>(".pjc")));

    // Numeral count-up — Overview's `.kpi-val`, here the project cards' stats.
    // The donor rebuilt the text from digits alone, which is only safe for its
    // own plain "$12,400"/"18": it drops any unit and would wipe an inline
    // icon. So keep whatever frames the number, skip decimals (digits-only
    // mangles them) and skip nodes holding elements rather than bare text —
    // which is how the Jobs cell keeps its icon while Budget counts up.
    $$(".pjc-val:not(.date)").forEach((el) => {
      if (el.children.length) return;
      const m = (el.textContent || "").trim().match(/^([^\d]*)(\d[\d,]*)([^\d]*)$/);
      if (!m) return;
      const [, prefix, digits, suffix] = m;
      const target = parseInt(digits.replace(/,/g, ""), 10);
      if (!isFinite(target)) return;
      let t0: number | null = null;
      function frame(t: number) {
        if (!t0) t0 = t;
        const pr = Math.min(1, (t - t0) / 750);
        const e = 1 - Math.pow(1 - pr, 3);
        el.textContent = prefix + Math.round(target * e).toLocaleString("en-US") + suffix;
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
