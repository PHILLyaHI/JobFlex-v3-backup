// PROJECT BUDGET — the arithmetic behind a project's Budget card (owner,
// 2026-09-18: "offer me the budgeting budgets and track that budgets within
// the project").
//
// Pure: no database, no framework. The loader feeds it the rows, the page
// renders what it returns, and the same rules hold on desktop and phone.
//
//   budget      — ProjectBudgetLine rows, one per category. A project that
//                 carries only the old single Project.budget figure (created
//                 before categories existed) reads as that total, unsplit.
//   spent       — ProjectExpense rows (costs logged straight to the project)
//                 plus JobExpense rows of the project's jobs, the job's free-
//                 text category mapped onto the six budget categories.
//   contract    — what the client has agreed to pay: the project's accepted,
//                 completed and paid proposals, with approved change orders.
//   projected   — cost at completion: per category, the larger of what was
//                 budgeted and what is already spent (an overrun is a cost
//                 whether or not the budget admits it).
//   margin      — contract − projected cost.

export const BUDGET_CATEGORIES = ["MATERIALS", "LABOR", "SUBCONTRACTORS", "PERMITS", "EQUIPMENT", "OTHER"] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<BudgetCategory, string> = {
  MATERIALS: "Materials",
  LABOR: "Labor",
  SUBCONTRACTORS: "Subcontractors",
  PERMITS: "Permits & fees",
  EQUIPMENT: "Equipment & rentals",
  OTHER: "Other",
};

/** Where a spend sits against its budget. */
export type BudgetTone = "ok" | "warn" | "over" | "none";
/** 80% spent is the warning line; past 100% the category is over. */
export const WARN_AT = 0.8;

export function isBudgetCategory(v: string): v is BudgetCategory {
  return (BUDGET_CATEGORIES as readonly string[]).includes(v);
}

/** A job expense's free-text category ("Materials", "lumber", "Dumpster") onto the six. */
export function categoryOf(raw: string | null | undefined): BudgetCategory {
  const s = (raw ?? "").toLowerCase();
  if (isBudgetCategory((raw ?? "").toUpperCase())) return (raw ?? "").toUpperCase() as BudgetCategory;
  if (/sub ?contract|\bsub\b|install crew|trade/.test(s)) return "SUBCONTRACTORS";
  if (/permit|\bfees?\b|inspection|licen/.test(s)) return "PERMITS";
  if (/equip|rental|rent\b|tool|dumpster|lift|scaffold|machine/.test(s)) return "EQUIPMENT";
  if (/labou?r|wage|payroll|crew|hour/.test(s)) return "LABOR";
  if (/material|lumber|supply|supplies|concrete|shingle|paint|hardware|home depot|lowe/.test(s)) return "MATERIALS";
  return "OTHER";
}

export type BudgetLineIn = { category: string; amount: number };
export type SpendIn = { category: string; amount: number };
export type ContractIn = { status: string; contract: number; total: number };

export type CategoryRow = {
  category: BudgetCategory;
  label: string;
  budget: number;
  spent: number;
  remaining: number;
  /** spent / budget, or null when nothing is budgeted. */
  pct: number | null;
  tone: BudgetTone;
};

export type BudgetSummary = {
  /** The budgeted cost: the lines' sum, or the old single figure when there are no lines. */
  budget: number;
  /** True when the budget is the old single figure, not split by category. */
  unsplit: boolean;
  spent: number;
  remaining: number;
  pct: number | null;
  tone: BudgetTone;
  /** Agreed with the client: sold proposals with approved change orders. */
  contract: number;
  /** Proposed but not yet agreed. */
  pipeline: number;
  /** Cost at completion: per category, the larger of budget and spend. */
  projectedCost: number;
  /** contract − projected cost, or null when nothing is sold yet. */
  margin: number | null;
  marginPct: number | null;
  rows: CategoryRow[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function toneOf(spent: number, budget: number): BudgetTone {
  if (budget <= 0) return spent > 0 ? "over" : "none";
  const pct = spent / budget;
  if (pct > 1) return "over";
  if (pct >= WARN_AT) return "warn";
  return "ok";
}

const SOLD = new Set(["ACCEPTED", "COMPLETED", "PAID"]);
const OPEN = new Set(["DRAFT", "SENT", "VIEWED"]);

export function summarizeBudget(input: {
  lines: BudgetLineIn[];
  /** Project.budget — used only when there are no lines. */
  projectBudget: number;
  spends: SpendIn[];
  proposals: ContractIn[];
}): BudgetSummary {
  const budgetBy = new Map<BudgetCategory, number>();
  for (const l of input.lines) {
    const c = isBudgetCategory(l.category) ? l.category : "OTHER";
    budgetBy.set(c, (budgetBy.get(c) ?? 0) + Math.max(0, l.amount || 0));
  }
  const spentBy = new Map<BudgetCategory, number>();
  for (const s of input.spends) {
    const c = categoryOf(s.category);
    spentBy.set(c, (spentBy.get(c) ?? 0) + Math.max(0, s.amount || 0));
  }

  const linesTotal = [...budgetBy.values()].reduce((a, b) => a + b, 0);
  const unsplit = input.lines.length === 0 && input.projectBudget > 0;
  const budget = unsplit ? input.projectBudget : linesTotal;
  const spent = [...spentBy.values()].reduce((a, b) => a + b, 0);

  const rows: CategoryRow[] = BUDGET_CATEGORIES.map((c) => {
    const b = budgetBy.get(c) ?? 0;
    const s = spentBy.get(c) ?? 0;
    return { category: c, label: CATEGORY_LABEL[c], budget: r2(b), spent: r2(s), remaining: r2(b - s), pct: b > 0 ? s / b : null, tone: toneOf(s, b) };
  }).filter((r) => r.budget > 0 || r.spent > 0);

  // An unsplit budget has no categories to hold an overrun against: the
  // projection is the larger of the whole budget and the whole spend.
  const projectedCost = unsplit
    ? Math.max(budget, spent)
    : BUDGET_CATEGORIES.reduce((n, c) => n + Math.max(budgetBy.get(c) ?? 0, spentBy.get(c) ?? 0), 0);

  const contract = input.proposals.filter((p) => SOLD.has(p.status)).reduce((n, p) => n + p.contract, 0);
  const pipeline = input.proposals.filter((p) => OPEN.has(p.status)).reduce((n, p) => n + p.total, 0);
  const margin = contract > 0 ? contract - projectedCost : null;

  return {
    budget: r2(budget),
    unsplit,
    spent: r2(spent),
    remaining: r2(budget - spent),
    pct: budget > 0 ? spent / budget : null,
    tone: toneOf(spent, budget),
    contract: r2(contract),
    pipeline: r2(pipeline),
    projectedCost: r2(projectedCost),
    margin: margin == null ? null : r2(margin),
    marginPct: margin == null || contract <= 0 ? null : margin / contract,
    rows,
  };
}
