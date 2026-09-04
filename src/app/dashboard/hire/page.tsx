// Hire — Blueprint edition. Pixel-identical port of the canonical hire donor
// (jobflex-hire-blueprint_4.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// Child routes (/hub, /talent, /profile, /job-posts, /applications,
// /contracts, /new, /[id]) live under the (dashboard) route group and keep the
// classic layout.
//
// NOTHING on this page is a fixture any more:
// - the applicant pipeline reads/writes through src/actions/applicants.ts;
// - the hub tallies are the org's real trade-network numbers (open TradeJobs,
//   interest received/sent) plus the pipeline's HIRED count;
// - "Publish your profile" edits the caller's TradeNetworkProfile and
//   "Discover talent" lists other orgs' opted-in profiles — both through
//   src/actions/tradeServices.ts.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { getHireSeed } from "@/actions/applicants";
import {
  discoverTradeProfiles,
  getMyTradeJobs,
  listOpenTradeJobs,
  getTradeInbox,
} from "@/actions/tradeServices";
import { HireContent } from "@/components/v3/hire-blueprint/hire-content";
import type { HireTallies } from "@/components/v3/hire-blueprint/hire-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Hire",
  description: "Hire — the marketplace hub and the applicant pipeline on one sheet.",
};

export default async function HirePage() {
  let seed: Awaited<
    ReturnType<typeof buildSeed>
  >;
  try {
    seed = await buildSeed();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Fhire");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  return (
    <HireContent
      applicants={seed.applicants}
      myPosts={seed.myJobs}
      tallies={seed.tallies}
      talent={seed.talent}
      networkJobs={seed.networkJobs}
    />
  );
}

async function buildSeed() {
  const [applicants, myJobs, inbox, talent, networkJobs] = await Promise.all([
    getHireSeed(),
    getMyTradeJobs(),
    getTradeInbox(),
    discoverTradeProfiles(),
    listOpenTradeJobs(),
  ]);
  const tallies: HireTallies = {
    hired: applicants.filter((a) => a.status === "HIRED").length,
    openPosts: myJobs.filter((j) => j.status === "OPEN").length,
    totalPosts: myJobs.length,
    interestReceived: myJobs.reduce((n, j) => n + j.interestedCount, 0),
    interestSent: inbox.engaged.length,
  };
  return { applicants, myJobs, tallies, talent, networkJobs };
}
