// THE PAGE-LEVEL HALF OF THE CUSTOM-PLAN GATE (owner, 2026-10-06).
//
// A layout renders only when its segment is entered: on a client-side
// navigation between two dashboard pages the shared layout is reused and only
// the PAGE segment is rendered on the server. The layout gate therefore never
// ran on that request — the page's server component did, and its data rode
// to the browser in the RSC payload even though the client swap painted the
// offer over it (the audit found a calendar's events in that payload).
//
// So every add-on page asks here FIRST, before it reads anything:
//
//   const gate = await customPageGate("calendar");
//   if (gate) return gate;
//
// It returns the offer for an org on the custom plan that does not hold the
// page, else null. A signed-out visitor gets null: the page's own
// redirect-to-login handles them, as before. Fails closed (lib/customPageAccess).

import { requireOrg } from "@/lib/orgContext";
import { isPageLocked } from "@/lib/customPageAccess";
import { CUSTOM_PAGES, type CustomPageId } from "@/lib/customPlan";
import { UpgradeGate } from "./upgrade-gate";

export async function customPageGate(page: CustomPageId): Promise<React.ReactElement | null> {
  let organizationId: string;
  try {
    ({ organizationId } = await requireOrg());
  } catch {
    return null;
  }
  if (!(await isPageLocked(organizationId, page))) return null;
  const href = CUSTOM_PAGES.find((p) => p.id === page)?.href ?? "/dashboard";
  return <UpgradeGate pathname={href} />;
}
