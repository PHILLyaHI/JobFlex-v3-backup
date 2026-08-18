"use client";
import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * The app's one loading spinner.
 *
 * Blueprint vocabulary: a hairline ring in `--ink` with the top quarter cut
 * out — the same ring `Button` draws while a write is on the wire, so a busy
 * button and a loading popup read as the same system.
 */
export function Spinner({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block shrink-0 rounded-full border-[color:var(--ink)] border-t-transparent animate-spin",
        className,
      )}
      style={{
        width: size,
        height: size,
        borderWidth: Math.max(1.5, Math.round(size / 12)),
      }}
    />
  );
}

/**
 * The body of a popup whose content has not arrived yet.
 *
 * WHY THE DELAY: a sheet that opens over a warm cache resolves in one frame,
 * and flashing a spinner into that frame is worse than showing nothing — it
 * reads as a stutter. So nothing renders for `delay` ms; only a load that is
 * actually slow enough to look frozen earns the spinner.
 *
 * WHY IT IS NOT AN EMPTY STATE: the trap this exists to close is a popup that
 * renders its "nothing here yet" copy while the fetch is still in flight, so
 * an existing conversation / list briefly claims to be empty and then pops in.
 * Gate the empty state on `!loading`, and render this instead while loading.
 */
export function PopupLoading({
  label = "Loading…",
  delay = 300,
  minHeight = 120,
  className,
}: {
  label?: string;
  /** ms to stay blank before the spinner appears. */
  delay?: number;
  minHeight?: number;
  className?: string;
}) {
  const [show, setShow] = React.useState(delay <= 0);

  React.useEffect(() => {
    if (delay <= 0) return;
    const t = window.setTimeout(() => setShow(true), delay);
    return () => window.clearTimeout(t);
  }, [delay]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-4 py-8",
        className,
      )}
      style={{ minHeight }}
    >
      {show && (
        <>
          <Spinner size={22} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-muted)]">
            {label}
          </span>
        </>
      )}
    </div>
  );
}
