// /dashboard/proposals/new — "start a proposal by hand". The blueprint builder
// at /dashboard/manual-blueprint opens EMPTY and honours `?client=<id>` (the
// spelling the estimator picker and the client record already use), so this
// route passes that through and hands over. The Tailwind editor that used to
// render here was removed on 2026-09-12.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NewProposalRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.client;
  const client = Array.isArray(raw) ? raw[0] : raw;
  redirect(client ? `/dashboard/manual-blueprint?client=${encodeURIComponent(client)}` : "/dashboard/manual-blueprint");
}
