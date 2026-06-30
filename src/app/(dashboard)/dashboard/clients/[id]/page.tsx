import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { money, longDate, shortDate } from "@/lib/format";
import { Phone, Mail, MapPin, Sparkles } from "lucide-react";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireOrg();
  const client = await db.client.findUnique({
    where: { id },
    include: {
      proposals: { orderBy: { updatedAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" }, take: 20 },
      activities: { orderBy: { createdAt: "desc" }, take: 20 },
      tags: { include: { tag: true } },
    },
  });
  if (!client || client.organizationId !== organizationId) return notFound();

  const totalPaid = client.payments
    .filter((p) => p.status === "PAID")
    .reduce((a, p) => a + p.amount, 0);
  const pipeline = client.proposals
    .filter((p) => !["DECLINED", "EXPIRED", "ARCHIVED"].includes(p.status))
    .reduce((a, p) => a + p.total, 0);

  return (
    <>
      <PageHeader
        eyebrow={`Client · since ${shortDate(client.createdAt)}`}
        title={client.name}
        description={client.notes ?? "No notes yet."}
        actions={
          <Link href={"/dashboard/advanced-ai" as any}>
            <Button icon={<Sparkles className="h-3.5 w-3.5" />}>New proposal</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <Card className="lg:col-span-1">
          <div className="flex items-center gap-3 mb-5">
            <Avatar name={client.name} size={52} />
            <div>
              <div className="font-display text-[20px] tracking-[-0.015em]">{client.name}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {client.tags.map((t) => (
                  <Badge key={t.tagId} tone="accent">
                    {t.tag.label}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <dl className="space-y-2.5 text-[13px]">
            <Row icon={<Mail className="h-3.5 w-3.5" />} label={client.email ?? "—"} />
            <Row icon={<Phone className="h-3.5 w-3.5" />} label={client.phone ?? "—"} />
            <Row
              icon={<MapPin className="h-3.5 w-3.5" />}
              label={[client.address, client.city, client.state, client.zip].filter(Boolean).join(", ") || "—"}
            />
          </dl>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <StatBlock label="Lifetime paid" value={money(totalPaid)} />
            <StatBlock label="Open pipeline" value={money(pipeline)} />
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Proposals</CardTitle>
              <CardSubtitle>{client.proposals.length} total</CardSubtitle>
            </div>
          </CardHeader>
          {client.proposals.length === 0 ? (
            <p className="text-[12px] text-[color:var(--ink-muted)]">No proposals yet.</p>
          ) : (
            <ul className="divide-y divide-[color:var(--ink-line)]">
              {client.proposals.map((p) => (
                <li key={p.id} className="py-3 flex items-center justify-between">
                  <Link href={`/dashboard/proposals/${p.id}` as any} className="min-w-0">
                    <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">{p.title}</div>
                    <div className="text-[11px] text-[color:var(--ink-muted)]">{longDate(p.updatedAt)}</div>
                  </Link>
                  <div className="flex items-center gap-3">
                    <Badge tone={toneFor(p.status)}>{p.status}</Badge>
                    <span className="font-display tabular text-[15px]">{money(p.total)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5 items-start">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Payment history</CardTitle>
              <CardSubtitle>Received payments across all providers</CardSubtitle>
            </div>
          </CardHeader>
          {client.payments.length === 0 ? (
            <p className="text-[12px] text-[color:var(--ink-muted)]">No payments recorded.</p>
          ) : (
            <ul className="divide-y divide-[color:var(--ink-line)]">
              {client.payments.map((p) => (
                <li key={p.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="text-[13px] text-[color:var(--ink)]">{p.method ?? p.provider.toLowerCase()}</div>
                    <div className="text-[11px] text-[color:var(--ink-muted)]">{longDate(p.paidAt ?? p.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={p.status === "PAID" ? "success" : p.status === "FAILED" ? "danger" : "neutral"}>
                      {p.status}
                    </Badge>
                    <span className="font-display tabular text-[15px]">{money(p.amount)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Activity</CardTitle>
              <CardSubtitle>Recent signals from this client</CardSubtitle>
            </div>
          </CardHeader>
          <ActivityFeed items={client.activities} />
        </Card>
      </div>
    </>
  );
}

function Row({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-[color:var(--ink-soft)]">
      <span className="text-[color:var(--ink-muted)]">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--r-md)] hairline p-3">
      <div className="quiet-caps">{label}</div>
      <div className="font-display text-[22px] tabular mt-1">{value}</div>
    </div>
  );
}

function toneFor(s: string): "neutral" | "accent" | "success" | "warn" | "danger" {
  if (s === "ACCEPTED" || s === "PAID") return "success";
  if (s === "SENT" || s === "VIEWED") return "accent";
  if (s === "DECLINED" || s === "EXPIRED") return "danger";
  return "neutral";
}
