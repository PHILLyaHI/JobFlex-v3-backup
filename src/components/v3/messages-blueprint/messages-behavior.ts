// Messages blueprint — runtime behaviors, ported verbatim from the donor file's
// <script> (jobflex-messages-blueprint_1.html). Every duration, easing, stagger
// and formula is the donor's exact value. Adaptations are mechanical only:
// - queries are scoped to the mounted `.content` root;
// - document/window listeners, timers and observers are tracked for unmount
//   cleanup;
// - the donor's chrome modules (matchMedia polyfill, mobile nav drawer, FLUID
//   SCALE, the sidebar entry cascade, the sliding active indicator and the
//   graph-paper parallax) are NOT ported here — the shared shell
//   (components/v3/blueprint-shell/shell-behavior.ts) already owns all of them;
// - the donor's `safe(name, fn)` try/catch wrapper is dropped: the modules it
//   guarded are either shell-owned or replaced by strict null checks below.
//
// THREE SUBSYSTEMS ARE NOT IN THE DONOR (added 2026-08-12, owner's request):
// "MESSAGE ACTIONS MENU" (the donor's inert #pMenu, put to work), "EDIT A
// SENT MESSAGE" and "READ RECEIPTS — LIVE", plus the per-own-message
// Sending…/Delivered/Read status in renderThread and its keepScroll parameter.
// Their values (the 12s poll, the receipt formula) are this repo's own, not
// donor values — each block carries its own note.

import { staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import { closeMdl, openMdl } from "@/components/v3/blueprint-shell/mdl-motion";
import {
  clearConversation,
  createConversation,
  editMessage,
  getReadReceipts,
  markConversationRead,
  postMessage,
} from "@/actions/messages";
import type { Conv, MessagesSeed, Msg } from "./messages-data";

/** Server actions reject with an Error whose message is written for the user
 *  ("You can only reply in your own threads.", the plan-limit copy). Surface
 *  that text; fall back to a generic line for anything unrecognisable. */
function actionError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  // A Next.js server-action transport failure has no useful message.
  if (!msg || msg.toLowerCase().includes("fetch failed")) {
    return "Something went wrong. Check your connection and try again.";
  }
  return msg;
}

/** Every string below is now real database content — a teammate's name, a
 *  message body, a job title — and all of it is written into `innerHTML`. The
 *  fixture never needed escaping; user-authored text always does. */
function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const EMPTY_SEED: MessagesSeed = { conversations: [], team: [], meName: "You", activeId: null };

