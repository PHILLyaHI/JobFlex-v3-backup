import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApplicantDetail } from "./applicant-detail";

// Session-scoped, never static. Declared so the dev server does not fork its
// static-paths worker for this route — see the workerThreads note in
// next.config.ts.
export const dynamic = "force-dynamic";

export default async function ApplicantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organizationId } = await requireOrg();

  const applicant = await db.applicant.findUnique({ where: { id } });
  if (!applicant || applicant.organizationId !== organizationId) notFound();

  return (
    <>
      <PageHeader eyebrow="Hire" title={applicant.fullName} description={applicant.role} />
      <ApplicantDetail
        applicant={{
          id: applicant.id,
          fullName: applicant.fullName,
          email: applicant.email,
          phone: applicant.phone,
          role: applicant.role,
          source: applicant.source,
          status: applicant.status,
          notes: applicant.notes,
          createdAt: applicant.createdAt,
        }}
      />
    </>
  );
}
