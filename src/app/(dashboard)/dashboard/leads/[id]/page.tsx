import { notFound } from "next/navigation";
import { requireOrg, isSalesRole } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { longDate } from "@/lib/format";

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
          <div className="quiet-caps mb-2">Project description</div>
          <p className="text-[13.5px] leading-relaxed text-[color:var(--ink-soft)] whitespace-pre-wrap">
            {lead.description ?? "No description provided."}
          </p>
        </Card>
      </div>
    </>
  );
}
