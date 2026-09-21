// PROJECT BOOK — the one read behind both editions of /dashboard/projects
// (the desktop page's server component and the handheld build's
// `listProjects` action), so the two can never describe the book differently.
//
// The figures are the project page's own (lib/contractTotal, the budget card's
// spend): sold = accepted, completed and paid proposals with their approved
// change orders; open = what is still with the client; spent = costs logged on
// the project plus every expense on its jobs.

import { db } from "@/lib/db";
import { contractTotal } from "@/lib/contractTotal";
import type { Project } from "./projects-data";

/** "Jul 08" in UTC — project dates are stored as UTC midnight (the action
 *  coerces a "YYYY-MM-DD" string), and a local format renders the previous
 *  day in every negative-offset timezone. */
function shortPlate(d: Date | null): string | null {
  if (!d) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
}

function ago(d: Date): string {
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const SOLD = new Set(["ACCEPTED", "COMPLETED", "PAID"]);
const OPEN = new Set(["SENT", "VIEWED"]);
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function loadProjectBook(organizationId: string): Promise<Project[]> {
  const projects = await db.project.findMany({
    where: { organizationId, status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    include: {
      client: { select: { name: true } },
      jobs: { select: { status: true, updatedAt: true, expenses: { select: { amount: true } } } },
      proposals: {
        where: { status: { not: "ARCHIVED" } },
        select: { status: true, total: true, updatedAt: true, changeOrders: { where: { status: "APPROVED" }, select: { status: true, total: true } } },
      },
      expenses: { select: { amount: true, createdAt: true } },
    },
  });
  return projects.map((p) => {
    const sold = p.proposals.filter((x) => SOLD.has(x.status)).reduce((n, x) => n + contractTotal(x.total, x.changeOrders), 0);
    const openOnes = p.proposals.filter((x) => OPEN.has(x.status));
    const spent = p.expenses.reduce((n, e) => n + e.amount, 0) + p.jobs.reduce((n, j) => n + j.expenses.reduce((m, e) => m + e.amount, 0), 0);
    // "Updated" is the newest thing on the project, not just the row itself.
    const last = [p.updatedAt, ...p.jobs.map((j) => j.updatedAt), ...p.proposals.map((x) => x.updatedAt), ...p.expenses.map((e) => e.createdAt)].reduce((a, b) => (b > a ? b : a));
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      startsAt: shortPlate(p.startsAt),
      endsAt: shortPlate(p.endsAt),
      budget: p.budget,
      jobCount: p.jobs.length,
      completedJobs: p.jobs.filter((j) => j.status === "COMPLETED").length,
      inProgressJobs: p.jobs.filter((j) => j.status === "IN_PROGRESS").length,
      clientName: p.client?.name ?? null,
      proposalCount: p.proposals.length,
      sold: r2(sold),
      open: r2(openOnes.reduce((n, x) => n + x.total, 0)),
      openCount: openOnes.length,
      spent: r2(spent),
      updatedAgo: ago(last),
    };
  });
}
