// Proposals blueprint — runtime behaviors, ported verbatim from the donor
// file's <script> (jobflex-proposals-blueprint.html). Every duration, easing,
// stagger, page size and formula is the donor's exact value. Adaptations are
// mechanical only:
// - queries are scoped to the mounted root;
// - document/window listeners and observers are tracked for unmount cleanup;
// - FLUID SCALE zooms the page ROOT instead of document.documentElement (the
//   root owns the full viewport, so the visual result is identical, and the
//   zoom cannot leak into the rest of the app); the menu-positioning math
//   reads the root's zoom accordingly;
// - the donor's `typeof layoutSync === 'function'` guard in FLUID SCALE is
//   inert in the donor too (no layoutSync exists on this page) and is
//   therefore omitted.

import {
  PROPOSALS_SEED,
  PSTATUS,
  PAGE_ALL,
  PAGE_ACC,
  PAGE_DONE,
  type Proposal,
  type Installment,
} from "./proposals-data";

export function initProposalsContent(content: HTMLElement): () => void {
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

  // Runtime mutations (duplicate/delete/done/unaccept) — clone the seed per mount.
  const proposalsData: Proposal[] = PROPOSALS_SEED.map((p) => ({
    ...p,
    inst: p.inst ? p.inst.map((i) => ({ ...i })) : undefined,
  }));

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

  const pstate = {
    tab: "all",
    filter: "ALL",
    pageAll: 1,
    pageAcc: 1,
    pageDone: 1,
    menuId: null as number | null,
  };

  function fmtMoney(n: number) {
    return "$" + n.toLocaleString("en-US");
  }
  function instDollars(p: Proposal, inst: Installment) {
    return inst.pct ? Math.round(p.total * (inst.amount / 100)) : inst.amount;
  }
  function sumOf(list: Proposal[]) {
    return list.reduce((a, p) => a + p.total, 0);
  }
  function listAccepted() {
    return proposalsData.filter((p) => p.status === "ACCEPTED");
  }
  function listDone() {
    return proposalsData.filter((p) => p.status === "PAID");
  }
  function rmOk() {
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // ================= PROPOSALS: RENDER =================
  // Masthead: one headline number per tab + exactly two annotations
  function mastData() {
    const all = proposalsData,
      acc = listAccepted(),
      done = listDone();
    if (pstate.tab === "accepted") {
      const owed = sumOf(acc);
      return {
        lbl: "Money Owed · Work In Motion",
        tone: "accent",
        val: fmtMoney(owed),
        sub: [
          ["Active jobs", acc.length],
          ["Avg contract", acc.length ? fmtMoney(Math.round(owed / acc.length)) : "—"],
        ] as Array<[string, string | number]>,
      };
    }
    if (pstate.tab === "completed") {
      const banked = sumOf(done);
      return {
        lbl: "Banked · Jobs Closed",
        tone: "good",
        val: fmtMoney(banked),
        sub: [
          ["Filed jobs", done.length],
          ["Avg job size", done.length ? fmtMoney(Math.round(banked / done.length)) : "—"],
        ] as Array<[string, string | number]>,
      };
    }
    return {
      lbl: "Total Value",
      tone: "accent",
      val: fmtMoney(sumOf(all)),
      sub: [
        ["Open proposals", all.filter((p) => p.status !== "PAID").length],
        ["Accepted", acc.length],
      ] as Array<[string, string | number]>,
    };
  }
  function renderKpis() {
    const m = mastData();
    const el = $("#pMast");
    if (!el) return;
    el.innerHTML =
      '<div class="pmast-top"><span class="pmast-lbl">' +
      m.lbl +
      '</span><span class="pmast-rule"></span></div>' +
      '<div class="pmast-val ' +
      m.tone +
      '">' +
      m.val +
      "</div>" +
      '<div class="pmast-sub">' +
      m.sub.map((x) => "<span>" + x[0] + " <b>" + x[1] + "</b></span>").join("") +
      "</div>";
    if (rmOk()) {
      el.style.opacity = "0";
      el.style.transform = "translateY(8px)";
      el.style.transition =
        "opacity 320ms cubic-bezier(0.22, 0.61, 0.36, 1), transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1)";
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          el.style.opacity = "";
          el.style.transform = "";
          el.addEventListener(
            "transitionend",
            () => {
              el.style.transition = "";
            },
            { once: true },
          );
        }),
      );
    }
  }
  function renderTabCounts() {
    const counts: Record<string, number> = {
      all: proposalsData.length,
      accepted: listAccepted().length,
      completed: listDone().length,
    };
    root.querySelectorAll<HTMLElement>("#pTabs .ptab-count").forEach((el) => {
      el.textContent = String(counts[el.dataset.count || ""]);
    });
  }
  function renderChipCounts() {
    const c: Record<string, number> = { ALL: proposalsData.length, DRAFT: 0, SENT: 0, VIEWED: 0, DECLINED: 0, EXPIRED: 0 };
    proposalsData.forEach((p) => {
      if (p.status in c) c[p.status] += 1;
    });
    root.querySelectorAll<HTMLElement>("#pChips [data-cf]").forEach((el) => {
      el.textContent = String(c[el.dataset.cf || ""]);
    });
  }
  function renderPager(el: HTMLElement | null, page: number, pages: number, key: string) {
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
      '<button class="pager-btn" type="button" data-pg="prev" data-key="' +
      key +
      '"' +
      (page <= 1 ? " disabled" : "") +
      ' aria-label="Previous page"><svg class="ic rot-l"><use href="#i-chev"/></svg></button>' +
      '<button class="pager-btn" type="button" data-pg="next" data-key="' +
      key +
      '"' +
      (page >= pages ? " disabled" : "") +
      ' aria-label="Next page"><svg class="ic rot-r"><use href="#i-chev"/></svg></button>';
  }
  function renderAll() {
    const rows =
      pstate.filter === "ALL" ? proposalsData : proposalsData.filter((p) => p.status === pstate.filter);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_ALL));
    if (pstate.pageAll > pages) pstate.pageAll = pages;
    const slice = rows.slice((pstate.pageAll - 1) * PAGE_ALL, pstate.pageAll * PAGE_ALL);
    const body = $("#propTableBody");
    if (!body) return;
    body.innerHTML = slice
      .map((p) => {
        const st = PSTATUS[p.status];
        return (
          '<tr class="prow">' +
          '<td><div class="pt-title">' +
          p.title +
          '</div><div class="pt-sub">' +
          p.client +
          " · " +
          p.city +
          "</div></td>" +
          '<td><span class="pstatus ' +
          st.cls +
          '">' +
          st.label +
          "</span></td>" +
          '<td class="num"><span class="pt-money">' +
          fmtMoney(p.total) +
          "</span></td>" +
          '<td><span class="pt-mono">' +
          p.updated +
          " ago</span></td>" +
          '<td class="num"><span class="pt-mono">' +
          p.views +
          "</span></td>" +
          '<td><span class="pt-mono">' +
          p.owner +
          "</span></td>" +
          '<td class="num"><button class="pt-open" type="button" data-menu="' +
          p.id +
          '" aria-label="Actions for ' +
          p.title +
          '"><svg class="ic"><use href="#i-dots"/></svg></button></td>' +
          "</tr>"
        );
      })
      .join("");
    $("#allCard")?.classList.toggle("is-hidden", rows.length === 0);
    $("#allEmpty")?.classList.toggle("is-hidden", rows.length !== 0);
    renderPager($("#allPager"), pstate.pageAll, pages, "all");
  }
  function renderAccepted() {
    const rows = listAccepted();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_ACC));
    if (pstate.pageAcc > pages) pstate.pageAcc = pages;
    const slice = rows.slice((pstate.pageAcc - 1) * PAGE_ACC, pstate.pageAcc * PAGE_ACC);
    const stack = $("#propStack");
    if (!stack) return;
    stack.innerHTML = slice
      .map((p) => {
        const insts = p.inst || [];
        // Payments: 1–5 items — columns; 6+ — a row table with dividers
        let payBlock = "";
        if (insts.length > 5) {
          payBlock =
            '<table class="psched psched--div"><tbody>' +
            insts
              .map(
                (inst) =>
                  "<tr>" +
                  '<td class="psched-label">' +
                  inst.label +
                  "</td>" +
                  '<td><span class="pt-mono">' +
                  (inst.due ? "due " + inst.due : "no due date") +
                  "</span></td>" +
                  '<td class="td-price"><span class="pt-money">' +
                  fmtMoney(instDollars(p, inst)) +
                  "</span></td>" +
                  '<td class="td-remind"><button class="btn btn-ghost btn--sm" type="button" data-flash="Sent"><svg class="ic"><use href="#i-bell"/></svg>Remind</button></td>' +
                  "</tr>",
              )
              .join("") +
            "</tbody></table>";
        } else if (insts.length) {
          payBlock =
            '<div class="pcols">' +
            insts
              .map((inst) => {
                const sub = inst.pct ? inst.amount + "% of total" : inst.due ? "due " + inst.due : "";
                return (
                  '<div class="pcol"><div class="kpi-lbl">' +
                  inst.label +
                  "</div>" +
                  '<div class="pcol-val">' +
                  fmtMoney(instDollars(p, inst)) +
                  "</div>" +
                  (sub ? '<div class="pcol-sub">' + sub + "</div>" : "") +
                  "</div>"
                );
              })
              .join("") +
            "</div>";
        }
        return (
          '<div class="pjob" data-id="' +
          p.id +
          '">' +
          '<div class="pjob-head">' +
          '<div><div class="pjob-title">' +
          p.title +
          "</div>" +
          '<div class="pjob-sub">' +
          p.client +
          " · " +
          p.city +
          (p.accepted ? " · accepted " + p.accepted : "") +
          "</div></div>" +
          '<div class="pjob-total"><span class="pt-mono">Contract value</span><span class="pt-money">' +
          fmtMoney(p.total) +
          "</span></div>" +
          "</div>" +
          payBlock +
          '<div class="pjob-foot">' +
          '<div class="pjob-foot-l">' +
          '<button class="btn btn-ghost btn--sm" type="button" data-flash="Scheduled"><svg class="ic"><use href="#i-cal"/></svg>Schedule</button>' +
          '<button class="btn btn--accent btn--sm" type="button" data-flash="Requested"><svg class="ic"><use href="#i-msg"/></svg>Request payment</button>' +
          '<button class="btn btn-ghost btn--sm" type="button" data-flash="Ordered"><svg class="ic"><use href="#i-box"/></svg>Materials · ' +
          (p.mat || 0) +
          "</button>" +
          '<button class="btn btn-ghost btn--sm" type="button" data-flash="Drafted"><svg class="ic"><use href="#i-file"/></svg>Change order</button>' +
          '<button class="btn btn-ghost btn--sm" type="button" data-flash="Opened"><svg class="ic"><use href="#i-ext"/></svg>View public</button>' +
          "</div>" +
          '<div class="pjob-foot-r">' +
          '<button class="btn btn-ghost btn--sm" type="button" data-act="unaccept"><svg class="ic"><use href="#i-undo"/></svg>Un-accept</button>' +
          '<button class="btn btn-primary btn--sm" type="button" data-act="done"><svg class="ic"><use href="#i-check"/></svg>Mark completed</button>' +
          "</div>" +
          "</div>" +
          "</div>"
        );
      })
      .join("");
    $("#accEmpty")?.classList.toggle("is-hidden", rows.length !== 0);
    renderPager($("#accPager"), pstate.pageAcc, pages, "acc");
  }
  function renderDone() {
    const rows = listDone();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_DONE));
    if (pstate.pageDone > pages) pstate.pageDone = pages;
    const slice = rows.slice((pstate.pageDone - 1) * PAGE_DONE, pstate.pageDone * PAGE_DONE);
    const stack = $("#doneStack");
    if (!stack) return;
    stack.innerHTML = slice
      .map((p) => {
        const insts = p.inst || [];
        const dep = insts.length ? instDollars(p, insts[0]) : Math.round(p.total * 0.3);
        const checks = insts
          .map(
            (inst) =>
              '<div class="pchk"><span class="pchk-ic"><svg class="ic"><use href="#i-check"/></svg></span>' +
              '<span class="pchk-lbl">' +
              inst.label +
              '</span><span class="pchk-lead"></span>' +
              '<span class="pt-money">' +
              fmtMoney(instDollars(p, inst)) +
              "</span></div>",
          )
          .join("");
        return (
          '<div class="psheet" data-id="' +
          p.id +
          '">' +
          '<div class="psheet-head">' +
          '<div><div class="pjob-title">' +
          p.title +
          "</div>" +
          '<div class="pjob-sub">' +
          p.client +
          " · " +
          p.city +
          "</div></div>" +
          '<div><span class="psheet-banklbl">Banked</span><span class="pt-money banked big">' +
          fmtMoney(p.total) +
          "</span></div>" +
          "</div>" +
          '<div class="pcols pcols--sheet">' +
          '<div class="pcol"><div class="kpi-lbl">Deposit</div><div class="pcol-val">' +
          fmtMoney(dep) +
          '</div><div class="pcol-sub">Locked in</div></div>' +
          '<div class="pcol"><div class="kpi-lbl">Start</div><div class="pcol-val">' +
          (p.accepted || "—") +
          '</div><div class="pcol-sub">Work began</div></div>' +
          '<div class="pcol"><div class="kpi-lbl">Completed</div><div class="pcol-val good">' +
          p.paid +
          '</div><div class="pcol-sub">Paid in full</div></div>' +
          "</div>" +
          '<div class="psheet-body">' +
          '<div class="psheet-check">' +
          checks +
          "</div>" +
          '<div class="psheet-photos">' +
          '<div><div class="kpi-lbl">Before</div><button class="photo-box" type="button" data-flash="Added"><svg class="ic"><use href="#i-imgadd"/></svg>Add before</button></div>' +
          '<div><div class="kpi-lbl">After</div><button class="photo-box" type="button" data-flash="Added"><svg class="ic"><use href="#i-imgadd"/></svg>Add after</button></div>' +
          "</div>" +
          "</div>" +
          '<div class="psheet-foot">' +
          '<div class="psheet-send">' +
          '<span class="kpi-lbl">Send paid receipt to</span>' +
          '<input class="pinput" type="email" placeholder="client@example.com">' +
          '<button class="btn btn-primary btn--sm" type="button" data-act="receipt"><svg class="ic"><use href="#i-send"/></svg>Send receipt</button>' +
          "</div>" +
          '<button class="btn btn-ghost btn--sm" type="button" data-act="unmark"><svg class="ic"><use href="#i-undo"/></svg>Unmark as paid</button>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");
    $("#doneEmpty")?.classList.toggle("is-hidden", rows.length !== 0);
    renderPager($("#donePager"), pstate.pageDone, pages, "done");
  }
  function renderProposals() {
    renderKpis();
    renderTabCounts();
    renderChipCounts();
    renderAll();
    renderAccepted();
    renderDone();
  }

  // ================= PROPOSALS: ROW CONTEXT MENU =================
  const pMenu = $("#pMenu");
  function menuItem(
    icon: string,
    tone: string,
    t: string,
    sub: string,
    act: string,
    dis?: boolean,
    danger?: boolean,
  ) {
    return (
      '<button class="pmenu-item' +
      (dis ? " is-disabled" : "") +
      (danger ? " is-danger" : "") +
      '" type="button" data-mact="' +
      act +
      '">' +
      '<span class="pmi-ic' +
      (tone ? " " + tone : "") +
      '"><svg class="ic"><use href="#' +
      icon +
      '"/></svg></span>' +
      '<span><span class="pmenu-item-t">' +
      t +
      '</span><span class="pmenu-item-s" style="display:block">' +
      sub +
      "</span></span>" +
      "</button>"
    );
  }
  function openMenu(id: number, btn: HTMLElement) {
    const p = proposalsData.find((x) => x.id === id);
    if (!p || !pMenu) return;
    pstate.menuId = id;
    pMenu.innerHTML =
      '<div class="pmenu-head"><div class="pmenu-title">' +
      p.title +
      '</div><div class="pmenu-sub">' +
      p.client +
      " · " +
      p.city +
      "</div></div>" +
      menuItem("i-pen", "pmi--bp", "Edit proposal", "Open editor", "edit") +
      menuItem("i-ext", "pmi--sky", "View public page", "New tab", "view") +
      menuItem("i-dup", "", "Duplicate", "Clone & edit", "dup") +
      '<div class="pmenu-div"></div>' +
      menuItem("i-send", "pmi--ok", "Send to client", "Add an email", "sendto") +
      menuItem("i-box", "pmi--warn", "Order materials", (p.mat || 0) + " items", "materials") +
      menuItem("i-building", "", "View on Zillow", p.addr ? "Open listing" : "No address on client", "zillow", !p.addr) +
      '<div class="pmenu-div"></div>' +
      menuItem("i-trash", "pmi--danger", "Delete proposal", "Permanent", "del", false, true);
    pMenu.classList.add("open");
    // The donor zooms document.documentElement; the port zooms the page root.
    const z = parseFloat(root.style.getPropertyValue("zoom")) || 1;
    const vw = window.innerWidth / z,
      vh = window.innerHeight / z;
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
    pstate.menuId = null;
    pMenu?.classList.remove("open");
  }
  main?.addEventListener("scroll", closeMenu, { passive: true });

  // ================= PROPOSALS: EVENTS =================
  function flashBtn(btn: HTMLElement, label: string) {
    if (btn.dataset.busy) return;
    btn.dataset.busy = "1";
    const old = btn.innerHTML;
    btn.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>' + label;
    btn.classList.add("is-flashed");
    setTimeout(() => {
      btn.innerHTML = old;
      btn.classList.remove("is-flashed");
      delete btn.dataset.busy;
    }, 1600);
  }
  $("#pTabs")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".ptab");
    if (!btn || btn.classList.contains("active")) return;
    pstate.tab = btn.dataset.tab || "all";
    root.querySelectorAll<HTMLElement>("#pTabs .ptab").forEach((t) => t.classList.toggle("active", t === btn));
    $$(".ppanel").forEach((pn) => pn.classList.toggle("is-hidden", pn.dataset.panel !== pstate.tab));
    renderKpis();
  });
  $("#pChips")?.addEventListener("click", (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>(".pchip");
    if (!chip) return;
    pstate.filter = chip.dataset.f || "ALL";
    pstate.pageAll = 1;
    root.querySelectorAll<HTMLElement>("#pChips .pchip").forEach((c) => c.classList.toggle("active", c === chip));
    renderAll();
  });
  on(document, "click", (e) => {
    const target = e.target as HTMLElement;
    const menuBtn = target.closest<HTMLElement>("[data-menu]");
    if (menuBtn) {
      const id = Number(menuBtn.dataset.menu);
      if (pstate.menuId === id) closeMenu();
      else openMenu(id, menuBtn);
      return;
    }
    const mact = target.closest<HTMLElement>("[data-mact]");
    if (mact) {
      const id = pstate.menuId;
      const idx = proposalsData.findIndex((x) => x.id === id);
      const act = mact.dataset.mact;
      closeMenu();
      if (idx === -1) return;
      if (act === "dup") {
        const src = proposalsData[idx];
        const copy: Proposal = Object.assign({}, src, {
          id: Math.max.apply(null, proposalsData.map((x) => x.id)) + 1,
          title: src.title + " (copy)",
          status: "DRAFT",
          updated: "now",
          views: 0,
          accepted: undefined,
          paid: undefined,
        });
        proposalsData.splice(idx + 1, 0, copy);
        renderProposals();
      }
      if (act === "del") {
        proposalsData.splice(idx, 1);
        renderProposals();
      }
      return;
    }
    if (!target.closest(".pmenu")) closeMenu();

    const pg = target.closest<HTMLButtonElement>(".pager-btn");
    if (pg && !pg.disabled) {
      const d = pg.dataset.pg === "next" ? 1 : -1;
      if (pg.dataset.key === "all") {
        pstate.pageAll += d;
        renderAll();
      }
      if (pg.dataset.key === "acc") {
        pstate.pageAcc += d;
        renderAccepted();
      }
      if (pg.dataset.key === "done") {
        pstate.pageDone += d;
        renderDone();
      }
      return;
    }
    const fl = target.closest<HTMLElement>("[data-flash]");
    if (fl) {
      flashBtn(fl, fl.dataset.flash || "");
      return;
    }
    const act = target.closest<HTMLElement>("[data-act]");
    if (!act) return;
    if (act.dataset.act === "done") {
      const id = Number(act.closest<HTMLElement>("[data-id]")?.dataset.id);
      const p = proposalsData.find((x) => x.id === id);
      if (p) {
        p.status = "PAID";
        p.paid = "JUL 22";
        p.updated = "now";
      }
      renderProposals();
    }
    if (act.dataset.act === "unaccept") {
      const id = Number(act.closest<HTMLElement>("[data-id]")?.dataset.id);
      const p = proposalsData.find((x) => x.id === id);
      if (p) {
        p.status = "SENT";
        p.accepted = undefined;
        p.updated = "now";
      }
      renderProposals();
    }
    if (act.dataset.act === "unmark") {
      const id = Number(act.closest<HTMLElement>("[data-id]")?.dataset.id);
      const p = proposalsData.find((x) => x.id === id);
      if (p) {
        p.status = "ACCEPTED";
        p.paid = undefined;
        p.updated = "now";
      }
      renderProposals();
    }
    if (act.dataset.act === "receipt") {
      const input = act.closest<HTMLElement>(".psheet-send")?.querySelector<HTMLInputElement>(".pinput");
      if (input && !input.value.trim()) {
        input.focus();
        return;
      }
      flashBtn(act, "Sent");
      if (input) input.value = "";
    }
  });

  // ================= INITIALIZATION =================
  renderProposals();

  // The mobile nav drawer and FLUID SCALE belong to the persistent chrome and
  // now live in components/v3/blueprint-shell/shell-behavior.ts.

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

    // Reveal: load + scroll
    const vpH = window.innerHeight;
    const scrollHost = main;
    let velLastY = scrollHost ? scrollHost.scrollTop : 0;
    let velLastT = performance.now();
    let scrollVel = 0; // px/ms
    if (scrollHost)
      scrollHost.addEventListener(
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
      const rows = Array.from(list.querySelectorAll<HTMLElement>(".prow, .pjob, .psheet"));
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
    ["propTableBody", "propStack", "doneStack"].forEach((id) => {
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
    pressify(
      ".page-actions .btn, .card-foot-btn, .ptab, .pchip, .pager-btn, .pmenu-item, .photo-box, .pt-open, .pjob-foot .btn, .psheet-foot .btn, .td-remind .btn",
      "pressed",
    );

    // (Graph-paper parallax lives in the shell — it owns .main.)
  })();

  // The sliding sidebar indicator lives in the shell — it survives navigation
  // and re-points at whichever item React marks `active`.

  return () => {
    disposers.forEach((d) => d());
  };
}
