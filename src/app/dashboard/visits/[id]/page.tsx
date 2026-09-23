import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { NoOrgError, requireOrg, UnauthorizedError } from "@/lib/orgContext";
import { appBaseUrl } from "@/lib/appUrl";
import { loadVisit } from "@/lib/visitBook";
import { VisitContent } from "@/components/v3/visit-blueprint/visit-content";

// THE VISIT (2026-09-23): one appointment, the units on file, the report
// form. Workers open it from the calendar's notes; the office from the plans page.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "JobFlex · Visit", description: "One visit: the home's equipment and the crew's report." };

export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let organizationId: string;
  try {
    organizationId = (await requireOrg()).organizationId;
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect(`/auth/login?next=${encodeURIComponent(`/dashboard/visits/${id}`)}`);
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }
  const [v, appUrl] = await Promise.all([loadVisit(id, organizationId), appBaseUrl()]);
  if (!v) notFound();
  return <VisitContent v={v} appUrl={appUrl} />;
}
