"use client";

// PROJECT BUDGET CARD (owner, 2026-09-18: "offer me the budgeting budgets and
// track that budgets within the project … smart and professional, and easy to
// use"). One component for the desktop and the handheld project page.
//
// Reads top to bottom the way a contractor checks a job:
//   1. the four numbers — sold, budgeted cost, spent, where the margin lands;
//   2. what needs attention — a category past 80%, one over budget;
//   3. each category's bar — spent against budgeted, what is left;
//   4. the spending itself — logged here or on the project's jobs.
// Setting the budget and logging a cost open in place, above the numbers they
// change; every write refreshes the page's data.
//
// Styles live in the module under `.w.w` so they outrank the desktop page's
// blanket `.content *` / `.content button` resets, and read only the global
// tokens so the handheld page (which has no blueprint module) draws the same.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addProjectExpense, deleteProjectExpense, setProjectBudget } from "@/actions/projectBudget";
import { BUDGET_CATEGORIES, CATEGORY_LABEL, WARN_AT, type BudgetCategory, type BudgetTone } from "@/lib/projectBudget";
import type { PdBudget } from "@/components/v3/project-detail-blueprint/project-detail-data";
import s from "./project-budget-card.module.css";

const whole = (n: number) => (n < 0 ? "−$" : "$") + Math.round(Math.abs(n)).toLocaleString("en-US");
const exact = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
const pctText = (p: number | null) => (p == null ? "—" : `${Math.round(p * 100)}%`);
const today = () => new Date().toISOString().slice(0, 10);
const dateText = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const toneCls = (t: BudgetTone) => (t === "over" ? s.over : t === "warn" ? s.warn : t === "ok" ? s.ok : "");
const parseMoney = (v: string) => {
  const n = Number(v.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

type Panel = null | "budget" | "expense";

export function ProjectBudgetCard({ projectId, budget }: { projectId: string; budget: PdBudget }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sum = budget.summary;

  // ── budget editor ──
  const initialDraft = useMemo(() => {
    const d: Record<BudgetCategory, string> = { MATERIALS: "", LABOR: "", SUBCONTRACTORS: "", PERMITS: "", EQUIPMENT: "", OTHER: "" };
    for (const l of budget.lines) if (l.category in d) d[l.category as BudgetCategory] = String(Math.round(l.amount));
    return d;
  }, [budget.lines]);
  const [draft, setDraft] = useState(initialDraft);
  const draftTotal = BUDGET_CATEGORIES.reduce((n, c) => n + parseMoney(draft[c]), 0);

  // ── expense form ──
  const [exp, setExp] = useState({ category: "MATERIALS" as BudgetCategory, amount: "", vendor: "", note: "", date: today() });

  const open = (p: Panel) => {
    setError(null);
    if (p === "budget") setDraft(initialDraft);
    if (p === "expense") setExp({ category: "MATERIALS", amount: "", vendor: "", note: "", date: today() });
    setPanel((cur) => (cur === p ? null : p));
  };
  const done = () => {
    setPanel(null);
    startTransition(() => router.refresh());
  };

  async function saveBudget() {
    setBusy(true);
    setError(null);
    try {
      await setProjectBudget({ projectId, lines: BUDGET_CATEGORIES.map((c) => ({ category: c, amount: parseMoney(draft[c]) })) });
      done();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the budget.");
    } finally {
      setBusy(false);
    }
  }

  async function saveExpense() {
    const amount = parseMoney(exp.amount);
    if (!(amount > 0)) {
      setError("Enter what it cost.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addProjectExpense({ projectId, category: exp.category, amount, vendor: exp.vendor, note: exp.note, spentAt: exp.date || null });
      done();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't log the expense.");
    } finally {
      setBusy(false);
    }
  }

  async function removeExpense(id: string) {
    if (!window.confirm("Delete this expense from the project?")) return;
    try {
      await deleteProjectExpense(id);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete it.");
    }
  }

  // What needs attention, most urgent first.
  const alerts = sum.rows
    .filter((r) => r.tone === "over" || r.tone === "warn")
    .sort((a, b) => (b.pct ?? 99) - (a.pct ?? 99))
    .map((r) =>
      r.tone === "over"
        ? r.budget > 0
          ? { tone: "over" as const, text: `${r.label} is over budget by ${whole(r.spent - r.budget)}` }
          : { tone: "over" as const, text: `${r.label} has ${whole(r.spent)} spent with nothing budgeted` }
        : { tone: "warn" as const, text: `${r.label} is at ${pctText(r.pct)} of budget — ${whole(r.remaining)} left` },
    );
  const empty = sum.budget <= 0 && sum.spent <= 0;

  return (
    <div className={s.w}>
      <section className={s.card} aria-label="Budget">
        <div className={s.head}>
          <h2 className={s.title}>Budget</h2>
          {!empty ? (
            <span className={`${s.headTone} ${toneCls(sum.tone)}`}>
              {sum.budget > 0 ? `${pctText(sum.pct)} spent` : "No budget set"}
            </span>
          ) : null}
          <div className={s.acts}>
            <button type="button" className={panel === "budget" ? s.btnOn : s.btn} onClick={() => open("budget")} aria-expanded={panel === "budget"}>
              {sum.budget > 0 ? "Edit budget" : "Set budget"}
            </button>
            <button type="button" className={panel === "expense" ? s.btnOn : s.btnPrimary} onClick={() => open("expense")} aria-expanded={panel === "expense"}>
              + Log expense
            </button>
          </div>
        </div>

        {/* ── the editors open here, above what they change ── */}
        {panel === "budget" ? (
          <div className={s.panel}>
            <div className={s.panelHint}>
              What this project should cost, by category. Spending on the project and on its jobs is tracked against it.
              {sum.unsplit ? ` It is ${whole(sum.budget)} as one figure now — split it to track each category.` : ""}
            </div>
            <div className={s.grid}>
              {BUDGET_CATEGORIES.map((c) => (
                <label key={c} className={s.fld}>
                  <span className={s.lbl}>{CATEGORY_LABEL[c]}</span>
                  <span className={s.moneyIn}>
                    <span aria-hidden="true">$</span>
                    <input
                      inputMode="decimal"
                      value={draft[c]}
                      placeholder="0"
                      onChange={(e) => setDraft((d) => ({ ...d, [c]: e.target.value.replace(/[^\d.,]/g, "") }))}
                    />
                  </span>
                </label>
              ))}
            </div>
            <div className={s.panelFoot}>
              <span className={s.total}>
                Budgeted cost <b>{whole(draftTotal)}</b>
                {sum.contract > 0 ? (
                  <>
                    {" "}
                    · margin at this budget <b className={sum.contract - draftTotal < 0 ? s.overText : ""}>{whole(sum.contract - draftTotal)}</b>
                  </>
                ) : null}
              </span>
              <button type="button" className={s.btn} onClick={() => setPanel(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className={s.btnPrimary} onClick={() => void saveBudget()} disabled={busy}>
                {busy ? "Saving…" : "Save budget"}
              </button>
            </div>
          </div>
        ) : null}

        {panel === "expense" ? (
          <div className={s.panel}>
            <div className={s.grid}>
              <label className={s.fld}>
                <span className={s.lbl}>Category</span>
                <select value={exp.category} onChange={(e) => setExp((x) => ({ ...x, category: e.target.value as BudgetCategory }))}>
                  {BUDGET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={s.fld}>
                <span className={s.lbl}>Amount</span>
                <span className={s.moneyIn}>
                  <span aria-hidden="true">$</span>
                  <input
                    inputMode="decimal"
                    autoFocus
                    value={exp.amount}
                    placeholder="0.00"
                    onChange={(e) => setExp((x) => ({ ...x, amount: e.target.value.replace(/[^\d.,]/g, "") }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveExpense();
                    }}
                  />
                </span>
              </label>
              <label className={s.fld}>
                <span className={s.lbl}>Vendor</span>
                <input value={exp.vendor} maxLength={120} placeholder="Home Depot" onChange={(e) => setExp((x) => ({ ...x, vendor: e.target.value }))} />
              </label>
              <label className={s.fld}>
                <span className={s.lbl}>Date</span>
                <input type="date" value={exp.date} onChange={(e) => setExp((x) => ({ ...x, date: e.target.value }))} />
              </label>
              <label className={`${s.fld} ${s.wide}`}>
                <span className={s.lbl}>Note</span>
                <input value={exp.note} maxLength={500} placeholder="What it was for" onChange={(e) => setExp((x) => ({ ...x, note: e.target.value }))} />
              </label>
            </div>
            <div className={s.panelFoot}>
              <span className={s.total}>
                {(() => {
                  const row = sum.rows.find((r) => r.category === exp.category);
                  const after = (row?.spent ?? 0) + parseMoney(exp.amount);
                  const b = row?.budget ?? 0;
                  return b > 0 ? (
                    <>
                      {CATEGORY_LABEL[exp.category]} after this: <b className={after > b ? s.overText : after >= b * WARN_AT ? s.warnText : ""}>{whole(after)}</b> of {whole(b)}
                    </>
                  ) : (
                    <>{CATEGORY_LABEL[exp.category]} has no budget set</>
                  );
                })()}
              </span>
              <button type="button" className={s.btn} onClick={() => setPanel(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className={s.btnPrimary} onClick={() => void saveExpense()} disabled={busy}>
                {busy ? "Saving…" : "Log expense"}
              </button>
            </div>
          </div>
        ) : null}
        {error ? (
          <div className={s.err} role="alert">
            {error}
          </div>
        ) : null}

        {empty && panel === null ? (
          <div className={s.empty}>
            <b>No budget yet.</b> Set what this project should cost by category — materials, labor, subs, permits,
            equipment — and every cost logged here or on its jobs is tracked against it, with a warning at 80% and when a
            category runs over.
            <button type="button" className={s.btnPrimary} onClick={() => open("budget")}>
              Set budget
            </button>
          </div>
        ) : null}

        {!empty ? (
          <>
            {/* 1 — the four numbers */}
            <div className={s.nums}>
              <div className={s.num}>
                <span className={s.numL}>Contract</span>
                <span className={s.numV}>{sum.contract > 0 ? whole(sum.contract) : "—"}</span>
                <span className={s.numS}>{sum.contract > 0 ? "sold, with approved changes" : sum.pipeline > 0 ? `${whole(sum.pipeline)} proposed` : "nothing sold yet"}</span>
              </div>
              <div className={s.num}>
                <span className={s.numL}>Budgeted cost</span>
                <span className={s.numV}>{sum.budget > 0 ? whole(sum.budget) : "—"}</span>
                <span className={s.numS}>{sum.unsplit ? "one figure — not split" : `${sum.rows.filter((r) => r.budget > 0).length} categories`}</span>
              </div>
              <div className={s.num}>
                <span className={s.numL}>Spent</span>
                <span className={`${s.numV} ${toneCls(sum.tone)}`}>{whole(sum.spent)}</span>
                <span className={s.numS}>
                  {sum.budget > 0 ? (sum.remaining >= 0 ? `${whole(sum.remaining)} left` : `${whole(-sum.remaining)} over`) : "no budget to track"}
                </span>
              </div>
              <div className={s.num}>
                <span className={s.numL}>Projected margin</span>
                <span className={`${s.numV} ${sum.margin != null && sum.margin < 0 ? s.overText : sum.margin != null ? s.okText : ""}`}>
                  {sum.margin != null ? whole(sum.margin) : "—"}
                </span>
                <span className={s.numS}>
                  {sum.margin != null ? `${pctText(sum.marginPct)} of contract · cost ${whole(sum.projectedCost)}` : "once a proposal is sold"}
                </span>
              </div>
            </div>

            {/* the whole budget as one bar, the 80% line drawn on it */}
            {sum.budget > 0 ? (
              <div className={s.bar} aria-hidden="true">
                <i className={toneCls(sum.tone)} style={{ width: `${Math.min(100, (sum.pct ?? 0) * 100)}%` }} />
                <b style={{ left: `${WARN_AT * 100}%` }} />
              </div>
            ) : null}

            {/* 2 — what needs attention */}
            {alerts.length ? (
              <ul className={s.alerts}>
                {alerts.map((a) => (
                  <li key={a.text} className={a.tone === "over" ? s.alertOver : s.alertWarn}>
                    {a.text}
                  </li>
                ))}
              </ul>
            ) : null}

            {/* 3 — by category */}
            {sum.rows.length ? (
              <div className={s.rows} role="table" aria-label="Budget by category">
                {sum.rows.map((r) => (
                  <div key={r.category} className={s.row} role="row">
                    <span className={s.rowL} role="cell">
                      {r.label}
                    </span>
                    <span className={s.rowBar} role="cell" aria-label={`${pctText(r.pct)} of budget`}>
                      <i className={toneCls(r.tone)} style={{ width: `${r.budget > 0 ? Math.min(100, (r.pct ?? 0) * 100) : r.spent > 0 ? 100 : 0}%` }} />
                    </span>
                    <span className={s.rowV} role="cell">
                      <b className={toneCls(r.tone)}>{whole(r.spent)}</b> of {r.budget > 0 ? whole(r.budget) : "—"}
                    </span>
                    <span className={`${s.rowR} ${r.remaining < 0 ? s.overText : ""}`} role="cell">
                      {r.budget > 0 ? (r.remaining >= 0 ? `${whole(r.remaining)} left` : `${whole(-r.remaining)} over`) : "not budgeted"}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* 4 — the spending */}
            <div className={s.secL}>
              Spending
              <span>{budget.expenses.length ? `${budget.expenses.length}${budget.expenses.length >= 60 ? "+" : ""} entries` : "nothing logged yet"}</span>
            </div>
            {budget.expenses.length ? (
              <ul className={s.exps}>
                {budget.expenses.slice(0, 12).map((e) => (
                  <li key={e.source + e.id} className={s.exp}>
                    <span className={s.expDate}>{dateText(e.at)}</span>
                    <span className={s.expMain}>
                      <span className={s.expT}>
                        {e.source === "project" ? e.vendor || CATEGORY_LABEL[e.category as BudgetCategory] || e.category : e.jobTitle}
                      </span>
                      <span className={s.expS}>
                        {CATEGORY_LABEL[e.category as BudgetCategory] ?? e.category}
                        {e.source === "job" ? " · logged on the job" : ""}
                        {e.note ? ` · ${e.note}` : ""}
                      </span>
                    </span>
                    <span className={s.expAmt}>{exact(e.amount)}</span>
                    {e.source === "project" ? (
                      <button type="button" className={s.expX} aria-label="Delete this expense" title="Delete" onClick={() => void removeExpense(e.id)}>
                        ×
                      </button>
                    ) : (
                      <span className={s.expX} aria-hidden="true" />
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
