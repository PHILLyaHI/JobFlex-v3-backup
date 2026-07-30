// Main clients — Blueprint edition. Pixel-identical port of the canonical
// clients donor (jobflex-clients-blueprint_2.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// The child route (/[id]) lives under the (dashboard) route group and keeps
// the classic layout.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { ClientsContent } from "@/components/v3/clients-blueprint/clients-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Clients",
  description: "Clients — masthead, tag filters and the full client book on one sheet.",
};

export default async function ClientsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fclients");
  }

  return <ClientsContent />;
}
