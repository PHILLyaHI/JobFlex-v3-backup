// IS THE CUSTOM PLAN ON SALE? (owner, 2026-10-06)
//
// CUSTOM_PLAN_ENABLED=true puts "Build your plan" back on /pricing, the signup
// plan step and the plan cards of /dashboard/upgrade. Anything else — unset,
// the default — takes it off sale: no surface offers it and the checkout
// routes refuse a NEW custom purchase. Organizations already on the custom
// plan keep working whatever the flag says: their pages, their page changes,
// their trial and its card.
//
// Read on the server only; pages hand the answer to their client components
// as a prop, the same way lib/trialPolicy does.

/** True when new shops may buy the custom plan. */
export function customPlanOffered(): boolean {
  return process.env.CUSTOM_PLAN_ENABLED?.trim().toLowerCase() === "true";
}

/** The refusal a checkout route sends when the plan is off sale. */
export const CUSTOM_PLAN_OFF_SALE = "The custom plan is not available right now. Pick one of the plans above.";
