// Settings — Blueprint edition. Port of the canonical settings donor
// (jobflex-settings-blueprint (6).html), with the owner's fix list applied on
// top (F1-F18: the three-column security row, the flush danger row, the
// processor cleanup, the custom dropdowns, the add-payout modal, the icon-less
// toggles, the notification event icons and column toggles).
//
// The sidebar, topbar, graph-paper field and shared sprite come from the shell
// mounted in ../layout.tsx, so this page renders only the donor's `.content`
// children. The classic settings index that used to serve this URL — a bare
// redirect to /dashboard/settings/account — was archived to
// old-design-pages/dashboard/settings/page.tsx.
//
// Its CHILD routes are untouched: /dashboard/settings/account, /billing,
// /team, /gmail, /meta and the rest still live under the (dashboard) route
// group and keep the classic layout.
//
// This page is PRESENTATIONAL. The donor content ships as fixture data in
// components/v3/settings-blueprint/settings-data.ts; the only server work here
// is the org guard, matching every other blueprint page. No server actions, no
// API routes, no Prisma reads beyond that guard.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { NoOrgError, UnauthorizedError, requireOrg } from "@/lib/orgContext";
import { SettingsContent } from "@/components/v3/settings-blueprint/settings-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Settings",
  description:
    "Settings — account, payments, billing, integrations and notifications on one sheet.",
};

export default async function SettingsPage() {
  try {
    await requireOrg();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Fsettings");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  return <SettingsContent />;
}
