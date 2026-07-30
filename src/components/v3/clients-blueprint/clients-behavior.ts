// Clients blueprint — runtime behaviors, ported verbatim from the donor file's
// <script> (jobflex-clients-blueprint_2.html). Every duration, easing, stagger,
// page size and formula is the donor's exact value. Adaptations are mechanical
// only:
// - queries are scoped to the mounted `.content` root;
// - document/window listeners, timers and observers are tracked for unmount
//   cleanup;
// - the donor's chrome modules (matchMedia polyfill, mobile nav drawer, FLUID
//   SCALE, the sidebar entry cascade, the sliding active indicator and the
//   graph-paper parallax) are NOT ported here — the shared shell
//   (components/v3/blueprint-shell/shell-behavior.ts) already owns all of them;
// - the donor's `safe(name, fn)` try/catch wrapper is dropped: the modules it
//   guarded are either shell-owned or replaced by strict null checks below.

import { closeMdl, openMdl, MDL_EXIT_MS } from "@/components/v3/blueprint-shell/mdl-motion";
import { CLIENTS_SEED, PAGE_SIZE, type Client } from "./clients-data";

export function initClientsContent(content: HTMLElement): () => void {
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

  // A per-mount COPY of the fixture. The create dialog below pushes into this
  // array, and the seed is a module-level constant — mutating it directly would
  // leak every created client into the next visit to the page (and into any
  // other importer of CLIENTS_SEED). Tags are copied too: they are the one
  // nested value the dialog writes.
  const clientsData: Client[] = CLIENTS_SEED.map((c) => ({ ...c, tags: [...c.tags] }));

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

  // ================= CLIENTS: STATE + HELPERS =================
  const cstate = { filter: "ALL", page: 1 };

  function money(n: number) {
    return "$" + n.toLocaleString("en-US");
  }
  function initials(name: string) {
    const parts = name.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  function rmOk() {
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function tagLabels() {
    const set: string[] = [];
    clientsData.forEach(function (c) {
      c.tags.forEach(function (t) {
        if (set.indexOf(t.label) === -1) set.push(t.label);
      });
    });
    return set;
  }
  function filtered() {
    if (cstate.filter === "ALL") return clientsData;
    if (cstate.filter === "VIP")
      return clientsData.filter(function (c) {
        return c.vip;
      });
    return clientsData.filter(function (c) {
      return c.tags.some(function (t) {
        return t.label === cstate.filter;
      });
    });
  }

  // ================= CLIENTS: RENDER =================
  function renderMast() {
    const pipeline = clientsData.reduce(function (a, c) {
      return a + c.pipelineValue;
    }, 0);
    const proposals = clientsData.reduce(function (a, c) {
      return a + c.proposalCount;
    }, 0);
    const el = $("#cMast");
    if (!el) return;
    el.innerHTML =
      '<div class="pmast-top"><span class="pmast-lbl">Pipeline Value</span><span class="pmast-rule"></span></div>' +
      '<div class="pmast-val accent">' +
      money(pipeline) +
      "</div>" +
      '<div class="pmast-sub">' +
      "<span>Clients <b>" +
      clientsData.length +
      "</b></span>" +
      "<span>Proposals <b>" +
      proposals +
      "</b></span>" +
      "</div>";
    if (rmOk()) {
      el.style.opacity = "0";
      el.style.transform = "translateY(8px)";
      el.style.transition =
        "opacity 320ms cubic-bezier(0.22, 0.61, 0.36, 1), transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1)";
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          el.style.opacity = "";
          el.style.transform = "";
          el.addEventListener(
            "transitionend",
            function () {
              el.style.transition = "";
            },
            { once: true },
          );
        });
      });
    }
  }
  function renderChips() {
    const chips = $("#cChips");
    if (!chips) return;
    const vipCount = clientsData.filter(function (c) {
      return c.vip;
    }).length;
    let html =
      '<button class="pchip' +
      (cstate.filter === "ALL" ? " active" : "") +
      '" type="button" data-f="ALL">All <b>' +
      clientsData.length +
      "</b></button>";
    html +=
      '<button class="pchip' +
      (cstate.filter === "VIP" ? " active" : "") +
      '" type="button" data-f="VIP">VIP <b>' +
      vipCount +
      "</b></button>";
    tagLabels().forEach(function (label) {
      const n = clientsData.filter(function (c) {
        return c.tags.some(function (t) {
          return t.label === label;
        });
      }).length;
      html +=
        '<button class="pchip' +
        (cstate.filter === label ? " active" : "") +
        '" type="button" data-f="' +
        label +
        '">' +
        label +
        " <b>" +
        n +
        "</b></button>";
    });
    chips.innerHTML = html;
  }
  function renderPager(page: number, pages: number) {
    const el = $("#clientsPager");
    if (!el) return;
    if (pages <= 1) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML =
      '<span class="pager-info">Page ' +
      page +
      " / " +
      pages +
      "</span>" +
      '<button class="pager-btn" type="button" data-pg="prev"' +
      (page <= 1 ? " disabled" : "") +
      ' aria-label="Previous page"><svg class="ic rot-l"><use href="#i-chev"/></svg></button>' +
      '<button class="pager-btn" type="button" data-pg="next"' +
      (page >= pages ? " disabled" : "") +
      ' aria-label="Next page"><svg class="ic rot-r"><use href="#i-chev"/></svg></button>';
  }
  function renderTable() {
    const body = $("#clientTableBody");
    const card = $("#clientsCard");
    const empty = $("#clientsEmpty");
    if (!body || !card || !empty) return;
    const rows = filtered();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (cstate.page > pages) cstate.page = pages;
    const slice = rows.slice((cstate.page - 1) * PAGE_SIZE, cstate.page * PAGE_SIZE);
    body.innerHTML = slice
      .map(function (c) {
        const tags = c.tags.length
          ? '<div class="ctags">' +
            c.tags
              .map(function (t) {
                return '<span class="ctag">' + t.label + "</span>";
              })
              .join("") +
            "</div>"
          : '<span class="cdash">—</span>';
        return (
          '<tr class="prow" data-id="' +
          c.id +
          '">' +
          '<td><div class="cname"><span class="cav">' +
          initials(c.name) +
          "</span>" +
          '<span><span class="cname-line"><span class="pt-title">' +
          c.name +
          "</span>" +
          (c.vip ? '<span class="ctag ctag--vip">VIP</span>' : "") +
          "</span>" +
          '<span class="cmail">' +
          (c.email || "—") +
          "</span></span></div></td>" +
          '<td><span class="pt-sub">' +
          (c.address || "—") +
          "</span></td>" +
          "<td>" +
          tags +
          "</td>" +
          '<td class="num"><span class="pt-mono">' +
          c.proposalCount +
          "</span></td>" +
          '<td class="num"><span class="pt-money">' +
          money(c.pipelineValue) +
          "</span></td>" +
          '<td><span class="pt-mono">' +
          c.updated +
          "</span></td>" +
          '<td class="num"><a class="pt-open" href="#" aria-label="Open ' +
          c.name +
          '"><svg class="ic"><use href="#i-arrow"/></svg></a></td>' +
          "</tr>"
        );
      })
      .join("");
    card.classList.toggle("is-hidden", rows.length === 0);
    empty.classList.toggle("is-hidden", rows.length !== 0);
    renderPager(cstate.page, pages);
  }
  function renderClients() {
    renderMast();
    renderChips();
    renderTable();
  }

  // ================= CLIENTS: EVENTS =================
  const chipsEl = $("#cChips");
  if (chipsEl) {
    on(chipsEl, "click", function (e) {
      const chip = (e.target as HTMLElement).closest<HTMLElement>(".pchip");
      if (!chip) return;
      cstate.filter = chip.dataset.f || "ALL";
      cstate.page = 1;
      renderChips();
      renderTable();
    });
  }
  const pagerEl = $("#clientsPager");
  if (pagerEl) {
    on(pagerEl, "click", function (e) {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".pager-btn");
      if (!btn || btn.disabled) return;
      cstate.page += btn.dataset.pg === "next" ? 1 : -1;
      renderTable();
    });
  }
  // ================= CREATE DIALOG (new client) =================
  // Replaces the donor's placeholder button (a 1.6s "Form opens here" flash)
  // with a real dialog. The frame is the one the Leads page uses for its delete
  // confirmation (`.mdl`), extended with a form body; the record it creates
  // lands in the in-memory fixture above, because wiring these pages to Prisma
  // is a separate, out-of-scope decision.
  const newClientBtn = $("#newClientBtn");
  const cDlg = $("#cNew");
  const cForm = root.querySelector<HTMLFormElement>("#cNewForm");
  if (cDlg && cForm) {
    const inp = (sel: string) => root.querySelector<HTMLInputElement>(sel);
    const vipBtn = $("#cfVip");
    let draftVip = false;
    let restoreFocus: HTMLElement | null = null;
    let created = 0;

    function markErr(on: boolean) {
      cDlg!.querySelector<HTMLElement>('[data-fld="name"]')?.classList.toggle("is-err", on);
    }

    function paintVip() {
      vipBtn?.setAttribute("aria-pressed", draftVip ? "true" : "false");
    }

    function openDlg() {
      restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      openMdl(cDlg!);
      // land on the first field, not on the dialog frame
      requestAnimationFrame(() => inp("#cfName")?.focus());
    }

    function closeDlg() {
      // The dialog animates out over MDL_EXIT_MS (see mdl-motion). Focus goes
      // back to the opener immediately — waiting for the exit would leave the
      // keyboard stranded inside a dialog that is already on its way out.
      if (!closeMdl(cDlg!, after)) return;
      markErr(false);
      restoreFocus?.focus();
    }

    function resetDlg() {
      cForm!.reset();
      draftVip = false;
      paintVip();
      markErr(false);
    }

    if (newClientBtn) on(newClientBtn, "click", openDlg);

    on(cDlg, "click", function (e) {
      const t = e.target as HTMLElement;
      if (t.closest('[data-mdl="close"]')) {
        closeDlg();
        return;
      }
      if (t.closest("#cfVip")) {
        draftVip = !draftVip;
        paintVip();
      }
    });

    on(document, "keydown", function (e) {
      const ev = e as KeyboardEvent;
      if (!cDlg.classList.contains("open")) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        closeDlg();
        return;
      }
      // aria-modal: Tab must not walk out of the dialog and into the page behind
      if (ev.key !== "Tab") return;
      const items = Array.from(
        cDlg.querySelectorAll<HTMLElement>("button, input, textarea, select, [href]"),
      ).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (ev.shiftKey && (active === first || !cDlg.contains(active))) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && active === last) {
        ev.preventDefault();
        first.focus();
      }
    });

    on(cForm, "input", function () {
      markErr(false);
    });

    on(cForm, "submit", function (e) {
      e.preventDefault();
      const nameEl = inp("#cfName");
      const name = (nameEl?.value || "").trim();
      if (!name) {
        markErr(true);
        nameEl?.focus();
        return;
      }
      const tags = (inp("#cfTags")?.value || "")
        .split(",")
        .map(function (t) {
          return t.trim();
        })
        .filter(Boolean)
        .map(function (label) {
          return { label };
        });
      created += 1;
      clientsData.unshift({
        id: "cn" + created,
        name,
        email: (inp("#cfEmail")?.value || "").trim() || null,
        address: (inp("#cfAddress")?.value || "").trim(),
        proposalCount: 0,
        pipelineValue: 0,
        vip: draftVip,
        tags,
        // The column shows the fixture's short date; a client created now was
        // last touched now.
        updated: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit" }),
      });
      // Drop back to All, so a client created while a tag filter was active is
      // actually visible — they land in the first row.
      cstate.filter = "ALL";
      cstate.page = 1;
      closeDlg();
      // Clear the form only once the box has finished animating out — reset it
      // on the same frame and you watch the fields blank while the dialog is
      // still visible.
      after(MDL_EXIT_MS, resetDlg);
      renderClients();
    });
  }

  // ================= INITIALIZATION =================
  renderClients();

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
    // This page has no `.kpi`, so the layer was silently absent; its strip of
    // small units is the filter chip row. Skip anything the block cascade
    // already claimed: no element should carry `rv` and `rv-cell` at once.
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
      const rows = Array.from(list.querySelectorAll<HTMLElement>(".prow"));
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
    ["clientTableBody"].forEach((id) => {
      const list = $("#" + id);
      if (!list) return;
      animateRows(list);
      const mo = new MutationObserver(() => animateRows(list));
      mo.observe(list, { childList: true });
      disposers.push(() => mo.disconnect());
    });

    // Numeral count-up — Overview's `.kpi-val`; here the masthead's pipeline
    // total, which is this page's one headline figure. The donor rebuilt the
    // text from digits alone, safe only for its own plain "$12,400"/"18": it
    // drops any trailing unit and would wipe an inline icon. So keep whatever
    // frames the number, skip decimals (digits-only mangles them), and skip
    // nodes that hold elements rather than bare text.
    $$(".pmast-val").forEach((el) => {
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
