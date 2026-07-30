// Messages — Blueprint edition. Pixel-identical port of the canonical messages
// donor (jobflex-messages-blueprint_1.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// The classic messages page is archived at old-design-pages/dashboard/messages.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { MessagesContent } from "@/components/v3/messages-blueprint/messages-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Messages",
  description: "Messages — the crew's conversation list and thread on one sheet.",
};

export default async function MessagesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fmessages");
  }

  return <MessagesContent />;
}
