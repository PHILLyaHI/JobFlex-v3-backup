import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { WorkerPortalHeader } from "@/components/workers/WorkerPortalHeader";

export default async function WorkerPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const worker = await db.workerProfile.findUnique({
    where: { token },
    include: {
      organization: { select: { name: true } },
    },
  });
  if (!worker) return notFound();

  return (
    <div className="min-h-dvh bg-[color:var(--paper)]">
      <WorkerPortalHeader
        workerName={worker.displayName}
        orgName={worker.organization?.name}
      />
      <main className="max-w-[720px] mx-auto px-5 py-8">{children}</main>
    </div>
  );
}
