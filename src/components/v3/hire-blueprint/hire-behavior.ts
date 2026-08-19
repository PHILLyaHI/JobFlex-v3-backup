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
  appendApplicantNote,
  convertApplicantToWorker,
  createApplicant,
  deleteApplicant,
  updateApplicantStatus,
} from "@/actions/applicants";
import { leaveRow, staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import {
  HK_COLUMNS,
  SOURCES,
  APPLICANTS_SEED,
  HUB_DOORS,
  HUB_TALLY,
  HUB_LINKS,
  type Applicant,
  type HireColumnKey,
} from "./hire-data";

export type HireContentOptions = {
  /** The org's real applicant pipeline, read server-side. Omit to fall back to
   *  the donor fixture (the standalone mock routes have no session to read
   *  from). */
  applicants?: Applicant[];
};

/** Server actions reject with an Error whose message is written for the user
 *  ("Manager access required", "Not found"). Surface that text; fall back to a
 *  generic line for anything unrecognisable. */
function actionError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  // A Next.js server-action transport failure has no useful message.
  if (!msg || msg.toLowerCase().includes("fetch failed")) {
    return "Something went wrong. Check your connection and try again.";
  }
  return msg;
}

/** Every card and every sheet field is built as an HTML STRING, and the values
 *  are now real user input from the database rather than the donor's fixed
 *  fixture. Text and attribute values are escaped on the way in. */
