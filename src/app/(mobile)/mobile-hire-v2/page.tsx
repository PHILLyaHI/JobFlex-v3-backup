// Mobile hire — mobile-hire-v2. A handheld-first rebuild of the Hire & Work
// surface in the Blueprint design system, fourth sibling to /mobile-v2
// (Overview), /mobile-proposals-v2 (Proposals) and /mobile-clients-v2 (Clients).
// Lives beside the desktop /dashboard/hire rather than replacing it, per the
// mobile route strategy.
//
// Built with the jobflex-page-styler skill (visual system: tokens, palette,
// type scale, Motion System "Balanced", FLUID SCALE) and the
// mobile-app-ui-design skill (structure: thumb zone, ≥44px targets, bottom
// sheets over modals, search over paging, initials over generic glyphs).
// Where the two disagree the house system wins — hard 3px offset shadows, 2px
// radii and Inter 900 caps stay, rather than the mobile skill's soft-shadow /
// rounded-3xl defaults.
//
// The fixture era is over: this page reads the SAME data the desktop
// /dashboard/hire reads — the org's applicant pipeline (getHireSeed), the
// caller's open-for-work profile, the trade-network tallies and the talent
// directory — and every board action below writes through the real applicant
// server actions with optimistic update + rollback.
//
// Auth: middleware only matches /dashboard and /admin, so this page enforces
// its own redirect-to-login like the other design routes.

import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { getHireSeed } from "@/actions/applicants";
import {
  discoverTradeProfiles,
  getMyTradeJobs,
  getTradeInbox,
  getTradeNetworkProfile,
} from "@/actions/tradeServices";
import type { HireTallies } from "./hire-data";
import { MobileHire } from "./mobile-hire";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hire · JobFlex Mobile",
  description:
    "Blueprint-edition mobile hire: the applicant pipeline as a searchable list, plus the marketplace doors.",
};

// Handheld build: lock the scale so the layout is read at true device width,
// and pay out the notch / home-indicator insets the shell reserves.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default async function MobileHireV2Page() {
  let seed: Awaited<ReturnType<typeof buildSeed>>;
  try {
    seed = await buildSeed();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect(`/auth/login?next=${encodeURIComponent("/mobile-hire-v2")}`);
    }
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  return (
    <MobileHire
      applicants={seed.applicants}
      profile={seed.profile}
      tallies={seed.tallies}
      talent={seed.talent}
    />
  );
}

async function buildSeed() {
  const [applicants, profile, myJobs, inbox, talent] = await Promise.all([
    getHireSeed(),
    getTradeNetworkProfile(),
    getMyTradeJobs(),
    getTradeInbox(),
    discoverTradeProfiles(),
  ]);
  const tallies: HireTallies = {
    hired: applicants.filter((a) => a.status === "HIRED").length,
    openPosts: myJobs.filter((j) => j.status === "OPEN").length,
    totalPosts: myJobs.length,
    interestReceived: myJobs.reduce((n, j) => n + j.interestedCount, 0),
    interestSent: inbox.engaged.length,
  };
  return { applicants, profile, tallies, talent };
}
