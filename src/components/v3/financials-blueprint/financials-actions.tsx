"use client";

/* THE FOUR THINGS A CONTRACTOR COMES TO FINANCIALS TO DO.
 *
 * The page could read money but never add any: booking an expense existed
 * only on the handheld build, a change order could only be raised from inside
 * a job or a proposal, and invoicing lived on the Proposals rail. All four now
 * start from the page head.
 *
 * Every one of them drives an EXISTING action — addJobExpense, the shared
 * ChangeOrderSheet, sendInstallmentInvoice, and the receipt-capture card that
 * is already on this page. Nothing new is written to the data layer.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChangeOrderSheet } from "@/components/changeOrders/ChangeOrderSheet";
import { toast } from "@/components/ui/Toast";
import { addJobExpense } from "@/actions/expenses";
import { getInvoiceOptions, sendInstallmentInvoice } from "@/actions/notify";
import type { FinancialsJob } from "./financials-behavior";
import type { Invoice } from "./financials-data";

type Dialog = null | "expense" | "order" | "invoice";
const EXPENSE_CATEGORIES = ["Materials", "Labor", "Equipment", "Permit", "Subcontractor", "Fuel", "Other"];
const today = () => new Date().toISOString().slice(0, 10);

export function FinancialsActions({ jobs, invoices }: { jobs: FinancialsJob[]; invoices: Invoice[] }) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  // expense
  const [jobId, setJobId] = React.useState(jobs[0]?.id ?? "");
  const [category, setCategory] = React.useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = React.useState("");
  const [when, setWhen] = React.useState(today);
  const [note, setNote] = React.useState("");

  // change order
  const [coJob, setCoJob] = React.useState(jobs[0]?.id ?? "");
  const [coOpen, setCoOpen] = React.useState(false);

  // invoice — the proposals this page already knows about, one entry each
  const proposals = React.useMemo(() => {
    const seen = new Map<string, { id: string; label: string }>();
    for (const i of invoices) {
      if (!i.proposalId || seen.has(i.proposalId)) continue;
      seen.set(i.proposalId, { id: i.proposalId, label: `${i.client} · ${i.num}` });
    }
    return [...seen.values()];
  }, [invoices]);
  const [proposalId, setProposalId] = React.useState(proposals[0]?.id ?? "");
  const [method, setMethod] = React.useState<"card" | "bank" | "any">("any");
  const [rails, setRails] = React.useState<{ card: boolean; bank: boolean } | null>(null);

  const close = () => {
    if (busy) return;
    setDialog(null);
    setErr("");
  };

  async function openInvoice() {
    setDialog("invoice");
    setErr("");
    if (rails) return;
    try {
      const o = await getInvoiceOptions();
      setRails({ card: o.card, bank: o.bank });
      setMethod(o.card ? "card" : o.bank ? "bank" : "any");
    } catch {
      setRails({ card: false, bank: false });
    }
  }

  async function saveExpense() {
    const value = Number(amount);
    if (!jobId) return setErr("Pick the job this expense belongs to.");
    if (!Number.isFinite(value) || value <= 0) return setErr("Enter the amount.");
    setBusy(true);
    setErr("");
    try {
      // JobExpense books on its created date, so a receipt dated earlier says
      // so in its own note rather than pretending the column exists.
      const dated = when && when !== today() ? `Dated ${when}. ` : "";
      await addJobExpense({ jobId, category, amount: value, note: `${dated}${note}`.trim() || null });
      toast.success("Expense booked", `${category} · $${value.toLocaleString("en-US")}`);
      setAmount("");
      setNote("");
      setDialog(null);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not book the expense.");
    } finally {
      setBusy(false);
    }
  }

  async function sendInvoice() {
    if (!proposalId) return setErr("Pick the proposal to invoice.");
    setBusy(true);
    setErr("");
    try {
      const res = await sendInstallmentInvoice(proposalId, null, method);
      if (!res.ok) {
        setErr(res.error ?? "The invoice could not be sent.");
        return;
      }
      toast.success("Invoice sent", `${res.label} · $${res.amount.toLocaleString("en-US")}`);
      setDialog(null);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The invoice could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  /** The receipt-capture card is already on this page — go to it and open its file picker. */
  function scanReceipt() {
    // The card lives on the Expenses tab: switch to it through the page's own
    // tab control, then open its file picker.
    const tab = document.querySelector<HTMLButtonElement>('#fiTabs [data-tab="expenses"]');
    if (tab && !tab.classList.contains("active")) tab.click();
    window.setTimeout(() => {
      const card = document.getElementById("rcDrop");
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
      const input = document.getElementById("rcFile") as HTMLInputElement | null;
      if (!input) {
        toast.error("Receipt capture is on the Expenses tab", "Open Expenses to scan a receipt.");
        return;
      }
      window.setTimeout(() => input.click(), 280);
    }, 160);
  }

  const modal = (title: string, body: React.ReactNode, onSubmit: () => void, cta: string, icon: string) => (
    <div className="mdl open" role="dialog" aria-modal="true" aria-label={title}>
      <div className="mdl-bg" onClick={close} />
      <div className="mdl-box">
        <div className="mdl-head mdl-head--row">
          <span>{title}</span>
          <button className="mdl-x" type="button" onClick={close} aria-label="Close dialog">
            <svg className="ic">
              <use href="#i-x" />
            </svg>
          </button>
        </div>
        <div className="mdl-txt fi-form">{body}</div>
        {err ? (
          <div className="fi-tnote fi-tnote--boxed" role="alert">
            {err}
          </div>
        ) : null}
        <div className="mdl-foot">
          <button className="btn btn-ghost btn--sm" type="button" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary btn--sm" type="button" onClick={onSubmit} disabled={busy}>
            <svg className="ic">
              <use href={`#${icon}`} />
            </svg>
            <span>{busy ? "Working…" : cta}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="page-actions">
        <button className="btn btn-ghost" type="button" onClick={() => { setDialog("expense"); setErr(""); }}>
          <svg className="ic">
            <use href="#i-plus" />
          </svg>
          Add expense
        </button>
        <button className="btn btn-ghost" type="button" onClick={() => { setDialog("order"); setErr(""); }}>
          <svg className="ic">
            <use href="#i-file" />
          </svg>
          Add change order
        </button>
        <button className="btn btn-ghost" type="button" onClick={() => void openInvoice()}>
          <svg className="ic">
            <use href="#i-receipt" />
          </svg>
          New invoice
        </button>
        <button className="btn btn-primary" type="button" onClick={scanReceipt}>
          <svg className="ic">
            <use href="#i-imgadd" />
          </svg>
          Scan receipt
        </button>
      </div>

      {dialog === "expense" &&
        modal(
          "Add an expense",
          <>
            <label className="fi-fld">
              <span>Job</span>
              <select className="pinput" value={jobId} onChange={(e) => setJobId(e.target.value)}>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="fi-fld">
              <span>Category</span>
              <select className="pinput" value={category} onChange={(e) => setCategory(e.target.value)}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="fi-fld">
              <span>Amount</span>
              <input className="pinput" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="fi-fld">
              <span>Date</span>
              <input className="pinput" type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
            </label>
            <label className="fi-fld fi-fld--wide">
              <span>Description</span>
              <input className="pinput" placeholder="What it was for" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </>,
          () => void saveExpense(),
          "Book expense",
          "i-plus",
        )}

      {dialog === "order" &&
        modal(
          "Add a change order",
          <>
            <p className="fi-fld-note">A change order amends one job. Pick it, and the change-order sheet opens with its scope and pricing.</p>
            <label className="fi-fld fi-fld--wide">
              <span>Job</span>
              <select className="pinput" value={coJob} onChange={(e) => setCoJob(e.target.value)}>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </label>
          </>,
          () => {
            if (!coJob) return setErr("Pick the job this change order amends.");
            setDialog(null);
            setCoOpen(true);
          },
          "Open the sheet",
          "i-file",
        )}

      {dialog === "invoice" &&
        modal(
          "Send an invoice",
          proposals.length ? (
            <>
              <p className="fi-fld-note">Invoices the balance still owing on a proposal, on the rail you pick.</p>
              <label className="fi-fld fi-fld--wide">
                <span>Proposal</span>
                <select className="pinput" value={proposalId} onChange={(e) => setProposalId(e.target.value)}>
                  {proposals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="fi-fld fi-fld--wide">
                <span>Pay by</span>
                <select className="pinput" value={method} onChange={(e) => setMethod(e.target.value as "card" | "bank" | "any")}>
                  {rails?.card !== false && <option value="card">Card</option>}
                  {rails?.bank !== false && <option value="bank">Bank transfer</option>}
                  <option value="any">Let the client choose</option>
                </select>
              </label>
            </>
          ) : (
            <p className="fi-fld-note">No proposal on this page has an invoice yet — raise the first one from the proposal itself.</p>
          ),
          () => void sendInvoice(),
          "Send invoice",
          "i-receipt",
        )}

      {coOpen && <ChangeOrderSheet open={coOpen} onClose={() => setCoOpen(false)} jobId={coJob} onDone={() => router.refresh()} />}
    </>
  );
}
