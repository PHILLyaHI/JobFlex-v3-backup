"use client";

/* ─────────────────────────────────────────────────────────────────────────
   HIRE & WORK — /dashboard/hire   (rebuilt from scratch, 2026-09-03)

   THESIS: a drawing SCHEDULE and a TITLE BLOCK. The people offering work are
   read as a schedule table (name, trade, city, rate); the one you pick is laid
   out as the title block of a drawing — the boxed grid of labelled cells that
   says who drew it, the company, the phone. It refuses the card-grid gallery,
   the profile modal and the hub-of-doors the old page had: one sheet, two
   sides.
   OWN-WORLD: JobFlex blueprint, pinned — paper, 2px ink frames, blueprint
   blue on the primary action, the active side and links only, JetBrains Mono
   for the annotation layer (rates, cities, ages, cell labels), Inter 900 caps
   headings, hard 3px offset shadows, 2px corners, dashed empty notes.
   STORY: open Hire, read the schedule, pick a row; the title block says who
   this is, what they charge, how JobFlex clients rated them, and offers two
   actions — I'm interested (bell + email to the poster) and Email. On Work,
   write one post, watch it land on the schedule stamped YOU, and see who
   answered it.
   FIRST VIEWPORT: live-count kicker + HIRE & WORK + a joined two-stamp side
   switch; below, a 1.15fr / 0.85fr split — search + trade filter over the
   schedule on the left, the sticky title block for the first row on the
   right with the primary action at its foot.
   FORM: master–detail ledger with a title block; first of five candidates
   (card grid + drawer, feed + inline expand, directory + route detail, hub
   doors — declined). No seed roll: the brief was precise.
   FINISH: unreviewed and undocumented is unfinished; this build ends with the
   finish review, the verdict, DESIGN.md, and every shipping raster carrying
   its provenance.
   ───────────────────────────────────────────────────────────────────────── */

// The sidebar, topbar, graph-paper field and sprite come from the shared
// shell (components/v3/blueprint-shell); this component renders only the
// `.content` children. Styling is `./hire.css` — a PLAIN stylesheet whose
// every selector is scoped `.jf-blueprint .content .hm-*`. Never a CSS module
// here: hashing leaves element and `*` selectors unscoped, which has
// flattened the whole app twice (css-modules-break-blueprint-ports).
//
// State is React state. Both lists arrive from the server page; every write
// goes through actions/tradeServices and the board is patched in place on
// success, so the person who pressed a button sees the result without a
// reload and without a re-fetch. The writes go through the `hire*` RESULT
// wrappers rather than the throwing actions: Next redacts a thrown message in
// production, so a returned one is the only way the user reads the real
// sentence the server wrote for them.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  hireCreatePost,
  hireDeletePost,
  hireExpressInterest,
  hireUpdatePost,
} from "@/actions/tradeServices";
import { HireBrowse } from "./hire-browse";
import { HireWork } from "./hire-work";
import {
  EMPTY_DRAFT,
  draftFromPost,
  draftToInput,
  ownToBoard,
  type HireOwnPost,
  type HirePost,
  type HireTab,
  type HireViewer,
  type PostDraft,
} from "./hire-data";
import "./hire.css";

/** useLayoutEffect warns during SSR; useEffect is inert there. */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

