// Smart Proposal — Blueprint edition. Pixel-identical port of the canonical
// Smart Proposal donor (jobflex-smart-proposal-blueprint_4.html).
//
// The route segment is `advanced-ai` (the app's existing URL for this screen);
// the donor file is named "smart-proposal" and its visible title/heading text
// is kept exactly as authored.
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// The child routes (/roof, /fence, /fence/studio) live under the (dashboard)
// route group and keep the classic layout.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { AdvancedAiContent } from "@/components/v3/advanced-ai-blueprint/advanced-ai-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Smart Proposal",
  description:
    "Smart Proposal — the estimate console and the studio that prices materials, labor and scope on one sheet.",
};

export default async function AdvancedAiPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fadvanced-ai");
  }

  return <AdvancedAiContent />;
}
