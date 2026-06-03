// Variant-2v parallel build — Proposals page.
// Faithful port of c:/jobflex-variants/variant-2v-neutral/src/pages/Proposals.jsx,
// wired to real Prisma data. Lives at /v3/proposals-2v alongside the live
// /dashboard/proposals (Pressroom edition). No changes to data layer or actions.

import "@/styles/variant-2v.css";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { V3_PORTED_ROUTES } from "@/lib/v3/routes";
import { Proposals2vView, type Proposal2vRow } from "./proposals-2v-view";

export const dynamic = "force-dynamic";

export default async function Proposals2vPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/login?next=${encodeURIComponent(V3_PORTED_ROUTES.proposals2v)}`);
  }

  const { organizationId } = await requireOrg();

  const proposals = await db.proposal.findMany({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
    include: {
      client: { select: { name: true } },
      owner: { select: { id: true, name: true } },
    },
  });

  const rows: Proposal2vRow[] = proposals.map((p) => ({
    id: p.id,
    title: p.title,
    clientName: p.client?.name ?? "Unassigned",
    status: p.status.toLowerCase() as Proposal2vRow["status"],
    viewCount: p.viewCount,
    updatedAtISO: p.updatedAt.toISOString(),
    total: p.total,
    creatorId: p.owner?.id ?? null,
    creatorName: p.owner?.name ?? null,
  }));

  return <Proposals2vView rows={rows} />;
}
