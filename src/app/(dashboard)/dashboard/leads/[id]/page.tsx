import { notFound } from "next/navigation";
import { requireOrg, isSalesRole, isWorkerRole } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { longDate } from "@/lib/format";
import { startEstimateFromLead } from "@/actions/leadEstimate";
import { ESTIMATOR_LABEL, estimatorFor, looksLikeStreetAddress, type EstimatorId } from "@/lib/leadRules";

// Session-scoped, never static. Declared so the dev server does not fork its
// static-paths worker for this route — see the workerThreads note in
// next.config.ts.
export const dynamic = "force-dynamic";

// The order the estimator buttons are offered in; the lead's own trade comes
// first (lib/leadRules estimatorFor) and is the filled button.
const ENGINES: EstimatorId[] = ["roof", "fence", "hvac", "smart"];

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId, role, user } = await requireOrg();
  const lead = await db.lead.findUnique({ where: { id }, include: { assignedTo: true } });
  if (!lead || lead.organizationId !== organizationId) return notFound();
  // Sales reps can only open leads that are theirs (assigned/claimed) or NEW.
  if (
    isSalesRole(role) &&
    lead.assignedToId !== user.id &&
    lead.claimedById !== user.id &&
    lead.status !== "NEW"
  ) {
    return notFound();
  }

  // THE WAY INTO AN ESTIMATE (owner, 2026-09-21): the lead's trade picks the
  // estimator, the others stay a click away. A roof or a fence is measured
  // off the address, so those buttons wait until the lead has one.
  const primary = estimatorFor(lead.aiCategory, lead.description);
  const fullAddress = [lead.address, lead.city, [lead.state, lead.zip].filter(Boolean).join(" ")]
    .filter((s) => s && s.trim())
    .join(", ");
  const hasStreet = looksLikeStreetAddress(lead.address);
  const canEstimate = !isSalesRole(role) && !isWorkerRole(role);
  const order = [primary, ...ENGINES.filter((e) => e !== primary)];

  return (
    <>
      <PageHeader
        eyebrow={`Lead · ${lead.status}`}
        title={lead.name}
        description={lead.projectType ?? lead.description?.slice(0, 120) ?? "—"}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <Avatar name={lead.name} size={48} />
            <div>
              <div className="font-display text-[19px]">{lead.name}</div>
              <div className="text-[11px] text-[color:var(--ink-muted)]">
                {[lead.city, lead.state].filter(Boolean).join(", ") || lead.address || "—"}
              </div>
            </div>
          </div>
          <dl className="space-y-2 text-[13px]">
            <dt className="quiet-caps">Email</dt>
            <dd>{lead.email ?? "—"}</dd>
            <dt className="quiet-caps mt-2">Phone</dt>
            <dd>{lead.phone ?? "—"}</dd>
            <dt className="quiet-caps mt-2">Job address</dt>
            <dd data-lead-address>
              {fullAddress || "Not given"}
              {!hasStreet && <span className="text-[color:var(--ink-muted)]"> — no street address yet; a roof or fence quote needs one</span>}
            </dd>
            <dt className="quiet-caps mt-2">Source</dt>
            <dd>{lead.source ?? "Homeowner form"}</dd>
            <dt className="quiet-caps mt-2">Created</dt>
            <dd>{longDate(lead.createdAt)}</dd>
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Badge tone="accent">{lead.status}</Badge>
            {lead.aiCategory && <Badge tone="neutral">AI · {lead.aiCategory}</Badge>}
            {lead.assignedTo && <Badge tone="success">Assigned · {lead.assignedTo.name ?? lead.assignedTo.email}</Badge>}
          </div>

          {/* The scope written for a contractor (lib/leadScope) when the
              request carried one; the homeowner's own words are always kept. */}
          {lead.scope ? (
            <>
              <div className="quiet-caps mb-2">Scope of work</div>
              <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap" data-lead-scope>
                {lead.scope}
              </p>
              <div className="quiet-caps mt-4 mb-2">In the homeowner&apos;s words</div>
            </>
          ) : (
            <div className="quiet-caps mb-2">Project description</div>
          )}
          <p className="text-[13.5px] leading-relaxed text-[color:var(--ink-soft)] whitespace-pre-wrap">
            {lead.description ?? "No description provided."}
          </p>

          {canEstimate && (
            <div className="mt-5 pt-4 border-t border-[color:var(--line)]" data-lead-estimators>
              <div className="quiet-caps mb-2">Estimate this job</div>
              <p className="text-[12.5px] text-[color:var(--ink-muted)] mb-3">
                {primary === "smart"
                  ? "The scope lands in the Smart Proposal's brief with the location filled in."
                  : hasStreet
                    ? `The address goes straight into the ${ESTIMATOR_LABEL[primary]} to measure the job.`
                    : `The ${ESTIMATOR_LABEL[primary]} measures off the address — this lead has no street address yet, so ask for it first.`}
              </p>
              <div className="flex flex-wrap gap-2">
                {order.map((engine) => {
                  const off = (engine === "roof" || engine === "fence") && !hasStreet;
                  const go = startEstimateFromLead.bind(null, lead.id, engine);
                  return (
                    <form key={engine} action={go}>
                      <Button
                        type="submit"
                        size="sm"
                        variant={engine === primary ? "primary" : "outline"}
                        disabled={off}
                        title={off ? "Needs the street address" : undefined}
                        data-estimator={engine}
                      >
                        {ESTIMATOR_LABEL[engine]}
                        {engine === primary ? " · recommended" : ""}
                      </Button>
                    </form>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
