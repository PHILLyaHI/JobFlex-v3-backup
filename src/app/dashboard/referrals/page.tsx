// Referrals — Blueprint edition. Pixel-identical port of the canonical
// referrals donor (jobflex-referrals-blueprint_1.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// The classic page was archived to old-design-pages/dashboard/referrals.
//
// This is NOT a fixture page: the code, the two share links, the three stat
// tiles and every conversion row are read from the database in
// ./load-referrals and handed to BOTH editions through ./referrals-responsive
// — the desktop sheet above 768px, the handheld build at or below — so both
// editions describe the same referral program.

import type { Metadata } from "next";
import { MarkNavSeen } from "@/components/layout/MarkNavSeen";
import { loadReferralsProps } from "./load-referrals";
import { ReferralsResponsive } from "./referrals-responsive";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Referrals",
  description: "Referrals — your code, the reward, and every conversion it has earned on one sheet.",
};

export default async function ReferralsPage() {
  const props = await loadReferralsProps("/dashboard/referrals");

  return (
    <>
      {/* Clears the referrals nav badge (pending conversions) on open. Both
          editions: the page owns the viewport switch, so this mounts on a phone
          too (the shell's HANDHELD_SEEN stamp for this route is gone). */}
      <MarkNavSeen surface="referrals" />
      <ReferralsResponsive {...props} />
    </>
  );
}
