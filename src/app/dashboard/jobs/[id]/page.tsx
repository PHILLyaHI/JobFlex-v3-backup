// Job detail — Blueprint edition. Pixel-identical port of the job detail donor
// (jobflex-jobdetail-blueprint (14).html).
//
// This REPLACES the classic record page that lived at
// src/app/(dashboard)/dashboard/jobs/[id]/ — same URL, no parallel
// "-blueprint" route beside it. Moving the folder into src/app/dashboard/ is
// what puts it on the blueprint shell: ../../layout.tsx mounts the sidebar,
// topbar, sprite and `.content` wrapper once, and the page renders only the
// donor's `.content` children. Its sibling /new still lives under the
// (dashboard) route group on the classic layout; a static segment outranks a
// dynamic one, so /dashboard/jobs/new is unaffected.
//
// ── THE CONTENT IS THE DONOR'S FIXTURE ─────────────────────────────
// Unlike the sibling project-detail port, this page does NOT read the Job
// record: shipping the donor's demo content verbatim was the explicit call for
// this port, so "Roof tear-off & reroof — 4812 Maple Ave" and its crew, change
// orders, photos and expenses render for every id. The route still resolves
// `[id]`, so every existing link and every
// `revalidatePath('/dashboard/jobs/<id>')` in src/actions/ keeps resolving —
// the id simply does not select content. The org check below is kept anyway:
// the page sits behind the same auth gate it always did.
//
// ── THE WORKER BRANCH IS PRESERVED ─────────────────────────────────
// Field workers still get the read-only, assignment-scoped WorkerJobView on
// REAL data (no expenses, change orders, crew management or messages). That
// view was the one part of the classic page with its own access rule, so it was
// carried across rather than dropped with the rest; it renders on the blueprint
// shell now, in the old design's visual language.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg, isWorkerRole, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { JobDetailContent } from "@/components/v3/job-detail-blueprint/job-detail-content";
import { WorkerJobView } from "./worker-job-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Job",
  description:
    "One job — its status, crew, schedule, change orders, photos and expenses on a single sheet.",
};

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // The blueprint layout deliberately swallows an auth failure so the PAGE can
  // decide; the classic tree let requireOrg throw into its own boundary.
  let organizationId: string;
  let role: string;
  let userId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
    role = ctx.role;
    userId = ctx.user.id;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect(`/auth/login?next=${encodeURIComponent(`/dashboard/jobs/${id}`)}`);
    }
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  if (isWorkerRole(role)) {
    return <WorkerJobView id={id} organizationId={organizationId} userId={userId} />;
  }

  return <JobDetailContent />;
}
