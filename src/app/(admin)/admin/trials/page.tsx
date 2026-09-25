// TRIAL WATCH — /admin/trials (2026-09-24). Owner: "can we track and check if
// people on a free trial are trying to copy our features by doing
// screenshots?" The accounts that behave like a tour rather than a company,
// scored by lib/trialWatch off their page views, their records, their email
// domains and shared devices; read by actions/trialWatch.
import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { getTrialWatch } from "@/actions/trialWatch";
import { AdminTrialsContent } from "@/components/v3/admin-trials/admin-trials-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "JobFlex Admin · Trial watch" };

export default async function AdminTrialsPage() {
  await requirePlatformAdmin();
  const data = await getTrialWatch();
  return <AdminTrialsContent data={data} />;
}
