"use client";

/* ─────────────────────────────────────────────────────────────────────────
   HIRE & WORK · HANDHELD — /mobile-hire-v1

   Stands BESIDE the desktop build (src/components/v3/hire-blueprint/*,
   untouched) and shares its whole data layer verbatim: every read and write is
   a server action in src/actions/tradeServices.ts, and every shape and pure
   helper is imported from hire-blueprint/hire-data so the rate string, the age
   label and the search match cannot drift between the two surfaces. Nothing
   here is a fixture and nothing here is a second endpoint.

   WHAT THE PAGE IS. A two-sided contractor-to-contractor board. HIRE is
   everyone on the network who has posted themselves as available; picking one
   opens their contact sheet — email, company, company phone, JobFlex reviews —
   with two actions, "I'm interested" (a bell notice plus an email to the
   poster) and "Email". WORK is where the viewer writes their own post, sees who
   answered it, and edits or deletes it.

   THE RESTACK. The desktop is a master–detail split: a drawing SCHEDULE on the
   left, a sticky TITLE BLOCK on the right. A phone has room for one of them, so
   the title block becomes a BOTTOM SHEET pulled up from the row — not a pushed
   detail view. The reason is the owner's own requirement that a person must be
   able to find their OWN post by searching: a pushed view unmounts the list and
   with it the query and the scroll position, so browse → inspect → browse
   becomes re-typing. Under a sheet the schedule is still there, still filtered,
   still where it was. The same sheet grammar then carries the Work composer,
   which keeps "Your posts" readable without scrolling past a five-field form.

   OWNER CALLS CARRIED OVER FROM THE DESKTOP (2026-09-03):
    · the Specialties chip field is GONE from the composer. Trade, headline and
      rate already say what a person does. A post created elsewhere still shows
      its specialties read-only on the title block, and an edit round-trips them.
    · "Mark filled" is GONE. A post you are done with is deleted.
    · Delete is OPTIMISTIC — the row leaves on the tap and comes back only if
      the server refuses. Waiting on the wire is the server's problem.
    · Writes go through the `hire*` RESULT-ENVELOPE wrappers, never the throwing
      actions: Next redacts a thrown server-action message in a production
      build, so a hand-written sentence is only readable when it is RETURNED.
    · `isOwnPost` (author-scoped) gates "You" and Edit; `isMine` (org-scoped)
      only says a colleague wrote it.

   OWN-WORLD: JobFlex blueprint, pinned — paper #f2f0eb, ink #0a0a0a,
   blueprint #1854a0 on the primary action and the active side, Inter 900 caps
   headings, JetBrains Mono for the annotation layer (rates, cities, ages, cell
   labels), 2px ink frames, 2px radii, hard 3px offset shadows with no blur,
   dashed 1.5px notes for empty states.
   ───────────────────────────────────────────────────────────────────────── */

// Styling is `./mobile-hire.css` — a PLAIN stylesheet, never a CSS module. The
// modules pipeline hashes class names and leaves the `*` reset and bare element
// selectors unscoped, which flattens every page in the app (the owner has had
// one such attempt reverted). Every selector there carries the single literal
// root class `.jf-mobile-hire`, and every child class the `mh-` prefix.
//
// State is React state, seeded from the server page. Every write patches BOTH
// lists in place on success, so the person who pressed a button sees the result
// without a reload and without a re-fetch. No MutationObserver anywhere: the
// row cascade is played once per side arrival, never on a filter keystroke.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { AddressField } from "@/components/v3/mobile-shell/address-field";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import { staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import { lockScroll } from "@/lib/scrollLock";
import {
  getPostInterest,
  markPostInterestSeen,
  hireCreatePost,
  hireDeletePost,
  hireExpressInterest,
  hireUpdatePost,
  type InterestedPartyDTO,
} from "@/actions/tradeServices";
import {
  EMPTY_DRAFT,
  RATE_UNITS,
  STATUS_LABEL,
  TRADES,
  agoLabel,
  draftFromPost,
  draftToInput,
  formatPhone,
  initials,
  matchesQuery,
  ownToBoard,
  parseRate,
  unitLabel,
  unitShort,
  type HireOwnPost,
  type HirePost,
  type HireTab,
  type HireViewer,
  type PostDraft,
  type RateUnit,
} from "@/components/v3/hire-blueprint/hire-data";
import "./mobile-hire.css";

/** The stylesheet gives a sheet 0.3s of travel; content that would change
 *  mid-exit (a title flipping from "Edit post" to "Post yourself") waits this
 *  long, so the box never rewrites itself while it is still on screen. */
const EXIT_MS = 320;
/** How long "Posted" stands on the button before the sheet leaves and the new
 *  row takes over the confirmation. */
const POSTED_MS = 560;
/** How long the broadcast receipt stands above Your posts. */
const RECEIPT_MS = 4000;
/** The board is capped at 200 rows server-side, and 200 × 45ms is nine seconds
 *  of rows sitting at opacity 0. Only what can be on screen cascades. */
const STAGGER_MAX = 12;

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Icon({ id }: { id: string }) {
  return (
    <svg className="mh-ic" aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

/** Five drawn squares — the chart-point language, used as a rating scale. Not
 *  stars: DESIGN.md rules stars out. */
function Squares({ value }: { value: number }) {
  const on = Math.round(value);
  return (
    <span className="mh-sqs" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={"mh-sq" + (i <= on ? " is-on" : "")} />
      ))}
    </span>
  );
}

