import Link from "next/link";
import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { money, relative } from "@/lib/format";
import { CustomerBookTable } from "@/components/crm/CustomerBookTable";

export default async function CustomerBookPage() {
  const { organizationId } = await requireOrg();

  const clients = await db.client.findMany({
    where: { organizationId },
    include: {
      proposals: {
        select: { id: true, total: true, status: true, createdAt: true },
      },
      payments: {
        where: { status: "PAID" },
        select: { amount: true, paidAt: true },
      },
    },
  });

  const customers = clients
    .map((c) => {
      const proposals = c.proposals;
      const ltv = c.payments.reduce((a, p) => a + p.amount, 0);
      const lastProposalAt = proposals.length
        ? proposals.reduce((latest, p) =>
            p.createdAt > latest ? p.createdAt : latest,
          new Date(0))
        : null;
      const lastPaidAt = c.payments.reduce<Date | null>(
        (latest, p) =>
          p.paidAt && (!latest || p.paidAt > latest) ? p.paidAt : latest,
        null,
      );
      const lastActivity =
        lastPaidAt && lastProposalAt
          ? lastPaidAt > lastProposalAt
            ? lastPaidAt
            : lastProposalAt
          : (lastPaidAt ?? lastProposalAt);
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        proposalsCount: proposals.length,
        proposalsValue: proposals.reduce((a, p) => a + p.total, 0),
        ltv,
        lastActivity,
        topStatus: deriveTopStatus(proposals.map((p) => p.status)),
      };
    })
    .filter((c) => c.proposalsCount > 0)
    .sort((a, b) => b.ltv - a.ltv);

  const totalLtv = customers.reduce((a, c) => a + c.ltv, 0);
  const totalProposals = customers.reduce((a, c) => a + c.proposalsCount, 0);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <div className="paper-card p-4">
          <div className="quiet-caps">Customers</div>
          <div className="font-display tabular text-[24px] mt-1.5 leading-none">{customers.length}</div>
          <div className="text-[10.5px] text-[color:var(--ink-muted)] mt-1.5 tabular">with ≥1 proposal</div>
        </div>
        <div className="paper-card p-4">
          <div className="quiet-caps">Lifetime value</div>
          <div className="font-display tabular text-[24px] mt-1.5 leading-none">{money(totalLtv)}</div>
          <div className="text-[10.5px] text-[color:var(--ink-muted)] mt-1.5 tabular">paid to date</div>
        </div>
        <div className="paper-card p-4">
          <div className="quiet-caps">Total proposals</div>
          <div className="font-display tabular text-[24px] mt-1.5 leading-none">{totalProposals}</div>
          <div className="text-[10.5px] text-[color:var(--ink-muted)] mt-1.5 tabular">all statuses</div>
        </div>
      </div>

      {customers.length === 0 ? (
        <Card>
          <div className="py-10 text-center">
            <Users className="h-6 w-6 text-[color:var(--ink-faint)] mx-auto mb-3" />
            <div className="font-medium text-[color:var(--ink)]">No customers yet</div>
            <div className="text-[12px] text-[color:var(--ink-muted)] mt-1.5 leading-relaxed max-w-sm mx-auto">
              Clients land here once they have at least one proposal attached.
            </div>
          </div>
        </Card>
      ) : (
        <CustomerBookTable rows={customers} />
      )}
    </>
  );
}

function deriveTopStatus(statuses: string[]): string {
  // Priority — what's the most "alive" status across this client's proposals?
  const order = ["PAID", "ACCEPTED", "VIEWED", "SENT", "DRAFT", "DECLINED", "EXPIRED", "ARCHIVED"];
  for (const s of order) if (statuses.includes(s)) return s;
  return statuses[0] ?? "DRAFT";
}
