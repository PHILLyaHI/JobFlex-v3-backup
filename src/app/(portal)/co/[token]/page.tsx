import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ChangeOrderApprovalCard } from "@/components/changeOrders/ChangeOrderApprovalCard";

export default async function ChangeOrderPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const co = await db.changeOrder.findUnique({
    where: { publicToken: token },
    include: {
      organization: { select: { name: true } },
      job: {
        select: {
          title: true,
          proposal: { select: { total: true } },
        },
      },
    },
  });
  if (!co) return notFound();

  return (
    <main className="min-h-dvh flex items-center justify-center p-6 relative">
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 60% 40% at 30% 0%, rgba(200,148,80,0.06), transparent 60%)",
        }}
      />
      <div className="relative z-10 w-full">
        <ChangeOrderApprovalCard
          token={token}
          orgName={co.organization.name}
          title={co.title}
          description={co.description}
          amount={co.amount}
          status={co.status}
          jobTitle={co.job.title}
          proposalTotal={co.job.proposal?.total ?? null}
          approvedAt={co.approvedAt}
          declinedAt={co.declinedAt}
        />
      </div>
    </main>
  );
}
