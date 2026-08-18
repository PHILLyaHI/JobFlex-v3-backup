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

  // An unanswered invite is not a page INSIDE the portal — it is the public
  // landing page the invite email points at, and it owns the whole viewport
  // (components/v3/worker-invite-blueprint). The portal header would be chrome
  // for an account that does not exist yet, and its 720px column would crop the
  // drafting panel, so the invite gate is rendered bare.
  if (worker.inviteStatus === "PENDING" || worker.inviteStatus === "DECLINED") {
    return <>{children}</>;
  }

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
