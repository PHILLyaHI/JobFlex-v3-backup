// Jobs blueprint — runtime behaviors, ported verbatim from the donor file's
// <script> (jobflex-jobs-blueprint.html). Every duration, easing, stagger,
// page size and string is the donor's exact value. Adaptations are mechanical
// only:
// - queries are scoped to the mounted `.content` root;
// - every listener, timer and observer is tracked for unmount cleanup;
// - the donor's demo fixture lives in jobs-data.ts (same split as the
//   proposals port).
//
// SKIPPED — owned by components/v3/blueprint-shell/shell-behavior.ts, which
// mounts once and survives navigation: the mobile nav drawer / burger /
// overlay, FLUID SCALE (root zoom + --app-h + the eff-* breakpoint classes),
// the sidebar entry cascade, the sliding active-item indicator, the
// graph-paper parallax on `.main`, and press feedback on shell controls.
// The donor's `window.matchMedia` polyfill is skipped too — it guards
// file:// previewers, and every browser this app ships to has it.

import { closeMdl, openMdl, MDL_EXIT_MS } from "@/components/v3/blueprint-shell/mdl-motion";
import { JOB_TABS, ACCENT, JOBS_SEED, PAGE_SIZE, type Job, type JobStatus } from "./jobs-data";

export function initJobsContent(content: HTMLElement): () => void {
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

  // ================= SAFETY: module isolation =================
  // Each block is wrapped so a failure in one does not disable the rest
  // (a throw higher up used to cut off every handler below it).
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
    on(btn, "click", () => {
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

  // ================= JOBS: DATA =================
  const jobsData: Job[] = JOBS_SEED.map((j) => ({ ...j, crew: [...j.crew] }));

  const jstate = { tab: "ALL" as "ALL" | JobStatus, page: 1 };

  function statusLabel(s: string) {
    return s.charAt(0) + s.slice(1).toLowerCase().replace("_", " ");
  }
  function initials(name: string) {
    const p = name.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
    return p.length === 1
      ? p[0].slice(0, 2).toUpperCase()
      : (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }
  function rangeLabel(j: Job) {
    if (!j.start) return null;
    if (!j.end || j.end === j.start) return j.start;
    return j.start.replace(", 2026", "") + " – " + j.end.replace(", 2026", "");
  }
  function crewStack(crew: string[]) {
    if (!crew.length) return '<span class="crew-none">—</span>';
    const shown = crew.slice(0, 3);
    return (
      '<span class="crew">' +
      shown
        .map(function (n) {
          return '<span class="crew-av" title="' + n + '">' + initials(n) + "</span>";
        })
        .join("") +
      (crew.length > shown.length
        ? '<span class="crew-more">+' + (crew.length - shown.length) + "</span>"
        : "") +
      "</span>"
    );
  }
  function filtered() {
    return jstate.tab === "ALL"
      ? jobsData
      : jobsData.filter(function (j) {
          return j.status === jstate.tab;
        });
  }

  // ================= RENDER =================
  function renderTabs() {
    const tabs = $("#jTabs");
    if (!tabs) return;
    tabs.innerHTML = JOB_TABS.map(function (t) {
      const n =
        t.key === "ALL"
          ? jobsData.length
          : jobsData.filter(function (j) {
              return j.status === t.key;
            }).length;
      return (
        '<button class="jtab' +
        (jstate.tab === t.key ? " on" : "") +
        '" type="button" data-t="' +
        t.key +
        '">' +
        (t.key === "ALL"
          ? ""
          : '<span class="jtab-dot" style="background:' + ACCENT[t.key] + '"></span>') +
        t.label +
        '<span class="jtab-n">' +
        n +
        "</span></button>"
      );
    }).join("");
  }
  function renderRows() {
    const body = $("#jobsBody");
    const cards = $("#jobsCards");
    const card = $("#jobsCard");
    const empty = $("#jobsEmpty");
    const el = $("#jobsPager");
    if (!body || !cards || !card || !empty || !el) return;

    const rows = filtered();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (jstate.page > pages) jstate.page = pages;
    const slice = rows.slice((jstate.page - 1) * PAGE_SIZE, jstate.page * PAGE_SIZE);

    body.innerHTML = slice
      .map(function (j) {
        const range = rangeLabel(j);
        return (
          '<tr class="prow" data-id="' +
          j.id +
          '" style="--acc:' +
          ACCENT[j.status] +
          '">' +
          '<td><div class="j-title">' +
          j.title +
          "</div>" +
          '<div class="j-client">' +
          (j.client || "No client") +
          "</div></td>" +
          '<td><span class="pstatus jst--' +
          j.status.toLowerCase() +
          '"><span class="jst-dot"></span>' +
          statusLabel(j.status) +
          "</span></td>" +
          "<td>" +
          (range
            ? '<div class="j-date">' + range + '</div><div class="j-rel">' + j.rel + "</div>"
            : '<span class="j-unsched">Unscheduled</span>') +
          "</td>" +
          '<td class="num">' +
          crewStack(j.crew) +
          "</td>" +
          '<td class="num"><a class="pt-open" href="#" aria-label="Open ' +
          j.title +
          '"><svg class="ic"><use href="#i-arrow"/></svg></a></td>' +
          "</tr>"
        );
      })
      .join("");

    cards.innerHTML = slice
      .map(function (j) {
        const range = rangeLabel(j);
        return (
          '<li><a class="jcard" href="#" data-id="' +
          j.id +
          '" style="--acc:' +
          ACCENT[j.status] +
          '">' +
          '<div class="jcard-top"><div style="min-width:0">' +
          '<div class="jcard-t">' +
          j.title +
          "</div>" +
          '<div class="jcard-c">' +
          (j.client || "No client") +
          "</div></div>" +
          '<span class="pstatus jst--' +
          j.status.toLowerCase() +
          '">' +
          statusLabel(j.status) +
          "</span></div>" +
          '<div class="jcard-bot">' +
          '<span class="jcard-when"><svg class="ic"><use href="#i-cal"/></svg>' +
          (range || "Unscheduled") +
          "</span>" +
          (j.crew.length ? crewStack(j.crew) : "") +
          "</div></a></li>"
        );
      })
      .join("");

    card.classList.toggle("is-hidden", rows.length === 0);
    cards.style.display = rows.length === 0 ? "none" : "";
    empty.classList.toggle("is-hidden", rows.length !== 0);

    if (pages <= 1) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML =
      '<span class="pager-info">Page ' +
      jstate.page +
      " / " +
      pages +
      "</span>" +
      '<button class="pager-btn" type="button" data-pg="prev"' +
      (jstate.page <= 1 ? " disabled" : "") +
      ' aria-label="Previous"><svg class="ic rot-l"><use href="#i-chev"/></svg></button>' +
      '<button class="pager-btn" type="button" data-pg="next"' +
      (jstate.page >= pages ? " disabled" : "") +
      ' aria-label="Next"><svg class="ic rot-r"><use href="#i-chev"/></svg></button>';
  }
  function renderJobs() {
    renderTabs();
    renderRows();
  }

  // ================= EVENTS =================
  const tabsEl = $("#jTabs");
  if (tabsEl) {
    on(tabsEl, "click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>(".jtab");
      if (!b) return;
      jstate.tab = (b.dataset.t || "ALL") as "ALL" | JobStatus;
      jstate.page = 1;
      renderJobs();
    });
  }
  const pagerEl = $("#jobsPager");
  if (pagerEl) {
    on(pagerEl, "click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".pager-btn");
      if (!b || b.disabled) return;
      jstate.page += b.dataset.pg === "next" ? 1 : -1;
      renderRows();
    });
  }
  // ================= CREATE DIALOG (new job) =================
  // Replaces the donor's placeholder button (a 1.6s "New job form" flash) with
  // a real dialog. The frame is the one the Leads page uses for its delete
  // confirmation (`.mdl`), extended with a form body; the record it creates
  // lands in the in-memory fixture above, because wiring these pages to Prisma
  // is a separate, out-of-scope decision.
  const newJobBtn = $("#newJobBtn");
  const jDlg = $("#jNew");
  const jForm = root.querySelector<HTMLFormElement>("#jNewForm");
  if (jDlg && jForm) {
    const inp = (sel: string) => root.querySelector<HTMLInputElement>(sel);
    let draftStatus: JobStatus = "SCHEDULED";
    let restoreFocus: HTMLElement | null = null;
    let created = 0;

    /** Parsed field by field on purpose: `new Date("2026-07-30")` is read as UTC
     *  midnight and renders as the previous day in every negative-offset
     *  timezone. */
    function parseDay(v: string): Date | null {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
    }
    /** "2026-07-30" → "Jul 30, 2026" — the fixture's own display format. */
    function longDate(v: string): string | null {
      const d = parseDay(v);
      return d
        ? d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
        : null;
    }
    /** The fixture's relative column, in its own vocabulary: today / in 1 day /
     *  in 2 days / in 1 week / 2d ago / 2w ago. */
    function relLabel(v: string): string | null {
      const d = parseDay(v);
      if (!d) return null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const days = Math.round((d.getTime() - today.getTime()) / 86400000);
      if (days === 0) return "today";
      if (days > 0) {
        if (days === 1) return "in 1 day";
        if (days < 7) return "in " + days + " days";
        if (days < 14) return "in 1 week";
        return "in " + Math.round(days / 7) + " weeks";
      }
      const ago = -days;
      if (ago < 7) return ago + "d ago";
      if (ago < 14) return "1w ago";
      return Math.round(ago / 7) + "w ago";
    }

    function markErr(on: boolean) {
      jDlg!.querySelector<HTMLElement>('[data-fld="title"]')?.classList.toggle("is-err", on);
    }

    function paintStatus() {
      $$("#jfStatus .fseg-btn").forEach((b) => {
        const on = b.dataset.v === draftStatus;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }

    /** The clients already on the page, offered as suggestions on the Client
     *  field — the fixture is the only client list this page has. */
    function fillClientList() {
      const list = root.querySelector<HTMLDataListElement>("#jfClientList");
      if (!list) return;
      const names: string[] = [];
      jobsData.forEach((j) => {
        if (j.client && names.indexOf(j.client) === -1) names.push(j.client);
      });
      list.innerHTML = names
        .sort()
        .map(function (n) {
          return '<option value="' + n + '"></option>';
        })
        .join("");
    }

    function openDlg() {
      restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      fillClientList();
      openMdl(jDlg!);
      // land on the first field, not on the dialog frame
      requestAnimationFrame(() => inp("#jfTitle")?.focus());
    }

    function closeDlg() {
      // The dialog animates out over MDL_EXIT_MS (see mdl-motion). Focus goes
      // back to the opener immediately — waiting for the exit would leave the
      // keyboard stranded inside a dialog that is already on its way out.
      if (!closeMdl(jDlg!, after)) return;
      markErr(false);
      restoreFocus?.focus();
    }

    function resetDlg() {
      jForm!.reset();
      draftStatus = "SCHEDULED";
      paintStatus();
      markErr(false);
    }

    if (newJobBtn) on(newJobBtn, "click", openDlg);

    on(jDlg, "click", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-mdl="close"]')) {
        closeDlg();
        return;
      }
      const seg = t.closest<HTMLElement>("#jfStatus .fseg-btn");
      if (seg) {
        draftStatus = (seg.dataset.v || "SCHEDULED") as JobStatus;
        paintStatus();
      }
    });

    on(document, "keydown", (e) => {
      const ev = e as KeyboardEvent;
      if (!jDlg.classList.contains("open")) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        closeDlg();
        return;
      }
      // aria-modal: Tab must not walk out of the dialog and into the page behind
      if (ev.key !== "Tab") return;
      const items = Array.from(
        jDlg.querySelectorAll<HTMLElement>("button, input, textarea, select, [href]"),
      ).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (ev.shiftKey && (active === first || !jDlg.contains(active))) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && active === last) {
        ev.preventDefault();
        first.focus();
      }
    });

    on(jForm, "input", () => markErr(false));

    on(jForm, "submit", (e) => {
      e.preventDefault();
      const titleEl = inp("#jfTitle");
      const title = (titleEl?.value || "").trim();
      if (!title) {
        markErr(true);
        titleEl?.focus();
        return;
      }
      const startRaw = inp("#jfStart")?.value || "";
      const endRaw = inp("#jfEnd")?.value || "";
      created += 1;
      jobsData.unshift({
        id: "jn" + created,
        title,
        client: (inp("#jfClient")?.value || "").trim() || null,
        status: draftStatus,
        start: longDate(startRaw),
        end: longDate(endRaw),
        rel: relLabel(startRaw),
        crew: (inp("#jfCrew")?.value || "")
          .split(",")
          .map(function (n) {
            return n.trim();
          })
          .filter(Boolean),
      });
      // Drop back to All, so a job created while a status tab was active is
      // actually visible — it lands in the first row.
      jstate.tab = "ALL";
      jstate.page = 1;
      closeDlg();
      // Clear the form only once the box has finished animating out — reset it
      // on the same frame and you watch the fields blank while the dialog is
      // still visible.
      after(MDL_EXIT_MS, resetDlg);
      renderJobs();
    });
  }

  // ================= INITIALIZATION =================
  safe("init", function () {
    renderJobs();
  });

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
    // `.mdl` is skipped: it is a `.content` child only because the port moved
    // the dialog inside the mounted root, and `.rv` would strand the fixed
    // overlay at `opacity: 0` until it happened to intersect the viewport.
    const blocks = (Array.from(root.children) as HTMLElement[]).filter(
      (el) => !el.classList.contains("mdl"),
    );
    blocks.forEach((el, i) => {
      el.classList.add("rv");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? i * 60 + "ms" : "200ms";
    });
    // Second layer of the arrival — Overview cascades its `.kpi` strip here.
    // This page has no `.kpi`, so the layer was silently absent; its strip of
    // small units is the status tab row. Skip anything the block cascade
    // already claimed: no element should carry `rv` and `rv-cell` at once.
    const cells = $$(".jtab").filter((el) => !el.classList.contains("rv"));
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
            // element below the fold: duration from the current scroll speed
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
      const rows = Array.from(list.querySelectorAll<HTMLElement>(".prow, .jcard"));
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
        // so hover lift on rows and cards silently stops working.
        r.addEventListener("transitionend", function te(e) {
          if (e.propertyName !== "transform") return;
          r.style.opacity = "";
          r.style.transform = "";
          r.style.transition = "";
          r.removeEventListener("transitionend", te);
        });
      });
    }
    ["jobsBody", "jobsCards"].forEach((id) => {
      const list = $("#" + id);
      if (!list) return;
      animateRows(list);
      const mo = new MutationObserver(() => animateRows(list));
      mo.observe(list, { childList: true });
      disposers.push(() => mo.disconnect());
    });

    // Numeral count-up — Overview's `.kpi-val`; here the per-status tab counts.
    // The donor rebuilt the text from digits alone, safe only for its own plain
    // "$12,400"/"18": it drops any trailing unit and would wipe an inline icon.
    // So keep whatever frames the number, skip decimals (digits-only mangles
    // them), and skip nodes that hold elements rather than bare text.
    $$(".jtab-n").forEach((el) => {
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
    disposers.forEach((d) => d());
  };
}
