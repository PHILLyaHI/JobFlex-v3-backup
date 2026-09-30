import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { touchWorkerActivity } from "@/lib/workerActivity";

export default async function WorkerPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const worker = await db.workerProfile.findUnique({ where: { token }, select: { id: true } });
  if (!worker) return notFound();

  // Worker opened their portal — record activity for the 6-month inactivity cron.
  await touchWorkerActivity(worker.id);

  // The layout draws no chrome (stage C, 2026-09-30). Each page brings its
  // own: the invite gate owns the whole viewport (worker-invite-blueprint),
  // the job list keeps the portal header and its 720px column (./page.tsx),
  // and a job is the dashboard's blueprint job page with the portal's bar
  // (./jobs/[assignmentId]) — a 720px column would crop its desk edition.
  return <>{children}</>;
}
