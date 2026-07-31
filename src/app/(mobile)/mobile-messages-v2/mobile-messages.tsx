"use client";

// MOBILE MESSAGES (mobile-messages-v2) — Blueprint system, handheld build.
//
// Tokens, palette, type scale, status tones and Motion System "Balanced" are
// the reference dashboard's; the shell (topbar / hamburger drawer / sprite) is
// the shared MobileNav, so this surface is one product with its twelve
// siblings.
//
// Every region / state / variant of the desktop messages sheet is covered:
//  · page head (Communication / Messages) + the New-message action
//  · the conversation rail: search, rows with initials avatar, preview with the
//    "You:" prefix, unread weighting, unread count badge, kind + job tags,
//    relative time, and the "No conversations" note
//  · the thread pane: head with counterparty + kind/job/message-count sub, an
//    in-thread search box, day dividers, inbound and outbound bubbles, the group
//    author label on the first message of a run, the per-message time,
//    "· Delivered" on your last message, the graph-paper ground, and every
//    thread empty state (no messages / no search match)
//  · the composer: auto-growing textarea, Enter to send / Shift+Enter for a
//    newline, and the send action
//  · Clear chat (the desktop's th-clear)
//  · the new-conversation dialog: member search, multi-select crew list,
//    the DIRECT → GROUP switch with its title/sub change, the optional group
//    name, and Cancel / Start
//
// What changes versus the desktop sheet, and why:
//  · The two-pane grid cannot survive 320px, so the rail is the page and a
//    thread opens as a two-detent sheet (60% → full) with its own head and a
//    docked composer. Nothing is hidden; the second pane became a second screen.
//  · The desktop has no in-thread search — it does not need one, because its
//    whole conversation is on screen. A 60% sheet is not, so the thread head
//    carries a search box, and focusing it promotes the sheet to full: you
//    cannot read search results through a keyhole.
//  · The composer is pinned to var(--app-h), which is republished from
//    visualViewport, so the send row rides above the software keyboard instead
//    of being buried under it.
//  · The desktop's th-clear icon and the (unused) row popover become ONE bottom
//    sheet of actions, reachable from the rail row and from the thread head:
//    no hover on touch, and CLAUDE.md prefers sheets over modals.
//  · A filter is added over states the fixture already carries (unread / direct
//    / group). It is one dropdown, never a chip rail.
//  · The new-conversation modal becomes a form sheet with its submit pair in a
//    beige foot outside the scrolling body.
//
// Content is the donor demo fixture by design: the data layer is out of scope
// until the layout is signed off.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import styles from "./mobile-messages.module.css";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import { lockScroll } from "@/lib/scrollLock";
import {
  ALL,
  CONV_SEQ_START,
  FILTERS,
  MSG_SEQ_START,
  PAGE_SIZE,
  TEAM,
  clockOf,
  cloneSeed,
  filterCount,
  initials,
  matchesFilter,
  matchesQuery,
  preview,
  type Conv,
  type Msg,
} from "./messages-data";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Icon({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ?? styles.ic} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

/* CountUp lived here to animate the masthead numeral. The masthead was removed
   on 2026-07-30 and it had no other caller, so it went with it. */

/**
 * Marks every occurrence of the live thread query inside a message body, so a
 * result list says WHERE it matched rather than just that it did.
 *
 * indexOf in a loop, never a RegExp: the things a contractor actually searches a
 * thread for are job numbers and phone numbers — "J-1042", "(206)", "40 sq ft" —
 * and half of those carry regex metacharacters that would either throw or match
 * the wrong thing. Escaping them is more code than not needing to.
 */
function Hit({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const hay = text.toLowerCase();
  const needle = q.toLowerCase();
  const out: ReactNode[] = [];
  let from = 0;
  let n = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at < 0) break;
    if (at > from) out.push(text.slice(from, at));
    out.push(
      <mark className={styles.hit} key={n}>
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    n += 1;
    from = at + needle.length;
  }
  if (!n) return <>{text}</>;
  out.push(text.slice(from));
  return <>{out}</>;
}

type MenuRow = {
  act: string;
  icon: string;
  tone?: string;
  title: string;
  sub: string;
  disabled?: boolean;
  danger?: boolean;
};

/** One rendered line of a thread: a day rule, or a bubble. */
type ThreadLine =
  | { kind: "day"; key: string; label: string }
  | { kind: "msg"; key: string; m: Msg; showWho: boolean; last: boolean };

export function MobileMessages() {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const thBodyRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const thSrchRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<Conv[]>(() => cloneSeed());
  /* Threads read during this mount that were unread when they were opened.
     They keep their place in the unread group even though their badge is gone —
     see openThread. Ids are only ever added, and only from an event handler. */
  const [heldTop, setHeldTop] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const [openId, setOpenId] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [landedId, setLandedId] = useState<string | null>(null);

  /* ---- composer + in-thread search + new-conversation form ---- */
  const [draft, setDraft] = useState("");
  /* Scoped to the OPEN thread, not to the rail: `query` above filters which
     conversations you see, this one filters which messages inside one of them
     you see. Kept separate so closing a thread cannot wipe a rail search. */
  const [thQuery, setThQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [memberErr, setMemberErr] = useState(false);

  /* Sequences kept out of state: they only ever advance, and nothing renders
     from them, so a re-render must not be able to rewind an id. */
  const convSeq = useRef(CONV_SEQ_START);
  const msgSeq = useRef(MSG_SEQ_START);

  /* ---------- viewport height ------------------------------------------
     Mandatory rule: viewport heights only via var(--app-h). A phone's URL bar
     changes innerHeight mid-scroll AND the software keyboard shrinks the
     visual viewport, so the real value is republished rather than trusting a
     bare 100vh/100dvh. On this surface that is load-bearing twice over: the
     full-height thread and its docked composer are both sized from it, which
     is what keeps the send row above the keyboard. This is the React form of
     the donor's FLUID SCALE module — no root zoom, since the composition here
     is already the handheld one. */
  useEffect(() => {
    const apply = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-h", `${h}px`);
    };
    apply();
    window.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("resize", apply);
    const releaseScroll = lockScroll();
    return () => {
      window.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("resize", apply);
      document.documentElement.style.removeProperty("--app-h");
      releaseScroll();
    };
  }, []);

  /* ---------- Motion: reveal on load + adaptive reveal on scroll -------- */
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const host = scrollRef.current;
    const content = contentRef.current;
    if (!host || !content) return;

    let velLastY = host.scrollTop;
    let velLastT = performance.now();
    let vel = 0;
    const onScroll = () => {
      const now = performance.now();
      vel = Math.abs(host.scrollTop - velLastY) / Math.max(1, now - velLastT);
      velLastY = host.scrollTop;
      velLastT = now;
    };
    host.addEventListener("scroll", onScroll, { passive: true });

    const vpH = window.innerHeight;
    const blocks = Array.from(content.children) as HTMLElement[];
    blocks.forEach((el, i) => {
      el.classList.add(styles.rv);
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? `${i * 60}ms` : "200ms";
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const t = en.target as HTMLElement;
          // Below the fold: duration follows scroll speed — slow ≈ 900ms,
          // fast never shorter than 550ms.
          if (t.dataset.rvScroll) {
            t.style.transitionDuration = `${Math.round(Math.max(550, 900 - vel * 160))}ms`;
          }
          t.classList.add(styles.rvIn);
          io.unobserve(t);
          const done = () => {
            t.style.transitionDelay = "";
            t.style.transitionDuration = "";
            t.removeEventListener("transitionend", done);
          };
          t.addEventListener("transitionend", done);
        });
      },
      { threshold: 0, rootMargin: "0px 0px 60px 0px" },
    );
    blocks.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      host.removeEventListener("scroll", onScroll);
    };
  }, []);

  /* ---------- Motion: graph-paper parallax ----------------------------- */
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const host = scrollRef.current;
    if (!host) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        host.style.setProperty("--gy", `${(-(host.scrollTop * 0.06)).toFixed(1)}px`);
        ticking = false;
      });
    };
    host.addEventListener("scroll", onScroll, { passive: true });
    return () => host.removeEventListener("scroll", onScroll);
  }, []);

  /* ---------- Motion: press stamp (delegated, covers late rows) --------- */
  const onRootClick = useCallback((e: React.MouseEvent) => {
    if (prefersReducedMotion()) return;
    const sel = [
      styles.btn, styles.ddBtn, styles.ddItem, styles.pagerBtn, styles.cmenuItem,
      styles.sheetCancel, styles.crowGo, styles.crowOpen, styles.srchX,
      styles.cemptyA, styles.thBack, styles.thMenu, styles.thDone, styles.thSrchX,
      styles.sendBtn, styles.memRow,
    ].map((c) => `.${c}`).join(", ");
    const el = (e.target as HTMLElement).closest<HTMLElement>(sel);
    if (!el) return;
    el.classList.remove(styles.pressed);
    void el.offsetWidth;
    el.classList.add(styles.pressed);
    el.addEventListener("animationend", () => el.classList.remove(styles.pressed), { once: true });
  }, []);

  /* The Escape ladder lives further down, below the detent state it reads. */

  /* ---------- Filter dropdown: close on outside tap -------------------- */
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [filterOpen]);

  /* ---------- Paging returns you to the top of the rail ----------------
     In an effect, not the click handler: the ref must not be read during
     render, and the scroll belongs to the page CHANGE. First run skipped so
     mounting does not scroll. */
  const firstPaint = useRef(true);
  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false;
      return;
    }
    scrollRef.current?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [page]);

  /* ---------- The one blue flash on a thread you just changed ----------- */
  useEffect(() => {
    if (!landedId) return;
    const t = window.setTimeout(() => setLandedId(null), 700);
    return () => clearTimeout(t);
  }, [landedId]);

  /* ---------- derived --------------------------------------------------
     UNREAD FIRST, then recency (the array's own order, newest first).

     The sort key is "unread OR held", not `unread > 0` alone. Sorting on the
     raw count is a trap: opening a thread zeroes it, so the row slides out from
     under the finger that tapped it. `heldTop` pins a thread you opened this
     session to the unread group, so the badge retires but the row stays put.
     Marking a thread unread again promotes it through the `unread > 0` half.
     Everything re-sorts on the next load, which is when a user expects the list
     to have been rebuilt. */
  const visible = useMemo(() => {
    const rows = data.filter((c) => matchesFilter(c, filter) && matchesQuery(c, query));
    // A stable partition rather than a comparator: it keeps recency order
    // inside each group and states the two-group intent outright.
    const top: typeof rows = [];
    const rest: typeof rows = [];
    for (const c of rows) (c.unread > 0 || heldTop.has(c.id) ? top : rest).push(c);
    return [...top, ...rest];
  }, [data, filter, query, heldTop]);
  const activeOption = FILTERS.find((o) => o.k === filter) ?? FILTERS[0];
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const slice = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openConv = openId === null ? null : (data.find((c) => c.id === openId) ?? null);
  const sheetConv = sheetId === null ? null : (data.find((c) => c.id === sheetId) ?? null);

  const resetFilters = () => {
    setFilter(ALL);
    setQuery("");
    setPage(1);
  };

  /* ---------- thread lines: day rules + bubbles ------------------------
     The donor's exact grouping: a rule whenever the day changes, and the group
     author label only on the FIRST message of a run by one person on one day.

     With a search running the same grouping is applied to the RESULTS, so a hit
     still arrives dated and attributed — a bare list of bodies out of a group
     thread is unreadable. Author and day are compared against the previous
     VISIBLE message, not the previous stored one: two hits from one person a
     week apart are not one run. */
  const trimmedThQuery = thQuery.trim();
  const lines = useMemo<ThreadLine[]>(() => {
    const c = openConv;
    if (!c) return [];
    const q = trimmedThQuery.toLowerCase();
    const shown = q
      ? c.msgs.filter((m) => m.body.toLowerCase().includes(q) || m.who.toLowerCase().includes(q))
      : c.msgs;
    // "Delivered" belongs to the newest message in the THREAD. Resolving it
    // against the filtered array would move the receipt onto whichever hit
    // happened to sort last.
    const newestId = c.msgs.length ? c.msgs[c.msgs.length - 1].id : null;
    const out: ThreadLine[] = [];
    let day: string | null = null;
    shown.forEach((m, i) => {
      if (m.day !== day) {
        out.push({ kind: "day", key: `d-${i}-${m.day}`, label: m.day });
        day = m.day;
      }
      const prev = shown[i - 1];
      const firstInRun = !prev || prev.who !== m.who || prev.day !== m.day;
      out.push({
        kind: "msg",
        key: m.id,
        m,
        showWho: !m.me && c.kind === "GROUP" && firstInRun,
        last: m.id === newestId,
      });
    });
    return out;
  }, [openConv, trimmedThQuery]);

  /* The readout on the search field: hits over the thread total. */
  const thHits = lines.reduce((n, l) => (l.kind === "msg" ? n + 1 : n), 0);

  /* ---------- thread open / close -------------------------------------- */
  /* ---------- thread detents: 60% → full → gone ------------------------
     The thread opens at 60% of the screen so the list stays visible behind it,
     then answers three gestures: drag up to full, drag down to come back to
     60%, drag down again to leave. Every one of them also has a control, because
     a sheet you can only work by swiping is a sheet some people cannot work:
     the X in the head closes, focusing the search box promotes to full, and the
     Done key beside it comes back down.

     Geometry: the panel is always --app-h tall and is moved with translateY.
     0 is full, PEEK_OFF of its own height leaves 60% showing, 100% is gone.
     Percentages of the element, not the viewport, so the keyboard republishing
     --app-h cannot desynchronise the detents from the panel. */
  /* Also written into the CSS, as the panel's --th-off default and its peek
     transform. Change one and the other two have to move with it: the module's
     .thread block says why the spacer exists. */
  const PEEK_OFF = 0.4;
  const FLING = 0.5; // px per ms — above this the direction decides, not the position

  const threadRef = useRef<HTMLDivElement>(null);
  const [detent, setDetent] = useState<"peek" | "full">("peek");
  /** Live pixel offset while a finger is down; null when the CSS class owns it. */
  const [dragY, setDragY] = useState<number | null>(null);
  const drag = useRef<{
    startY: number;
    base: number;
    active: boolean;
    fromBody: boolean;
    lastY: number;
    lastT: number;
    v: number;
  } | null>(null);

  const panelH = () => threadRef.current?.offsetHeight || window.innerHeight;
  const baseOffset = useCallback(
    () => (detent === "full" ? 0 : panelH() * PEEK_OFF),
    [detent],
  );

  /* Closing drops the in-thread search with the thread: a query is a question
     about ONE conversation, and carrying it into the next one you open would
     silently hide most of it. */
  const closeThread = () => {
    setOpenId(null);
    setThQuery("");
  };

  /* Down from full. Blur first — leaving the keyboard up over a 60% sheet
     covers the very messages the collapse was meant to reveal. */
  const collapseThread = () => {
    thSrchRef.current?.blur();
    setDetent("peek");
  };

  /* ---------- Esc closes what THIS PAGE owns, topmost first -------------
     Bound here rather than up with the other effects because it reads `detent`,
     which the block above declares.

     The drawer is not listed: MobileNav handles its own Escape and only binds
     while open, so the two listeners can never claim one key press. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (filterOpen) setFilterOpen(false);
      else if (newOpen) setNewOpen(false);
      else if (sheetId) setSheetId(null);
      // Escape out of the search field undoes what focusing it did — it comes
      // back down to 60% — before it will close the thread underneath.
      else if (openId && detent === "full" && document.activeElement === thSrchRef.current) {
        collapseThread();
      } else if (openId) closeThread();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // collapseThread / closeThread are deliberately absent from the deps: they
    // are re-created every render and only ever touch refs and setters, so
    // listing them would rebind the listener on every keystroke for nothing.
  }, [filterOpen, newOpen, sheetId, openId, detent]);

  const onThreadPointerDown = (e: React.PointerEvent) => {
    // NOT gated on prefers-reduced-motion: that setting asks for less
    // animation, not fewer ways to close a sheet. The CSS drops the snap
    // transition instead, so the panel jumps to its detent rather than gliding.
    if (!openConv) return;
    // A pointerdown on the composer or a button must not arm a drag, or typing
    // a reply would fight the sheet.
    const t = e.target as HTMLElement;
    if (t.closest("button, input, textarea, a")) return;
    drag.current = {
      startY: e.clientY,
      base: baseOffset(),
      active: false,
      fromBody: Boolean(thBodyRef.current?.contains(t)),
      lastY: e.clientY,
      lastT: performance.now(),
      v: 0,
    };
  };

  const onThreadPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.startY;

    if (!d.active) {
      if (d.fromBody) {
        // From the message list, only a downward pull that starts at the very
        // top becomes a drag — otherwise the list would stop scrolling.
        const body = thBodyRef.current;
        if (dy > 6 && body && body.scrollTop <= 0) d.active = true;
        else if (Math.abs(dy) > 6) {
          drag.current = null;
          return;
        }
      } else if (Math.abs(dy) > 3) {
        d.active = true;
      }
      if (!d.active) return;
      threadRef.current?.setPointerCapture(e.pointerId);
    }

    const now = performance.now();
    const dt = now - d.lastT;
    if (dt > 0) {
      d.v = (e.clientY - d.lastY) / dt;
      d.lastY = e.clientY;
      d.lastT = now;
    }
    // Clamped at 0: the panel is already full height, so dragging past the top
    // would just tear it off the screen.
    setDragY(Math.max(0, d.base + dy));
  };

  const onThreadPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.active) {
      setDragY(null);
      return;
    }
    const H = panelH();
    const peek = H * PEEK_OFF;
    const y = Math.max(0, d.base + (e.clientY - d.startY));

    let target: "full" | "peek" | "closed";
    if (d.v > FLING) target = d.base >= peek - 1 ? "closed" : "peek";
    else if (d.v < -FLING) target = "full";
    else {
      // Slow release: whichever detent the panel is actually nearest.
      const opts: [typeof target, number][] = [["full", 0], ["peek", peek], ["closed", H]];
      target = opts.reduce((a, b) => (Math.abs(y - b[1]) < Math.abs(y - a[1]) ? b : a))[0];
    }

    setDragY(null);
    if (target === "closed") closeThread();
    else setDetent(target);
  };

  const openThread = (id: string) => {
    // Hold this row in the unread group before clearing its badge. Without it
    // the thread you just tapped sorts away underneath your finger while the
    // sheet is still animating in, and again when you close. Reading a thread
    // should retire the badge, not move the row.
    setHeldTop((prev) => {
      if (!data.some((c) => c.id === id && c.unread > 0) || prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setData((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    setDraft("");
    setThQuery("");
    // Always arrive at 60%, even if the last thread was left full — the detent
    // is a property of this opening, not a preference that persists.
    setDetent("peek");
    setDragY(null);
    setOpenId(id);
  };

  /* Pin to the newest message on open and after every send — except while a
     search is running, where the first hit is the interesting end of the list
     and landing on the last one would look like the search had failed. */
  useEffect(() => {
    const body = thBodyRef.current;
    if (!body || !openId) return;
    body.scrollTop = trimmedThQuery ? 0 : body.scrollHeight;
  }, [openId, lines.length, trimmedThQuery]);

  const sendMessage = () => {
    const text = draft.trim();
    const c = openConv;
    if (!text || !c) return;
    msgSeq.current += 1;
    const rec: Msg = {
      id: `m${msgSeq.current}`,
      who: "Ivan",
      me: true,
      day: "Today",
      at: clockOf(new Date()),
      body: text,
    };
    setData((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, when: "now", msgs: [...x.msgs, rec] } : x)),
    );
    setDraft("");
    // Sending ends the search. Otherwise the reply you just wrote lands outside
    // the filter and the thread appears to have swallowed it.
    setThQuery("");
    const box = boxRef.current;
    if (box) box.style.height = "";
  };

  /* ---------- actions sheet -------------------------------------------- */
  const menuRows = useMemo<MenuRow[]>(() => {
    const c = sheetConv;
    if (!c) return [];
    return [
      { act: "open", icon: "i-msg", tone: styles.cmiBp, title: "Open thread", sub: "Read and reply" },
      {
        act: "job", icon: "i-jobs", tone: styles.cmiSky,
        title: c.job ? `Open job ${c.job}` : "Open job",
        sub: c.job ?? "No job linked to this thread",
        disabled: !c.job,
      },
      {
        act: "read", icon: "i-mail", tone: styles.cmiOk,
        title: c.unread > 0 ? "Mark as read" : "Mark as unread",
        sub: c.unread > 0 ? `Clears ${c.unread} unread` : "Flag it to come back to",
      },
      {
        act: "clear", icon: "i-rotate", tone: styles.cmiWarn,
        title: "Clear chat",
        sub: c.msgs.length ? `Removes all ${c.msgs.length} messages` : "Nothing to clear",
        disabled: c.msgs.length === 0,
      },
      {
        act: "del", icon: "i-trash", tone: styles.cmiDanger,
        title: c.kind === "GROUP" ? "Leave group" : "Delete conversation",
        sub: "Removes the thread permanently", danger: true,
      },
    ];
  }, [sheetConv]);

  const runMenu = (act: string) => {
    const c = sheetConv;
    setSheetId(null);
    if (!c) return;
    if (act === "open") {
      openThread(c.id);
    } else if (act === "read") {
      setData((prev) => prev.map((x) => (x.id === c.id ? { ...x, unread: x.unread > 0 ? 0 : 1 } : x)));
      setLandedId(c.id);
    } else if (act === "clear") {
      setData((prev) => prev.map((x) => (x.id === c.id ? { ...x, when: "now", msgs: [] } : x)));
      setLandedId(c.id);
    } else if (act === "del") {
      setData((prev) => prev.filter((x) => x.id !== c.id));
      if (openId === c.id) closeThread();
    }
  };

  /* ---------- new conversation ------------------------------------------ */
  const openNew = () => {
    setSelected([]);
    setMemberQuery("");
    setGroupTitle("");
    setMemberErr(false);
    setNewOpen(true);
  };

  const toggleMember = (id: string) => {
    setMemberErr(false);
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const memberRows = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    return TEAM.filter((m) => !q || m.name.toLowerCase().includes(q));
  }, [memberQuery]);

  const isGroupDraft = selected.length > 1;

  const submitNew = (e: React.FormEvent) => {
    e.preventDefault();
    const chosen = TEAM.filter((m) => selected.includes(m.id));
    if (!chosen.length) {
      setMemberErr(true);
      return;
    }
    const group = chosen.length > 1;
    const custom = groupTitle.trim();
    convSeq.current += 1;
    const rec: Conv = {
      id: `k${convSeq.current}`,
      kind: group ? "GROUP" : "DIRECT",
      title: group ? custom || chosen.map((m) => m.name.split(" ")[0]).join(", ") : chosen[0].name,
      job: null,
      unread: 0,
      when: "now",
      msgs: [],
    };
    setData((prev) => [rec, ...prev]);
    resetFilters();
    setNewOpen(false);
    setLandedId(rec.id);
    setDraft("");
    setOpenId(rec.id);
    // The only thing you can do in a brand-new thread is type, so land in the
    // composer — but after the sheet settles: focusing mid-transform makes the
    // keyboard fight the animation, and the keyboard's own resize is what
    // republishes --app-h.
    window.setTimeout(() => boxRef.current?.focus(), prefersReducedMotion() ? 0 : 340);
  };

  const anySheet = Boolean(sheetConv) || newOpen;

  // Swipe-down dismissal for the two bottom sheets. The thread panel above runs
  // its own three-detent gesture and is deliberately left alone.
  const actionsDrag = useSheetDrag(Boolean(sheetConv), () => setSheetId(null));
  const newDrag = useSheetDrag(newOpen, () => setNewOpen(false));

  return (
    <div className={styles.app} onClick={onRootClick}>

      {/* Shared handheld nav: topbar + drawer + sprite. Owns its own open
          state, so the page holds none. */}
      <MobileNav />

      {/* ============ SCROLLER ============ */}
      <main className={styles.scroll} ref={scrollRef}>
        <div className={styles.content} ref={contentRef}>
          {/* PAGE HEAD */}
          <div className={styles.pageHead}>
            <div className={styles.kicker}>Communication</div>
            <h1 className={styles.pageTitle}>Messages</h1>
            <div className={styles.pageActions}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={openNew}>
                <Icon id="i-plus" />New message
              </button>
            </div>
          </div>

          {/* The masthead (unread numeral + Threads / Messages annotations) was
              removed at the owner's request on 2026-07-30. On a surface whose
              whole job is "get to the right conversation", it pushed the list a
              third of a screen down to restate what the row badges already say.
              The unread count still reaches the user — it is the tally on the
              Unread filter option, where it is actionable rather than decorative. */}

          {/* FIND BAR — the desktop's conversation search, plus the filter as
              ONE dropdown. A chip rail does not survive 320px. */}
          <div className={styles.find}>
            <label className={styles.srch}>
              <Icon id="i-search" />
              <input
                className={styles.srchInput}
                type="search"
                value={query}
                placeholder="Search conversations…"
                autoComplete="off"
                aria-label="Search conversations"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
              {query ? (
                <button className={styles.srchX} type="button" aria-label="Clear search"
                  onClick={() => { setQuery(""); setPage(1); }}>
                  <Icon id="i-x" />
                </button>
              ) : null}
            </label>

            <div className={`${styles.dd} ${filterOpen ? styles.open : ""}`} ref={filterRef}>
              <button className={styles.ddBtn} type="button" aria-haspopup="listbox"
                aria-expanded={filterOpen} onClick={() => setFilterOpen((v) => !v)}>
                <Icon id="i-filter" />
                Filter
                <span className={`${styles.ddValue} ${filter === ALL ? styles.isAll : ""}`}>
                  {activeOption.l} · {filterCount(data, filter)}
                </span>
                <Icon id="i-chev" className={`${styles.ic} ${styles.ddCaret}`} />
              </button>
              <div className={styles.ddMenu} role="listbox">
                {FILTERS.map((o) => (
                  <button key={o.k} className={`${styles.ddItem} ${filter === o.k ? styles.active : ""}`}
                    type="button" role="option" aria-selected={filter === o.k}
                    onClick={() => { setFilter(o.k); setPage(1); setFilterOpen(false); }}>
                    {o.l}
                    <span className={styles.ddCount}>{filterCount(data, o.k)}</span>
                    {filter === o.k ? <Icon id="i-check" /> : null}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* CONVERSATION RAIL */}
          {visible.length === 0 ? (
            <div className={styles.cempty}>
              {data.length === 0 ? (
                <>
                  <div className={styles.cemptyT}>No conversations</div>
                  <div className={styles.cemptyS}>
                    Nothing in the rail yet. Start a thread with someone on the crew.
                  </div>
                  <button className={styles.cemptyA} type="button" onClick={openNew}>
                    <Icon id="i-plus" />New message
                  </button>
                </>
              ) : (
                <>
                  <div className={styles.cemptyT}>No matches</div>
                  <div className={styles.cemptyS}>No thread matches that search and filter.</div>
                  <button className={styles.cemptyA} type="button" onClick={resetFilters}>
                    <Icon id="i-x" />Clear filters
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className={styles.rail}>
              {slice.map((c, i) => (
                <div
                  key={c.id}
                  className={`${styles.crow} ${styles.rowIn} ${c.unread ? styles.isUnread : ""} ${landedId === c.id ? styles.landed : ""}`}
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  <span className={styles.cav}>{initials(c.title)}</span>
                  <div className={styles.cname}>{c.title}</div>
                  <button className={styles.crowOpen} type="button"
                    aria-label={`Actions for ${c.title}`} onClick={() => setSheetId(c.id)}>
                    <Icon id="i-dots" />
                  </button>
                  <div className={styles.cprev}>{preview(c)}</div>
                  <div className={styles.crowFoot}>
                    <span className={styles.crowTags}>
                      {c.unread ? (
                        <span className={`${styles.tag} ${styles.isNew}`}>{c.unread} new</span>
                      ) : null}
                      <span className={`${styles.tag} ${c.kind === "GROUP" ? styles.isGroup : ""}`}>
                        {c.kind === "GROUP" ? "Group" : "Direct"}
                        {c.job ? ` · ${c.job}` : ""}
                      </span>
                    </span>
                    <span className={styles.ctime}>{c.when}</span>
                  </div>
                  {/* The whole card opens the thread; the ⋮ button above it
                      opens the actions sheet. A stretched button rather than a
                      role="button" div, so it is a real tab stop with a real
                      label. */}
                  <button className={styles.crowGo} type="button"
                    aria-label={`Open conversation with ${c.title}`} onClick={() => openThread(c.id)} />
                </div>
              ))}
            </div>
          )}

          {/* PAGER */}
          {visible.length > PAGE_SIZE ? (
            <div className={styles.pager}>
              <button className={styles.pagerBtn} type="button" disabled={safePage <= 1}
                onClick={() => setPage(Math.max(1, safePage - 1))}>
                <Icon id="i-chevl" />Prev
              </button>
              <button className={styles.pagerBtn} type="button" disabled={safePage >= pages}
                onClick={() => setPage(Math.min(pages, safePage + 1))}>
                Next<Icon id="i-chevr" />
              </button>
              <span className={styles.pagerInfo}>{safePage} / {pages}</span>
            </div>
          ) : null}
        </div>
      </main>

      {/* ============ THREAD — the desktop's right pane, as a detent sheet ======
          Opens at 60%, drags to full, drags away. Sized from var(--app-h): when
          the software keyboard opens the visual viewport shrinks, --app-h is
          republished, and the composer rides up with it instead of being
          buried. See the detent block above for the gesture rules. */}
      <div
        ref={threadRef}
        className={`${styles.thread} ${openConv ? styles.on : ""} ${
          detent === "full" ? styles.full : styles.peek
        }`}
        style={
          dragY === null
            ? undefined
            : // While a finger is down the offset is live, so the transition has
              // to be off or every frame would chase the last one. --th-off is
              // the same number: it is the height of the panel that is below the
              // fold right now, which is exactly what the trailing grid spacer
              // has to absorb to keep the composer on screen mid-drag.
              ({
                transform: `translateY(${dragY}px)`,
                transition: "none",
                "--th-off": `${dragY}px`,
              } as React.CSSProperties)
        }
        onPointerDown={onThreadPointerDown}
        onPointerMove={onThreadPointerMove}
        onPointerUp={onThreadPointerUp}
        onPointerCancel={onThreadPointerUp}
        role="dialog"
        /* Only modal when it covers the screen. At 60% the rail behind is
           genuinely reachable — tapping another conversation switches to it —
           so claiming modality here would tell a screen reader the rest of the
           page is inert when it is not. */
        aria-modal={detent === "full"}
        aria-label={openConv ? `Conversation with ${openConv.title}` : "Conversation"}
        aria-hidden={!openConv}
      >
        {/* The drag affordance in the 60% state, and the reason the head is not
            scrollable: this strip plus the identity row are the reliable grab
            area. It collapses at full height — see .thGrab: a handle floating
            above a full-screen pane is a rule with a gap under it, not a sheet
            edge. The head keeps taking the drag either way. */}
        <div className={styles.thGrab} aria-hidden="true">
          <span className={styles.thGrabBar} />
        </div>
        <div className={styles.thHead}>
          {/* IDENTITY ROW — close · who · actions. The avatar and the name live
              in ONE flex child (.thIdent) that owns all the slack, so the two
              44px keys can never be squeezed and the name can never be pushed
              under them; at 320px the sub ellipses and nothing else moves. */}
          <div className={styles.thTop}>
            <button
              className={styles.thBack}
              type="button"
              aria-label="Close conversation"
              onClick={closeThread}
            >
              <Icon id="i-x" />
            </button>
            <span className={styles.thIdent}>
              <span className={styles.thAv} aria-hidden="true">
                {openConv ? initials(openConv.title) : "—"}
              </span>
              <span className={styles.thTxt}>
                <span className={styles.thT}>{openConv?.title ?? "Conversation"}</span>
                <span className={styles.thS}>
                  {openConv
                    ? `${openConv.kind === "GROUP" ? "Group" : "Direct"}${openConv.job ? ` · job ${openConv.job}` : ""} · ${openConv.msgs.length} message${openConv.msgs.length === 1 ? "" : "s"}`
                    : "—"}
                </span>
              </span>
            </span>
            <button className={styles.thMenu} type="button" aria-label="Conversation actions"
              onClick={() => setSheetId(openId)}>
              <Icon id="i-dots" />
            </button>
          </div>

          {/* SEARCH ROW — present in BOTH detents, and the promotion to full.
              Focusing it is what raises the sheet: you cannot read search
              results through a 60% keyhole, and asking for the search is the
              clearest statement that you want the whole conversation. Done
              comes back down. */}
          <div className={styles.thFind}>
            <label className={styles.thSrch}>
              <Icon id="i-search" />
              <input
                ref={thSrchRef}
                className={styles.thSrchIn}
                type="search"
                value={thQuery}
                placeholder="Search this conversation…"
                autoComplete="off"
                aria-label="Search this conversation"
                onFocus={() => setDetent("full")}
                onChange={(e) => setThQuery(e.target.value)}
              />
              {trimmedThQuery ? (
                <span className={styles.thHits}>
                  {thHits}/{openConv?.msgs.length ?? 0}
                </span>
              ) : null}
              {thQuery ? (
                <button className={styles.thSrchX} type="button" aria-label="Clear conversation search"
                  onClick={() => { setThQuery(""); thSrchRef.current?.focus(); }}>
                  <Icon id="i-x" />
                </button>
              ) : null}
            </label>
            {/* Rendered in both detents and collapsed by CSS rather than
                unmounted: the sheet is mid-transform when this appears, and a
                key popping into existence beside a moving panel reads as a
                glitch. Hidden from the tab order and from AT while it is. */}
            <button
              className={styles.thDone}
              type="button"
              tabIndex={detent === "full" ? 0 : -1}
              aria-hidden={detent !== "full"}
              onClick={collapseThread}
            >
              Done
            </button>
          </div>
        </div>

        <div className={styles.thBody} ref={thBodyRef}>
          {lines.length === 0 ? (
            <div className={styles.thEmpty}>
              {trimmedThQuery ? (
                <>
                  <div className={styles.thEmptyT}>No matches</div>
                  <div className={styles.thEmptyS}>
                    Nothing in this conversation mentions “{trimmedThQuery}”.
                  </div>
                  <button className={styles.cemptyA} type="button"
                    onClick={() => { setThQuery(""); thSrchRef.current?.focus(); }}>
                    <Icon id="i-x" />Clear search
                  </button>
                </>
              ) : (
                <>
                  <div className={styles.thEmptyT}>No messages yet</div>
                  <div className={styles.thEmptyS}>
                    Say something to start the thread — it sends to everyone on it.
                  </div>
                </>
              )}
            </div>
          ) : (
            lines.map((l) =>
              l.kind === "day" ? (
                <div className={styles.dayDiv} key={l.key}>
                  <span className={styles.dayLbl}>{l.label}</span>
                </div>
              ) : (
                <div className={`${styles.msg} ${l.m.me ? styles.isMe : ""}`} key={l.key}>
                  {l.showWho ? <span className={styles.msgWho}>{l.m.who}</span> : null}
                  <span className={styles.bub}>
                    <Hit text={l.m.body} q={trimmedThQuery} />
                  </span>
                  <span className={styles.msgMeta}>
                    {l.m.at}
                    {l.m.me && l.last ? " · Delivered" : ""}
                  </span>
                </div>
              ),
            )
          )}
        </div>

        {/* Docked composer — outside the scrolling body, and the thread sheet's
            own submit pair, so the send key carries the blueprint fill the way
            a sheet foot does. */}
        <form
          className={styles.composer}
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
        >
          <textarea
            ref={boxRef}
            className={styles.composerIn}
            rows={1}
            value={draft}
            placeholder="Write a message…"
            aria-label="Write a message"
            onChange={(e) => {
              setDraft(e.target.value);
              const box = e.currentTarget;
              box.style.height = "auto";
              box.style.height = `${Math.min(130, box.scrollHeight)}px`;
            }}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter breaks the line — the donor's contract.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <button className={styles.sendBtn} type="submit" aria-label="Send message"
            disabled={!draft.trim()}>
            <Icon id="i-send" />
          </button>
        </form>
      </div>

      {/* ============ SHEET SCRIM (shared by both bottom sheets) ============ */}
      <div
        className={`${styles.scrim} ${anySheet ? styles.on : ""}`}
        onClick={() => { setSheetId(null); setNewOpen(false); }}
        aria-hidden="true"
      />

      {/* ============ THREAD ACTIONS SHEET ============ */}
      <div className={`${styles.sheet} ${sheetConv ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-label="Conversation actions" aria-hidden={!sheetConv} {...actionsDrag.sheetProps}>
        <div className={styles.sheetGrab} {...actionsDrag.handleProps} />
        <div className={styles.sheetHead} {...actionsDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {sheetConv
              ? `${sheetConv.kind === "GROUP" ? "Group" : "Direct"} · ${sheetConv.msgs.length} messages · ${sheetConv.when}`
              : "Conversation · —"}
          </div>
          <div className={styles.sheetTitle}>{sheetConv?.title ?? "Actions"}</div>
        </div>
        <div className={styles.sheetBody}>
          {menuRows.map((r) => (
            <button key={r.act} type="button" disabled={r.disabled}
              className={`${styles.cmenuItem} ${r.danger ? styles.cmenuItemDanger : ""}`}
              onClick={() => runMenu(r.act)}>
              <span className={`${styles.cmiIc} ${r.tone ?? ""}`}><Icon id={r.icon} /></span>
              <span>
                <span className={styles.cmenuItemT}>{r.title}</span>
                <span className={styles.cmenuItemS}>{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setSheetId(null)}>Cancel</button>
      </div>

      {/* ============ NEW CONVERSATION SHEET ============ */}
      <div className={`${styles.sheet} ${newOpen ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-labelledby="mmNewTitle" aria-hidden={!newOpen} {...newDrag.sheetProps}>
        <div className={styles.sheetGrab} {...newDrag.handleProps} />
        <div className={styles.sheetHead} {...newDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {isGroupDraft ? `Group with ${selected.length} people` : "Pick someone on the crew"}
          </div>
          <div className={styles.sheetTitle} id="mmNewTitle">
            {isGroupDraft ? "New group" : "New conversation"}
          </div>
        </div>
        <form className={`${styles.sheetBody} ${styles.formBody}`} id="mmNewForm" noValidate onSubmit={submitNew}>
          <div className={`${styles.fld} ${memberErr ? styles.invalid : ""}`}>
            <label className={styles.fldLbl} htmlFor="mmMember">
              Crew<span className={styles.req}>*</span>
            </label>
            <input className={styles.pinput} id="mmMember" type="search"
              placeholder="Search the team…" autoComplete="off" value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)} />
            <div className={styles.memList} role="group" aria-label="Crew members">
              {memberRows.length === 0 ? (
                <div className={styles.memNone}>Nobody on the crew matches that.</div>
              ) : (
                memberRows.map((m) => {
                  const on = selected.includes(m.id);
                  return (
                    <button key={m.id} type="button" aria-pressed={on}
                      className={`${styles.memRow} ${on ? styles.active : ""}`}
                      onClick={() => toggleMember(m.id)}>
                      <span className={styles.memChk}><Icon id="i-check" /></span>
                      <span className={styles.memAv}>{initials(m.name)}</span>
                      <span className={styles.memMain}>
                        <span className={styles.memN}>{m.name}</span>
                        <span className={styles.memR}>{m.role}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            {memberErr ? <span className={styles.fldErr}>Pick at least one person</span> : null}
          </div>

          {isGroupDraft ? (
            <div className={styles.fld}>
              <label className={styles.fldLbl} htmlFor="mmGroup">Group name</label>
              <input className={styles.pinput} id="mmGroup" type="text"
                placeholder="Maple Ave crew" autoComplete="off" value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)} />
              <span className={styles.fldHint}>
                Optional — leave it blank and the thread is named after everyone on it.
              </span>
            </div>
          ) : null}
        </form>
        <div className={styles.formFoot}>
          <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => setNewOpen(false)}>
            Cancel
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" form="mmNewForm">
            <Icon id="i-check" />Start
          </button>
        </div>
      </div>
    </div>
  );
}
