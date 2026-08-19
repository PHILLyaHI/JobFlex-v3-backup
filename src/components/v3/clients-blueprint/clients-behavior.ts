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

import { createClient, updateClient } from "@/actions/clients";
import { closeMdl, openMdl, MDL_EXIT_MS } from "@/components/v3/blueprint-shell/mdl-motion";
import { staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import { PAGE_SIZE, type Client } from "./clients-data";

export type ClientsContentOptions = {
  /** The org's real client book, read server-side. REQUIRED. It used to be
   *  optional, falling back to the donor fixture for "the standalone mock
   *  route" — a route that no longer exists (src/app/dashboard/clients/page.tsx
   *  is the only mount, and it always reads the book). An optional seed on a
   *  live surface is a fixture waiting for the first caller who forgets the
   *  prop, so the type now refuses to be mounted without a book. An EMPTY
   *  array is a perfectly good book: it draws #clientsEmpty. */
  entries: Client[];
  /** Next's client-side router push, handed down from clients-content.tsx.
   *
   *  This page opened the client record with `window.location.assign()`, which
   *  is a HARD document load, and the destination is a blueprint page whose
   *  entrance cascade is armed from a LAYOUT EFFECT (see
   *  blueprint-shell/use-blueprint-content.ts). That timing only beats the
   *  paint on a CLIENT-SIDE navigation — React commits and the effect runs in
   *  the same frame. On a hard load the server HTML paints in full long before
   *  hydration, so the record appeared finished, then dropped to opacity 0 and
   *  replayed its entrance: the "it shows one version, then the real one"
   *  double take. A hard load also tears the shell down and rebuilds the
   *  sidebar, which is the flicker the shared shell exists to prevent.
   *
   *  Optional: the standalone mock route mounts this module with no router, and
   *  falls back to the assign() below. */
  navigate?: (href: string) => void;
};

/** Server actions reject with an Error whose message is written for the user
 *  ("Name is required", "Client not found"). Surface that text; fall back to a
 *  generic line for anything unrecognisable. */
function actionError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  // A Next.js server-action transport failure has no useful message.
  if (!msg || msg.toLowerCase().includes("fetch failed")) {
    return "Something went wrong. Check your connection and try again.";
  }
  return msg;
}

/** Text interpolated into an innerHTML string. The donor could inline its own
 *  fixture names raw; these are database rows a contractor typed, so every
 *  user-supplied value goes through here. */
