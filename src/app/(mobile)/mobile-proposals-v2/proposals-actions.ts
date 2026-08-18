"use server";

// Route-local read for the handheld proposals surface.
//
// Why this exists at all: `/dashboard/proposals` at ≤768px is mounted by
// components/v3/responsive-shell/responsive-dashboard-shell.tsx, whose
// HANDHELD_SURFACES map is `Record<pathname, ComponentType>` — it renders the
// handheld component with NO PROPS and never renders the page's children. So
// the rows this surface needs cannot reach it from the server component that
// already reads them; it has to ask for them itself.
//
// This adds no capability. It runs readProposalBook() — the exact query the
// desktop sheet renders from, with the same requireProposalStaff() guard, which
// this module deliberately does NOT bypass or parameterise. There is no org id,
// no user id and no filter in the signature: the caller cannot ask for anyone
// else's book.
//
// The standalone /mobile-proposals-v2 URL does not go through here — its page
// is a server component and passes rows straight down.

import { readProposalBook } from "@/components/v3/proposals-blueprint/proposals-query";
import type { ProposalRow } from "@/components/v3/proposals-blueprint/proposals-data";

export async function loadProposalBook(): Promise<ProposalRow[]> {
  return readProposalBook();
}
