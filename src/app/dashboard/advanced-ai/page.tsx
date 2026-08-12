// Smart Proposal — Blueprint edition. Pixel-identical port of the canonical
// Smart Proposal donor (jobflex-smart-proposal-blueprint_4.html).
//
// The route segment is `advanced-ai` (the app's existing URL for this screen);
// the donor file is named "smart-proposal" and its visible title/heading text
// is kept exactly as authored.
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// The child routes (/roof, /fence, /fence/studio) live under the (dashboard)
// route group and keep the classic layout.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { AdvancedAiContent } from "@/components/v3/advanced-ai-blueprint/advanced-ai-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Smart Proposal",
  description:
    "Smart Proposal — the estimate console and the studio that prices materials, labor and scope on one sheet.",
};

export default async function AdvancedAiPage({
  searchParams,
}: {
  // `?client=<id>` — set by the estimator picker when the studio was opened
  // from a client's record. See the note beside the lookup below.
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: requestedClientId } = await searchParams;

  let organizationId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Fadvanced-ai");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  // The hidden profit markup `convertEstimateToProposal` will apply when it
  // writes the proposal. Read here so the studio's Totals card can state the
  // client price the proposal will actually carry, instead of the donor's
  // editable "Margin %" box that the server never saw.
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { materialMarkupPct: true, laborMarkupPct: true },
  });

  // Resolved HERE rather than handed to the browser as-is: the id arrives on a
  // URL a user can edit, so it is checked against this org before any part of
  // the studio treats it as a client. An id that fails the check becomes null —
  // the estimate is simply unassigned, which is a legitimate draft, rather than
  // an error page over a mistyped query string.
  const clientId = requestedClientId
    ? (
        await db.client.findFirst({
          where: { id: requestedClientId, organizationId, deletedAt: null },
          select: { id: true },
        })
      )?.id ?? null
    : null;

  return (
    <AdvancedAiContent
      markup={{
        materialMarkupPct: org?.materialMarkupPct ?? 0,
        laborMarkupPct: org?.laborMarkupPct ?? 0,
      }}
      clientId={clientId}
    />
  );
}
