"use client";

// THE OFFICE'S SIDE OF THE CREW'S MONEY (stage D, 2026-09-30) —
// Financials → Expenses, desk and handheld editions alike.
//
//   OfficeReview   — every receipt on review: who sent it, for which job, how
//                    much, the picture, who paid; approve or reject with a
//                    reason, one at a time or several at once. Then what the
//                    company owes each worker (approved receipts they paid,
//                    not handed back) with "Mark reimbursed".
//   JobCostCard    — the cost of each job (lib/jobCost), the same figure its
//                    job page shows, and the purchases for stock beside it.
//   ExpenseStatusFilter — All / On review / Approved / Rejected / Reimbursed.
//
// Wears the crew board's sheet (crew-board.module.css) so the job page and
// Financials draw a receipt the same way. Writes go through the existing
// server actions (actions/expenses.ts), which re-check the manager; after a
// write the page re-reads through `onChanged` — the desk reloads its books,
// the handheld re-fetches.

import { useState } from "react";
import { Check, FileText, Receipt, X } from "lucide-react";
import { reviewJobExpenses } from "@/actions/expenses";
import s from "./crew-board.module.css";
import { EXPENSE_STATUS_FILTERS, money2, type JobCostRow, type OfficeMoney, type ReviewItem } from "./office-review-data";

function cx(...n: Array<string | false | null | undefined>) {
  return n
    .filter(Boolean)
    .map((k) => (s as Record<string, string>)[k as string] ?? k)
    .join(" ");
}

type Decision = "approve" | "reject" | "reimburse";

function useReview(onChanged: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (key: string, ids: string[], decision: Decision, reason?: string) => {
    setBusy(key);
    setError(null);
    try {
      const out = await reviewJobExpenses(ids, decision, reason ?? null);
      if (out.failed.length) setError(out.failed.length === ids.length ? out.failed[0].error : `${out.done.length} done — ${out.failed.length} could not move: ${out.failed[0].error}`);
      if (out.done.length) onChanged();
      return out.failed.length === 0;
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "That did not go through — try again.");
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, setError, run };
}

function ErrorLine({ text, onClose }: { text: string | null; onClose: () => void }) {
  if (!text) return null;
  return (
    <div className={cx("err")} role="alert" style={{ margin: "12px var(--pad) 0" }}>
      <span>{text}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss">
        <X aria-hidden="true" />
      </button>
    </div>
  );
}

