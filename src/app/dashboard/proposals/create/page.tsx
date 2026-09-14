// /dashboard/proposals/create — the classic chrome's "pick a way to build a
// proposal" page. The blueprint shell's "+ New proposal" opens the estimator
// picker instead, and lib/roleRoutes already maps this path to the manual
// builder, so the URL now goes straight there. The method-card page was
// removed on 2026-09-12.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function CreateProposalRedirect() {
  redirect("/dashboard/manual-blueprint");
}
