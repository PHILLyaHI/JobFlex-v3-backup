// The standalone "AI proposal studio" was retired (2026-06-25) — there is one
// AI tool, "Smart Proposal" (the advanced estimator). Old links and bookmarks
// land there. Moved into the blueprint tree on 2026-09-12 when the classic
// proposals routes were removed.

import { redirect } from "next/navigation";

export default function AiProposalRedirect() {
  redirect("/dashboard/advanced-ai");
}