export function HireContent({
  posts: seedPosts,
  mine: seedMine,
  viewer,
  initialTab,
}: {
  /** Every open post on the network, the viewer's own included. */
  posts: HirePost[];
  /** The viewer's own posts, every status. */
  mine: HireOwnPost[];
  viewer: HireViewer;
  initialTab: HireTab;
}) {
  const [tab, setTab] = useState<HireTab>(initialTab);
  // Working copies of the server lists. The route is force-dynamic and a
  // navigation remounts this component, so a visit always starts from fresh
  // rows; between visits the copies are patched by the handlers below.
  const [posts, setPosts] = useState(seedPosts);
  const [mine, setMine] = useState(seedMine);
  const [editing, setEditing] = useState<HireOwnPost | null>(null);
  // The composer's draft lives HERE, not in HireWork. HireWork is keyed on the
  // post being edited and the body is keyed on the side, so a draft held down
  // there died silently the moment you pressed Edit or switched to Hire.
  const [draft, setDraft] = useState<PostDraft>(EMPTY_DRAFT);
  const [armed, setArmed] = useState(false);
  /** Posts whose interest has been read in THIS visit. Lives HERE rather than
   *  in HireWork because the unseen total is drawn on the Work tab, which this
   *  component owns — and because HireWork is remounted on every edit. */
  const [seenPosts, setSeenPosts] = useState<ReadonlySet<string>>(() => new Set<string>());
  const markPostSeen = useCallback((id: string) => {
    setSeenPosts((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  // Mirrors for the handlers below, so a stale closure can never roll a row
  // back to a state it was not in.
  const postsRef = useRef(posts);
  const mineRef = useRef(mine);
  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);
  useEffect(() => {
    mineRef.current = mine;
  }, [mine]);

  // One in-flight interest call per post, tracked in the PARENT: the title
  // block is keyed on the selected row, so a guard living down there was
  // cleared by selecting away and back mid-flight, which let the optimistic
  // increment run twice against one idempotent server call.
  const interestInFlight = useRef(new Set<string>());

  // `.main` is the scroll container; a new visit must not inherit the
  // previous page's offset.
  useIsoLayoutEffect(() => {
    const main = document.querySelector<HTMLElement>(".jf-blueprint .main");
    if (main) main.scrollTop = 0;
  }, []);

  // Entrance — the head and the columns cascade in (opacity + 14px, 60ms
  // stagger: the house "Balanced" page-load pattern). Replayed on each side
  // switch, because the body remounts. A layout effect runs before paint, so
  // the un-armed frame is never seen.
  useIsoLayoutEffect(() => {
    setArmed(false);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setArmed(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [tab]);

  const switchTab = useCallback((next: HireTab) => {
    setTab(next);
    if (next === "hire") setEditing(null);
    // Keep the URL honest without a server round trip: the interest email
    // deep-links to ?tab=work, and a reload should land where the user was.
    const url = new URL(window.location.href);
    if (next === "work") url.searchParams.set("tab", "work");
    else url.searchParams.delete("tab");
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);

  // ── Hire side ────────────────────────────────────────────────────────────
  const onInterest = useCallback(async (id: string): Promise<string | null> => {
    if (interestInFlight.current.has(id)) return null;
    const before = postsRef.current.find((p) => p.id === id);
    if (!before) return "That post is gone.";
    interestInFlight.current.add(id);
    setPosts((ps) =>
      ps.map((p) =>
        p.id === id
          ? { ...p, viewerStatus: "INTERESTED", interestedCount: p.interestedCount + 1 }
          : p,
      ),
    );
    const res = await hireExpressInterest(id);
    interestInFlight.current.delete(id);
    if (res.ok) return null;
    // Undo the increment rather than restoring a snapshot: another row's
    // update may have landed in between, and a snapshot would overwrite it.
    setPosts((ps) =>
      ps.map((p) =>
        p.id === id
          ? {
              ...p,
              viewerStatus: before.viewerStatus,
              interestedCount: Math.max(0, p.interestedCount - 1),
            }
          : p,
      ),
    );
    return res.message;
  }, []);

  const onEdit = useCallback(
    (id: string) => {
      const p = mineRef.current.find((m) => m.id === id);
      if (!p) return;
      setEditing(p);
      setDraft(draftFromPost(p));
      switchTab("work");
    },
    [switchTab],
  );

  // ── Work side ────────────────────────────────────────────────────────────
  const onPost = useCallback(
    async (d: PostDraft): Promise<{ error: string | null; broadcastCount: number }> => {
      const input = draftToInput(d);
      const res = await hireCreatePost(input);
      if (!res.ok) return { error: res.message, broadcastCount: 0 };
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
      return { error: null, broadcastCount: res.data.broadcastCount };
    },
    [viewer],
  );

  const onSave = useCallback(async (id: string, d: PostDraft): Promise<string | null> => {
    const res = await hireUpdatePost(id, draftToInput(d));
    if (!res.ok) return res.message;
    const updated = res.data;
    // The update action returns the shared OwnPost shape, which has no
    // unseen-interest count — that is this page's own read. Keep the row's
    // current one rather than dropping it to undefined.
    setMine((m) => m.map((p) => (p.id === id ? { ...updated, newInterest: p.newInterest } : p)));
    setPosts((ps) =>
      ps.map((p) =>
        p.id === id
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
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    return null;
  }, []);

  const onCancelEdit = useCallback(() => {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
  }, []);

  /** Optimistic on the caller's side: HireWork hides the row the moment this
   *  is called and only puts it back if a message comes out. */
  const onDelete = useCallback(async (id: string): Promise<string | null> => {
    const snapshotMine = mineRef.current;
    const snapshotPosts = postsRef.current;
    setMine((m) => m.filter((p) => p.id !== id));
    setPosts((ps) => ps.filter((p) => p.id !== id));
    setEditing((e) => (e?.id === id ? null : e));
    const res = await hireDeletePost(id);
    if (res.ok) return null;
    setMine(snapshotMine);
    setPosts(snapshotPosts);
    return res.message;
  }, []);

  const openCount = posts.length;
  const myOpen = mine.filter((p) => p.status === "OPEN").length;
  // Answers across all of this author's posts that they have not opened yet.
  // Sits on the Work tab (owner, 2026-09-03) rather than on each post: the
  // point of the badge is to pull you to the side where the answers are.
  const newInterest = mine.reduce(
    (n, p) => (seenPosts.has(p.id) ? n : n + p.newInterest),
    0,
  );

  return (
    <>
      <div className={"page-head hm-head hm-rv" + (armed ? " hm-armed" : "")} style={stagger(0)}>
        <div>
          <div className="kicker">
            {openCount} open {openCount === 1 ? "post" : "posts"}
            {myOpen > 0 ? ` · ${myOpen} by you` : ""}
          </div>
          <h1 className="page-title">Hire &amp; Work</h1>
        </div>
        {/* A plain group of pressed buttons, NOT role="tablist": the switch
            swaps the whole body rather than revealing a panel, so there is no
            tabpanel to point aria-controls at, and claiming the tab role
            promises arrow-key navigation this widget does not implement. */}
        <div className="page-actions hm-switch" role="group" aria-label="Side of the board">
          <button
            type="button"
            aria-pressed={tab === "hire"}
            className={"btn hm-tab" + (tab === "hire" ? " is-on" : "")}
            onClick={() => switchTab("hire")}
          >
            <svg className="ic hm-ic" aria-hidden="true">
              <use href="#i-search" />
            </svg>
            Hire
          </button>
          <button
            type="button"
            aria-pressed={tab === "work"}
            className={"btn hm-tab" + (tab === "work" ? " is-on" : "")}
            onClick={() => switchTab("work")}
          >
            <svg className="ic hm-ic" aria-hidden="true">
              <use href="#i-pen" />
            </svg>
            Work
            {newInterest > 0 && (
              <span className="hm-tab-n" aria-label={`${newInterest} new`}>
                {newInterest > 99 ? "99+" : newInterest}
              </span>
            )}
          </button>
        </div>
      </div>

      <div key={tab} className={"hm-body" + (armed ? " hm-armed" : "")}>
        {tab === "hire" ? (
          <HireBrowse
            posts={posts}
            onInterest={onInterest}
            onEdit={onEdit}
            onGoWork={() => switchTab("work")}
          />
        ) : (
          <HireWork
            // Keyed on the post being edited: entering or leaving edit mode
            // remounts the composer. The draft is the parent's, so nothing
            // typed is lost by the remount.
            key={editing?.id ?? "new"}
            mine={mine}
            editing={editing}
            canPost={viewer.canPost}
            draft={draft}
            onDraft={setDraft}
            seenPosts={seenPosts}
            onPostSeen={markPostSeen}
            onPost={onPost}
            onSave={onSave}
            onCancelEdit={onCancelEdit}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )}
      </div>
    </>
  );
}
