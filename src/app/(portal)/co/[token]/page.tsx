import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ChangeOrderApprovalCard } from "@/components/changeOrders/ChangeOrderApprovalCard";
import { parseCoLines, parseCoPhotos } from "@/lib/changeOrders/parse";
import { contractTotal } from "@/lib/contractTotal";

// The client's approval page for one change order. Shows the lines, the
// photos of why, the tax, and the contract as it stands: original → changes
// approved so far → this change → new total. Approve = typed full name +
// "I agree"; decline takes a reason. The token is the only key.
export default async function ChangeOrderPublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const co = await db.changeOrder.findUnique({
    where: { publicToken: token },
    include: {
      organization: { select: { name: true, phone: true, deletedAt: true } },
      job: {
        select: {
          title: true,
          proposal: { select: { id: true, title: true, total: true, changeOrders: { where: { status: "APPROVED" }, select: { id: true, status: true, total: true } } } },
        },
      },
      proposal: { select: { id: true, title: true, total: true, changeOrders: { where: { status: "APPROVED" }, select: { id: true, status: true, total: true } } } },
    },
  });
  if (!co || co.organization.deletedAt) return notFound();

  const proposal = co.proposal ?? co.job?.proposal ?? null;
  const contextTitle = co.proposal?.title ?? co.job?.title ?? "Your contract";
  // Contract before this change: the original plus every change already
  // approved, this one excluded (it is counted once approved).
  const others = proposal ? proposal.changeOrders.filter((c) => c.id !== co.id) : [];
  const originalTotal = proposal?.total ?? null;
  const contractBefore = proposal ? contractTotal(proposal.total, others) : null;
  const total = co.total ?? co.amount;

  return (
    <main className="min-h-dvh flex items-center justify-center p-4 sm:p-6 relative">
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{ backgroundImage: "radial-gradient(ellipse 60% 40% at 30% 0%, rgba(200,148,80,0.06), transparent 60%)" }}
      />
      <div className="relative z-10 w-full">
        <ChangeOrderApprovalCard
          token={token}
          orgName={co.organization.name}
          orgPhone={co.organization.phone}
          number={co.number}
          title={co.title}
          reason={co.reason ?? co.description}
          lines={parseCoLines(co.linesJson).map((l) => ({ ...l, total: Math.round(l.quantity * l.unitPrice * 100) / 100 }))}
          photos={parseCoPhotos(co.photosJson)}
          subtotal={co.amount}
          taxRate={co.taxRate ?? 0}
          taxTotal={co.taxTotal ?? 0}
          total={total}
          status={co.status}
          contextTitle={contextTitle}
          originalTotal={originalTotal}
          contractBefore={contractBefore}
          approvedAt={co.approvedAt}
          approvedName={co.approvedName}
          declinedAt={co.declinedAt}
        />
      </div>
    </main>
  );
}
