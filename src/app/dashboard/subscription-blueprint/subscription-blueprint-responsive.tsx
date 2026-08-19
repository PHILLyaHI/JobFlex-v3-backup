// The switch moved to the promoted route when its handheld half was folded in
// (2026-08-18) — see app/dashboard/subscription/subscription-responsive.tsx.
// This staging route keeps rendering the SAME module through this re-export,
// so there is still one switch, not two.
export { SubscriptionResponsive as SubscriptionBlueprintResponsive } from "../subscription/subscription-responsive";
