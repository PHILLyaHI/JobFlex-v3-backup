import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProposalEditor } from "@/components/v3/proposal-builder-a/ProposalEditor";
import { ResetDraft } from "@/components/v3/proposal-builder-a/ResetDraft";
import { V3_PORTED_ROUTES } from "@/lib/v3/routes";

// v3 manual proposal builder — a duplicate of the live `/dashboard/proposals/new`
// page. Saves still go through saveProposal/sendProposal in `src/actions/proposals.ts`,
// so the existing builder keeps its own users untouched. Schema-blocked features
// (project, free-text client, toggles, terms, files) render as "Preview" shells.
//
// Auth: the project's middleware only gates /dashboard and /admin, so v3
// pages enforce their own redirect-to-login. (Adding /v3 to the middleware
// matcher would also pull in the public marketing pages.)
export default async function ManualBuilderAPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(
      `/auth/login?next=${encodeURIComponent(V3_PORTED_ROUTES.manualBuilderA)}`,
    );
  }
  const { organizationId } = await requireOrg();
  const [clients, projects, org] = await Promise.all([
    db.client.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        zip: true,
      },
    }),
    db.project.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, defaultTaxRate: true, materialMarkupPct: true, laborMarkupPct: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-8">
      <PageHeader
        eyebrow="New proposal · v3 · builder A"
        title="Manual builder"
        description="Hand-craft every line. Live preview mirrors what the client will see."
      />
      <ResetDraft
        defaultTaxRate={org?.defaultTaxRate ?? 0}
        materialMarkupPct={org?.materialMarkupPct ?? 0}
        laborMarkupPct={org?.laborMarkupPct ?? 0}
      />
      <ProposalEditor
        clients={clients}
        projects={projects}
        orgName={org?.name ?? undefined}
      />
    </div>
  );
}