/* ═══════════════════════════ THE SHEET SHELL ═══════════════════════════
   One implementation for all three sheets on this page (the title block, the
   composer, the trade picker). Swipe-down dismissal comes from the shared
   use-sheet-drag hook; the body scroll lock from lib/scrollLock, which is
   reference-counted — a picker opened from inside the composer nests safely,
   where a hand-rolled `document.body.style.overflow` would leave the page
   locked until a reload.

   The sheet stays MOUNTED while closed (parked at translateY(100%), visibility
   hidden) so the exit animation has something to animate. Callers therefore
   keep their content alive across a close and clear it after EXIT_MS. */
function Sheet({
  open,
  onClose,
  tall,
  kicker,
  title,
  sub,
  titleId,
  children,
  foot,
}: {
  open: boolean;
  onClose: () => void;
  /** The composer is a form and takes the taller stop. */
  tall?: boolean;
  kicker: string;
  title: ReactNode;
  sub?: ReactNode;
  titleId: string;
  children: ReactNode;
  foot?: ReactNode;
}) {
  const drag = useSheetDrag(open, onClose);

  useEffect(() => {
    if (!open) return;
    return lockScroll();
  }, [open]);

  return (
    <>
      <div className={"mh-scrim" + (open ? " is-on" : "")} onClick={onClose} aria-hidden="true" />
      <div
        className={"mh-sheet" + (tall ? " mh-sheet--tall" : "") + (open ? " is-on" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...drag.sheetProps}
      >
        <div className="mh-grab" {...drag.handleProps} />
        <div className="mh-sheet-head" {...drag.handleProps}>
          <div className="mh-sheet-top">
            <div className="mh-sheet-kick">{kicker}</div>
            <button type="button" className="mh-close" onClick={onClose} aria-label="Close">
              <Icon id="i-x" />
            </button>
          </div>
          <h2 className="mh-sheet-t" id={titleId}>
            {title}
          </h2>
          {sub && <div className="mh-sheet-s">{sub}</div>}
        </div>
        <div className="mh-sheet-body">{children}</div>
        {foot && <div className="mh-sheet-foot">{foot}</div>}
      </div>
    </>
  );
}

/* ═════════════════════════════════ PAGE ═════════════════════════════════ */

export type MobileHireProps = {
  /** Every open post on the network, the viewer's own included. */
  posts: HirePost[];
  /** The viewer's own posts, every status. */
  mine: HireOwnPost[];
  viewer: HireViewer;
  initialTab: HireTab;
};

export function MobileHire({
  posts: seedPosts,
  mine: seedMine,
  viewer,
  initialTab,
}: MobileHireProps) {
  const [tab, setTab] = useState<HireTab>(initialTab);
  const [posts, setPosts] = useState(seedPosts);
  const [mine, setMine] = useState(seedMine);

  // Hire-side filters.
  const [q, setQ] = useState("");
  const [trade, setTrade] = useState("");

  // Sheets. Each keeps its subject across the close so the exit animation has
  // something to animate (see the Sheet shell).
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFor, setPickerFor] = useState<"filter" | "trade">("filter");
  const [pickerQ, setPickerQ] = useState("");

  // Composer. The draft lives HERE, not in a keyed child: opening, closing and
  // re-opening the composer must not throw away a half-typed post.
  const [editing, setEditing] = useState<HireOwnPost | null>(null);
  const [draft, setDraft] = useState<PostDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Work-side row state.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<string | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  /** Rows hidden by an optimistic delete that has not come back yet. */
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set<string>());
  /** The broadcast receipt after a successful post. */
  const [receipt, setReceipt] = useState<number | null>(null);
  /** Which post's interested list is expanded, and what it holds. */
  const [openInterest, setOpenInterest] = useState<string | null>(null);
  /** Posts whose interest has been read in THIS visit — the server's own
   *  `newInterest` is a snapshot from page load and cannot know about it. */
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [interest, setInterest] = useState<
    Record<string, InterestedPartyDTO[] | "loading" | string>
  >({});

  // Mirrors for the handlers, so a stale closure can never roll a row back to a
  // state it was not in.
  const postsRef = useRef(posts);
  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  // Tracked timeouts — an unmount mid-sequence must not fire the rest of it
  // into a detached tree.
  const timers = useRef<number[]>([]);
  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((id) => window.clearTimeout(id));
  }, []);

  /* ---------- Sides ------------------------------------------------------- */

  const switchTab = useCallback((next: HireTab) => {
    setTab(next);
    setDetailOpen(false);
    // Keep the URL honest without a server round trip: the interest email
    // deep-links to ?tab=work, and a reload should land where the user was.
    const url = new URL(window.location.href);
    if (next === "work") url.searchParams.set("tab", "work");
    else url.searchParams.delete("tab");
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);

  /* ---------- Hire side --------------------------------------------------- */

  const onInterest = useCallback(async (id: string): Promise<string | null> => {
    const before = postsRef.current.find((p) => p.id === id);
    if (!before) return "That post is gone.";
    setPosts((ps) =>
      ps.map((p) =>
        p.id === id
          ? { ...p, viewerStatus: "INTERESTED", interestedCount: p.interestedCount + 1 }
          : p,
      ),
    );
    const res = await hireExpressInterest(id);
    if (res.ok) return null;
    setPosts((ps) =>
      ps.map((p) =>
        p.id === id
          ? { ...p, viewerStatus: before.viewerStatus, interestedCount: before.interestedCount }
          : p,
      ),
    );
    return res.message;
  }, []);

  /* ---------- The composer, opened from either side ---------------------- */

  const openComposer = useCallback((post: HireOwnPost | null) => {
    setEditing(post);
    // A NEW post keeps whatever was half-typed; only an EDIT re-seeds the form.
    if (post) setDraft(draftFromPost(post));
    setFormErr(null);
    setDone(false);
    setBusy(false);
    setComposerOpen(true);
  }, []);

  const closeComposer = useCallback(() => {
    setComposerOpen(false);
    const wasEditing = editing !== null;
    // The head reads "Edit post" while a post is being edited; clearing the
    // subject now would rewrite it while the box is still on screen.
    later(EXIT_MS, () => {
      setEditing(null);
      // Leaving an EDIT hands the next "Post yourself" a blank form; leaving a
      // half-typed NEW post keeps it.
      if (wasEditing) setDraft(EMPTY_DRAFT);
    });
  }, [editing, later]);

  /** Edit reached from the Hire side's title block: leave the sheet, cross to
   *  Work, and open the composer on that post. */
  const editFromDetail = useCallback(
    (id: string) => {
      const own = mine.find((m) => m.id === id);
      if (!own) return;
      setDetailOpen(false);
      switchTab("work");
      openComposer(own);
    },
    [mine, openComposer, switchTab],
  );

  const submit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (busy) return;
      if (!draft.tradeType) return setFormErr("Pick a trade.");
      if (!draft.title.trim()) return setFormErr("Give the post a headline.");
      setBusy(true);
      setFormErr(null);
      const input = draftToInput(draft);

      if (editing) {
        const res = await hireUpdatePost(editing.id, input);
        setBusy(false);
        if (!res.ok) return setFormErr(res.message);
        const updated = res.data;
        // The update action returns the shared OwnPost shape, which carries
        // no unseen-interest count; keep the row's current one.
        setMine((m) =>
          m.map((p) => (p.id === editing.id ? { ...updated, newInterest: p.newInterest } : p)),
        );
        setPosts((ps) =>
          ps.map((p) =>
            p.id === editing.id
              ? {
                  ...p,
                  title: updated.title,
                  description: updated.description,
                  tradeType: updated.tradeType,
                  specialties: updated.specialties,
                  location: updated.location ?? null,
                  budget: updated.budget ?? null,
                }
              : p,
          ),
        );
        closeComposer();
        return;
      }

      const res = await hireCreatePost(input);
      setBusy(false);
      if (!res.ok) return setFormErr(res.message);
      const own: HireOwnPost = {
        id: res.data.id,
        title: input.title,
        description: input.description,
        tradeType: input.tradeType,
        specialties: input.specialties,
        location: input.location ?? undefined,
        budget: input.budget ?? undefined,
        status: "OPEN",
        hoursAgo: 0,
        broadcastCount: res.data.broadcastCount,
        interestedCount: 0,
        newInterest: 0,
      };
      setMine((m) => [own, ...m]);
      setPosts((ps) => [ownToBoard(own, viewer), ...ps]);
      setDraft(EMPTY_DRAFT);
      setDone(true);
      // The button holds its check for a beat, then the sheet leaves and the
      // new row plus the broadcast receipt take over the confirmation.
      setLanded(own.id);
      setReceipt(res.data.broadcastCount);
      later(POSTED_MS, () => {
        setDone(false);
        setComposerOpen(false);
      });
      later(POSTED_MS + 900, () => setLanded(null));
      later(RECEIPT_MS, () => setReceipt(null));
    },
    [busy, draft, editing, viewer, closeComposer, later],
  );

  /** Delete, optimistically. The row leaves on the tap and comes back only if
   *  the server refuses — the owner's call: it "really slow to respond". */
  const remove = useCallback(
    (id: string) => {
      setConfirmId(null);
      setRowErr(null);
      setLeaving((s) => new Set(s).add(id));
      // The board copy goes too, so the Hire side agrees with the Work side.
      const boardRow = postsRef.current.find((p) => p.id === id) ?? null;
      const boardAt = postsRef.current.findIndex((p) => p.id === id);
      setPosts((ps) => ps.filter((p) => p.id !== id));
      if (editing?.id === id) closeComposer();
      void hireDeletePost(id).then((res) => {
        if (res.ok) {
          setMine((m) => m.filter((p) => p.id !== id));
          setLeaving((s) => {
            const n = new Set(s);
            n.delete(id);
            return n;
          });
          return;
        }
        setLeaving((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
        if (boardRow) {
          setPosts((ps) => {
            const next = [...ps];
            next.splice(Math.max(0, boardAt), 0, boardRow);
            return next;
          });
        }
        setRowErr(res.message);
      });
    },
    [editing, closeComposer],
  );

  /** The interested count is a disclosure: it expands into who answered, with
   *  their email and phone, so a poster can act without leaving the page. */
  const toggleInterest = useCallback(
    (id: string) => {
      if (openInterest === id) return setOpenInterest(null);
      setOpenInterest(id);
      // Unfolding IS looking: clear the post's unseen counter here and stamp
      // the server without anything on screen waiting for it.
      setSeen((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
      void markPostInterestSeen(id);
      if (interest[id] !== undefined && interest[id] !== "loading") return;
      setInterest((m) => ({ ...m, [id]: "loading" }));
      void getPostInterest(id).then((r) =>
        setInterest((m) => ({ ...m, [id]: r.ok ? r.data : r.message })),
      );
    },
    [openInterest, interest],
  );

  /* ---------- Derived ----------------------------------------------------- */

  const filtered = useMemo(
    () => posts.filter((p) => (!trade || p.tradeType === trade) && matchesQuery(p, q)),
    [posts, q, trade],
  );
  const detail = detailId ? (posts.find((p) => p.id === detailId) ?? null) : null;
  const filtering = q.trim() !== "" || trade !== "";
  // Answers across all of this author's posts that they have not opened yet.
  // Drawn on the Work tab (owner, 2026-09-03) rather than on each post: the
  // badge exists to pull you to the side where the answers are.
  const newInterest = mine.reduce((n, p) => (seen.has(p.id) ? n : n + p.newInterest), 0);

  const visibleMine = mine.filter((p) => !leaving.has(p.id));
  const openCount = posts.length;
  const myOpen = visibleMine.filter((p) => p.status === "OPEN").length;

  /* ---------- Motion: reveal on load, row cascade on arrival -------------- */
  // Applied ONCE per side, to the blocks that exist then. Never through a
  // MutationObserver: this page re-renders on every search keystroke, and an
  // observer would replay the whole entrance each time a character is typed —
  // which reads as the list wiping itself.
  const scrollRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (reducedMotion()) return;
    const content = contentRef.current;
    if (!content) return;
    const blocks = Array.from(content.children) as HTMLElement[];
    blocks.forEach((el, i) => {
      el.classList.add("mh-rv");
      el.style.transitionDelay = `${i * 60}ms`;
    });
    const raf = requestAnimationFrame(() => {
      blocks.forEach((el) => el.classList.add("mh-rv-in"));
    });
    const settled = window.setTimeout(
      () => {
        blocks.forEach((el) => {
          el.style.transitionDelay = "";
        });
      },
      60 * blocks.length + 460,
    );
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settled);
    };
  }, []);

  // The rows cascade when a SIDE arrives — a deliberate switch, or the first
  // paint. `tab` is the only dependency on purpose.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    staggerIn(Array.from(el.querySelectorAll<HTMLElement>(".mh-row")).slice(0, STAGGER_MAX));
  }, [tab]);

  /* ---------- Motion: graph-paper parallax -------------------------------- */
  useEffect(() => {
    if (reducedMotion()) return;
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

  /* ---------- Motion: press stamp, delegated from the root ---------------- */
  const onRootClick = useCallback((e: React.MouseEvent) => {
    if (reducedMotion()) return;
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(
      ".mh-btn, .mh-side-b, .mh-unit-b, .mh-act, .mh-close",
    );
    if (!el) return;
    el.classList.remove("mh-pressed");
    void el.offsetWidth;
    el.classList.add("mh-pressed");
  }, []);
  const onRootAnimEnd = useCallback((e: React.AnimationEvent) => {
    const el = e.target as HTMLElement;
    if (el.classList?.contains("mh-pressed")) el.classList.remove("mh-pressed");
  }, []);

  /* ---------- Escape closes the topmost sheet ----------------------------- */
  useEffect(() => {
    if (!pickerOpen && !composerOpen && !detailOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (pickerOpen) setPickerOpen(false);
      else if (composerOpen) closeComposer();
      else setDetailOpen(false);
    };
    // Capture, so this runs before MobileNav's own Escape (its drawer).
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [pickerOpen, composerOpen, detailOpen, closeComposer]);

  /* ---------- Composer helpers -------------------------------------------- */

  const set = <K extends keyof PostDraft>(k: K, v: PostDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const openPicker = (which: "filter" | "trade") => {
    setPickerFor(which);
    setPickerQ("");
    setPickerOpen(true);
  };

  const pickerValue = pickerFor === "filter" ? trade : draft.tradeType;
  const pickerList = useMemo(() => {
    const needle = pickerQ.trim().toLowerCase();
    if (!needle) return TRADES;
    return TRADES.filter((t) => t.toLowerCase().includes(needle));
  }, [pickerQ]);

  /* ═════════════════════════════ RENDER ═════════════════════════════ */

  return (
    <div className="jf-mobile-hire" onClick={onRootClick} onAnimationEnd={onRootAnimEnd}>
      {/* Shared handheld chrome: dark topbar + slide-out drawer + icon sprite.
          It owns its own state and reads its token contract off this root. */}
      <MobileNav />

      <main className="mh-scroll" ref={scrollRef}>
        <div className="mh-content" ref={contentRef}>
          <div className="mh-head">
            <div className="mh-kick">
              {openCount} open {openCount === 1 ? "post" : "posts"}
              {myOpen > 0 ? ` · ${myOpen} by you` : ""}
            </div>
            <h1 className="mh-title">Hire &amp; Work</h1>
          </div>

          {/* The two sides. A joined two-stamp switch, the desktop's own
              treatment at a thumb-sized scale. */}
          <div className="mh-side" role="group" aria-label="Side of the board">
            <button
              type="button"
              aria-pressed={tab === "hire"}
              className={"mh-side-b" + (tab === "hire" ? " is-on" : "")}
              onClick={() => switchTab("hire")}
            >
              <Icon id="i-search" />
              Hire
            </button>
            <button
              type="button"
              aria-pressed={tab === "work"}
              className={"mh-side-b" + (tab === "work" ? " is-on" : "")}
              onClick={() => switchTab("work")}
            >
              <Icon id="i-file" />
              Work
              {newInterest > 0 && (
                <span className="mh-tab-n" aria-label={`${newInterest} new`}>
                  {newInterest > 99 ? "99+" : newInterest}
                </span>
              )}
            </button>
          </div>

          {tab === "hire" ? (
            <>
              {/* Search sticks to the top of the scroller: the board can run
                  long, and finding your own post is a stated requirement, so
                  the query must never be a scroll away. */}
              <div className="mh-bar">
                <label className="mh-search">
                  <Icon id="i-search" />
                  <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search name, trade, city"
                    aria-label="Search posts"
                    autoComplete="off"
                  />
                  {q && (
                    <button
                      type="button"
                      className="mh-search-x"
                      onClick={() => setQ("")}
                      aria-label="Clear search"
                    >
                      <Icon id="i-x" />
                    </button>
                  )}
                </label>
                <div className="mh-bar-row">
                  <button
                    type="button"
                    className={"mh-pick" + (trade ? " is-set" : "")}
                    aria-haspopup="listbox"
                    onClick={() => openPicker("filter")}
                  >
                    <Icon id="i-filter" />
                    <span className="mh-pick-v">{trade || "All trades"}</span>
                    <Icon id="i-chev" />
                  </button>
                  {/* Only while filtering. Unfiltered it restated the page
                      kicker word for word, which the brief bans outright. */}
                  {filtering && (
                    <span className="mh-count" aria-live="polite">
                      {filtered.length} of {posts.length}
                    </span>
                  )}
                </div>
              </div>

              {filtered.length ? (
                <div className="mh-list" role="listbox" aria-label="Posts" ref={listRef}>
                  {filtered.map((p) => {
                    const rate = parseRate(p.budget);
                    const isSel = detailId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="option"
                        aria-selected={detailOpen && isSel}
                        // Roving tabindex — the listbox pattern wants ONE
                        // tabbable option, not 200 stops down the page.
                        tabIndex={isSel || (!detailId && p.id === filtered[0].id) ? 0 : -1}
                        className={"mh-row" + (isSel ? " is-sel" : "")}
                        onClick={() => {
                          setDetailId(p.id);
                          setDetailOpen(true);
                        }}
                      >
                        <span className="mh-plate" aria-hidden="true">
                          {initials(p.postedBy)}
                        </span>
                        <span className="mh-main">
                          <span className="mh-nameline">
                            <b className="mh-name" title={p.postedBy}>
                              {p.postedBy}
                            </b>
                            {p.isOwnPost && <span className="mh-you">You</span>}
                            {p.isMine && !p.isOwnPost && (
                              <span className="mh-you mh-you--org">Your company</span>
                            )}
                            {!p.isMine && p.viewerStatus === "INTERESTED" && (
                              <span className="mh-chip is-ok">Interested</span>
                            )}
                          </span>
                          <span className="mh-headline" title={p.title}>
                            {p.title}
                          </span>
                          <span className="mh-meta">
                            {p.tradeType} · {p.location ?? p.company} · {agoLabel(p.hoursAgo)}
                          </span>
                        </span>
                        {rate && (
                          /* An unparsed budget is free text up to 80
                             characters; only a PARSED figure gets the numeral
                             treatment, or one long string takes the row. */
                          <span className={"mh-rate" + (rate.unit ? "" : " mh-rate--raw")}>
                            <b>{rate.amount}</b>
                            {rate.unit && <span>{unitShort(rate.unit)}</span>}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : posts.length ? (
                <div className="mh-empty">
                  <b>No posts match</b>
                  <span>Try a wider trade or a shorter search</span>
                  <button
                    type="button"
                    className="mh-btn mh-btn-ghost"
                    onClick={() => {
                      setQ("");
                      setTrade("");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="mh-empty">
                  <b>No one has posted yet</b>
                  <span>Be the first on the board</span>
                  <button
                    type="button"
                    className="mh-btn mh-btn-primary"
                    onClick={() => switchTab("work")}
                  >
                    <Icon id="i-fileplus" />
                    Post yourself
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {receipt !== null && (
                <div className="mh-sent" role="status">
                  <Icon id="i-check" />
                  {receipt > 0
                    ? `Sent to ${receipt} ${receipt === 1 ? "contractor" : "contractors"}`
                    : "Live on the board"}
                </div>
              )}

              {rowErr && (
                <div className="mh-err" role="alert">
                  {rowErr}
                </div>
              )}

              {visibleMine.length ? (
                <div className="mh-list" ref={listRef}>
                  {visibleMine.map((p) => {
                    const rate = parseRate(p.budget);
                    const open = p.status === "OPEN";
                    const list = interest[p.id];
                    const isOpenList = openInterest === p.id;
                    const unseen = seen.has(p.id) ? 0 : p.newInterest;
                    return (
                      <div
                        key={p.id}
                        className={
                          "mh-row mh-mrow" +
                          (editing?.id === p.id && composerOpen ? " is-editing" : "") +
                          (landed === p.id ? " is-new" : "")
                        }
                      >
                        <div className="mh-main">
                          <div className="mh-nameline">
                            <b className="mh-name" title={p.title}>
                              {p.title}
                            </b>
                            <span className={"mh-chip is-" + p.status.toLowerCase()}>
                              {STATUS_LABEL[p.status]}
                            </span>
                          </div>
                          <div className="mh-meta">
                            {p.tradeType}
                            {p.location ? ` · ${p.location}` : ""}
                            {rate ? ` · ${rate.amount} ${unitShort(rate.unit)}`.trimEnd() : ""} ·{" "}
                            {agoLabel(p.hoursAgo)}
                          </div>

                          {/* The count is a disclosure, not a statistic: it
                              opens into who answered and how to reach them. */}
                          {p.interestedCount > 0 ? (
                            <button
                              type="button"
                              className={
                                "mh-int" +
                                (isOpenList ? " is-on" : "") +
                                (unseen > 0 ? " has-new" : "")
                              }
                              aria-expanded={isOpenList}
                              onClick={() => toggleInterest(p.id)}
                            >
                              Interested
                              <b className="mh-int-n">{p.interestedCount}</b>
                              <Icon id="i-chev" />
                            </button>
                          ) : (
                            <span className="mh-int mh-int--none">No answers yet</span>
                          )}

                          {isOpenList && (
                            <div className="mh-ilist">
                              {list === "loading" || list === undefined ? (
                                <div className="mh-inote">Loading…</div>
                              ) : typeof list === "string" ? (
                                <div className="mh-inote is-bad">{list}</div>
                              ) : list.length === 0 ? (
                                <div className="mh-inote">Nobody has answered yet.</div>
                              ) : (
                                list.map((who) => (
                                  <div key={who.id} className="mh-irow">
                                    <b className="mh-name" title={who.name}>
                                      {who.name}
                                    </b>
                                    <span className="mh-meta">
                                      {who.company ?? "—"} · {agoLabel(who.agoHours)}
                                    </span>
                                    <a
                                      className="mh-mono"
                                      href={`mailto:${who.email}?subject=${encodeURIComponent(p.title)}`}
                                    >
                                      {who.email}
                                    </a>
                                    {who.phone && (
                                      <a
                                        className="mh-mono"
                                        href={`tel:${who.phone.replace(/[^\d+]/g, "")}`}
                                      >
                                        {formatPhone(who.phone)}
                                      </a>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          )}

                          <div className="mh-acts">
                            {open && (
                              <button
                                type="button"
                                className="mh-act"
                                onClick={() => openComposer(p)}
                              >
                                Edit
                              </button>
                            )}
                            {confirmId === p.id ? (
                              <>
                                <span className="mh-act-q">Delete?</span>
                                <button
                                  type="button"
                                  className="mh-act is-danger"
                                  onClick={() => remove(p.id)}
                                >
                                  Yes
                                </button>
                                <button
                                  type="button"
                                  className="mh-act"
                                  onClick={() => setConfirmId(null)}
                                >
                                  No
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="mh-act is-danger"
                                onClick={() => setConfirmId(p.id)}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mh-empty">
                  <b>No posts yet</b>
                  <span>
                    {viewer.canPost
                      ? "Write one and it lands on the board"
                      : "Only owners and managers can post for the company"}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* ============ THUMB-ZONE FOOT ============
          A grid ROW of the shell, not `position: sticky` inside the scroller: a
          row is deterministic at every viewport, cannot be outrun by an
          overscroll, and reserves its own space so the last row is never
          covered. Work only — on Hire the primary action belongs to the person
          you picked, and lives in the title block's own foot. */}
      {tab === "work" && viewer.canPost && (
        <div className="mh-foot">
          <button
            type="button"
            className="mh-btn mh-btn-primary mh-btn-wide"
            onClick={() => openComposer(null)}
          >
            <Icon id="i-fileplus" />
            Post yourself
          </button>
        </div>
      )}

      {/* ══════════════ THE TITLE BLOCK — who this is, and how to reach them
          Company / phone / email / JobFlex reviews as a boxed grid of labelled
          cells, the way a drawing's title block names who drew it. ══════════ */}
      <Sheet
        open={detailOpen && !!detail}
        onClose={() => setDetailOpen(false)}
        kicker="Available for work"
        titleId="mhDetailTitle"
        title={detail?.postedBy ?? ""}
        sub={
          detail
            ? `${detail.tradeType}${detail.location ? ` · ${detail.location}` : ""} · posted ${agoLabel(detail.hoursAgo)}`
            : undefined
        }
        foot={
          detail ? (
            <DetailFoot post={detail} onInterest={onInterest} onEdit={editFromDetail} />
          ) : null
        }
      >
        {detail && <DetailBody post={detail} />}
      </Sheet>

      {/* ══════════════ THE COMPOSER ══════════════ */}
      <Sheet
        open={composerOpen}
        onClose={closeComposer}
        tall
        kicker={editing ? "Your post" : "New listing"}
        titleId="mhComposerTitle"
        title={editing ? "Edit post" : "Post yourself"}
        foot={
          <>
            <button
              type="submit"
              form="mhPostForm"
              className={"mh-btn mh-btn-primary" + (done ? " is-done" : "")}
              disabled={busy}
            >
              <Icon id={done ? "i-check" : "i-send"} />
              {editing ? (busy ? "Saving…" : "Save") : done ? "Posted" : busy ? "Posting…" : "Post"}
            </button>
            <button type="button" className="mh-btn mh-btn-ghost" onClick={closeComposer}>
              Cancel
            </button>
          </>
        }
      >
        <form id="mhPostForm" onSubmit={submit} noValidate className="mh-form">
          <div className="mh-fld">
            <span className="mh-lbl">Trade</span>
            {/* The handheld twin of the desktop's HireSelect: a drawn trigger
                whose menu is a bottom sheet WITH A SEARCH FIELD (explicit owner
                request — twenty-one trades is too many to hunt through), rather
                than a pointer-anchored popover a thumb cannot reach. */}
            <button
              type="button"
              className={"mh-pick" + (draft.tradeType ? " is-set" : "")}
              aria-haspopup="listbox"
              aria-label="Trade"
              onClick={() => openPicker("trade")}
            >
              <span className="mh-pick-v">{draft.tradeType || "Pick a trade"}</span>
              <Icon id="i-chev" />
            </button>
          </div>

          <div className="mh-fld">
            <span className="mh-lbl">City</span>
            <AddressField
              cityOnly
              id="mhCity"
              value={draft.location}
              placeholder="Snohomish, WA"
              onPick={(p) => set("location", p.formatted)}
            />
          </div>

          <label className="mh-fld">
            <span className="mh-lbl">Headline</span>
            <input
              className="mh-in"
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Licensed electrician, 12 years"
              maxLength={200}
              required
            />
          </label>

          <div className="mh-fld">
            <span className="mh-lbl">Rate</span>
            <div className="mh-money-row">
              <span className="mh-money">
                <i aria-hidden="true">$</i>
                <input
                  className="mh-in"
                  inputMode="decimal"
                  value={draft.rateMin}
                  onChange={(e) => set("rateMin", e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="90"
                  aria-label="Rate from"
                  maxLength={9}
                />
              </span>
              <span className="mh-dash" aria-hidden="true">
                –
              </span>
              <span className="mh-money">
                <i aria-hidden="true">$</i>
                <input
                  className="mh-in"
                  inputMode="decimal"
                  value={draft.rateMax}
                  onChange={(e) => set("rateMax", e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="150"
                  aria-label="Rate to"
                  maxLength={9}
                />
              </span>
            </div>
            {/* Three options, laid out flat rather than behind a sheet: a
                closed set this small is faster to read than to open. */}
            <div className="mh-unit" role="group" aria-label="Rate unit">
              {RATE_UNITS.map((u) => (
                <button
                  key={u.key}
                  type="button"
                  className={"mh-unit-b" + (draft.rateUnit === u.key ? " is-on" : "")}
                  aria-pressed={draft.rateUnit === u.key}
                  onClick={() => set("rateUnit", u.key as RateUnit)}
                >
                  {u.label.replace("per ", "/ ")}
                </button>
              ))}
            </div>
          </div>

          <label className="mh-fld">
            <span className="mh-lbl">Details</span>
            <textarea
              className="mh-in mh-ta"
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Licenses, years in the trade, availability, what you bring."
              rows={5}
              maxLength={20000}
            />
          </label>

          {formErr && (
            <div className="mh-err" role="alert">
              {formErr}
            </div>
          )}

          <p className="mh-note">
            Your name, company, phone and email are shown on the post so people can reach you.
          </p>
        </form>
      </Sheet>

      {/* ══════════════ THE TRADE PICKER ══════════════ */}
      <Sheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        kicker={pickerFor === "filter" ? "Filter" : "Your post"}
        titleId="mhPickerTitle"
        title="Trade"
      >
        <label className="mh-search mh-search--sheet">
          <Icon id="i-search" />
          <input
            type="search"
            value={pickerQ}
            onChange={(e) => setPickerQ(e.target.value)}
            placeholder="Type to find a trade"
            aria-label="Find a trade"
            autoComplete="off"
          />
        </label>
        <div className="mh-opts" role="listbox" aria-label="Trade">
          {pickerFor === "filter" && !pickerQ.trim() && (
            <button
              type="button"
              role="option"
              aria-selected={trade === ""}
              className={"mh-opt" + (trade === "" ? " is-on" : "")}
              onClick={() => {
                setTrade("");
                setPickerOpen(false);
              }}
            >
              All trades
              {trade === "" && <Icon id="i-check" />}
            </button>
          )}
          {pickerList.map((t) => (
            <button
              key={t}
              type="button"
              role="option"
              aria-selected={pickerValue === t}
              className={"mh-opt" + (pickerValue === t ? " is-on" : "")}
              onClick={() => {
                if (pickerFor === "filter") setTrade(t);
                else set("tradeType", t);
                setPickerOpen(false);
              }}
            >
              {t}
              {pickerValue === t && <Icon id="i-check" />}
            </button>
          ))}
          {pickerList.length === 0 && (
            <div className="mh-opt-none">No trade matches “{pickerQ.trim()}”</div>
          )}
        </div>
      </Sheet>
    </div>
  );
}

/* ═══════════════════════ THE TITLE BLOCK — body ═══════════════════════ */

function DetailBody({ post }: { post: HirePost }) {
  const rate = parseRate(post.budget);
  const { reviews } = post;
  const mailto = `mailto:${post.email}?subject=${encodeURIComponent(`${post.title} — JobFlex`)}`;

  return (
    <>
      {rate && (
        <div className={"mh-tb-rate" + (rate.unit ? "" : " is-raw")}>
          <b>{rate.amount}</b>
          {rate.unit && <span>{unitLabel(rate.unit)}</span>}
        </div>
      )}

      <p className="mh-tb-headline">{post.title}</p>
      {post.description.trim() && <p className="mh-tb-desc">{post.description.trim()}</p>}
      {/* Read-only. The composer no longer collects these; a post created at
          /trade-services still carries them, and they still say something. */}
      {post.specialties.length > 0 && (
        <div className="mh-tb-tags">
          {post.specialties.map((s) => (
            <span key={s} className="mh-tag">
              {s}
            </span>
          ))}
        </div>
      )}

      <dl className="mh-tb-grid">
        <div className="mh-tb-cell">
          <dt>Company</dt>
          <dd>{post.company}</dd>
        </div>
        <div className="mh-tb-cell">
          <dt>Phone</dt>
          <dd>
            {post.phone ? (
              <a className="mh-mono" href={`tel:${post.phone.replace(/[^\d+]/g, "")}`}>
                {formatPhone(post.phone)}
              </a>
            ) : (
              <span className="mh-dim">Not listed</span>
            )}
          </dd>
        </div>
        <div className="mh-tb-cell">
          <dt>Email</dt>
          <dd>
            <a className="mh-mono" href={mailto}>
              {post.email}
            </a>
          </dd>
        </div>
        <div className="mh-tb-cell">
          <dt>JobFlex reviews</dt>
          <dd>
            {reviews.count > 0 && reviews.avg != null ? (
              <span
                className="mh-rating"
                aria-label={`${reviews.avg.toFixed(1)} out of 5 from ${reviews.count} reviews`}
              >
                <Squares value={reviews.avg} />
                {reviews.avg.toFixed(1)} · {reviews.count}{" "}
                {reviews.count === 1 ? "review" : "reviews"}
              </span>
            ) : (
              <span className="mh-dim">No reviews yet</span>
            )}
          </dd>
        </div>
      </dl>

      {reviews.latest.length > 0 && (
        <div className="mh-quotes">
          {reviews.latest.map((r, i) => (
            <blockquote key={i} className="mh-quote">
              <div className="mh-quote-k">
                <Squares value={r.rating} />
                <span>
                  {r.client ?? "Client"} · {r.when}
                </span>
              </div>
              <p>{r.comment}</p>
            </blockquote>
          ))}
        </div>
      )}
    </>
  );
}

/* ═══════════════════ THE TITLE BLOCK — thumb-zone foot ═══════════════════
   Four states, gated on AUTHORSHIP, not on the company:
     · you wrote it            → the stamp and Edit;
     · a colleague wrote it    → whose it is, and Email — only its author may
                                 edit it, and interest is refused org-internally;
     · you already answered    → the acknowledgement, and Email;
     · anyone else             → I'm interested, and Email.                   */

function DetailFoot({
  post,
  onInterest,
  onEdit,
}: {
  post: HirePost;
  onInterest: (id: string) => Promise<string | null>;
  onEdit: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mailto = `mailto:${post.email}?subject=${encodeURIComponent(`${post.title} — JobFlex`)}`;

  const interested = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const msg = await onInterest(post.id);
    setBusy(false);
    if (msg) setErr(msg);
  };

  return (
    <>
      {err && (
        <div className="mh-err mh-err--foot" role="alert">
          {err}
        </div>
      )}
      {post.isOwnPost ? (
        <>
          <span className="mh-stamp">Your post</span>
          <button type="button" className="mh-btn mh-btn-ghost" onClick={() => onEdit(post.id)}>
            <Icon id="i-file" />
            Edit
          </button>
        </>
      ) : post.isMine ? (
        <>
          <span className="mh-stamp mh-stamp--org">Posted by your company</span>
          <a className="mh-btn mh-btn-ghost" href={mailto}>
            <Icon id="i-send" />
            Email
          </a>
        </>
      ) : post.viewerStatus === "INTERESTED" ? (
        <>
          <span className="mh-said">
            <Icon id="i-check" />
            Interested · they know
          </span>
          <a className="mh-btn mh-btn-ghost" href={mailto}>
            <Icon id="i-send" />
            Email
          </a>
        </>
      ) : (
        <>
          <button
            type="button"
            className="mh-btn mh-btn-primary"
            disabled={busy}
            onClick={interested}
          >
            <Icon id="i-thumb" />
            {busy ? "Sending…" : "I'm interested"}
          </button>
          <a className="mh-btn mh-btn-ghost" href={mailto}>
            <Icon id="i-send" />
            Email
          </a>
        </>
      )}
    </>
  );
}
