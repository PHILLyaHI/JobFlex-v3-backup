// Manage your profile — Blueprint edition. Route: /dashboard/hire/profile.
//
// The page the Hire hub's "Manage your profile" row opens. It edits ONE record:
// the caller's TradeNetworkProfile — the row that puts them in other companies'
// talent directories (discoverTradeProfiles) and makes matching trade jobs
// broadcast to them. Before this existed the route resolved to a ComingSoon
// stub in the classic (dashboard) tree; that stub is gone, and this file claims
// the path (two pages resolving to one path is a build error, not a choice).
//
// The sidebar, topbar and sprite come from the shell mounted in ../../layout.tsx,
// so this page renders only the donor's `.content` children.
//
// Three facts are read here, on the server, because the page below is a client
// tree:
//   · the profile itself, through the existing getTradeNetworkProfile action;
//   · the display name and the org name — the two strings the talent directory
//     prints for a row (`user.name ?? org.name`, and the org as the headline),
//     so the page's preview can be the row rather than an impression of it.
// The name read is a plain server-component query, the same shape
// /dashboard/video-estimator's page uses for its ticket number. Nothing here
// writes; the only write on this surface is setTradeNetworkOptIn, called from
// the client through the existing action.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NoOrgError, UnauthorizedError, requireOrg } from "@/lib/orgContext";
import { getTradeNetworkProfile } from "@/actions/tradeServices";
import { HireProfileViewportSwitch } from "@/components/v3/hire-profile-blueprint/hire-profile-viewport-switch";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Your listing",
  description:
    "Your trade-network listing: the trades, specialties and service area other companies search, and whether you appear at all.",
};

const LOGIN = "/auth/login?next=%2Fdashboard%2Fhire%2Fprofile";

export default async function HireProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect(LOGIN);

  let seed: Awaited<ReturnType<typeof buildSeed>>;
  try {
    seed = await buildSeed();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect(LOGIN);
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  // The switch, not the desktop page: at ≤768px this URL serves the handheld
  // build instead (hire-profile-viewport-switch.tsx). Both editions take the
  // same three props, so the choice is a layout, never a dataset.
  return (
    <HireProfileViewportSwitch
      company={seed.company}
      displayName={seed.displayName}
      profile={seed.profile}
    />
  );
}

async function buildSeed() {
  const [{ user, organizationId }, profile] = await Promise.all([
    requireOrg(),
    getTradeNetworkProfile(),
  ]);
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });
  const company = org?.name ?? null;
  // discoverTradeProfiles' own fallback, restated so the preview and the real
  // directory row print the same string.
  const displayName = user.name ?? company ?? "A contractor";
  return { company, displayName, profile };
}
