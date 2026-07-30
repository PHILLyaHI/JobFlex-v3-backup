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

import { staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import {
  CONV_SEED,
  CONV_SEQ_START,
  MSG_SEQ_START,
  TEAM,
  type Conv,
  type Msg,
} from "./messages-data";

export function initMessagesContent(content: HTMLElement): () => void {
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
  // A per-mount COPY of the fixture. Sending, clearing and creating threads all
  // mutate this array (and the nested `msgs`), and the seed is a module-level
  // constant — mutating it directly would leak every sent message into the next
  // visit to the page (and into any other importer of CONV_SEED).
  const convData: Conv[] = CONV_SEED.map((c) => ({ ...c, msgs: c.msgs.map((m) => ({ ...m })) }));
  let convSeq = CONV_SEQ_START;
  let msgSeq = MSG_SEQ_START;

  const mx: { active: string; search: string; selected: string[]; memberSearch: string } = {
    active: "k1",
    search: "",
    selected: [],
    memberSearch: "",
  };

  function initials(n: string) {
    const p = n.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
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
   * Conversations in recency order — `convData`'s own order, newest first.
   *
   * Unread used to be the primary sort key, which made the list reorder itself
   * as a DIRECT RESULT of reading it: opening a thread clears its unread count
   * (see the `[data-conv]` handler), the thread instantly lost its float-to-top
   * priority, and the row you had just clicked slid down past every thread you
   * had not read yet. A list whose order depends on a value that the act of
   * looking changes cannot hold still.
   *
   * Unread threads are already unmistakable without moving them — the row
   * carries `.unread` and a count badge — and every messaging app people
   * already use orders by recency, not by read state.
   */
  function sorted() {
    const q = mx.search.trim().toLowerCase();
    return convData.filter(function (c) {
      if (!q) return true;
      const last = lastMsg(c);
      return (
        c.title.toLowerCase().indexOf(q) !== -1 ||
        (last !== null && last.body.toLowerCase().indexOf(q) !== -1)
      );
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
          c.id +
          '">' +
          '<span class="conv-av">' +
          initials(c.title) +
          "</span>" +
          '<span class="conv-main">' +
          '<span class="conv-top"><span class="conv-t">' +
          c.title +
          "</span>" +
          '<span class="conv-time">' +
          c.when +
          "</span></span>" +
          '<span class="conv-prev">' +
          (last ? (last.me ? "You: " : "") + last.body : "No messages yet") +
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
      if (when) when.textContent = c.when;

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

  function renderThread() {
    const c = conv(mx.active);
    const head = $("#thHead");
    const body = $("#thBody");
    const composer = $("#thComposer");
    if (!head || !body || !composer) return;
    if (!c) {
      head.innerHTML = "";
      composer.style.display = "none";
      body.innerHTML =
        '<div class="th-empty"><b>Pick a conversation</b>' +
        "<span>Choose a thread on the left to read and reply.</span></div>";
      return;
    }
    composer.style.display = "";
    head.innerHTML =
      '<div class="th-who"><span class="conv-av">' +
      initials(c.title) +
      "</span>" +
      '<span style="min-width:0"><span class="th-t" style="display:block">' +
      c.title +
      "</span>" +
      '<span class="th-s" style="display:block">' +
      (c.kind === "GROUP" ? "Group" : "Direct") +
      (c.job ? " · job " + c.job : "") +
      " · " +
      c.msgs.length +
      " message" +
      (c.msgs.length === 1 ? "" : "s") +
      "</span></span></div>" +
      '<button class="th-clear" type="button" data-act="clear" aria-label="Clear this chat"><svg class="ic"><use href="#i-trash"/></svg></button>';

    let html = "";
    let day: string | null = null;
    c.msgs.forEach(function (m, i) {
      if (m.day !== day) {
        html += '<div class="day-div"><span>' + m.day + "</span></div>";
        day = m.day;
      }
      const prev = c.msgs[i - 1];
      const firstInRun = !prev || prev.who !== m.who || prev.day !== m.day;
      const isLast = i === c.msgs.length - 1;
      html +=
        '<div class="msg' +
        (m.me ? " me" : "") +
        '">' +
        (!m.me && c.kind === "GROUP" && firstInRun ? '<span class="msg-who">' + m.who + "</span>" : "") +
        '<span class="bub">' +
        m.body +
        "</span>" +
        '<span class="msg-meta">' +
        m.at +
        (m.me && isLast ? " · Delivered" : "") +
        "</span>" +
        "</div>";
    });
    body.innerHTML =
      html || '<div class="th-empty"><b>No messages yet</b><span>Say something to start the thread.</span></div>';
    body.scrollTop = body.scrollHeight;
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
    const rows = TEAM.filter(function (m) {
      return !q || m.name.toLowerCase().indexOf(q) !== -1;
    });
    const list = $("#memberList");
    const title = $("#mdlTitle");
    const sub = $("#mdlSub");
    const grpWrap = $("#grpTitleWrap");
    const startBtn = root.querySelector<HTMLButtonElement>("#startBtn");
    if (!list || !title || !sub || !grpWrap || !startBtn) return;
    list.innerHTML = rows
      .map(function (m) {
        return (
          '<li class="' +
          (mx.selected.indexOf(m.id) !== -1 ? "on" : "") +
          '" data-mem="' +
          m.id +
          '">' +
          '<span class="mem-check"></span>' +
          '<span class="mem-av">' +
          initials(m.name) +
          "</span>" +
          '<span class="mem-main"><span class="mem-n" style="display:block">' +
          m.name +
          "</span>" +
          '<span class="mem-r" style="display:block">' +
          m.role +
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
  function openDialog() {
    mx.selected = [];
    mx.memberSearch = "";
    const memberSearch = root.querySelector<HTMLInputElement>("#memberSearch");
    const grpTitle = root.querySelector<HTMLInputElement>("#grpTitle");
    if (memberSearch) memberSearch.value = "";
    if (grpTitle) grpTitle.value = "";
    renderMembers();
    $("#convMdl")?.classList.add("open");
  }
  function closeDialog() {
    $("#convMdl")?.classList.remove("open");
  }

  function sendMessage() {
    const box = root.querySelector<HTMLTextAreaElement>("#msgBox");
    if (!box) return;
    const text = box.value.trim();
    const c = conv(mx.active);
    if (!text || !c) return;
    msgSeq += 1;
    const now = new Date();
    let h = now.getHours();
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    c.msgs.push({
      id: "m" + msgSeq,
      who: "Ivan",
      me: true,
      day: "Today",
      at: h + ":" + String(now.getMinutes()).padStart(2, "0") + " " + ap,
      body: text,
    });
    c.when = "now";
    box.value = "";
    box.style.height = "";
    // The rail's preview and timestamp change; its membership does not.
    paintConvRows();
    renderThread();
  }

  // ================= EVENTS =================
  on(document, "click", function (e) {
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLElement>("[data-conv]");
    if (row) {
      mx.active = row.dataset.conv || "";
      const c = conv(mx.active);
      if (c) c.unread = 0;
      // Patch the rail in place rather than rebuilding it. Selecting a thread
      // does not change WHICH conversations exist or their order, and a full
      // `renderList()` replaced every row's node — which made the whole rail
      // fade out and re-cascade on each click, on top of the row itself moving.
      paintConvRows();
      renderThread();
      return;
    }
    if (target.closest("#sendBtn")) {
      sendMessage();
      return;
    }
    if (target.closest("#newConvBtn")) {
      openDialog();
      return;
    }
    if (target.closest('[data-mdl="close"]')) {
      closeDialog();
      return;
    }
    const mem = target.closest<HTMLElement>("[data-mem]");
    if (mem) {
      const id = mem.dataset.mem || "";
      const i = mx.selected.indexOf(id);
      if (i === -1) mx.selected.push(id);
      else mx.selected.splice(i, 1);
      renderMembers();
      return;
    }
    if (target.closest("#startBtn")) {
      const chosen = TEAM.filter(function (m) {
        return mx.selected.indexOf(m.id) !== -1;
      });
      if (!chosen.length) return;
      const group = chosen.length > 1;
      const custom = (root.querySelector<HTMLInputElement>("#grpTitle")?.value || "").trim();
      convSeq += 1;
      const c: Conv = {
        id: "k" + convSeq,
        kind: group ? "GROUP" : "DIRECT",
        title: group
          ? custom ||
            chosen
              .map(function (m) {
                return m.name.split(" ")[0];
              })
              .join(", ")
          : chosen[0].name,
        job: null,
        unread: 0,
        when: "now",
        msgs: [],
      };
      convData.unshift(c);
      mx.active = c.id;
      closeDialog();
      renderMessages();
      // A new thread really does re-list the rail, so the cascade belongs here.
      playStagger?.();
      root.querySelector<HTMLTextAreaElement>("#msgBox")?.focus();
      return;
    }
    const act = target.closest<HTMLElement>("[data-act]");
    if (act && act.dataset.act === "clear") {
      const c = conv(mx.active);
      if (c) {
        c.msgs = [];
        c.when = "now";
      }
      paintConvRows();
      renderThread();
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
      sendMessage();
    }
  });

  // ================= INITIALIZATION =================
  renderMessages();

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
    disposers.forEach((d) => d());
  };
}
