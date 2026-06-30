import { redirect } from "next/navigation";

// The standalone "AI proposal studio" was retired — there is one AI tool now,
// "Smart Proposal" (the advanced estimator). Redirect any old links/bookmarks.
export default function AiProposalPage() {
  redirect("/dashboard/advanced-ai");
}
