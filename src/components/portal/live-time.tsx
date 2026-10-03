"use client";

// The request page's two clock-bound pieces.
//
// LiveRefresh — the page re-reads itself (router.refresh re-runs the server
// render; no new endpoint) every 30 seconds while the tab is visible and the
// moment it comes back into view, so a new match, a proposal or an accept
// shows up without the homeowner reloading.
//
// LocalTime — times in the VIEWER'S zone and locale. The server cannot know
// them, so it renders the contractor's zone as the stand-in and the browser
// swaps in its own after mount (useSyncExternalStore: null on the server,
// real on the client, no hydration mismatch).

import * as React from "react";
import { useRouter } from "next/navigation";

const subscribeNever = () => () => {};
function useMounted(): boolean {
  return React.useSyncExternalStore(subscribeNever, () => true, () => false);
}

export function LiveRefresh({ everyMs = 30_000, className }: { everyMs?: number; className?: string }) {
  const router = useRouter();

  React.useEffect(() => {
    let t: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const start = () => {
      if (t) clearInterval(t);
      t = setInterval(tick, everyMs);
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      tick();
      start();
    };
    start();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      if (t) clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [router, everyMs]);

  return (
    <span className={className}>
      <i aria-hidden="true" />
      Live — updates on its own
    </span>
  );
}

type Kind = "datetime" | "date" | "time" | "day";
const OPTS: Record<Kind, Intl.DateTimeFormatOptions> = {
  datetime: { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  date: { month: "short", day: "numeric", year: "numeric" },
  time: { hour: "numeric", minute: "2-digit" },
  day: { weekday: "short", month: "short", day: "numeric" },
};

export function LocalTime({ iso, kind = "datetime", tz }: { iso: string; kind?: Kind; tz: string }) {
  const mounted = useMounted();
  const d = new Date(iso);
  let text: string;
  try {
    text = d.toLocaleString(mounted ? undefined : "en-US", { ...OPTS[kind], ...(mounted ? {} : { timeZone: tz }) });
  } catch {
    text = d.toISOString().slice(0, 16).replace("T", " ");
  }
  return <time dateTime={iso}>{text}</time>;
}
