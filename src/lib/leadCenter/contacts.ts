// When a shop may see a platform lead's homeowner — email, phone, street.
//
// The rule (2026-10-02): after the shop accepts it, never before. A live offer
// carries no contacts at all (lib/leadCenter/route.ts, leads-data Offer). The
// one other way a shop can hold a platform lead it has not accepted is a ROUTED
// row — what a hand-routed lead was before hand-sent leads became offers — and
// those are read through this check until someone at the shop claims them.
export function contactsLocked(lead: { source: string | null; status: string }): boolean {
  return lead.source === "LEAD_CENTER" && lead.status === "ROUTED";
}