function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function initClientsContent(
  content: HTMLElement,
  options: ClientsContentOptions,
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

  // A per-mount COPY of the org's book. The copy matters: the dialog writes
  // into this array as clients are created and edited, and mutating the prop
  // the server component handed down would leave React holding a value that no
  // longer matches what it rendered.
  const clientsData: Client[] = options.entries.map((c) => ({
    ...c,
    tags: [...c.tags],
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

  // ================= CLIENTS: STATE + HELPERS =================
  const cstate = {
    filter: "ALL",
    page: 1,
    /** id of the client whose row menu is open, or null. */
    menuId: null as string | null,
    /** id being edited in the dialog; null means the dialog is in create mode. */
    editing: null as string | null,
    /** a write is in flight — the dialog's submit is inert until it lands. */
    saving: false,
  };

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
        esc(label) +
        '">' +
        esc(label) +
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
  /** Where a client row opens. ONE definition, because the list has two doors
   *  into the record — the row's arrow and the row menu's "Open" — and two
   *  string literals is how they drift apart.
   *
   *  The destination is now the blueprint record at /dashboard/client-detail,
   *  not the classic (dashboard)/dashboard/clients/[id] page. That route has no
   *  [id] segment yet and renders a fixture regardless of what it is handed, so
   *  the id travels as a query param: the link stays addressable and whoever
   *  wires the record to the database inherits the id already in the URL,
   *  rather than having to re-plumb both call sites. */
  function recordHref(id: string) {
    return "/dashboard/client-detail?client=" + encodeURIComponent(id);
  }

  /** ONE door out of this page, for the same reason recordHref is one string:
   *  three call sites (arrow, row menu, whole-row click) that must all navigate
   *  the same WAY, not just to the same place. See `navigate` on
   *  ClientsContentOptions for why the way matters. */
  function openRecord(id: string) {
    const href = recordHref(id);
    if (options.navigate) options.navigate(href);
    else window.location.assign(href);
  }

  /** One row's markup. Kept separate from renderTable so a single edited client
   *  can be patched in place: rebuilding the whole tbody would destroy the row
   *  the user just acted on, steal focus and replay every entrance inside it. */
  function rowHtml(c: Client) {
    const tags = c.tags.length
      ? '<div class="ctags">' +
        c.tags
          .map(function (t) {
            return '<span class="ctag">' + esc(t.label) + "</span>";
          })
          .join("") +
        "</div>"
      : '<span class="cdash">—</span>';
    return (
      '<tr class="prow" data-id="' +
      esc(c.id) +
      '">' +
      // The three text cells are single-line and ellipsised (see the
      // `#clientsCard` overflow block in clients.module.css): a 200-character
      // name with no spaces in it used to widen the column past the card and
      // take the page's horizontal scrollbar with it. `title` is what keeps
      // the clipped tail reachable — the full value is one hover away, and
      // the whole record is one click away.
      '<td><div class="cname"><span class="cav">' +
      esc(initials(c.name)) +
      "</span>" +
      '<span class="cname-stack"><span class="cname-line"><span class="pt-title" title="' +
      esc(c.name) +
      '">' +
      esc(c.name) +
      "</span>" +
      (c.vip ? '<span class="ctag ctag--vip">VIP</span>' : "") +
      "</span>" +
      '<span class="cmail" title="' +
      esc(c.email || "") +
      '">' +
      esc(c.email || "—") +
      "</span></span></div></td>" +
      '<td><span class="pt-sub" title="' +
      esc(c.address || "") +
      '">' +
      esc(c.address || "—") +
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
      esc(c.updated) +
      "</span></td>" +
      // The arrow is a REAL link to the client's record — see recordHref. The
      // dots open the row menu.
      '<td class="num"><span class="pt-acts">' +
      '<button class="pt-open" type="button" data-menu="' +
      esc(c.id) +
      '" aria-haspopup="menu" aria-label="Actions for ' +
      esc(c.name) +
      '"><svg class="ic"><use href="#i-dots"/></svg></button>' +
      '<a class="pt-open" href="' +
      esc(recordHref(c.id)) +
      '" aria-label="Open ' +
      esc(c.name) +
      '"><svg class="ic"><use href="#i-arrow"/></svg></a>' +
      "</span></td>" +
      "</tr>"
    );
  }

  /** Repaint ONE row after an edit. Everything else on the page keeps its
   *  identity, its focus and its finished animations. */
  function patchRow(id: string) {
    const c = clientsData.find((x) => x.id === id);
    const row = root.querySelector<HTMLElement>('#clientTableBody .prow[data-id="' + CSS.escape(id) + '"]');
    if (!c || !row) return;
    const tpl = document.createElement("tbody");
    tpl.innerHTML = rowHtml(c);
    const next = tpl.firstElementChild;
    if (next) row.replaceWith(next);
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
    body.innerHTML = slice.map(rowHtml).join("");
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
  // Assigned by the motion IIFE at the bottom. The list stagger is played only
  // when the list genuinely ARRIVES (first paint, a page turn, a created
  // client) — never on a filter toggle or a single-row edit. See
  // blueprint-shell/list-motion: a MutationObserver here replays the whole
  // cascade on every repaint and reads as "the list wiped itself".
  let playStagger: (() => void) | null = null;

  const chipsEl = $("#cChips");
  if (chipsEl) {
    on(chipsEl, "click", function (e) {
      const chip = (e.target as HTMLElement).closest<HTMLElement>(".pchip");
      if (!chip) return;
      cstate.filter = chip.dataset.f || "ALL";
      cstate.page = 1;
      closeMenu();
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
      closeMenu();
      renderTable();
      // A page turn is a new list arriving, so it earns the entrance.
      playStagger?.();
    });
  }

  // ================= ROW MENU (#pMenu) =================
  // The donor left `.pmenu` in the markup with nothing to open it. The three
  // items are the only client actions that already exist end to end: the record
  // page the classic list linked to, the edit form (updateClient), and the
  // contractor's own mail client. Nothing here is a placeholder.
  const pMenu = $("#pMenu");

  function menuItem(
    icon: string,
    tone: string,
    title: string,
    sub: string,
    act: string,
    dis?: boolean,
  ) {
    return (
      '<button class="pmenu-item' +
      (dis ? " is-disabled" : "") +
      '" type="button" role="menuitem" data-mact="' +
      act +
      '">' +
      '<span class="pmi-ic' +
      (tone ? " " + tone : "") +
      '"><svg class="ic"><use href="#' +
      icon +
      '"/></svg></span>' +
      '<span><span class="pmenu-item-t">' +
      esc(title) +
      '</span><span class="pmenu-item-s" style="display:block">' +
      esc(sub) +
      "</span></span>" +
      "</button>"
    );
  }

  function openMenu(id: string, btn: HTMLElement) {
    const c = clientsData.find((x) => x.id === id);
    if (!c || !pMenu) return;
    cstate.menuId = id;
    pMenu.setAttribute("role", "menu");
    pMenu.innerHTML =
      '<div class="pmenu-head"><div class="pmenu-title">' +
      esc(c.name) +
      '</div><div class="pmenu-sub">' +
      esc(c.address || c.email || "No location on file") +
      "</div></div>" +
      menuItem("i-file", "pmi--bp", "Open client", c.proposalCount + " proposals", "open") +
      menuItem("i-pen", "", "Edit client", "Name, contact, location", "edit") +
      menuItem(
        "i-send",
        "pmi--ok",
        "Email client",
        c.email || "No email on file",
        "mail",
        !c.email,
      );
    pMenu.classList.add("open");
    // FLUID SCALE zooms the shell root, so viewport maths has to be un-zoomed
    // before it can be compared with a zoomed getBoundingClientRect.
    const host = root.closest<HTMLElement>(".jf-blueprint");
    const zRaw = host ? parseFloat(getComputedStyle(host).zoom) : 1;
    const z = isFinite(zRaw) && zRaw > 0 ? zRaw : 1;
    const vw = window.innerWidth / z;
    const vh = window.innerHeight / z;
    // getBoundingClientRect reports ZOOMED pixels; `left`/`top` are written in
    // the menu's own unzoomed space, so the anchor has to be divided by the
    // live zoom too (decisions.md: every FLIP and every popover placement).
    const r = btn.getBoundingClientRect();
    const rRight = r.right / z;
    const rTop = r.top / z;
    const rBottom = r.bottom / z;
    const mw = 254;
    let left = Math.min(rRight - mw, vw - mw - 12);
    left = Math.max(12, left);
    pMenu.style.left = left + "px";
    pMenu.style.top = "0px";
    const mh = pMenu.offsetHeight;
    let top = rBottom + 6;
    if (top + mh > vh - 12) top = Math.max(12, rTop - mh - 6);
    pMenu.style.top = top + "px";
  }

  function closeMenu() {
    cstate.menuId = null;
    pMenu?.classList.remove("open");
  }
  if (main) on(main, "scroll", closeMenu, { passive: true });

  // ================= CREATE / EDIT DIALOG =================
  // The donor shipped a placeholder button (a 1.6s "Form opens here" flash).
  // This dialog is the real one: it posts to createClient / updateClient in
  // src/actions/clients.ts — the same org-scoped, role-gated actions the
  // classic ClientFormSheet used — and patches the local row from the record
  // the action returns, so a reload reads the same values back.
  const newClientBtn = $("#newClientBtn");
  const cDlg = $("#cNew");
  const cForm = root.querySelector<HTMLFormElement>("#cNewForm");
  if (cDlg && cForm) {
    const inp = (sel: string) => root.querySelector<HTMLInputElement>(sel);
    const txt = (sel: string) => root.querySelector<HTMLTextAreaElement>(sel);
    const vipBtn = $("#cfVip");
    let draftVip = false;
    let restoreFocus: HTMLElement | null = null;

    /* ---- BUSY PLATE ---------------------------------------------------
       Armed on a 300ms fuse, never shown outright. Two callers arm it: the
       open path (cleared on the frame the first field takes focus) and the
       write (cleared when the action settles). Anything that finishes inside
       300ms — which is every open on a warm page, and most saves — clears the
       fuse before it burns, so the dialog does not flash a spinner at a
       reader who never had to wait. What it replaces is the frozen box: a
       dialog that is open, empty and not yet typeable with nothing on it
       saying so. */
    let busyFuse = 0;
    function showBusy(on: boolean, label?: string) {
      const box = $("#cNewBusy");
      if (!box) return;
      if (label) {
        const lbl = box.querySelector<HTMLElement>("[data-busy-lbl]");
        if (lbl) lbl.textContent = label;
      }
      box.classList.toggle("is-hidden", !on);
    }
    function armBusy(label: string) {
      window.clearTimeout(busyFuse);
      busyFuse = window.setTimeout(() => showBusy(true, label), 300);
    }
    function clearBusy() {
      window.clearTimeout(busyFuse);
      showBusy(false);
    }

    function markErr(on: boolean) {
      cDlg!.querySelector<HTMLElement>('[data-fld="name"]')?.classList.toggle("is-err", on);
    }

    /** The action's own message, or nothing. */
    function dlgError(msg: string | null) {
      const box = $("#cNewErr");
      if (!box) return;
      box.textContent = msg || "";
      box.classList.toggle("is-hidden", !msg);
    }

    /** Submit label + disabled state while a write is in flight. */
    function setSaving(on: boolean) {
      cstate.saving = on;
      const btn = root.querySelector<HTMLButtonElement>("#cNewSave");
      if (!btn) return;
      btn.disabled = on;
      btn.classList.toggle("is-busy", on);
      const lbl = btn.querySelector<HTMLElement>("[data-save-lbl]");
      if (!lbl) return;
      lbl.textContent = on
        ? cstate.editing
          ? "Saving…"
          : "Creating…"
        : cstate.editing
          ? "Save changes"
          : "Create client";
    }

    function paintVip() {
      vipBtn?.setAttribute("aria-pressed", draftVip ? "true" : "false");
    }

    /** Point the dialog at a record (edit) or at nothing (create). */
    function fillDlg(entry: Client | null) {
      cstate.editing = entry ? entry.id : null;
      const kick = $("#cNewKick");
      const title = $("#cNewTitle");
      if (kick) kick.textContent = entry ? "CRM / edit record" : "CRM / new record";
      if (title) title.textContent = entry ? "Edit client" : "New client";
      const name = inp("#cfName");
      if (name) name.value = entry ? entry.name : "";
      const email = inp("#cfEmail");
      if (email) email.value = entry?.email || "";
      const phone = inp("#cfPhone");
      if (phone) phone.value = entry?.phone || "";
      const addr = inp("#cfAddress");
      if (addr) addr.value = entry ? entry.address : "";
      // Filled from the record, so a save sends back what is on file rather
      // than an empty box — `notes` is the one column a blank field would
      // erase if the form pretended it had nothing to say about it.
      const notes = txt("#cfNotes");
      if (notes) notes.value = entry?.notes || "";
      // VIP is an org tag written by createClient only; updateClient has no
      // path to it, so the flag is hidden rather than shown doing nothing.
      draftVip = false;
      paintVip();
      $("#cfVipFld")?.classList.toggle("is-hidden", !!entry);
      markErr(false);
      dlgError(null);
      setSaving(false);
    }

    function openDlg(entry: Client | null) {
      restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      // Armed BEFORE the fill, so the plate covers everything between the
      // click and a typeable field. On a warm page that whole span is one
      // frame and the fuse is cleared long before it burns.
      armBusy("Opening");
      fillDlg(entry);
      openMdl(cDlg!);
      // land on the first field, not on the dialog frame
      requestAnimationFrame(() => {
        inp("#cfName")?.focus();
        clearBusy();
      });
    }

    function closeDlg() {
      // The dialog animates out over MDL_EXIT_MS (see mdl-motion). Focus goes
      // back to the opener immediately — waiting for the exit would leave the
      // keyboard stranded inside a dialog that is already on its way out.
      if (!closeMdl(cDlg!, after)) return;
      markErr(false);
      clearBusy();
      restoreFocus?.focus();
    }

    function resetDlg() {
      cForm!.reset();
      fillDlg(null);
    }

    if (newClientBtn) on(newClientBtn, "click", () => openDlg(null));

    on(cDlg, "click", function (e) {
      const t = e.target as HTMLElement;
      if (t.closest('[data-mdl="close"]')) {
        if (cstate.saving) return;
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
      if (!cDlg.classList.contains("open")) {
        if (ev.key === "Escape") closeMenu();
        return;
      }
      if (ev.key === "Escape") {
        ev.preventDefault();
        if (!cstate.saving) closeDlg();
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
      dlgError(null);
    });

    /**
     * The blueprint form has one Location box; the database has address / city
     * / state / zip, and `updateClient` writes all four. Left untouched, the box
     * sends the record's own columns straight back, so street line and zip
     * survive an edit made through this form. Retyped, it is read as "City, ST".
     */
    function locationParts(entry: Client | null, value: string) {
      const v = value.trim();
      if (entry && v === (entry.address || "")) {
        return {
          address: entry.line1 || "",
          city: entry.city || "",
          state: entry.state || "",
          zip: entry.zip || "",
        };
      }
      const parts = v.split(",").map((s) => s.trim()).filter(Boolean);
      return {
        address: entry?.line1 || "",
        city: parts[0] || "",
        state: parts.length > 1 ? parts.slice(1).join(", ") : "",
        zip: entry?.zip || "",
      };
    }

    /** The Location column reads the same way the classic list built it. */
    function locationLabel(rec: { address: string | null; city: string | null; state: string | null }) {
      return [rec.city, rec.state].filter(Boolean).join(", ") || rec.address || "";
    }

    async function submitClient() {
      const nameEl = inp("#cfName");
      const name = (nameEl?.value || "").trim();
      if (!name) {
        markErr(true);
        nameEl?.focus();
        return;
      }
      const editingId = cstate.editing;
      const entry = editingId ? clientsData.find((x) => x.id === editingId) || null : null;
      const notes = (txt("#cfNotes")?.value || "").trim();
      const payload = {
        name,
        email: (inp("#cfEmail")?.value || "").trim(),
        phone: (inp("#cfPhone")?.value || "").trim(),
        notes,
        ...locationParts(entry, inp("#cfAddress")?.value || ""),
      };

      dlgError(null);
      setSaving(true);
      armBusy(editingId ? "Saving" : "Creating");
      try {
        if (editingId) {
          const saved = await updateClient(editingId, payload);
          if (entry) {
            entry.name = saved.name;
            entry.email = saved.email;
            entry.phone = saved.phone;
            entry.line1 = saved.address;
            entry.city = saved.city;
            entry.state = saved.state;
            entry.zip = saved.zip;
            entry.address = locationLabel(saved);
            // `notes` is not in the action's returned shape, so the row keeps
            // what was just sent — the same value the next server read will
            // hand back.
            entry.notes = notes || null;
            entry.updated = new Date().toLocaleDateString("en-US", {
              month: "short",
              day: "2-digit",
            });
          }
          setSaving(false);
          clearBusy();
          closeDlg();
          after(MDL_EXIT_MS, resetDlg);
          // One record changed, so one row is repainted. Rebuilding the table
          // would replay every entrance and throw the reader's place away.
          patchRow(editingId);
        } else {
          const created = await createClient({ ...payload, vip: draftVip });
          const wasVip = draftVip;
          clientsData.unshift({
            id: created.id,
            name: created.name,
            email: created.email,
            address: locationLabel(created),
            proposalCount: 0,
            pipelineValue: 0,
            vip: wasVip,
            tags: [],
            updated: new Date().toLocaleDateString("en-US", {
              month: "short",
              day: "2-digit",
            }),
            phone: created.phone,
            line1: created.address,
            city: created.city,
            state: created.state,
            zip: created.zip,
            notes: notes || null,
          });
          // Drop back to All, so a client created while a tag filter was active
          // is actually visible — they land in the first row.
          cstate.filter = "ALL";
          cstate.page = 1;
          setSaving(false);
          clearBusy();
          closeDlg();
          // Clear the form only once the box has finished animating out — reset
          // it on the same frame and you watch the fields blank while the
          // dialog is still visible.
          after(MDL_EXIT_MS, resetDlg);
          renderClients();
          playStagger?.();
        }
      } catch (err) {
        setSaving(false);
        clearBusy();
        dlgError(actionError(err));
      }
    }

    on(cForm, "submit", function (e) {
      e.preventDefault();
      if (cstate.saving) return;
      void submitClient();
    });

    // Row menu triggers and menu items. Bound on document so a repainted row
    // never loses its handler.
    on(document, "click", function (e) {
      const target = e.target as HTMLElement;
      if (!root.contains(target)) {
        closeMenu();
        return;
      }
      const trigger = target.closest<HTMLElement>("[data-menu]");
      if (trigger) {
        const id = trigger.dataset.menu || "";
        if (cstate.menuId === id) closeMenu();
        else openMenu(id, trigger);
        return;
      }
      const mact = target.closest<HTMLElement>("[data-mact]");
      if (mact) {
        const id = cstate.menuId;
        const act = mact.dataset.mact;
        const c = id ? clientsData.find((x) => x.id === id) : null;
        closeMenu();
        if (!c) return;
        if (act === "open") {
          openRecord(c.id);
        } else if (act === "edit") {
          openDlg(c);
        } else if (act === "mail" && c.email) {
          window.location.href = "mailto:" + encodeURIComponent(c.email);
        }
        return;
      }
      // A plain left-click on the arrow is claimed here so it goes through
      // openRecord like the other two doors. The element stays a real <a> with
      // a real href — that is what keeps middle-click, ⌘/ctrl-click and "copy
      // link address" working, and those paths are deliberately NOT intercepted
      // below: a new tab IS a hard load, correctly.
      const ev = e as MouseEvent;
      const plainClick =
        ev.button === 0 && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey && !ev.altKey;
      const arrow = target.closest<HTMLElement>("#clientTableBody a.pt-open");
      if (arrow && plainClick) {
        const id = arrow.closest<HTMLElement>(".prow")?.dataset.id;
        if (id) {
          e.preventDefault();
          closeMenu();
          openRecord(id);
          return;
        }
      }
      // The WHOLE ROW is a door into the record, not just the 15px arrow at the
      // far right. The row already lifts to --paper-deep on hover, so it has
      // been advertising itself as a target since the port; a row that looks
      // clickable and is not is worse than one that looks inert.
      //
      // Excluded: anything that already owns its click (the dots trigger, the
      // arrow anchor), and modified / non-primary clicks — ctrl, meta, shift and
      // middle-click belong to the browser, and swallowing them here would
      // break "open in a new tab" on the arrow sitting inside the same row.
      const row = target.closest<HTMLElement>("#clientTableBody .prow");
      if (row && !target.closest("a, button") && plainClick) {
        const id = row.dataset.id;
        if (id) {
          closeMenu();
          openRecord(id);
          return;
        }
      }
      if (!target.closest(".pmenu")) closeMenu();
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

    // Row stagger — played when the list ARRIVES, and only then.
    //
    // The donor wired this to `new MutationObserver(..., {childList:true})`,
    // which fires on ANY change to the tbody: every filter toggle, every page
    // turn, every single-row repaint dropped all twelve rows to opacity 0 and
    // crawled them back. The caller now decides (see `playStagger` above);
    // `staggerIn` from blueprint-shell/list-motion owns the timing so this page
    // cannot drift from the other lists.
    playStagger = () => {
      const list = $("#clientTableBody");
      if (!list) return;
      staggerIn(Array.from(list.querySelectorAll<HTMLElement>(".prow")));
    };
    playStagger();

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

    // Press effects — delegated to `root` so nodes injected after init
    // (menu items, JS-rendered buttons, innerHTML re-renders) still press.
    function pressify(sel: string, cls: string) {
      on(root, "click", (e) => {
        const el = (e.target as Element).closest<HTMLElement>(sel);
        if (!el || !root.contains(el)) return;
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
      });
      on(root, "animationend", (e) => {
        const el = e.target as HTMLElement;
        if (el.matches && el.matches(sel)) el.classList.remove(cls);
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