function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function initHireContent(
  content: HTMLElement,
  options: HireContentOptions = {},
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
  /** `leaveRow`'s tracked-timeout contract is (ms, fn) — the mirror of `later`. */
  const after = (ms: number, fn: () => void) => {
    later(fn, ms);
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
  // The org's real pipeline, read in src/app/dashboard/hire/page.tsx. Cloned
  // per mount; every mutation below goes through a server action first and
  // patches this array from the result, so a reload reads the same rows back.
  let applicantsData: Applicant[] = (options.applicants ?? APPLICANTS_SEED).map((a) => ({ ...a }));

  const hire = {
    tab: "hub",
    dragId: null as string | null,
    picked: null as string | null,
    sheet: null as string | null,
    editing: null as string | null,
    status: "APPLIED" as HireColumnKey,
    /** A write is on the wire — block a second one and block the dismiss. */
    saving: false,
    /** Two-tap arming for the destructive actions in the sheet. */
    armed: null as string | null,
  };

  function monogram(name: string) {
    const p = name.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
    return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }

  // ================= RENDER =================
  // `#hkBoard` itself is static markup that React owns; only its inside is
  // built here, and only when the board GENUINELY ARRIVES (first paint, or the
  // first card added to an empty pipeline). Every later change patches the one
  // node that changed — see the patch helpers below. Rebuilding the board on a
  // stage move would destroy the card the user is dragging, drop its focus and
  // replay every entrance animation on it.
  const board = $("#hkBoard");

  function cardHTML(a: Applicant) {
    return '<button class="hk-card' + (hire.picked === a.id ? ' picked' : '') + '" type="button" draggable="true" data-id="' + esc(a.id) + '">' +
      '<span class="hk-top">' +
        '<span class="hk-av">' + esc(monogram(a.name)) + '</span>' +
        '<span style="min-width:0;flex:1">' +
          '<span class="hk-name" style="display:block">' + esc(a.name) + '</span>' +
          '<span class="hk-role" style="display:block">' + esc(a.role) + '</span>' +
        '</span>' +
        '<svg class="ic hk-grip"><use href="#i-dots"/></svg>' +
      '</span>' +
      '<span class="hk-foot">' +
        '<span class="hk-meta">' +
          (a.email ? '<svg class="ic"><use href="#i-msg"/></svg>' : '') +
          (a.phone ? '<svg class="ic"><use href="#i-phone"/></svg>' : '') +
          (a.source ? esc(a.source) : '') +
        '</span>' +
        '<span class="hk-age">' + esc(a.age) + '</span>' +
      '</span>' +
    '</button>';
  }

  function syncEmpty() {
    const empty = $("#hkEmpty");
    if (empty) empty.classList.toggle("is-hidden", applicantsData.length !== 0);
    if (board) board.classList.toggle("is-hidden", applicantsData.length === 0);
  }

  function renderBoard() {
    if (!board) return;
    syncEmpty();
    board.innerHTML = HK_COLUMNS.map(function (col) {
      const list = applicantsData.filter(function (a) { return a.status === col.key; });
      return '<div class="hk-col" data-col="' + col.key + '">' +
        '<div class="hk-head"><span class="hk-lbl"><span class="hk-dot" style="background:' + col.tone + '"></span>' + col.label + '</span>' +
        '<span class="hk-n">' + list.length + '</span></div>' +
        '<div class="hk-body">' +
          (list.length ? list.map(cardHTML).join('') : '<div class="hk-drop">Drop here</div>') +
        '</div></div>';
    }).join('');
  }

  // ---- patch helpers: one node at a time ----
  function colBody(key: HireColumnKey) {
    return board?.querySelector<HTMLElement>('.hk-col[data-col="' + key + '"] .hk-body') ?? null;
  }
  function cardNode(id: string) {
    return board?.querySelector<HTMLElement>('.hk-card[data-id="' + id + '"]') ?? null;
  }
  /** Re-derive one column's counter and its "Drop here" placeholder. */
  function syncCol(key: HireColumnKey) {
    const body = colBody(key);
    if (!body) return;
    const n = body.parentElement?.querySelector<HTMLElement>(".hk-n");
    const cards = body.querySelectorAll(".hk-card").length;
    if (n) n.textContent = String(cards);
    const drop = body.querySelector<HTMLElement>(".hk-drop");
    if (cards === 0 && !drop) {
      const d = document.createElement("div");
      d.className = "hk-drop";
      d.textContent = "Drop here";
      body.appendChild(d);
    } else if (cards > 0 && drop) {
      drop.remove();
    }
  }
  /** Move the card the user is holding into another column — the same node,
   *  relocated, so its focus and its identity survive the move. */
  function placeCard(id: string, from: HireColumnKey, to: HireColumnKey) {
    const card = cardNode(id);
    const target = colBody(to);
    if (!card || !target) return;
    target.appendChild(card);
    syncCol(from);
    syncCol(to);
  }

  function boardError(msg: string | null) {
    const box = $("#hkErr");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-hidden", !msg);
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
    // A dismiss must never interrupt a write that is already on the wire.
    if (hire.saving) return;
    $("#sheet")?.classList.remove("open");
    $("#sheetBg")?.classList.remove("open");
    hire.sheet = null;
    hire.editing = null;
    hire.armed = null;
  }
  function sheetError(msg: string | null) {
    const box = $("#sheetErr");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-hidden", !msg);
  }
  /** Button label + disabled state while an action is in flight. */
  function setSaving(btn: HTMLElement | null, on: boolean, busyLabel: string, idleLabel: string) {
    hire.saving = on;
    if (!btn) return;
    (btn as HTMLButtonElement).disabled = on;
    btn.classList.toggle("is-busy", on);
    const lbl = btn.querySelector<HTMLElement>("[data-save-lbl]");
    if (lbl) lbl.textContent = on ? busyLabel : idleLabel;
  }

  /** `appendApplicantNote` writes "YYYY-MM-DD HH:MM — text" blocks separated by
   *  a blank line — the same format the classic detail page parses back out. */
  function noteEntries(raw: string) {
    if (!raw.trim()) return [] as Array<{ stamp: string; text: string }>;
    return raw.split(/\n\n+/).map(function (block) {
      const m = block.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}) — ([\s\S]+)/);
      return m ? { stamp: m[1], text: m[2] } : { stamp: "", text: block };
    });
  }

  function openApplicant(id: string) {
    const a = applicantsData.find(function (x) { return x.id === id; });
    if (!a) return;
    hire.sheet = 'detail'; hire.editing = id; hire.status = a.status; hire.armed = null;
    const history = noteEntries(a.notes);
    openSheet(a.name,
      '<div class="sf-meta">' +
        '<div class="sf-meta-row"><span class="kpi-lbl">Role</span><span>' + esc(a.role) + '</span></div>' +
        '<div class="sf-meta-row"><span class="kpi-lbl">Email</span><span>' + esc(a.email || '—') + '</span></div>' +
        '<div class="sf-meta-row"><span class="kpi-lbl">Phone</span><span>' + esc(a.phone || '—') + '</span></div>' +
        '<div class="sf-meta-row"><span class="kpi-lbl">Source</span><span>' + esc(a.source || 'Other') + '</span></div>' +
        '<div class="sf-meta-row"><span class="kpi-lbl">Applied</span><span>' + esc(a.age) + '</span></div>' +
      '</div>' +
      '<div class="sf"><span class="sf-lbl">Pipeline status</span><div class="pipe" id="pipeBox">' +
        HK_COLUMNS.map(function (c) {
          return '<button class="pipe-btn' + (a.status === c.key ? ' on' : '') + '" type="button" data-st="' + c.key + '">' + c.label + '</button>';
        }).join('') +
      '</div></div>' +
      // The note column is APPEND-ONLY on the server (`appendApplicantNote`
      // stamps and appends), so the sheet shows the history read-only and takes
      // a new entry — the classic detail page's contract, not a free-text
      // overwrite that the data layer cannot honour.
      (history.length
        ? '<div class="sf"><span class="sf-lbl">Notes</span><ul class="sf-notes" id="sheetNotes">' +
            history.map(function (n) {
              return '<li class="sf-note">' +
                (n.stamp ? '<span class="sf-note-stamp">' + esc(n.stamp) + '</span>' : '') +
                '<span class="sf-note-txt">' + esc(n.text) + '</span></li>';
            }).join('') +
          '</ul></div>'
        : '') +
      '<label class="sf"><span class="sf-lbl">Add a note</span><textarea class="sf-area" data-a="notes" placeholder="Interview observations, follow-ups, decisions."></textarea></label>' +
      '<div class="mf-err is-hidden" id="sheetErr" role="alert"></div>' +
      '<div class="sf-act">' +
        '<button class="btn btn-primary btn--sm" type="button" data-act="save-applicant"><svg class="ic"><use href="#i-check"/></svg><span data-save-lbl>Save</span></button>' +
        '<button class="btn btn-ghost btn--sm" type="button" data-act="convert"><svg class="ic"><use href="#i-hardhat"/></svg><span data-save-lbl>Convert to worker</span></button>' +
      '</div>' +
      '<div class="sf-act" style="border:none;padding-top:0;margin-top:9px">' +
        '<button class="btn btn-ghost btn--sm" type="button" data-act="delete-applicant"><svg class="ic"><use href="#i-trash"/></svg><span data-save-lbl>Delete applicant</span></button>' +
      '</div>');
  }
  function openAddForm() {
    hire.sheet = 'add'; hire.editing = null; hire.status = 'APPLIED'; hire.armed = null;
    openSheet('Add applicant',
      '<label class="sf"><span class="sf-lbl">Full name</span><input class="sf-in" data-a="name" placeholder="Casey Stone"></label>' +
      '<label class="sf"><span class="sf-lbl">Role</span><input class="sf-in" data-a="role" placeholder="Roofer, Estimator, Foreman…"></label>' +
      '<div class="sf sf-row">' +
        '<label><span class="sf-lbl">Email</span><input class="sf-in" type="email" data-a="email" placeholder="casey@example.com"></label>' +
        '<label><span class="sf-lbl">Phone</span><input class="sf-in" data-a="phone" placeholder="(425) 555-0199"></label>' +
      '</div>' +
      // The shared blueprint select (blueprint-global.css): the `.bp-sel`
      // wrapper draws the chevron a <select> cannot carry, `.bp-sel-in` owns
      // the appearance reset. `.sf-sel` is retired rather
      // than kept alongside it — at `.bp .content .sf-sel` (3 classes) it
      // out-specified `.jf-blueprint .bp-sel-in` (2) and would have pulled the
      // native font and box back. `data-a="source"` stays on the <select> —
      // the create-applicant handler's val() helper reads `[data-a="source"]`
      // and takes `.value` off whatever it finds, so the control must keep the
      // attribute and the wrapper must not take it.
      '<label class="sf"><span class="sf-lbl">Source</span>' +
        '<span class="bp-sel"><select class="bp-sel-in" data-a="source">' +
        SOURCES.map(function (s2) { return '<option>' + s2 + '</option>'; }).join('') +
        '</select></span>' +
      '</label>' +
      '<label class="sf"><span class="sf-lbl">Notes</span><textarea class="sf-area" data-a="notes" placeholder="Years of experience, specialties, schedule constraints…"></textarea></label>' +
      '<div class="mf-err is-hidden" id="sheetErr" role="alert"></div>' +
      '<div class="sf-act">' +
        '<button class="btn btn-primary btn--sm" type="button" data-act="create-applicant"><svg class="ic"><use href="#i-check"/></svg><span data-save-lbl>Add applicant</span></button>' +
        '<button class="btn btn-ghost btn--sm" type="button" data-sheet="close">Cancel</button>' +
      '</div>');
  }

  // ================= WRITES (real server actions) =================
  // These are the live applicant actions from src/actions/applicants.ts — the
  // same ones the classic pipeline used. They are org-scoped and manager-gated
  // on the server and they revalidate /dashboard/hire. `applicantsData` is
  // patched from the result so the board repaints immediately; a reload reads
  // the same rows back from the database.

  /** A stage move: optimistic on the node the user is holding, rolled back — to
   *  the exact column it came from — if the server refuses. */
  async function moveCard(id: string, status: HireColumnKey) {
    const a = applicantsData.find(function (x) { return x.id === id; });
    if (!a || a.status === status) return;
    const prev = a.status;
    a.status = status;
    placeCard(id, prev, status);
    boardError(null);
    try {
      await updateApplicantStatus(id, status);
    } catch (err) {
      a.status = prev;
      placeCard(id, status, prev);
      boardError(actionError(err));
    }
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
      void moveCard(hire.dragId, col.dataset.col as HireColumnKey);
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
        const prev = hire.picked ? cardNode(hire.picked) : null;
        hire.picked = same ? null : id;
        // Selection is a class on two nodes, not a board rebuild.
        if (prev) prev.classList.remove("picked");
        card.classList.toggle("picked", !same);
        if (same) openApplicant(id);
        return;
      }
      const head = (ev.target as HTMLElement | null)?.closest<HTMLElement>(".hk-head");
      if (head && hire.picked) {
        const col = head.closest<HTMLElement>(".hk-col");
        if (!col) return;
        const picked = hire.picked;
        cardNode(picked)?.classList.remove("picked");
        hire.picked = null;
        void moveCard(picked, col.dataset.col as HireColumnKey);
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
      // Retargeting the status mid-save would commit a stage the user can no
      // longer see selected by the time the in-flight write returns.
      if (hire.saving) return;
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

    if (hire.saving) return;

    if (kind === "add") { openAddForm(); return; }
    if (kind === "save-applicant") { void saveApplicant(act, val("notes")); return; }
    if (kind === "convert") { void convertApplicant(act); return; }
    if (kind === "delete-applicant") { void removeApplicant(act); return; }
    if (kind === "create-applicant") { void submitApplicant(act, val); return; }
  });

  /** Save = the two things the data layer actually supports: a status move
   *  (`updateApplicantStatus`) and a new stamped note (`appendApplicantNote`).
   *  Both are skipped when nothing changed, so Save on an untouched sheet is
   *  free rather than writing a duplicate row. */
  async function saveApplicant(btn: HTMLElement, note: string) {
    const id = hire.editing;
    const a = applicantsData.find(function (x) { return x.id === id; });
    if (!id || !a) return;
    const nextStatus = hire.status;
    const statusChanged = a.status !== nextStatus;
    const text = note.trim();
    if (!statusChanged && !text) { closeSheet(); return; }

    sheetError(null);
    setSaving(btn, true, "Saving…", "");
    try {
      if (statusChanged) await updateApplicantStatus(id, nextStatus);
      if (text) await appendApplicantNote(id, text);
      const prev = a.status;
      if (statusChanged) {
        a.status = nextStatus;
        placeCard(id, prev, nextStatus);
      }
      if (text) {
        const stamped = new Date().toISOString().slice(0, 16).replace("T", " ") + " — " + text;
        a.notes = a.notes ? a.notes + "\n\n" + stamped : stamped;
      }
      setSaving(btn, false, "", "Save");
      closeSheet();
    } catch (err) {
      setSaving(btn, false, "", "Save");
      sheetError(actionError(err));
    }
  }

  /** Conversion creates a worker invite and emails it — a two-tap arm keeps a
   *  stray click from sending one. */
  async function convertApplicant(btn: HTMLElement) {
    const id = hire.editing;
    const a = applicantsData.find(function (x) { return x.id === id; });
    if (!id || !a) return;
    const label = btn.querySelector<HTMLElement>("[data-save-lbl]");
    if (hire.armed !== "convert") {
      hire.armed = "convert";
      if (label) label.textContent = "Convert — tap to confirm";
      later(function () {
        if (hire.armed !== "convert") return;
        hire.armed = null;
        if (label) label.textContent = "Convert to worker";
      }, 3000);
      return;
    }
    hire.armed = null;
    sheetError(null);
    setSaving(btn, true, "Converting…", "");
    try {
      await convertApplicantToWorker(id);
      const prev = a.status;
      a.status = "HIRED";
      placeCard(id, prev, "HIRED");
      setSaving(btn, false, "", "Converted");
      closeSheet();
    } catch (err) {
      setSaving(btn, false, "", "Convert to worker");
      sheetError(actionError(err));
    }
  }

  /** Delete: two-tap arm, then the row leaves on its own and the rest of the
   *  column closes the gap — the board is never rebuilt around it. */
  async function removeApplicant(btn: HTMLElement) {
    const id = hire.editing;
    if (!id) return;
    const label = btn.querySelector<HTMLElement>("[data-save-lbl]");
    if (hire.armed !== "delete") {
      hire.armed = "delete";
      if (label) label.textContent = "Delete — tap to confirm";
      later(function () {
        if (hire.armed !== "delete") return;
        hire.armed = null;
        if (label) label.textContent = "Delete applicant";
      }, 3000);
      return;
    }
    hire.armed = null;
    sheetError(null);
    setSaving(btn, true, "Deleting…", "");
    try {
      await deleteApplicant(id);
      const gone = applicantsData.find(function (x) { return x.id === id; });
      const col = gone ? gone.status : null;
      applicantsData = applicantsData.filter(function (x) { return x.id !== id; });
      if (hire.picked === id) hire.picked = null;
      setSaving(btn, false, "", "Delete applicant");
      closeSheet();
      const row = cardNode(id);
      if (row) {
        leaveRow(row, function () { if (col) syncCol(col); syncEmpty(); }, after);
      } else {
        if (col) syncCol(col);
        syncEmpty();
      }
    } catch (err) {
      setSaving(btn, false, "", "Delete applicant");
      sheetError(actionError(err));
    }
  }

  /** Create: `createApplicant` returns the real database id, so the card that
   *  lands on the board is the database row — not a placeholder that a reload
   *  would erase. */
  async function submitApplicant(btn: HTMLElement, val: (f: string) => string) {
    const name = val("name");
    if (!name) {
      sheetError("Enter the applicant’s full name.");
      root.querySelector<HTMLInputElement>('[data-a="name"]')?.focus();
      return;
    }
    const role = val("role");
    if (!role) {
      sheetError("Enter the role they applied for.");
      root.querySelector<HTMLInputElement>('[data-a="role"]')?.focus();
      return;
    }
    const email = val("email");
    // createApplicant requires a real address — it is the applicant's only
    // identity on the record and the field the classic form also enforced.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      sheetError("A valid email is required.");
      root.querySelector<HTMLInputElement>('[data-a="email"]')?.focus();
      return;
    }
    const phone = val("phone");
    const source = val("source") || "Other";
    const notes = val("notes");

    sheetError(null);
    setSaving(btn, true, "Adding…", "");
    try {
      const created = await createApplicant({
        fullName: name,
        email,
        phone: phone || null,
        role,
        source,
        notes: notes || null,
      });
      const wasEmpty = applicantsData.length === 0;
      const entry: Applicant = {
        id: created.id,
        name,
        role,
        email,
        phone: phone || null,
        source,
        status: "APPLIED",
        age: "just now",
        notes,
      };
      applicantsData.unshift(entry);
      setSaving(btn, false, "", "Add applicant");
      closeSheet();
      if (wasEmpty) {
        // The board is genuinely arriving — build it and play the entrance.
        renderBoard();
        staggerIn(Array.from(board?.querySelectorAll<HTMLElement>(".hk-card") ?? []));
      } else {
        const body = colBody("APPLIED");
        if (body) {
          body.insertAdjacentHTML("afterbegin", cardHTML(entry));
          syncCol("APPLIED");
          const row = cardNode(entry.id);
          if (row) staggerIn([row]);
        }
      }
    } catch (err) {
      setSaving(btn, false, "", "Add applicant");
      sheetError(actionError(err));
    }
  }

  // ================= INITIALIZATION =================
  safe("init", function () { renderHire(); });

  // The mobile nav drawer and FLUID SCALE belong to the persistent chrome and
  // live in components/v3/blueprint-shell/shell-behavior.ts.

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // (The donor's local EASE constant went with its hand-rolled row stagger —
    // that now lives in blueprint-shell/list-motion, which owns the curve.)

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

    // Row stagger — ON ARRIVAL ONLY.
    //
    // The donor wired this to a MutationObserver on the list container, so every
    // later change replayed the whole cascade: deleting one applicant made the
    // survivors blink, and a stage move wiped and re-faded the entire board
    // while the user was still holding the card. The lists here now ARRIVE once
    // (this call) and are patched node-by-node afterwards; `staggerIn` from
    // blueprint-shell/list-motion is the shared implementation.
    ["hkBoard", "hubList"].forEach((id) => {
      const list = $("#" + id);
      if (!list) return;
      staggerIn(Array.from(list.querySelectorAll<HTMLElement>(".hk-card, .door")));
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
