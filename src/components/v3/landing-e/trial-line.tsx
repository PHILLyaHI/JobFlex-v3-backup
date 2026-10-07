/* THE TRIAL'S PROMISE (owner, 2026-10-01; words by TRIAL_REQUIRES_CARD —
   lib/trialPolicy trialLine: "Start your 7-day free trial" with the card, the
   default since 2026-10-06; the card-less line with the flag off). It is not
   the small mono note the card-first trial once carried under its buttons: it
   is its own line under the heading, set as a Blueprint stamp — an ink (or white)
   frame, heavy uppercase, the blue tick — large enough to be read before the
   button is (landing-e.css, .lp-trial-line). `tone` picks the ink for a black
   or a white ground; `size="sm"` is the sticky phone bar's.

   THE BADGE IS A LINK (owner, 2026-10-02): given `href` — the same register
   link the section's main button carries, industry, utm_* and fbclid in it —
   it renders as an anchor that starts the trial. It keeps the stamp's look;
   only the pointer, a faint hover wash and a focus ring say it can be
   pressed, so it never reads as a third button. Clicks are `cta_click` with
   placement "badge" (cta-tracker.tsx) and `spot` naming which badge. */
import { trialLine } from "@/lib/trialPolicy";

export function TrialLine({
  tone = "light",
  size = "lg",
  className = "",
  href,
  spot,
  requiresCard = true,
}: {
  /** TRIAL_REQUIRES_CARD (lib/trialPolicy), read on the server by the page. */
  requiresCard?: boolean;
  tone?: "light" | "dark";
  /** lg: its own line under a heading; sm: the sticky phone bar; bar: under
   *  the hero's pair, exactly as wide as the pair, tick at the left. */
  size?: "lg" | "sm" | "bar";
  className?: string;
  /** The trial start this badge opens — the section's own register link. */
  href?: string;
  /** Which badge was pressed, for the click event (hero, final, pricing…). */
  spot?: string;
}) {
  const cls = `lp-trial-line lp-trial-line--${tone} lp-trial-line--${size} ${className}`;
  const body = (
    <>
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M4 12.5l5 5L20 6.5" />
      </svg>
      {trialLine(requiresCard)}
    </>
  );
  return href ? (
    <a href={href} className={`${cls} lp-trial-line--link`} data-cta="badge" data-cta-spot={spot}>
      {body}
    </a>
  ) : (
    <p className={cls}>{body}</p>
  );
}
