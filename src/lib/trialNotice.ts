// THE TRIAL RIBBON'S STEPS (owner, 2026-10-07; lib/trialState for the trial
// itself, components/v3/trial-card for the ribbon).
//
// While the trial runs the ribbon has four steps: early (more than
// TRIAL_NOTICE_DAYS left), "2 days left", "1 day left" and "Ends today". It
// shows from the first visit and stays until it is dismissed; a dismissal
// hides it for the step it was dismissed on only, so it comes back at the
// next one. Once the trial has ended it shows always and cannot be dismissed.
//
// THE DISMISSAL is a cookie per organization holding the step, set in the
// browser and read by the dashboard layouts on the server, so a dismissed
// ribbon is never painted and then removed. It expires with the trial. This
// device only — nothing is written to the database.
//
// No imports: the client ribbon reads this module as well as the server
// layouts, and lib/trialState pulls in the database.

/** The last days that each get a step of their own, and the ribbon's amber. */
export const TRIAL_NOTICE_DAYS = 2;

/** "early" while more than TRIAL_NOTICE_DAYS are left, then the days left. */
export function trialNoticeStep(daysLeft: number): string {
  return daysLeft > TRIAL_NOTICE_DAYS ? "early" : String(Math.max(0, daysLeft));
}

export function trialDismissCookie(orgId: string): string {
  return `jf_trial_x_${orgId}`;
}

/** Dismissed on the step the trial is on now. An ended trial never is. */
export function trialNoticeDismissed(view: { kind: "trialing" | "ended"; daysLeft: number }, cookieValue: string | null | undefined): boolean {
  return view.kind === "trialing" && cookieValue === trialNoticeStep(view.daysLeft);
}
