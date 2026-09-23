// LEADS WAITING FOR AN ESTIMATOR (2026-09-22) — server only.
//
// Owner, on the HVAC estimator's "Recent estimates" card: "why do we need
// recent estimates there — no need; make smart use of that space." The
// space now shows the work the estimator is for: the shop's own leads that
// still want an estimate and belong to this estimator by their trade
// (lib/leadRules estimatorFor), newest first. One click on a row is the same
// hand-off the lead page makes (actions/leadEstimate). Platform offers the
// shop has not accepted yet are not its work and are left out, as the Leads
// page leaves them out of the pipeline (leads-blueprint ownLeads).

import { db } from "@/lib/db";
import { estimatorFor, type EstimatorId, type WaitingLead } from "@/lib/leadRules";

/** Not yet quoted, lost or closed: the lead still wants an estimate. */
const WAITING = ["NEW", "CLAIMED", "CONTACTED"];

function ago(d: Date): string {
  const m = (Date.now() - d.getTime()) / 60_000;
  if (m < 60) return "just now";
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`;
  if (m < 60 * 24 * 30) return `${Math.round(m / 60 / 24)}d ago`;
  return `${Math.round(m / 60 / 24 / 30)}mo ago`;
}

export async function leadsWaitingFor(organizationId: string, estimator: EstimatorId, limit = 6): Promise<WaitingLead[]> {
  const rows = await db.lead.findMany({
    where: { organizationId, status: { in: WAITING } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, name: true, city: true, state: true, zip: true, projectType: true, description: true, aiCategory: true, source: true, status: true, createdAt: true },
  });
  return rows
    .filter((l) => !(l.source === "LEAD_CENTER" && (l.status === "NEW" || l.status === "ROUTED")))
    .filter((l) => estimatorFor(l.aiCategory, `${l.projectType ?? ""} ${l.description ?? ""}`) === estimator)
    .slice(0, limit)
    .map((l) => ({
      id: l.id,
      name: l.name,
      place: [l.city, l.state].filter(Boolean).join(", ") || l.zip || null,
      projectType: l.projectType,
      ago: ago(l.createdAt),
    }));
}
