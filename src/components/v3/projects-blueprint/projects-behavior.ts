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

import { closeMdl, openMdl, MDL_EXIT_MS } from "@/components/v3/blueprint-shell/mdl-motion";
import { PROJECTS_SEED, STATUSES, type Project } from "./projects-data";

export function initProjectsContent(content: HTMLElement): () => void {
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
  // A per-mount COPY of the fixture. The create dialog below pushes into this
  // array, and the seed is a module-level constant — mutating it directly would
  // leak every created project into the next visit to the page (and into any
  // other importer of PROJECTS_SEED).
  const projectsData: Project[] = PROJECTS_SEED.map((p) => ({ ...p }));

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
  function renderChips() {
    let html =
      '<button class="pchip' +
      (pjstate.filter === "ALL" ? " active" : "") +
      '" type="button" data-f="ALL">All <b>' +
      projectsData.length +
      "</b></button>";
    STATUSES.forEach(function (st) {
      const n = projectsData.filter(function (p) {
        return p.status === st;
      }).length;
      html +=
        '<button class="pchip' +
        (pjstate.filter === st ? " active" : "") +
        '" type="button" data-f="' +
        st +
        '">' +
        statusLabel(st) +
        " <b>" +
        n +
        "</b></button>";
    });
    const chips = $("#pjChips");
    if (chips) chips.innerHTML = html;
  }

  function renderGrid() {
    const rows =
      pjstate.filter === "ALL"
        ? projectsData
        : projectsData.filter(function (p) {
            return p.status === pjstate.filter;
          });
    const grid = $("#pjGrid");
    if (grid)
      grid.innerHTML = rows
        .map(function (p) {
          const pct = progress(p);
          const done = pct >= 100;
          return (
            '<a class="pjc" href="#" data-id="' +
            p.id +
            '" aria-label="Open ' +
            p.name +
            '">' +
            '<div class="pjc-head">' +
            '<div style="min-width:0">' +
            '<div class="pjc-name">' +
            p.name +
            "</div>" +
            (p.description ? '<p class="pjc-desc">' + p.description + "</p>" : "") +
            "</div>" +
            '<span class="pstatus pjs--' +
            p.status.toLowerCase() +
            '">' +
            statusLabel(p.status) +
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
            (p.startsAt || "—") +
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
            (p.endsAt ? " · due " + p.endsAt : "") +
            "</div>" +
            "</div>" +
            "</a>"
          );
        })
        .join("");
    const empty = $("#pjEmpty");
    if (empty) empty.classList.toggle("is-hidden", rows.length !== 0);
    // progress fill — animated from zero
    const fills = $$(".pjc-fill");
    if (rmOk()) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          fills.forEach(function (f) {
            f.style.width = String(f.dataset.w) + "%";
          });
        });
      });
    } else {
      fills.forEach(function (f) {
        f.style.width = String(f.dataset.w) + "%";
      });
    }
  }

  function renderProjects() {
    renderChips();
    renderGrid();
  }

  // ================= PROJECTS: EVENTS =================
  const chipsHost = $("#pjChips");
  if (chipsHost)
    chipsHost.addEventListener("click", function (e) {
      const chip = (e.target as HTMLElement).closest<HTMLElement>(".pchip");
      if (!chip) return;
      pjstate.filter = chip.dataset.f || "ALL";
      renderProjects();
    });

  // ================= CREATE DIALOG (new project) =================
  // Replaces the donor's placeholder button (a 1.6s "New project form" flash)
  // with a real dialog. The frame is the one the Leads page uses for its delete
  // confirmation (`.mdl`), extended with a form body; the record it creates
  // lands in the in-memory fixture above, because wiring these pages to Prisma
  // is a separate, out-of-scope decision.
  const newProjectBtn = $("#newProjectBtn");
  const pjDlg = $("#pjNew");
  const pjForm = root.querySelector<HTMLFormElement>("#pjNewForm");
  if (pjDlg && pjForm) {
    const inp = (sel: string) => root.querySelector<HTMLInputElement>(sel);
    const descEl = root.querySelector<HTMLTextAreaElement>("#pjfDesc");
    let draftStatus = STATUSES[0];
    let restoreFocus: HTMLElement | null = null;
    let created = 0;

    /** "2026-08-04" → "Aug 04" — the fixture's own display format. Parsed field
     *  by field on purpose: `new Date("2026-08-04")` is read as UTC midnight and
     *  renders as the previous day in every negative-offset timezone. */
    function shortDate(v: string): string | null {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      if (!m) return null;
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
    }

    function markErr(on: boolean) {
      pjDlg!.querySelector<HTMLElement>('[data-fld="name"]')?.classList.toggle("is-err", on);
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
      if (!closeMdl(pjDlg!, after)) return;
      markErr(false);
      restoreFocus?.focus();
    }

    function resetDlg() {
      pjForm!.reset();
      draftStatus = STATUSES[0];
      paintStatus();
      markErr(false);
    }

    if (newProjectBtn) on(newProjectBtn, "click", openDlg);

    on(pjDlg, "click", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-mdl="close"]')) {
        closeDlg();
        return;
      }
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
      const nameEl = inp("#pjfName");
      const name = (nameEl?.value || "").trim();
      if (!name) {
        markErr(true);
        nameEl?.focus();
        return;
      }
      created += 1;
      projectsData.unshift({
        id: "pn" + created,
        name,
        description: (descEl?.value || "").trim() || null,
        status: draftStatus,
        startsAt: shortDate(inp("#pjfStart")?.value || ""),
        endsAt: shortDate(inp("#pjfEnd")?.value || ""),
        budget: Math.round(Number((inp("#pjfBudget")?.value || "").replace(/[^\d.]/g, "")) || 0),
        jobCount: 0,
        completedJobs: 0,
      });
      // Drop back to All, so a project created while a status filter was active
      // is actually visible — it lands first in the grid.
      pjstate.filter = "ALL";
      closeDlg();
      // Clear the form only once the box has finished animating out — reset it
      // on the same frame and you watch the fields blank while the dialog is
      // still visible.
      after(MDL_EXIT_MS, resetDlg);
      renderProjects();
    });
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
    const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

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

    // Row stagger on list (re)render
    function animateRows(list: HTMLElement) {
      const rows = Array.from(list.querySelectorAll<HTMLElement>(".pjc"));
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
        // inline `transform: none` outranks every stylesheet `:hover` rule —
        // which is what killed the lift on `.pjc:hover`: the card's shadow
        // swapped but the card itself could not move.
        r.addEventListener("transitionend", function te(e) {
          if (e.propertyName !== "transform") return;
          r.style.opacity = "";
          r.style.transform = "";
          r.style.transition = "";
          r.removeEventListener("transitionend", te);
        });
      });
    }
    ["pjGrid"].forEach((id) => {
      const list = $("#" + id);
      if (!list) return;
      animateRows(list);
      const mo = new MutationObserver(() => animateRows(list));
      mo.observe(list, { childList: true });
      disposers.push(() => mo.disconnect());
    });

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