export function initMessagesContent(
  content: HTMLElement,
  seed: MessagesSeed = EMPTY_SEED,
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
  // Tracked timeouts, so an unmount mid-dialog-exit cannot fire into a detached
  // tree. `closeMdl` takes this helper for exactly that reason.
  const timers: number[] = [];
  const after = (ms: number, fn: () => void) => {
    timers.push(window.setTimeout(fn, ms));
  };
  disposers.push(() => timers.forEach((t) => window.clearTimeout(t)));

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

  // ================= MESSAGES: DATA =================
  // The org's real threads, read in src/app/dashboard/messages/page.tsx. This
  // array is the page's working copy: every write goes to the database through
  // a server action first (or optimistically, and is rolled back if the action
  // rejects), and the copy is patched to match so the rail repaints instantly.
  // A reload reads the same rows back.
  const convData: Conv[] = seed.conversations.map((c) => ({ ...c, msgs: c.msgs.map((m) => ({ ...m })) }));
  const team = seed.team;
  const meName = seed.meName;

  /** The rail's relative timestamp — "now", "12m", "1h", "2d", "3w". */
  function whenLabel(ts: number): string {
    const d = Date.now() - ts;
    if (d < 60000) return "now";
    const m = Math.floor(d / 60000);
    if (m < 60) return m + "m";
    const h = Math.floor(m / 60);
    if (h < 24) return h + "h";
    const days = Math.floor(h / 24);
    if (days < 7) return days + "d";
    return Math.floor(days / 7) + "w";
  }
  /** The thread's day divider — "Today", "Yesterday", then "Jul 20". */
  function dayLabel(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((midnight(today) - midnight(d)) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  /** The per-message stamp — "7:42 AM". */
  function timeLabel(ts: number): string {
    const d = new Date(ts);
    let h = d.getHours();
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return h + ":" + String(d.getMinutes()).padStart(2, "0") + " " + ap;
  }

  /** Record activity on a thread and float it to the top of the rail. Called
   *  wherever a message lands, whoever wrote it. */
  function touchConv(c: Conv) {
    c.ts = Date.now();
  }

  let tmpSeq = 0;

  const mx: {
    active: string;
    search: string;
    selected: string[];
    memberSearch: string;
    /** A write is on the wire — the composer and the dialog are inert. */
    busy: boolean;
    /** Message id being edited in the composer, or null. Only ever one of the
     *  viewer's own persisted messages — a `tmp-` optimistic row can't enter. */
    editing: string | null;
  } = {
    active: seed.activeId ?? "",
    search: "",
    selected: [],
    memberSearch: "",
    busy: false,
    editing: null,
  };

  function initials(n: string) {
    const p = n.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
    // The fixture's names were always two latin words. Real ones are not: an
    // email-only member ("dan@…") or a non-latin name can leave `p` empty, and
    // the donor's `p[0][0]` threw on it.
    if (p.length === 0) return (n.trim().slice(0, 2) || "?").toUpperCase();
    return p.length === 1
      ? p[0].slice(0, 2).toUpperCase()
      : (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }
  function conv(id: string) {
    return convData.find(function (c) {
      return c.id === id;
    });
  }
  function lastMsg(c: Conv): Msg | null {
    return c.msgs.length ? c.msgs[c.msgs.length - 1] : null;
  }
  /**
   * Conversations by REAL recency — newest activity first, whoever wrote it.
   *
   * `ts` is the sort key on purpose. Unread used to be the primary key, which
   * made the list reorder itself as a direct result of reading it: opening a
   * thread clears its unread count, the thread instantly lost its float-to-top
   * priority, and the row just clicked slid down past everything still unread.
   * A list whose order depends on a value that the act of LOOKING changes
   * cannot hold still.
   *
   * Recency gives the behaviour that was actually wanted without that feedback
   * loop: a thread that receives a new message rises because it is newer, and
   * reading it does not move it, because reading does not change when the
   * message arrived. Unread stays visible through `.unread` and the count badge.
   */
  function sorted() {
    const q = mx.search.trim().toLowerCase();
    return convData
      .filter(function (c) {
        if (!q) return true;
        const last = lastMsg(c);
        return (
          c.title.toLowerCase().indexOf(q) !== -1 ||
          (last !== null && last.body.toLowerCase().indexOf(q) !== -1)
        );
      })
      .slice()
      .sort(function (a, b) {
        const d = b.ts - a.ts;
        // Stable tie-break on the server's own order, so two threads with the
        // same last-activity time never shuffle between renders.
        return d !== 0 ? d : convData.indexOf(a) - convData.indexOf(b);
      });
  }

  // ================= RENDER =================
  function renderList() {
    const rows = sorted();
    const list = $("#convList");
    const empty = $("#convEmpty");
    if (!list || !empty) return;
    list.innerHTML = rows
      .map(function (c) {
        const last = lastMsg(c);
        return (
          '<li><button class="conv-row' +
          (mx.active === c.id ? " on" : "") +
          (c.unread ? " unread" : "") +
          '" type="button" data-conv="' +
          esc(c.id) +
          '">' +
          '<span class="conv-av">' +
          esc(initials(c.title)) +
          "</span>" +
          '<span class="conv-main">' +
          '<span class="conv-top"><span class="conv-t">' +
          esc(c.title) +
          "</span>" +
          '<span class="conv-time">' +
          esc(whenLabel(c.ts)) +
          "</span></span>" +
          '<span class="conv-prev">' +
          (last ? (last.me ? "You: " : "") + esc(last.body) : "No messages yet") +
          "</span>" +
          "</span>" +
          (c.unread ? '<span class="conv-badge">' + c.unread + "</span>" : "") +
          "</button></li>"
        );
      })
      .join("");
    empty.classList.toggle("is-hidden", rows.length !== 0);
  }

  /**
   * Re-sync the rail's EXISTING rows — selection, unread badge, last-message
   * preview, timestamp — without replacing a single node.
   *
   * Every path that changes what a conversation says rather than WHICH
   * conversations there are goes through here. A full `renderList()` swaps every
   * row's node, and the entrance cascade then replays across the whole rail, so
   * opening a thread or sending one message made the entire list blink.
   * `renderList()` is now reserved for real membership changes: first paint, a
   * search query, a brand-new conversation.
   */
  function paintConvRows() {
    root.querySelectorAll<HTMLElement>("#convList [data-conv]").forEach(function (btn) {
      const c = conv(btn.dataset.conv || "");
      if (!c) return;
      btn.classList.toggle("on", mx.active === c.id);
      btn.classList.toggle("unread", c.unread > 0);

      const last = lastMsg(c);
      const prev = btn.querySelector<HTMLElement>(".conv-prev");
      if (prev) prev.textContent = last ? (last.me ? "You: " : "") + last.body : "No messages yet";
      const when = btn.querySelector<HTMLElement>(".conv-time");
      if (when) when.textContent = whenLabel(c.ts);

      // The badge only exists while something is unread, so it has to be created
      // and destroyed rather than merely re-labelled.
      const badge = btn.querySelector<HTMLElement>(".conv-badge");
      if (c.unread > 0) {
        if (badge) badge.textContent = String(c.unread);
        else {
          const el = document.createElement("span");
          el.className = "conv-badge";
          el.textContent = String(c.unread);
          btn.appendChild(el);
        }
      } else if (badge) {
        badge.remove();
      }
    });
  }

  /** @param keepScroll hold the reader's place instead of snapping to the
   *  bottom — for repaints the reader didn't ask for (a receipt landing, edit
   *  mode toggling), where a jump would yank them away from what they're
   *  reading. Sends and thread switches keep the donor's snap. */
  function renderThread(keepScroll?: boolean) {
    const c = conv(mx.active);
    const head = $("#thHead");
    const body = $("#thBody");
    const composer = $("#thComposer");
    if (!head || !body || !composer) return;
    const heldScroll = keepScroll ? body.scrollTop : null;
    if (!c) {
      head.innerHTML = "";
      composer.style.display = "none";
      body.innerHTML = convData.length
        ? '<div class="th-empty"><b>Pick a conversation</b>' +
          "<span>Choose a thread on the left to read and reply.</span></div>"
        : '<div class="th-empty"><b>No conversations yet</b>' +
          "<span>Start one with anyone on the crew — “New chat”, top right.</span></div>";
      return;
    }
    composer.style.display = "";
    head.innerHTML =
      '<div class="th-who"><span class="conv-av">' +
      esc(initials(c.title)) +
      "</span>" +
      '<span style="min-width:0"><span class="th-t" style="display:block">' +
      esc(c.title) +
      "</span>" +
      '<span class="th-s" style="display:block">' +
      (c.kind === "GROUP" ? "Group" : "Direct") +
      (c.job ? " · job " + esc(c.job) : "") +
      " · " +
      c.msgs.length +
      " message" +
      (c.msgs.length === 1 ? "" : "s") +
      "</span></span></div>" +
      '<button class="th-clear" type="button" data-act="clear" aria-label="Clear this chat"><svg class="ic"><use href="#i-trash"/></svg></button>';

    let html = "";
    let day: string | null = null;
    c.msgs.forEach(function (m, i) {
      const mDay = dayLabel(m.ts);
      if (mDay !== day) {
        html += '<div class="day-div"><span>' + esc(mDay) + "</span></div>";
        day = mDay;
      }
      const prev = c.msgs[i - 1];
      const firstInRun = !prev || prev.who !== m.who || dayLabel(prev.ts) !== mDay;
      // A `tmp-` id is an optimistic send still on the wire: the row reads
      // "Sending…" until the server action resolves. From there the status is
      // REAL, per message: "Read" when every other participant's lastReadAt
      // (server-computed c.readAt — page load, then the receipts poll) covers
      // this message's timestamp, "Delivered" until then. The donor stamped
      // the last own message only; a receipt is per-message, so every own
      // message carries its own.
      const pendingSend = m.id.indexOf("tmp-") === 0;
      const status = pendingSend
        ? "Sending…"
        : c.readAt !== null && m.ts <= c.readAt
          ? "Read"
          : "Delivered";
      // The viewer's own persisted rows carry an actions affordance: a ⋯
      // button at the end of the meta line (revealed on message hover/focus,
      // always visible on touch) and data-mid on the row for the right-click
      // path — both open the #pMenu actions menu. An optimistic row has no
      // database id yet, and a `sent-` fallback row (send resolved without
      // returning its row id — normally unreachable) has no REAL id either,
      // so neither gets the menu.
      const actionable = m.me && !pendingSend && m.id.indexOf("sent-") !== 0;
      // The bubble is the donor's, UNTOUCHED: a direct `.msg > .bub` child,
      // no wrapper. The ⋯ trigger is `.msg-dots` — states and tones (reveal,
      // hover frame, colors) live in messages.module.css, but the GEOMETRY
      // (20px box, 10px icon, centering) rides inline: the owner's tab has
      // now rendered fresh markup against a stale stylesheet three times on
      // this page (2026-08-12; decisions.md Session 3), and with the inline
      // baseline a stale sheet degrades to a quiet, correctly-aligned,
      // always-visible button instead of a 17px default svg towering over
      // the meta line. `vertical-align:-1.5px` is dead weight under the
      // fresh sheet (the meta line is a flex row, which ignores it) and
      // exists purely for that degraded state. The reference point is the
      // inline-flex box's BASELINE — the svg's bottom edge, box center
      // + 5px — not the box's bottom: to put the box center on the meta
      // text's optical center (baseline − cap/2 ≈ baseline − 3.5px at
      // 9.5px mono), the box baseline goes 1.5px below the text baseline.
      // Pixel-measured in the degraded state (owner report of the dots
      // sitting low, 2026-08-12 late evening).
      const dots = actionable
        ? '<button class="msg-dots" type="button" data-mopen="' +
          esc(m.id) +
          '" aria-haspopup="menu" aria-label="Message actions" ' +
          'style="display:inline-flex;align-items:center;justify-content:center;' +
          'width:20px;height:20px;padding:0;margin-left:7px;vertical-align:-1.5px">' +
          '<svg class="ic" style="width:10px;height:10px"><use href="#i-dots"/></svg></button>'
        : "";
      html +=
        '<div class="msg' +
        (m.me ? " me" : "") +
        (mx.editing === m.id ? " is-editing" : "") +
        // menu-on keeps the row's ⋯ trigger revealed while its menu is open;
        // stamping it here keeps the receipts repaint honest (openMsgMenu /
        // closeMsgMenu patch the same class in place between renders).
        (menuMsgId === m.id ? " menu-on" : "") +
        '"' +
        (actionable ? ' data-mid="' + esc(m.id) + '"' : "") +
        ">" +
        (!m.me && c.kind === "GROUP" && firstInRun
          ? '<span class="msg-who">' + esc(m.who) + "</span>"
          : "") +
        '<span class="bub">' +
        esc(m.body) +
        "</span>" +
        '<span class="msg-meta">' +
        esc(timeLabel(m.ts)) +
        (m.me ? " · " + status : "") +
        dots +
        "</span>" +
        "</div>";
    });
    body.innerHTML =
      html || '<div class="th-empty"><b>No messages yet</b><span>Say something to start the thread.</span></div>';
    body.scrollTop = heldScroll !== null ? heldScroll : body.scrollHeight;
  }
  function renderMessages() {
    renderList();
    renderThread();
  }
  /** Installed by the motion module below; null under reduced motion. */
  let playStagger: (() => void) | null = null;

  // ================= NEW CONVERSATION DIALOG =================
  function renderMembers() {
    const q = mx.memberSearch.trim().toLowerCase();
    const rows = team.filter(function (m) {
      return !q || m.name.toLowerCase().indexOf(q) !== -1;
    });
    const list = $("#memberList");
    const title = $("#mdlTitle");
    const sub = $("#mdlSub");
    const grpWrap = $("#grpTitleWrap");
    const startBtn = root.querySelector<HTMLButtonElement>("#startBtn");
    if (!list || !title || !sub || !grpWrap || !startBtn) return;
    list.innerHTML = team.length === 0
      ? '<li class="members-empty">No teammates yet. Add someone to your team first, then you can message them.</li>'
      : rows.length === 0
        ? '<li class="members-empty">No match.</li>'
        : rows
            .map(function (m, i) {
              // The LAST row drops its hairline: the footer's 2px-ink top rule
              // sits right under it, and the two lines read as a doubled
              // divider (owner report 2026-08-13). Inline, like the rest of
              // this page's delivery-critical geometry.
              const picked = mx.selected.indexOf(m.id) !== -1;
              return (
                '<li class="' +
                (picked ? "on" : "") +
                '" data-mem="' +
                esc(m.id) +
                '" role="option" tabindex="0" aria-selected="' +
                (picked ? "true" : "false") +
                '"' +
                (i === rows.length - 1 ? ' style="border-bottom:0"' : "") +
                ">" +
                '<span class="mem-check"></span>' +
                '<span class="mem-av">' +
                esc(initials(m.name)) +
                "</span>" +
                '<span class="mem-main"><span class="mem-n" style="display:block">' +
                esc(m.name) +
                "</span>" +
                '<span class="mem-r" style="display:block">' +
                esc(m.role) +
                "</span></span></li>"
              );
            })
            .join("");
    const group = mx.selected.length > 1;
    title.textContent = group ? "New group" : "New conversation";
    sub.textContent = group ? "Group with " + mx.selected.length + " people." : "Pick someone on the crew.";
    grpWrap.classList.toggle("is-hidden", !group);
    startBtn.disabled = mx.selected.length === 0;
  }
  /** One toggle path for mouse and keyboard. Every toggle re-renders the
   *  member list, which destroys the focused row — so if a member row had
   *  focus, put it back on the same member afterwards to keep keyboard flow
   *  intact. */
  function toggleMember(id: string) {
    if (mx.busy) return;
    const hadFocus =
      document.activeElement instanceof HTMLElement && document.activeElement.closest("[data-mem]") !== null;
    const i = mx.selected.indexOf(id);
    if (i === -1) mx.selected.push(id);
    else mx.selected.splice(i, 1);
    renderMembers();
    if (hadFocus) root.querySelector<HTMLElement>('[data-mem="' + CSS.escape(id) + '"]')?.focus();
  }
  function openDialog() {
    mx.selected = [];
    mx.memberSearch = "";
    const memberSearch = root.querySelector<HTMLInputElement>("#memberSearch");
    const grpTitle = root.querySelector<HTMLInputElement>("#grpTitle");
    if (memberSearch) memberSearch.value = "";
    if (grpTitle) grpTitle.value = "";
    convError(null);
    renderMembers();
    const mdl = $("#convMdl");
    if (mdl) openMdl(mdl);
  }
  function closeDialog() {
    const mdl = $("#convMdl");
    if (mdl) closeMdl(mdl, after);
  }

  /** Show / clear the message a rejected server action wrote for the user. */
  function showErr(sel: string, msg: string | null) {
    const box = $(sel);
    if (!box) return;
    box.textContent = msg ?? "";
    box.classList.toggle("is-hidden", !msg);
  }
  const sendError = (msg: string | null) => showErr("#sendErr", msg);
  const convError = (msg: string | null) => showErr("#convErr", msg);

  /** Composer inert while a send / clear is on the wire. */
  function setThreadBusy(on: boolean) {
    mx.busy = on;
    $("#thComposer")?.classList.toggle("is-busy", on);
  }

  // ================= WRITES (real server actions) =================
  // These are the live actions from src/actions/messages.ts — the same ones the
  // classic inbox used. They are org-scoped and participant-gated on the server
  // and they revalidate /dashboard/messages. `convData` is patched so the rail
  // repaints immediately; a reload reads the same rows back from the database.

  async function sendMessage() {
    const box = root.querySelector<HTMLTextAreaElement>("#msgBox");
    if (!box || mx.busy) return;
    const text = box.value.trim();
    const c = conv(mx.active);
    if (!text || !c) return;

    sendError(null);
    // Optimistic: the bubble lands the instant Enter is pressed and reads
    // "Sending…" until the action resolves. If it rejects, the bubble is taken
    // back out and the text is returned to the composer — never a silent drop.
    tmpSeq += 1;
    const tmpId = "tmp-" + tmpSeq;
    const prevTs = c.ts;
    c.msgs.push({ id: tmpId, who: meName, me: true, ts: Date.now(), body: text });
    touchConv(c);
    box.value = "";
    box.style.height = "";
    // A sent message changes the rail's ORDER (this thread is now the newest),
    // so the rail is re-listed rather than patched — that IS the thread rising
    // to the top. Deliberately without the entrance cascade: one row moving
    // should not replay every row's arrival.
    renderList();
    renderThread();
    setThreadBusy(true);

    try {
      const res = await postMessage(c.id, text);
      const sent = c.msgs.find((m) => m.id === tmpId);
      // The action returns the database row's id + stamp; the optimistic row
      // becomes the real row, so it is editable and a reload changes nothing.
      if (sent && res) {
        sent.id = res.id;
        sent.ts = res.ts;
      } else if (sent) {
        sent.id = "sent-" + tmpId;
      }
      setThreadBusy(false);
      renderThread();
    } catch (err) {
      c.msgs = c.msgs.filter((m) => m.id !== tmpId);
      c.ts = prevTs;
      box.value = text;
      setThreadBusy(false);
      renderList();
      renderThread();
      sendError(actionError(err));
      box.focus();
    }
  }

  // ====== MESSAGE ACTIONS MENU (#pMenu) (not in the donor, 2026-08-12) ======
  // The donor ships `.pmenu` markup + styles with nothing to open it — the
  // same leftover the Clients port found, and the same resolution: it becomes
  // this page's per-message actions menu, opened by the ⋯ button beside the
  // viewer's own bubbles or by right-clicking one. Owner request 2026-08-13:
  // no head (the bubble right above IS the context), just Edit and Copy side
  // by side — the `.pmenu--row` modifier. Placement mirrors
  // clients-behavior.ts, including its zoom compensation; the row menu is
  // content-sized, so the clamp measures offsetWidth instead of assuming the
  // donor's 254px.

  const pMenu = $("#pMenu");
  let menuMsgId: string | null = null;

  function closeMsgMenu() {
    menuMsgId = null;
    // Patch, not re-render: only the row's revealed ⋯ state changes.
    root.querySelector(".msg.menu-on")?.classList.remove("menu-on");
    pMenu?.classList.remove("open");
    // openMsgMenu sets an inline `display: flex` (stale-sheet insurance);
    // it must go, or the base display:none can never hide the menu again.
    if (pMenu) pMenu.style.display = "";
  }

  // Item geometry is inline (stale-stylesheet insurance, same contract as
  // the ⋯ trigger): under a sheet that predates the row menu, the old
  // `.pmenu-item { width: 100% }` would stack the two actions vertically.
  // States (hover) and the icon-box/label tones are pre-row vocabulary
  // present in every sheet vintage, so they stay in CSS. The tonal boxes run
  // 22px with 12px icons, not the house menu's 26/14 — the owner asked the
  // row's INNER height down twice (2026-08-13); with 3px item padding the
  // content band runs 28px inside the unchanged frame.
  function menuItem(icon: string, tone: string, label: string, act: string) {
    return (
      '<button class="pmenu-item" type="button" role="menuitem" data-mact="' +
      act +
      '" style="display:flex;align-items:center;gap:9px;width:auto;padding:3px 13px 3px 10px">' +
      '<span class="pmi-ic' +
      (tone ? " " + tone : "") +
      '" style="width:22px;height:22px"><svg class="ic" style="width:12px;height:12px"><use href="#' +
      icon +
      '"/></svg></span>' +
      '<span class="pmenu-item-t">' +
      esc(label) +
      "</span>" +
      "</button>"
    );
  }

  /** @param anchor viewport-px rect edges (a button's rect, or a right-click
   *  point widened to a zero-height rect). */
  function openMsgMenu(id: string, anchor: { right: number; top: number; bottom: number }) {
    const c = conv(mx.active);
    const m = c?.msgs.find((x) => x.id === id);
    if (!c || !m || !m.me || !pMenu) return;
    menuMsgId = id;
    // The open menu keeps its row's ⋯ trigger revealed via `menu-on` — moved
    // between rows as a patch in place (renderThread re-stamps it on the
    // receipts repaint).
    root.querySelector(".msg.menu-on")?.classList.remove("menu-on");
    root.querySelector('[data-mid="' + id + '"]')?.classList.add("menu-on");
    pMenu.setAttribute("role", "menu");
    pMenu.innerHTML =
      menuItem("i-pen", "pmi--bp", "Edit", "edit") +
      // The vertical divider between the two actions — inline like the rest
      // of the row geometry; --hair-soft is the same tone the old vertical
      // menu's .pmenu-div used.
      '<span style="width:1.5px;align-self:stretch;background:var(--hair-soft);flex:0 0 auto;margin:2px 6px"></span>' +
      menuItem("i-dup", "", "Copy", "copy");
    pMenu.classList.add("open");
    // Stale-sheet insurance for the CONTAINER: the row layout and the
    // shadowless frame must hold even when the tab's stylesheet predates
    // them. closeMsgMenu clears the display so the base `display: none`
    // can hide the menu again.
    pMenu.style.display = "flex";
    pMenu.style.width = "auto";
    pMenu.style.boxShadow = "none";
    // 5px, not the donor's 6px — with the items' own vertical padding also
    // tightened to 5px the row runs ~46px tall (owner asked for a slightly
    // shorter popup, 2026-08-13; the 26px tonal icon boxes are the system
    // standard and stay).
    pMenu.style.padding = "5px";
    // FLUID SCALE zooms the shell root, so viewport maths has to be un-zoomed
    // before it can be compared with a zoomed getBoundingClientRect
    // (decisions.md: every FLIP and every popover placement).
    const host = root.closest<HTMLElement>(".jf-blueprint");
    const zRaw = host ? parseFloat(getComputedStyle(host).zoom) : 1;
    const z = isFinite(zRaw) && zRaw > 0 ? zRaw : 1;
    const vw = window.innerWidth / z;
    const vh = window.innerHeight / z;
    // Park at the origin before measuring: a fixed box with `width: auto`
    // shrink-wraps against the viewport edge it currently sits at, so
    // measuring at a stale left would under-report the row's width.
    pMenu.style.left = "0px";
    pMenu.style.top = "0px";
    const mw = pMenu.offsetWidth;
    let left = Math.min(anchor.right / z - mw, vw - mw - 12);
    left = Math.max(12, left);
    pMenu.style.left = left + "px";
    const mh = pMenu.offsetHeight;
    let top = anchor.bottom / z + 6;
    let flipped = false;
    if (top + mh > vh - 12) {
      top = Math.max(12, anchor.top / z - mh - 6);
      flipped = true;
    }
    // `.up` flips the enter slide so the menu always slides FROM its anchor;
    // toggled before this frame paints, so the animation restart is invisible.
    pMenu.classList.toggle("up", flipped);
    pMenu.style.top = top + "px";
  }

  // ============ EDIT A SENT MESSAGE (not in the donor, 2026-08-12) ============
  // The composer is reused as the editor: Edit loads the bubble's text into it,
  // the strip above names what's happening, Enter/send saves, Esc/Cancel walks
  // away. Same optimistic contract as sending — the bubble updates the instant
  // the save is submitted and rolls back with the error surfaced if the action
  // rejects.

  function paintEditBar() {
    // Direct style.display, not a class: the strip is inline-styled and must
    // show/hide correctly with no help from any stylesheet.
    const bar = $("#editBar");
    if (bar) bar.style.display = mx.editing ? "flex" : "none";
    $("#thComposer")?.classList.toggle("is-editing", !!mx.editing);
  }

  function enterEdit(id: string) {
    const c = conv(mx.active);
    const m = c?.msgs.find((x) => x.id === id);
    if (!c || !m || !m.me || mx.busy) return;
    mx.editing = id;
    sendError(null);
    const box = root.querySelector<HTMLTextAreaElement>("#msgBox");
    if (box) {
      box.value = m.body;
      box.style.height = "auto";
      box.style.height = Math.min(130, box.scrollHeight) + "px";
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
    }
    paintEditBar();
    renderThread(true);
  }

  function exitEdit() {
    if (!mx.editing) return;
    mx.editing = null;
    const box = root.querySelector<HTMLTextAreaElement>("#msgBox");
    if (box) {
      box.value = "";
      box.style.height = "";
    }
    paintEditBar();
    renderThread(true);
  }

  async function saveEdit() {
    const box = root.querySelector<HTMLTextAreaElement>("#msgBox");
    const c = conv(mx.active);
    const id = mx.editing;
    if (!box || !c || !id || mx.busy) return;
    const m = c.msgs.find((x) => x.id === id);
    if (!m) {
      exitEdit();
      return;
    }
    const text = box.value.trim();
    // Unchanged or emptied — treat both as walking away, never a write.
    if (!text || text === m.body) {
      exitEdit();
      return;
    }
    sendError(null);
    const prevBody = m.body;
    m.body = text;
    mx.editing = null;
    box.value = "";
    box.style.height = "";
    paintEditBar();
    renderThread(true);
    // The rail preview quotes the thread's LAST message — an edit to it must
    // repaint the row, or the pre-edit text lingers there.
    paintConvRows();
    setThreadBusy(true);
    try {
      await editMessage(id, text);
      setThreadBusy(false);
    } catch (err) {
      m.body = prevBody;
      setThreadBusy(false);
      renderThread(true);
      paintConvRows();
      // Give the rejected text back for another try — but ONLY if the user
      // hasn't switched threads while the save was on the wire: enterEdit
      // no-ops for a message outside the active thread, and restoring the
      // text anyway would carry it into another thread's composer (the
      // invariant the rail-click handler records). enterEdit wipes #sendErr,
      // so the error is surfaced AFTER it — and only in the thread it
      // belongs to; a switched-away user keeps the original message intact
      // and hears nothing stale over the new thread.
      enterEdit(id);
      if (mx.editing === id) {
        box.value = text;
        box.style.height = "auto";
        box.style.height = Math.min(130, box.scrollHeight) + "px";
        sendError(actionError(err));
      }
    }
  }

  async function clearThread() {
    const c = conv(mx.active);
    if (!c || mx.busy) return;
    if (mx.editing) exitEdit();
    sendError(null);
    const prevMsgs = c.msgs;
    const prevTs = c.ts;
    c.msgs = [];
    touchConv(c);
    renderList();
    renderThread();
    setThreadBusy(true);
    try {
      await clearConversation(c.id);
      setThreadBusy(false);
    } catch (err) {
      c.msgs = prevMsgs;
      c.ts = prevTs;
      setThreadBusy(false);
      renderList();
      renderThread();
      sendError(actionError(err));
    }
  }

  async function startConversation() {
    const chosen = team.filter(function (m) {
      return mx.selected.indexOf(m.id) !== -1;
    });
    if (!chosen.length || mx.busy) return;
    const group = chosen.length > 1;
    const custom = (root.querySelector<HTMLInputElement>("#grpTitle")?.value || "").trim();
    const title = group
      ? custom || chosen.map((m) => m.name.split(" ")[0]).join(", ")
      : chosen[0].name;

    convError(null);
    mx.busy = true;
    const startBtn = root.querySelector<HTMLButtonElement>("#startBtn");
    if (startBtn) startBtn.disabled = true;
    try {
      // The action returns the real conversation id, so the row appended below
      // is the database row — every later send posts against it.
      const created = await createConversation({
        participantIds: chosen.map((m) => m.id),
        kind: group ? "GROUP" : "DIRECT",
        title,
      });
      const c: Conv = {
        id: created.id,
        kind: group ? "GROUP" : "DIRECT",
        title,
        job: null,
        unread: 0,
        // A brand-new thread is the newest thing on the rail.
        ts: Date.now(),
        // Nobody has opened it yet, so nothing is read.
        readAt: null,
        msgs: [],
      };
      convData.unshift(c);
      mx.active = c.id;
      mx.busy = false;
      closeDialog();
      renderMessages();
      // A new thread really does re-list the rail, so the cascade belongs here.
      playStagger?.();
      root.querySelector<HTMLTextAreaElement>("#msgBox")?.focus();
    } catch (err) {
      mx.busy = false;
      if (startBtn) startBtn.disabled = mx.selected.length === 0;
      // Plan limits ("You've hit your conversation limit…") land here too.
      convError(actionError(err));
    }
  }

  // ================= EVENTS =================
  on(document, "click", function (e) {
    const target = e.target as HTMLElement;
    // Message-actions menu first: any click that is neither inside the menu
    // nor on a ⋯ trigger closes it, and the two menu branches run on their
    // own clicks before the rest of the page reacts.
    const mopen = target.closest<HTMLElement>("[data-mopen]");
    const mact = target.closest<HTMLElement>("[data-mact]");
    if (!mopen && !mact && !target.closest(".pmenu")) closeMsgMenu();
    if (mopen) {
      const r = mopen.getBoundingClientRect();
      openMsgMenu(mopen.dataset.mopen || "", { right: r.right, top: r.top, bottom: r.bottom });
      return;
    }
    if (mact && menuMsgId) {
      const id = menuMsgId;
      const act = mact.dataset.mact;
      closeMsgMenu();
      if (act === "edit") enterEdit(id);
      if (act === "copy") {
        const m = conv(mx.active)?.msgs.find((x) => x.id === id);
        if (m && navigator.clipboard && navigator.clipboard.writeText) {
          void navigator.clipboard.writeText(m.body).catch(() => {});
        }
      }
      return;
    }
    const row = target.closest<HTMLElement>("[data-conv]");
    if (row) {
      // Leaving the thread abandons an edit in progress — the composer must
      // never carry one thread's text into another.
      if (mx.editing) exitEdit();
      mx.active = row.dataset.conv || "";
      sendError(null);
      const c = conv(mx.active);
      if (c && c.unread > 0) {
        c.unread = 0;
        // Stamps lastReadAt for this viewer — the same call that clears the
        // sidebar / tab-bar unread badge. Fire-and-forget: the badge is
        // cosmetic and a failed stamp must not block opening the thread.
        void markConversationRead(c.id).catch(() => {});
      }
      // Patch the rail in place rather than rebuilding it. Selecting a thread
      // does not change WHICH conversations exist or their order, and a full
      // `renderList()` replaced every row's node — which made the whole rail
      // fade out and re-cascade on each click, on top of the row itself moving.
      paintConvRows();
      renderThread();
      return;
    }
    if (target.closest("#sendBtn")) {
      void (mx.editing ? saveEdit() : sendMessage());
      return;
    }
    if (target.closest("#editCancel")) {
      exitEdit();
      return;
    }
    if (target.closest("#newConvBtn")) {
      openDialog();
      return;
    }
    if (target.closest('[data-mdl="close"]')) {
      // A dismiss must never interrupt a create that is already on the wire.
      if (!mx.busy) closeDialog();
      return;
    }
    const mem = target.closest<HTMLElement>("[data-mem]");
    if (mem) {
      toggleMember(mem.dataset.mem || "");
      return;
    }
    if (target.closest("#startBtn")) {
      void startConversation();
      return;
    }
    const act = target.closest<HTMLElement>("[data-act]");
    if (act && act.dataset.act === "clear") {
      void clearThread();
    }
  });
  on(document, "input", function (e) {
    const target = e.target as HTMLElement;
    if (target.id === "convSearch") {
      mx.search = (target as HTMLInputElement).value;
      renderList();
      return;
    }
    if (target.id === "memberSearch") {
      mx.memberSearch = (target as HTMLInputElement).value;
      renderMembers();
      return;
    }
    if (target.id === "msgBox") {
      const box = target as HTMLTextAreaElement;
      box.style.height = "auto";
      box.style.height = Math.min(130, box.scrollHeight) + "px";
    }
  });
  on(document, "keydown", function (e) {
    const ev = e as KeyboardEvent;
    const target = ev.target as HTMLElement;
    if (target.id === "msgBox" && ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      void (mx.editing ? saveEdit() : sendMessage());
    }
    // Enter/Space on a member row toggles it exactly like a click — the rows
    // are focusable options, not buttons, so the key path is wired by hand.
    if (ev.key === "Enter" || ev.key === " ") {
      const mem = target.closest<HTMLElement>("[data-mem]");
      if (mem) {
        ev.preventDefault(); // Space must toggle, not scroll the dialog.
        toggleMember(mem.dataset.mem || "");
        return;
      }
    }
    // Escape walks the states from the closest out: actions menu, then an
    // edit in progress, then the new-conversation dialog — the scrim and
    // Cancel were the only ways out of the last, and neither is where a
    // keyboard reaches first.
    if (ev.key === "Escape") {
      if (menuMsgId) {
        closeMsgMenu();
        return;
      }
      if (mx.editing && !mx.busy) {
        exitEdit();
        return;
      }
      if ($("#convMdl")?.classList.contains("open") && !mx.busy) {
        closeDialog();
      }
    }
  });
  // Right-clicking one of the viewer's own bubbles opens the same actions
  // menu at the pointer — the path every messenger trains. Other rows keep
  // the native context menu.
  on(document, "contextmenu", function (e) {
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLElement>(".msg[data-mid]");
    if (!row) return;
    e.preventDefault();
    const ev = e as MouseEvent;
    openMsgMenu(row.dataset.mid || "", { right: ev.clientX + 2, top: ev.clientY, bottom: ev.clientY });
  });
  // The menu is position: fixed — any scroll of its anchor detaches it, so
  // both scroll hosts (the page and the transcript) close it. #thBody is a
  // persistent element (renders replace only its innerHTML), so one binding
  // at init holds for the life of the mount.
  if (main) on(main, "scroll", closeMsgMenu, { passive: true });
  const thBodyEl = $("#thBody");
  if (thBodyEl) on(thBodyEl, "scroll", closeMsgMenu, { passive: true });

  // ================= INITIALIZATION =================
  renderMessages();

  // The auto-opened thread counts as opened. The rail-click path stamps
  // lastReadAt, but the newest thread is already active on arrival (page.tsx
  // auto-selects it) — exactly the thread holding the unread message — so
  // without this the most common read (land, read, leave) would never
  // register and the sender would poll "Delivered" forever. Same
  // fire-and-forget contract as the click path; the classic inbox stamps on
  // mount the same way (MessagesInbox.tsx).
  (function () {
    const c = conv(mx.active);
    if (c && c.unread > 0) {
      c.unread = 0;
      void markConversationRead(c.id).catch(() => {});
      paintConvRows();
    }
  })();

  // ================= READ RECEIPTS — LIVE (not in the donor, 2026-08-12) =================
  // The page load computed each thread's readAt once; this keeps it honest
  // while the page is open. Every 12s (and immediately on refocus, the moment
  // "did they read it yet?" is actually asked) the server re-reports every
  // thread's real lastReadAt-derived receipt, and a change repaints the open
  // thread in place — Delivered flips to Read without touching the reader's
  // scroll. Hidden tabs skip the tick; failures are dropped silently and the
  // next tick tries again — a missed poll must never surface an error over a
  // working inbox.
  (function () {
    let inFlight = false;
    async function tick() {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const receipts = await getReadReceipts();
        let activeChanged = false;
        receipts.forEach(function (r) {
          const c = conv(r.id);
          if (!c || c.readAt === r.readAt) return;
          c.readAt = r.readAt;
          if (c.id === mx.active) activeChanged = true;
        });
        if (activeChanged) renderThread(true);
      } catch {
        /* next tick retries */
      } finally {
        inFlight = false;
      }
    }
    const iv = window.setInterval(() => void tick(), 12000);
    disposers.push(() => window.clearInterval(iv));
    on(window, "focus", () => void tick());
  })();

  // The matchMedia polyfill, mobile nav drawer and FLUID SCALE belong to the
  // persistent chrome and live in
  // components/v3/blueprint-shell/shell-behavior.ts.

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // The row cascade's curve now lives in blueprint-shell/list-motion.

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
    // Second layer of the arrival — the donor cascades its `.kpi` strip here.
    // This page ships no `.kpi`, so the layer is silently absent, exactly as in
    // the donor file; the selector is kept literal rather than substituted.
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

    // Entrance cascade — on first paint, and afterwards only when the rail's
    // MEMBERSHIP changes (a search query, a new conversation). It used to hang
    // off a MutationObserver, so it also fired on every thread selection and
    // every sent message; see `paintConvRows`.
    playStagger = () => {
      const list = $("#convList");
      if (list) staggerIn(Array.from(list.querySelectorAll<HTMLElement>(".conv-row")));
    };
    playStagger();

    // Numeral count-up — the donor's `.kpi-val`. This page ships no KPI strip,
    // so the loop finds nothing; kept literal for the same reason as `.kpi`.
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
    pressify(".btn, .card-foot-btn, .ptab, .pchip, .pager-btn, .pmenu-item, .photo-box, .pt-open, .send-btn, .th-clear, .msg-dots", "pressed");
    pressify(".week-strip .day", "day-pressed");

    // (Graph-paper parallax lives in the shell — it owns .main.)
  })();

  // The sliding sidebar indicator lives in the shell — it survives navigation
  // and re-points at whichever item React marks `active`.

  return () => {
    disposers.forEach((d) => d());
  };
}
