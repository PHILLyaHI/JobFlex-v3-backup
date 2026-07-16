import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { WorkerPortalHeader } from "@/components/workers/WorkerPortalHeader";
import { touchWorkerActivity } from "@/lib/workerActivity";

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

  // Worker opened their portal — record activity for the 6-month inactivity cron.
  await touchWorkerActivity(worker.id);

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
