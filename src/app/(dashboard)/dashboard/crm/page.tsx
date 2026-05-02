import Link from "next/link";
import { TrendingUp, Inbox, Clock, MessagesSquare, ArrowUpRight } from "lucide-react";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { StatCard } from "@/components/ui/StatCard";
import { StaggerGrid } from "@/components/ui/StaggerGrid";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { relative } from "@/lib/format";

export default async function CrmOverview() {
  const { organizationId } = await requireOrg();
  const now = new Date();

  const [leads, dueFollowUps, conversations, recentLeads, recentActivities] = await Promise.all([
    db.lead.findMany({
      where: { organizationId },
      select: { status: true },
    }),
    db.followUp.count({
      where: { organizationId, completedAt: null, runAt: { lte: now } },
    }),
    db.conversation.count({ where: { organizationId } }),
    db.lead.findMany({
      where: { organizationId, status: { in: ["NEW", "ROUTED", "CLAIMED"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { assignedTo: { select: { name: true } } },
    }),
    db.activityEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const won = leads.filter((l) => l.status === "WON").length;
  const lost = leads.filter((l) => l.status === "LOST").length;
  const active = leads.filter((l) =>
    ["NEW", "ROUTED", "CLAIMED", "CONTACTED", "QUOTED"].includes(l.status),
  ).length;
  const conversionRate = won + lost > 0 ? (won / (won + lost)) * 100 : 0;

  return (
    <>
      <StaggerGrid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Conversion rate"
          value={`${conversionRate.toFixed(1)}%`}
          delta={
            won + lost > 0
              ? {
                  value: `${won} won · ${lost} lost`,
                  direction: conversionRate >= 50 ? "up" : "down",
                }
              : undefined
          }
          hint="Won / (Won + Lost)"
        />
        <StatCard label="Active leads" value={String(active)} hint="In play right now" />
        <StatCard
          label="Follow-ups due"
          value={String(dueFollowUps)}
          hint={dueFollowUps > 0 ? "Past their runAt" : "None overdue"}
        />
        <StatCard label="Shared inbox" value={String(conversations)} hint="Conversation threads" />
      </StaggerGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Fresh leads</CardTitle>
              <CardSubtitle>Latest five — claim or route.</CardSubtitle>
            </div>
            <Link href={"/dashboard/leads/kanban" as any}>
              <Button variant="ghost" size="sm" icon={<ArrowUpRight className="h-3 w-3" />}>
                Kanban
              </Button>
            </Link>
          </CardHeader>
          {recentLeads.length === 0 ? (
            <p className="text-[12px] text-[color:var(--ink-muted)]">No new leads.</p>
          ) : (
            <ul className="divide-y divide-[color:var(--ink-line)]">
              {recentLeads.map((l) => (
                <li key={l.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-[13px] text-[color:var(--ink)] truncate">
                      {l.name}
                    </div>
                    <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5 truncate">
                      {l.projectType ?? "—"}
                      {l.assignedTo?.name && ` · ${l.assignedTo.name}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge tone="accent">{l.status.toLowerCase()}</Badge>
                    <span className="text-[10.5px] text-[color:var(--ink-muted)] tabular">
                      {relative(l.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>What needs you</CardTitle>
              <CardSubtitle>Pinch points worth acting on.</CardSubtitle>
            </div>
          </CardHeader>
          <ul className="space-y-2.5">
            <ActionRow
              icon={<Clock className="h-3.5 w-3.5" />}
              title={`${dueFollowUps} follow-up${dueFollowUps === 1 ? "" : "s"} overdue`}
              hint="Run or mark done in the queue"
              href="/dashboard/crm/queue"
              tone={dueFollowUps > 0 ? "danger" : "neutral"}
              show={dueFollowUps > 0}
            />
            <ActionRow
              icon={<Inbox className="h-3.5 w-3.5" />}
              title={`${active} lead${active === 1 ? "" : "s"} still in motion`}
              hint="Push them forward in the kanban"
              href="/dashboard/leads/kanban"
              tone="accent"
              show={active > 0}
            />
            <ActionRow
              icon={<MessagesSquare className="h-3.5 w-3.5" />}
              title={`${conversations} conversation${conversations === 1 ? "" : "s"}`}
              hint="Open the shared inbox"
              href="/dashboard/messages"
              tone="neutral"
              show={conversations > 0}
            />
            <ActionRow
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              title="Quote → close optimization"
              hint="Tighten your follow-up workflow rules"
              href="/dashboard/crm/workflows"
              tone="neutral"
              show
            />
          </ul>

          <div className="mt-5 pt-4 border-t border-[color:var(--ink-line)]">
            <div className="quiet-caps mb-2">Recent activity</div>
            <ul className="space-y-1.5">
              {recentActivities.slice(0, 5).map((a) => (
                <li
                  key={a.id}
                  className="flex items-start justify-between gap-2 text-[11.5px]"
                >
                  <span className="text-[color:var(--ink-soft)] truncate">{a.summary}</span>
                  <span className="text-[color:var(--ink-muted)] tabular shrink-0">
                    {relative(a.createdAt)}
                  </span>
                </li>
              ))}
              {recentActivities.length === 0 && (
                <li className="text-[11px] text-[color:var(--ink-muted)]">
                  Nothing recorded yet.
                </li>
              )}
            </ul>
          </div>
        </Card>
      </div>
    </>
  );
}

function ActionRow({
  icon,
  title,
  hint,
  href,
  tone,
  show,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  href: string;
  tone: "neutral" | "accent" | "danger";
  show: boolean;
}) {
  if (!show) return null;
  const ring =
    tone === "danger"
      ? "rgba(225,29,72,0.10)"
      : tone === "accent"
        ? "rgba(79,70,229,0.10)"
        : "rgba(17,17,19,0.04)";
  const fg =
    tone === "danger" ? "#BE123C" : tone === "accent" ? "#4F46E5" : "#6B6A64";
  return (
    <li>
      <Link
        href={href as any}
        className="flex items-center gap-3 p-3 rounded-[var(--r-md)] hairline bg-white/40 hover:bg-white/60 transition-colors"
      >
        <span
          className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] shrink-0"
          style={{ background: ring, color: fg }}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-medium text-[color:var(--ink)] truncate">{title}</div>
          <div className="text-[10.5px] text-[color:var(--ink-muted)] truncate">{hint}</div>
        </div>
        <ArrowUpRight className="h-3.5 w-3.5 text-[color:var(--ink-muted)]" />
      </Link>
    </li>
  );
}
