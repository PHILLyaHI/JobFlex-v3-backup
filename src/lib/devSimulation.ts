// TEMP (2026-09-19) — the gate for the dev-only plan simulator on
// /dashboard/upgrade. Remove with the simulator when it has done its job.
//
// The simulator changes an organization's plan in the database without Stripe
// so the upgrade flow — the plan change and the activation stamp — can be seen
// on a machine that has no checkout. That is a thing only a development
// machine may do, and "may" is decided here, on the server, once, rather than
// by each caller: the route answers 404 and the page draws nothing unless
// BOTH conditions hold. NODE_ENV alone is not enough — a Vercel preview is
// built as production, but a misconfigured deployment could run development
// there, and VERCEL_ENV is set on every Vercel build regardless.

export function isDevSimulationEnabled(): boolean {
  return process.env.NODE_ENV === "development" && !process.env.VERCEL_ENV;
}
