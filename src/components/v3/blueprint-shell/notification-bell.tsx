"use client";

// THE BELL — the shell's notification surface.
//
// It used to have no feed at all: the button opened the command palette and the
// `.bell-dot` was a static CSS dot no code ever toggled, so it advertised unread
// notifications permanently. Meanwhile the only real feed in the codebase
// (`recentNotifications`) was mounted solely by the LEGACY (dashboard) topbar —
// which no promoted route renders — and was `requireManager()`-gated, so a
// worker could never have reached it even if it had been wired here.
//
// This panel calls `notificationFeed()`, which answers per role: the org
// activity stream for the office, and their OWN schedule for a field worker —
// the jobs and appointments they have been put on.
//
// Hand-rolled, per the house rule (no Radix). It reads ONCE on mount — the dot
// cannot be truthful otherwise — and again on each open, so a panel left shut
// still tells you something arrived without polling for it. The unread dot is
// "items newer than the last time this person opened the bell", kept in
// localStorage: honest without a read-state column, and it never advertises
// unread mail that does not exist, which is exactly what the old static dot did.

import * as React from "react";
import { notificationFeed, type NotificationItem } from "@/actions/notifications";
import "./notification-bell.css";

const SEEN_KEY = "jf.bell.seenAt";

function readSeenAt(): number {
  if (typeof localStorage === "undefined") return 0;
  const raw = Number(localStorage.getItem(SEEN_KEY));
  return Number.isFinite(raw) ? raw : 0;
}

/** "just now" / "4h ago" / "Aug 12" — the same voice the lists use. */
function ago(d: Date): string {
  const ms = Date.now() - d.getTime();
  if (ms < 0) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function NotificationBell({
  buttonClassName = "icon-btn",

  iconClassName = "ic",
}: {
  /** The host shell's icon-button class. The desktop topbar's chrome is global
   *  (`icon-btn`); the handheld shells style theirs with CSS modules, so they
   *  pass their own hashed names. */
  buttonClassName?: string;

  /** Likewise for the icon. A module-scoped `.ic` is what sizes the glyph on
   *  the handheld surfaces; passing the global string there rendered the bell
   *  as a full-size black slab, because nothing matched and the SVG fell back
   *  to its intrinsic size and default fill. The inline attributes below are
   *  the belt to that braces. */
  iconClassName?: string;
} = {}) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<NotificationItem[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [newest, setNewest] = React.useState(0);
  const [seenAt, setSeenAt] = React.useState(0);
  const [popTop, setPopTop] = React.useState(72);
  const [popRight, setPopRight] = React.useState(16);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    try {
      const rows = await notificationFeed();
      setItems(rows);
      setNewest(rows.length ? Math.max(...rows.map((r) => new Date(r.createdAt).getTime())) : 0);
    } catch {
      // A role with no feed, or a dropped connection. An empty panel that says
      // so beats an error dialog over a bell.
      setItems([]);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  // One quiet read on mount, so the dot can be truthful before the first open.
  // Everything is set from an async continuation rather than the effect body:
  // localStorage does not exist on the server, so the seen stamp cannot be a
  // lazy useState initializer without a hydration mismatch.
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const seen = readSeenAt();
      let rows: NotificationItem[] = [];
      try {
        rows = await notificationFeed();
      } catch {
        rows = [];
      }
      if (!alive) return;
      setSeenAt(seen);
      setItems(rows);
      setNewest(rows.length ? Math.max(...rows.map((r) => new Date(r.createdAt).getTime())) : 0);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Outside click + Escape.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // How many rows arrived since this viewer last opened the panel. The badge
  // shows the number rather than a dot (owner call, 2026-09-03) — "something
  // happened" is less useful than "three things happened", and the same figure
  // is what the Hire & Work post counters are showing.
  const unreadCount = (items ?? []).reduce(
    (n, i) => (new Date(i.createdAt).getTime() > seenAt ? n + 1 : n),
    0,
  );
  const unread = unreadCount > 0 && newest > seenAt && newest > 0;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    // Anchor the panel to the REAL bar edge, measured at open time. The old
    // stylesheet hardcoded the offsets (top: 62px on handhelds; the button's
    // bottom + 10 on desktop) and both landed 1–2px inside the bar — worse on
    // phones whose safe-area inset makes the bar taller — so the bar's bottom
    // border visibly overlapped the panel. The bar is the nearest <header> /
    // .topbar; falling back to the button keeps a detached bell working.
    const btn = rootRef.current;
    if (btn) {
      const bar = btn.closest("header, .topbar");
      const anchor = Math.max(
        btn.getBoundingClientRect().bottom,
        bar ? bar.getBoundingClientRect().bottom : 0,
      );
      setPopTop(Math.round(anchor) + 10);
      setPopRight(Math.max(12, Math.round(window.innerWidth - btn.getBoundingClientRect().right)));
    }
    void load(true);
    // Opening IS reading — stamp now so the dot clears and stays cleared.
    const stamp = Date.now();
    setSeenAt(stamp);
    try {
      localStorage.setItem(SEEN_KEY, String(stamp));
    } catch {
      /* private mode — the dot just stays until reload */
    }
  }

  return (
    <div className="bell-wrap" ref={rootRef}>
      <button
        className={buttonClassName}
        type="button"
        title="Notifications"
        aria-label={
          unread
            ? `Notifications — ${unreadCount} new`
            : "Notifications"
        }
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={toggle}
      >
        <svg
          className={iconClassName}
          width={18}
          height={18}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <use href="#i-bell" />
        </svg>
        {unread && (
          <span className="bell-n" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="bell-pop"
          role="menu"
          aria-label="Notifications"
          style={{ "--bell-top": `${popTop}px`, "--bell-right": `${popRight}px` } as React.CSSProperties}
        >
          <div className="bell-head">Notifications</div>
          <div className="bell-body">
            {loading && items === null ? (
              <div className="bell-empty">Loading…</div>
            ) : !items || items.length === 0 ? (
              <div className="bell-empty">Nothing yet. New work lands here.</div>
            ) : (
              items.map((n) => {
                const at = new Date(n.createdAt);
                const row = (
                  <>
                    <span className="bell-kind">{n.kind.replace(/_/g, " ").toLowerCase()}</span>
                    <span className="bell-sum">{n.summary}</span>
                    <span className="bell-when">{ago(at)}</span>
                  </>
                );
                return n.href ? (
                  <a className="bell-row" key={n.id} href={n.href} role="menuitem">
                    {row}
                  </a>
                ) : (
                  <div className="bell-row" key={n.id}>
                    {row}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
