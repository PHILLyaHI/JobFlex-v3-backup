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
 * is already on this page. No new endpoint: the invoice book row that a send
 * now leaves behind is written by sendInvoice itself, not from here.
 */

import * as React from "react";
import { ChangeOrderSheet } from "@/components/changeOrders/ChangeOrderSheet";
import { InvoiceSheet } from "@/components/billing/InvoiceSheet";
import { toast } from "@/components/ui/Toast";
import { addJobExpense, addStockPurchase } from "@/actions/expenses";
import type { FinancialsJob } from "./financials-behavior";
import type { InvoiceTarget } from "./financials-data";
import type { StockPick } from "@/components/v3/crew-board/office-review-data";

/** The "For" select's value for a purchase for the warehouse (stage D). */
const STOCK = "__stock";

type Dialog = null | "expense" | "order" | "invoice";
const EXPENSE_CATEGORIES = ["Materials", "Labor", "Equipment", "Permit", "Subcontractor", "Fuel", "Other"];
const today = () => new Date().toISOString().slice(0, 10);

/** Land the page on the book a write just touched.
 *
 *  This page's three books are built ONCE, from the payload financials-content
 *  mounted with — it holds them in a write-once ref so a re-render cannot
 *  replay the reveal cascade — so `router.refresh()` re-renders React and
 *  leaves every table exactly as it was. The route has to be read again — a
 *  hash alone would not do it, since a same-document jump reloads nothing — and
 *  `?tab=` tells the fresh page which book to open on. The short pause lets
 *  the toast (which names the invoice number) be read first.
 */
function landOn(tab: "expenses" | "orders" | "invoices") {
  window.setTimeout(() => window.location.assign(`/dashboard/financials?tab=${tab}`), 700);
}

export function FinancialsActions({ jobs, invoiceTargets, stockItems = [] }: { jobs: FinancialsJob[]; invoiceTargets: InvoiceTarget[]; stockItems?: StockPick[] }) {
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  // expense
  const [jobId, setJobId] = React.useState(jobs[0]?.id ?? "");
  const [category, setCategory] = React.useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = React.useState("");
  const [when, setWhen] = React.useState(today);
  const [note, setNote] = React.useState("");
  // For stock (stage D): the item it bought and how many, both optional —
  // given, they set the item's last price, which issued stock goes by.
  const [itemId, setItemId] = React.useState("");
  const [qty, setQty] = React.useState("");

  // change order
  const [coJob, setCoJob] = React.useState(jobs[0]?.id ?? "");
  const [coOpen, setCoOpen] = React.useState(false);

  const close = () => {
    if (busy) return;
    setDialog(null);
    setErr("");
  };

  async function saveExpense() {
    const value = Number(amount);
    if (!jobId) return setErr("Pick the job this expense belongs to, or Stock.");
    if (!Number.isFinite(value) || value <= 0) return setErr("Enter the amount.");
    const units = qty ? Number(qty) : null;
    if (jobId === STOCK && itemId && units !== null && !(units > 0)) return setErr("Enter how many units it bought, or leave it empty.");
    setBusy(true);
    setErr("");
    try {
      // The date is the day the money was spent (JobExpense.spentAt, stage A);
      // the totals go by it.
      const spentAt = when ? `${when}T12:00:00` : null;
      if (jobId === STOCK) {
        await addStockPurchase({ category, amount: value, note: note.trim() || null, spentAt, stockItemId: itemId || null, stockQty: itemId ? units : null });
      } else {
        await addJobExpense({ jobId, category, amount: value, note: note.trim() || null, spentAt });
      }
      toast.success(jobId === STOCK ? "Stock purchase booked" : "Expense booked", `${category} · $${value.toLocaleString("en-US")}`);
      setAmount("");
      setNote("");
      setDialog(null);
      landOn("expenses");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not book the expense.");
    } finally {
      setBusy(false);
    }
  }

  /** The receipt-capture card is already on this page — go to it and open its file picker.
   *
   *  The card, its progress line and its staged result all live in ONE panel,
   *  and the tab to open is read off that panel — not assumed. This used to
   *  switch to the Expenses tab, where the card is not: the scan ran and
   *  succeeded in the hidden Overview panel while the owner looked at a
   *  ledger, with nothing on screen to say a receipt had been read (his real
   *  photo, 2026-09-19). */
  function scanReceipt() {
    const drop = document.getElementById("rcDrop");
    const panel = drop?.closest<HTMLElement>("[data-panel]");
    const tab = panel ? document.querySelector<HTMLButtonElement>(`#fiTabs [data-tab="${panel.dataset.panel}"]`) : null;
    if (!drop || !tab) {
      toast.error("Receipt capture isn't on this page", "Reload Financials and try again.");
      return;
    }
    if (!tab.classList.contains("active")) tab.click();
    window.setTimeout(() => {
      drop.scrollIntoView({ behavior: "smooth", block: "center" });
      const input = document.getElementById("rcFile") as HTMLInputElement | null;
      if (!input) {
        toast.error("Receipt capture isn't on this page", "Reload Financials and try again.");
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
        <button className="btn btn-ghost" type="button" onClick={() => { setDialog("invoice"); setErr(""); }}>
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
              <span>For</span>
              {/* A job, or the warehouse (stage D): money for stock is the
                  company's now and a job's only when the stock is issued. */}
              <select className="pinput" value={jobId} onChange={(e) => setJobId(e.target.value)} data-expense-for>
                <option value={STOCK}>Stock — the warehouse, no job</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </label>
            {jobId === STOCK && stockItems.length > 0 && (
              <>
                <label className="fi-fld">
                  <span>Item (optional)</span>
                  <select className="pinput" value={itemId} onChange={(e) => setItemId(e.target.value)} data-stock-item>
                    <option value="">Not one item</option>
                    {stockItems.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} · {i.trade}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="fi-fld">
                  <span>Units bought</span>
                  <input className="pinput" inputMode="decimal" placeholder="Sets its unit cost" value={qty} disabled={!itemId} onChange={(e) => setQty(e.target.value)} data-stock-qty />
                </label>
              </>
            )}
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

      {/* Invoicing is the same two questions everywhere, so it is the same
          sheet the handheld Financials build and the proposal rail mount. */}
      <InvoiceSheet
        open={dialog === "invoice"}
        onClose={() => setDialog(null)}
        targets={invoiceTargets}
        onSent={() => landOn("invoices")}
      />

      {coOpen && (
        <ChangeOrderSheet
          open={coOpen}
          onClose={() => setCoOpen(false)}
          jobId={coJob}
          onDone={() => landOn("orders")}
        />
      )}
    </>
  );
}
