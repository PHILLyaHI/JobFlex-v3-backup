import { redirect } from "next/navigation";

// Part of the retired AI proposal studio. The single AI tool is now "Smart
// Proposal" (the advanced estimator), which converts straight to a proposal.
export default function AiBuildRedirect() {
  redirect("/dashboard/advanced-ai");
}