/** One receipt in the queue. */
function QueueRow({ r, picked, onPick, review }: { r: ReviewItem; picked: boolean; onPick: (on: boolean) => void; review: ReturnType<typeof useReview> }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <li className={cx("rc", "rcPick")} data-status="SUBMITTED" data-queue-item={r.id}>
      <input className={cx("chk")} type="checkbox" checked={picked} onChange={(e) => onPick(e.target.checked)} aria-label={`Select the ${money2(r.amount)} receipt from ${r.who ?? "the crew"}`} />
      <div className={cx("rcThumb")}>
        {r.receipt ? (
          <a href={r.receipt.href} target="_blank" rel="noopener noreferrer" aria-label="Open the receipt">
            {r.receipt.pdf ? (
              <FileText aria-hidden="true" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.receipt.href} alt="" loading="lazy" />
            )}
          </a>
        ) : (
          <Receipt aria-hidden="true" />
        )}
      </div>
      <div className={cx("rcMain")}>
        <div className={cx("rcTop")}>
          <span className={cx("rcName")}>
            {r.who ?? "The crew"} · {r.jobId ? <a href={`/dashboard/jobs/${r.jobId}`}>{r.job}</a> : r.job}
          </span>
          <span className={cx("rcAmt")}>{money2(r.amount)}</span>
        </div>
        <div className={cx("meta")}>
          {[r.vendor, r.category, r.spent].filter(Boolean).join(" · ")} · {r.paidBy === "WORKER" ? <b>paid by {r.who ?? "the worker"} — to reimburse</b> : "company card"}
          {r.edited && <span className={cx("edited")}> · {r.edited}</span>}
          {!r.receipt && " · no picture"}
        </div>
        {r.note && <div className={cx("rcNote")}>{r.note}</div>}
        {rejecting ? (
          <div className={cx("rejectBox")}>
            <label className={cx("field")}>
              <span className={cx("fieldLabel")}>Why is it rejected? The worker reads this.</span>
              <input className={cx("input")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. Not for this job" data-reject-reason-input />
            </label>
            <div className={cx("rejectRow")}>
              <button
                type="button"
                className={cx("btn", "btnDanger", "btnSm")}
                disabled={!reason.trim() || review.busy === `rej-${r.id}`}
                data-reject-confirm
                onClick={async () => {
                  if (await review.run(`rej-${r.id}`, [r.id], "reject", reason.trim())) setRejecting(false);
                }}
              >
                Reject receipt
              </button>
              <button type="button" className={cx("btn", "btnSm")} onClick={() => setRejecting(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className={cx("rcActs")}>
            <span className={cx("stamp", "stamp-wait")}>On review</span>
            <button type="button" className={cx("btn", "btnPrimary", "btnSm")} disabled={review.busy === `ok-${r.id}`} onClick={() => void review.run(`ok-${r.id}`, [r.id], "approve")} data-approve>
              <Check aria-hidden="true" /> Approve
            </button>
            <button type="button" className={cx("btn", "btnSm")} onClick={() => setRejecting(true)} data-reject>
              Reject
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export function OfficeReview({ data, onChanged }: { data: OfficeMoney; onChanged: () => void }) {
  const review = useReview(onChanged);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [batchReject, setBatchReject] = useState(false);
  const [batchReason, setBatchReason] = useState("");
  // Only ids still in the queue count as selected (a refresh may drop some).
  const selected = data.queue.filter((q) => picked.has(q.id)).map((q) => q.id);
  const all = data.queue.length > 0 && selected.length === data.queue.length;
  const pick = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const queueTotal = data.queue.reduce((a, q) => a + q.amount, 0);

  return (
    <div className={cx("root")} data-office-review>
      {/* ── the queue ── */}
      <section className={cx("card")} data-review-queue>
        <div className={cx("head")}>
          <div>
            <span className={cx("label")}>Waiting for you</span>
            <h2 className={cx("title")}>Receipts on review</h2>
          </div>
          <span className={cx("mono")} data-queue-count={data.queue.length}>
            {data.queue.length} · {money2(queueTotal)} · not in any total yet
          </span>
        </div>
        {data.queue.length === 0 ? (
          <p className={cx("empty")}>Nothing on review. A receipt the crew sends lands here first.</p>
        ) : (
          <>
            <div className={cx("batch")}>
              <label className={cx("chkLabel")}>
                <input className={cx("chk")} type="checkbox" checked={all} onChange={(e) => setPicked(e.target.checked ? new Set(data.queue.map((q) => q.id)) : new Set())} data-select-all />
                {selected.length ? `${selected.length} selected` : "Select all"}
              </label>
              {selected.length > 0 && !batchReject && (
                <>
                  <button
                    type="button"
                    className={cx("btn", "btnPrimary", "btnSm")}
                    disabled={review.busy === "batch-ok"}
                    data-batch-approve
                    onClick={async () => {
                      if (await review.run("batch-ok", selected, "approve")) setPicked(new Set());
                    }}
                  >
                    <Check aria-hidden="true" /> Approve {selected.length}
                  </button>
                  <button type="button" className={cx("btn", "btnSm")} onClick={() => setBatchReject(true)} data-batch-reject>
                    Reject {selected.length}
                  </button>
                </>
              )}
              {selected.length > 0 && batchReject && (
                <div className={cx("rejectBox")}>
                  <label className={cx("field")}>
                    <span className={cx("fieldLabel")}>One reason for all {selected.length} — each worker reads it</span>
                    <input className={cx("input")} value={batchReason} onChange={(e) => setBatchReason(e.target.value)} maxLength={500} data-batch-reason />
                  </label>
                  <div className={cx("rejectRow")}>
                    <button
                      type="button"
                      className={cx("btn", "btnDanger", "btnSm")}
                      disabled={!batchReason.trim() || review.busy === "batch-no"}
                      data-batch-reject-confirm
                      onClick={async () => {
                        if (await review.run("batch-no", selected, "reject", batchReason.trim())) {
                          setPicked(new Set());
                          setBatchReject(false);
                          setBatchReason("");
                        }
                      }}
                    >
                      Reject {selected.length}
                    </button>
                    <button type="button" className={cx("btn", "btnSm")} onClick={() => setBatchReject(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
            <ErrorLine text={review.error} onClose={() => review.setError(null)} />
            <ul className={cx("rcList")}>
              {data.queue.map((r) => (
                <QueueRow key={r.id} r={r} picked={picked.has(r.id)} onPick={(on) => pick(r.id, on)} review={review} />
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ── owed to workers ── */}
      <section className={cx("card")} data-owed>
        <div className={cx("head")}>
          <div>
            <span className={cx("label")}>Approved, paid from their pocket</span>
            <h2 className={cx("title")}>Owed to workers</h2>
          </div>
          <span className={cx("owAmt")} data-owed-total={data.owedTotal}>
            {money2(data.owedTotal)}
          </span>
        </div>
        {data.owed.length === 0 ? (
          <p className={cx("empty")}>Nobody is owed anything. An approved receipt a worker paid for shows here until it is reimbursed.</p>
        ) : (
          <ul className={cx("rcList")}>
            {data.owed.map((w) => (
              <li key={w.key} className={cx("ow")} data-owed-worker={w.name}>
                <span className={cx("owName")}>{w.name}</span>
                <span className={cx("owAmt")}>{money2(w.total)}</span>
                <ul className={cx("owItems")}>
                  {w.items.map((i) => (
                    <li key={i.id} className={cx("mono")}>
                      {i.spent} · {i.job} · {money2(i.amount)}
                    </li>
                  ))}
                </ul>
                <div className={cx("owActs")}>
                  <button
                    type="button"
                    className={cx("btn", "btnSm")}
                    disabled={review.busy === `pay-${w.key}`}
                    data-reimburse-worker
                    onClick={() => {
                      if (window.confirm(`Mark ${money2(w.total)} handed back to ${w.name}? The money itself moves outside the app.`)) void review.run(`pay-${w.key}`, w.items.map((i) => i.id), "reimburse");
                    }}
                  >
                    <Check aria-hidden="true" /> Mark reimbursed
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** The cost of each job — lib/jobCost, the job page's own figure. */
export function JobCostCard({ costs, stockPurchases30d }: { costs: JobCostRow[]; stockPurchases30d: number }) {
  const sum = (k: "crew" | "receipts" | "stock" | "total") => costs.reduce((a, c) => a + c[k], 0);
  const unpriced = costs.flatMap((c) => c.unpriced);
  return (
    <div className={cx("root")}>
      <section className={cx("card")} data-job-costs>
        <div className={cx("head")}>
          <div>
            <span className={cx("label")}>What each job consumed</span>
            <h2 className={cx("title")}>Cost by job</h2>
          </div>
          <span className={cx("mono")}>
            bought for stock, 30 days: {money2(stockPurchases30d)} — counted once, above; a job pays for stock when it is issued
          </span>
        </div>
        {costs.length === 0 ? (
          <p className={cx("empty")}>No job has a cost booked yet.</p>
        ) : (
          <>
            <div className={cx("tableWrap")}>
              <table className={cx("costTable")}>
                <thead>
                  <tr>
                    <th>Job</th>
                    <th className={cx("num")}>Crew</th>
                    <th className={cx("num")}>Receipts</th>
                    <th className={cx("num")}>From stock</th>
                    <th className={cx("num")}>Job cost</th>
                  </tr>
                </thead>
                <tbody>
                  {costs.map((c) => (
                    <tr key={c.jobId} data-cost-job={c.jobId} data-cost-total={c.total}>
                      <td>
                        <a href={`/dashboard/jobs/${c.jobId}`}>{c.title}</a>
                        {c.receiptsPending > 0 && <div className={cx("mono")}>{money2(c.receiptsPending)} on review, not counted</div>}
                        {c.unpriced.length > 0 && <div className={cx("mono")}>no price on {c.unpriced.join(", ")} — counted at $0</div>}
                      </td>
                      <td className={cx("num")}>{money2(c.crew)}</td>
                      <td className={cx("num")}>{money2(c.receipts)}</td>
                      <td className={cx("num")}>{money2(c.stock)}</td>
                      <td className={cx("num")}>
                        <b>{money2(c.total)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>All jobs</td>
                    <td className={cx("num")}>{money2(sum("crew"))}</td>
                    <td className={cx("num")}>{money2(sum("receipts"))}</td>
                    <td className={cx("num")}>{money2(sum("stock"))}</td>
                    <td className={cx("num")}>{money2(sum("total"))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <ul className={cx("costCards")}>
              {costs.map((c) => (
                <li key={c.jobId} data-cost-job={c.jobId}>
                  <div className={cx("rcTop")}>
                    <a className={cx("rcName")} href={`/dashboard/jobs/${c.jobId}`}>
                      {c.title}
                    </a>
                    <span className={cx("rcAmt")}>{money2(c.total)}</span>
                  </div>
                  <span className={cx("mono")}>
                    crew {money2(c.crew)} · receipts {money2(c.receipts)} · stock {money2(c.stock)}
                  </span>
                  {c.receiptsPending > 0 && <span className={cx("mono")}>{money2(c.receiptsPending)} on review, not counted</span>}
                </li>
              ))}
            </ul>
            {unpriced.length > 0 && <p className={cx("hint")} style={{ padding: "0 var(--pad) 16px" }}>Stock with no price is counted at $0 — set its cost on the Inventory page.</p>}
          </>
        )}
      </section>
    </div>
  );
}

/** All / On review / Approved / Rejected / Reimbursed, with counts. */
export function ExpenseStatusFilter({ counts, value, onChange, padded = false }: { counts: Record<string, number>; value: string; onChange: (key: string) => void; padded?: boolean }) {
  return (
    <div className={cx("root", padded && "filterBar")}>
      <div className={cx("filter")} role="group" aria-label="Expense status" data-expense-filter>
        {EXPENSE_STATUS_FILTERS.map((f) => (
          <button key={f.key} type="button" className={cx("seg", value === f.key && "segOn")} aria-pressed={value === f.key} onClick={() => onChange(f.key)} data-status-filter={f.key}>
            {f.label} <b>{counts[f.key] ?? 0}</b>
          </button>
        ))}
      </div>
    </div>
  );
}
