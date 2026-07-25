// /v3/proposals-blueprint was the staging route for the proposals donor port.
// The port is now the live /dashboard/proposals page
// (src/app/dashboard/proposals/), rendered inside the shared blueprint shell,
// so this URL forwards there rather than mounting a second copy of the shell.

import { redirect } from "next/navigation";

export default function ProposalsBlueprintStagingPage() {
  redirect("/dashboard/proposals");
}
