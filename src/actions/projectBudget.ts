"use server";

// PROJECT BUDGET — the writes behind a project's Budget card (2026-09-18).
//
//   setProjectBudget     the budget by category; replaces the lines and keeps
//                        Project.budget (what the project list reads) equal to
//                        their sum.
//   addProjectExpense    a cost logged straight to the project.
//   deleteProjectExpense takes one back out.
//
// Spending logged on the project's JOBS (JobExpense) is read alongside these
// and is managed where it always was, on the job.
//
// Guard: estimators and managers — the same door every other project write
// uses (actions/projects.ts). Every id is checked against the caller's org.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireEstimatorOrManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { BUDGET_CATEGORIES } from "@/lib/projectBudget";

const money = z.number().finite().min(0).max(100_000_000);
const category = z.enum(BUDGET_CATEGORIES);

async function projectInOrg(projectId: string, organizationId: string) {
  const p = await db.project.findFirst({ where: { id: projectId, organizationId }, select: { id: true } });
  if (!p) throw new Error("Project not found");
  return p.id;
}

function refresh(projectId: string) {
  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/projects");
}

const budgetInput = z.object({
  projectId: z.string().min(1),
  lines: z.array(z.object({ category, amount: money })).max(BUDGET_CATEGORIES.length),
});

/** The project's budget, one amount per category. Zero amounts are dropped. */
export async function setProjectBudget(raw: unknown): Promise<{ budget: number }> {
  const { organizationId } = await requireEstimatorOrManager();
  const data = budgetInput.parse(raw);
  const projectId = await projectInOrg(data.projectId, organizationId);
  const seen = new Set<string>();
  const lines = data.lines.filter((l) => l.amount > 0 && !seen.has(l.category) && seen.add(l.category));
  const budget = Math.round(lines.reduce((n, l) => n + l.amount, 0) * 100) / 100;

  await db.$transaction([
    db.projectBudgetLine.deleteMany({ where: { projectId } }),
    ...lines.map((l) =>
      db.projectBudgetLine.create({
        data: { projectId, category: l.category, amount: Math.round(l.amount * 100) / 100, position: BUDGET_CATEGORIES.indexOf(l.category) },
      }),
    ),
    db.project.update({ where: { id: projectId }, data: { budget } }),
  ]);
  refresh(projectId);
  return { budget };
}

const expenseInput = z.object({
  projectId: z.string().min(1),
  category,
  amount: money.refine((n) => n > 0, "Enter an amount"),
  vendor: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  /** "YYYY-MM-DD"; absent means today. */
  spentAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export async function addProjectExpense(raw: unknown): Promise<{ id: string }> {
  const { organizationId, user } = await requireEstimatorOrManager();
  const data = expenseInput.parse(raw);
  const projectId = await projectInOrg(data.projectId, organizationId);
  const row = await db.projectExpense.create({
    data: {
      projectId,
      category: data.category,
      amount: Math.round(data.amount * 100) / 100,
      vendor: data.vendor || null,
      note: data.note || null,
      // Noon UTC, so the day it was logged for reads the same in every US timezone.
      spentAt: data.spentAt ? new Date(`${data.spentAt}T12:00:00Z`) : new Date(),
      createdById: user.id,
    },
    select: { id: true },
  });
  refresh(projectId);
  return { id: row.id };
}

export async function deleteProjectExpense(id: string): Promise<void> {
  const { organizationId } = await requireEstimatorOrManager();
  const row = await db.projectExpense.findFirst({
    where: { id, project: { organizationId } },
    select: { id: true, projectId: true },
  });
  if (!row) throw new Error("Expense not found");
  await db.projectExpense.delete({ where: { id: row.id } });
  refresh(row.projectId);
}
