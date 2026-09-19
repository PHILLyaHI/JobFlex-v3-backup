// FILING CONTEXT — where the next estimate's proposal is filed (2026-09-18).
//
// "New proposal" on a project (or on a client's page) opens the estimator
// picker, and the contractor may pick ANY engine — Smart Proposal, roof, fence,
// HVAC, video. None of those engines read a client or a project from the URL,
// several are mounted with no props at all on a phone, and one is a DOM
// behaviour script; threading two ids through each of them would be five
// separate plumbing jobs that drift. So the picker records the choice in one
// short-lived cookie, a chip on the estimator page says so out loud (with an ×
// to drop it), and every convert-to-proposal action reads it here, on the
// server, when it creates the proposal — then clears it.
//
// The cookie carries ids and display names. Only the ids are trusted, and only
// after they are checked against the caller's organization: a client that is
// deleted or foreign, or a project that is archived or foreign, is ignored.

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { FILING_COOKIE } from "@/lib/filingCookie";

export type FilingContext = { clientId: string | null; projectId: string | null };

/** The filing the picker recorded, checked against the organization; null when there is none. */
export async function readFilingContext(organizationId: string): Promise<FilingContext | null> {
  let raw: string | undefined;
  try {
    raw = (await cookies()).get(FILING_COOKIE)?.value;
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: { clientId?: unknown; projectId?: unknown };
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  const clientId = typeof parsed.clientId === "string" && parsed.clientId ? parsed.clientId : null;
  const projectId = typeof parsed.projectId === "string" && parsed.projectId ? parsed.projectId : null;
  if (!clientId && !projectId) return null;

  const [client, project] = await Promise.all([
    clientId
      ? db.client.findFirst({ where: { id: clientId, organizationId, deletedAt: null }, select: { id: true } })
      : Promise.resolve(null),
    projectId
      ? db.project.findFirst({ where: { id: projectId, organizationId, status: { not: "ARCHIVED" } }, select: { id: true, clientId: true } })
      : Promise.resolve(null),
  ]);
  // A project named without a client files under the project's own client.
  return { clientId: client?.id ?? project?.clientId ?? null, projectId: project?.id ?? null };
}

/** Spent: the proposal it was for exists now. */
export async function clearFilingContext(): Promise<void> {
  try {
    (await cookies()).delete(FILING_COOKIE);
  } catch {
    /* outside a request that can write cookies — it expires on its own */
  }
}
