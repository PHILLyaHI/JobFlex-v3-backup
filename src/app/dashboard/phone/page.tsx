// Main phone — Blueprint edition. Pixel-identical port of the canonical phone
// donor (jobflex-phone-blueprint_1.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// The classic page it replaces is archived at
// old-design-pages/dashboard/phone/page.tsx.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { PhoneContent } from "@/components/v3/phone-blueprint/phone-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Phone",
  description: "Phone — webhook setup, call volume and the full call log with transcripts.",
};

export default async function PhonePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fphone");
  }

  return <PhoneContent />;
}
