/* THE CARD-LESS TRIAL'S PROMISE (owner, 2026-10-01; TRIAL_REQUIRES_CARD off —
   lib/trialPolicy). "7-Day Free Trial — No Credit Card Required" is not the
   small mono note the card-first trial carried under its buttons: it is its
   own line under the heading, set as a Blueprint stamp — an ink (or white)
   frame, heavy uppercase, the blue tick — large enough to be read before the
   button is (landing-e.css, .lp-trial-line). `tone` picks the ink for a black
   or a white ground; `size="sm"` is the sticky phone bar's. */
import { trialLine } from "@/lib/trialPolicy";

export function TrialLine({
  tone = "light",
  size = "lg",
  className = "",
}: {
  tone?: "light" | "dark";
  /** lg: its own line under a heading; sm: the sticky phone bar; bar: under
   *  the hero's pair, exactly as wide as the pair, tick at the left. */
  size?: "lg" | "sm" | "bar";
  className?: string;
}) {
  return (
    <p className={`lp-trial-line lp-trial-line--${tone} lp-trial-line--${size} ${className}`}>
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M4 12.5l5 5L20 6.5" />
      </svg>
      {trialLine(false)}
    </p>
  );
}
