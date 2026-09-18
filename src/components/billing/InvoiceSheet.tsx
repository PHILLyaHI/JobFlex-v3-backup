"use client";

/* THE INVOICE SHEET — one form, every surface.
 *
 * Invoicing used to live only on the Proposals rail, driven by that page's own
 * DOM code. The Financials page now raises invoices too, on the desk and on a
 * phone, and all three ask for exactly the same two things: WHICH proposal,
 * and HOW the client may pay. So the form is a component (the ChangeOrderSheet
 * precedent — one sheet mounted from the job, the proposal and now here),
 * rather than a second and third copy of the same two fields.
 *
 * It bills the balance still owing (`installmentId: null`), which is what
 * `sendInstallmentInvoice` does with no stage named, and it only offers a rail
 * the shop can actually take money on (`getInvoiceOptions`).
 */

import * as React from "react";
import { Send } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { getInvoiceOptions, sendInstallmentInvoice } from "@/actions/notify";

export interface InvoiceTarget {
  /** Proposal id — what the invoice is raised against. */
  id: string;
  /** What the picker shows: the client and the proposal's own label. */
  label: string;
}

type Method = "card" | "bank" | "any";

export function InvoiceSheet({
  open,
  onClose,
  targets,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  /** The proposals this surface can invoice. One entry = no picker. */
  targets: InvoiceTarget[];
  /** After a successful send — the caller reloads its ledger. */
  onSent?: () => void;
}) {
  const [picked, setPicked] = React.useState("");
  /** The caller's list can arrive after the first render, so the choice is
   *  derived rather than synced: whatever was picked, if it is still on the
   *  list, else the first entry. */
  const proposalId = targets.some((t) => t.id === picked) ? picked : targets[0]?.id ?? "";
  const [method, setMethod] = React.useState<Method>("any");
  const [rails, setRails] = React.useState<{ card: boolean; bank: boolean } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  // The rails the shop can actually take money on, read once per opening.
  React.useEffect(() => {
    if (!open || rails) return;
    let alive = true;
    void getInvoiceOptions()
      .then((o) => {
        if (!alive) return;
        setRails({ card: o.card, bank: o.bank });
        setMethod(o.card ? "card" : o.bank ? "bank" : "any");
      })
      .catch(() => {
        if (alive) setRails({ card: false, bank: false });
      });
    return () => {
      alive = false;
    };
  }, [open, rails]);

  const close = () => {
    if (busy) return;
    setErr("");
    onClose();
  };

  async function send() {
    if (!proposalId) {
      setErr("Pick the proposal to invoice.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await sendInstallmentInvoice(proposalId, null, method);
      if (!res.ok) {
        setErr(res.error ?? "The invoice could not be sent.");
        return;
      }
      // Say what actually reached the client — a proposal with no email on
      // file still raises the invoice, and the contractor should know.
      const where = [res.email === "sent" ? "emailed" : null, res.sms === "sent" ? "texted" : null].filter(Boolean).join(" and ");
      toast.success("Invoice sent", `${res.label} · $${res.amount.toLocaleString("en-US")}${where ? ` · ${where}` : " · no contact on file"}`);
      onSent?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The invoice could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  const field = "h-10 w-full rounded-[var(--r-md)] hairline bg-white/70 px-3 text-[14px]";
  const label = "quiet-caps text-[color:var(--ink-muted)]";

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Send an invoice"
      description="Bills the balance still owing on the proposal, on the rail you pick."
      footer={
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void send()} disabled={busy || !proposalId} className="flex-1">
            <Send className="h-4 w-4" />
            {busy ? "Sending…" : "Send invoice"}
          </Button>
        </div>
      }
    >
      {targets.length === 0 ? (
        <p className="text-[13px] text-[color:var(--ink-soft)]">
          No proposal here has an invoice yet — raise the first one from the proposal itself.
        </p>
      ) : (
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className={label}>Proposal</span>
            <select className={field} value={proposalId} onChange={(e) => setPicked(e.target.value)} disabled={busy}>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className={label}>Pay by</span>
            <select className={field} value={method} onChange={(e) => setMethod(e.target.value as Method)} disabled={busy}>
              {rails?.card !== false && <option value="card">Card</option>}
              {rails?.bank !== false && <option value="bank">Bank transfer</option>}
              <option value="any">Let the client choose</option>
            </select>
          </label>

          {err ? (
            <p className="text-[13px] text-[color:var(--rose)]" role="alert">
              {err}
            </p>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}
