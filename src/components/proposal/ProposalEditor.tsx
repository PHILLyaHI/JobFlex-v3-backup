"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Send, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { LineItemRow } from "@/components/proposal/LineItemRow";
import { EstimateBreakdown } from "@/components/proposal/EstimateBreakdown";
import { ProposalPreview } from "@/components/proposal/ProposalPreview";
import { SavedTransferModal } from "@/components/v3/proposal-builder-a/SavedTransferModal";
import { useProposalDraftStore } from "@/stores/useProposalDraftStore";
import { toast } from "@/components/ui/Toast";
import { saveProposal, sendProposal } from "@/actions/proposals";
import { cn } from "@/lib/cn";

interface ClientOption {
  id: string;
  name: string;
}

interface ProposalEditorProps {
  clients: ClientOption[];
  existingId?: string;
  orgName?: string;
}

// A borderless installment field: quiet at rest (no nested box inside the card),
// a sage focus ring + subtle hover wash for affordance. The row's hairline
// divider is the only boundary — no per-row card outline.
const INSTALLMENT_FIELD =
  "rounded-[var(--r-sm)] bg-transparent px-2.5 py-1.5 text-[14px] text-[color:var(--ink)] outline-none transition-colors placeholder:text-[color:var(--ink-faint)] hover:bg-black/[0.02] focus:bg-white/70 focus:shadow-[0_0_0_2px_rgba(31,122,82,0.18)]";

export function ProposalEditor({ clients, existingId, orgName }: ProposalEditorProps) {
  const router = useRouter();
  const draft = useProposalDraftStore((s) => s.draft);
  const set = useProposalDraftStore((s) => s.set);
  const addLine = useProposalDraftStore((s) => s.addLine);
  const addInstallment = useProposalDraftStore((s) => s.addInstallment);
  const updateInstallment = useProposalDraftStore((s) => s.updateInstallment);
  const removeInstallment = useProposalDraftStore((s) => s.removeInstallment);
  const [saving, setSaving] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  // After a plain "Save draft", the transfer modal counts down to the public portal.
  const [transfer, setTransfer] = React.useState<{ id: string; publicId: string } | null>(null);

  async function persist(opts?: { sendAfter?: boolean }) {
    // Friendly client-side checks before the server's stricter validation.
    if (!draft.title.trim()) {
      toast.error("Add a title", "Give the proposal a name before saving.");
      return;
    }
    setSaving(true);
    try {
      const res = await saveProposal({
        id: existingId,
        title: draft.title,
        clientId: draft.clientId,
        description: draft.description,
        scopeOfWork: draft.scopeOfWork,
        notes: draft.notes,
        taxRate: draft.taxRate,
        // Drop empty placeholder rows — only named line items are persisted.
        lineItems: draft.lineItems
          .filter((l) => l.name.trim().length > 0)
          .map((l) => ({
            name: l.name.trim(),
            description: l.description,
            measurementType: l.measurementType,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            materialCost: l.materialCost,
            laborCost: l.laborCost,
          })),
        installments: draft.installments.map((i) => ({
          label: i.label,
          amount: i.amount,
          isPercent: i.isPercent,
        })),
        materialMarkupPct: draft.materialMarkupPct,
        laborMarkupPct: draft.laborMarkupPct,
        overheadPct: draft.overheadPct,
        profitPct: draft.profitPct,
      });
      if (opts?.sendAfter) {
        setSending(true);
        await sendProposal(res.id);
        setSending(false);
        toast.success("Proposal sent", "The client will receive an email once Resend is configured.");
        router.push(`/dashboard/proposals/${res.id}` as never);
        router.refresh();
      } else {
        // Hand off to the countdown modal — it opens the public portal in 5s,
        // or the contractor can stay / exit from there.
        toast.success("Saved", "Your proposal is up to date.");
        setTransfer({ id: res.id, publicId: res.publicId });
      }
    } catch (err: unknown) {
      // zod errors serialize to a JSON array — never surface that raw.
      const raw = err instanceof Error ? err.message : "";
      const message =
        raw && !raw.trim().startsWith("[")
          ? raw
          : "Check the title and that each line item has a name, then try again.";
      toast.error("Save failed", message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">
        <div className="xl:col-span-3 space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Basics</CardTitle>
                <CardSubtitle>Who it&apos;s for and what it&apos;s about</CardSubtitle>
              </div>
            </CardHeader>
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="Proposal title"
                value={draft.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="Patel Residence — Roof Replacement"
              />
              <Select
                label="Client"
                value={draft.clientId ?? ""}
                onChange={(e) => set({ clientId: e.target.value || undefined })}
              >
                <option value="">— No client yet —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="mt-4">
              <Textarea
                label="Description"
                rows={3}
                value={draft.description}
                onChange={(e) => set({ description: e.target.value })}
                placeholder="One-paragraph overview your client will see first."
              />
            </div>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Line items</CardTitle>
                <CardSubtitle>Separate materials and labor per line. Measurement unit is up to you.</CardSubtitle>
              </div>
              <Button variant="outline" size="sm" onClick={addLine} icon={<Plus className="h-3 w-3" />}>
                Add line
              </Button>
            </CardHeader>
            <div className="space-y-2">
              {draft.lineItems.map((l) => (
                <LineItemRow key={l.id} item={l} />
              ))}
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <Input
                label="Tax rate"
                type="number"
                step="0.001"
                value={draft.taxRate}
                onChange={(e) => set({ taxRate: Number(e.target.value) })}
                hint="Decimal, e.g. 0.06 for 6%"
              />
            </div>
          </Card>

          <EstimateBreakdown />

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Scope &amp; notes</CardTitle>
                <CardSubtitle>What&apos;s included, in plain English.</CardSubtitle>
              </div>
            </CardHeader>
            <Textarea
              label="Scope of work"
              rows={6}
              value={draft.scopeOfWork}
              onChange={(e) => set({ scopeOfWork: e.target.value })}
              placeholder="Remove existing shingles, install underlayment…"
            />
            <div className="mt-6">
              <Textarea
                label="Notes"
                rows={3}
                value={draft.notes}
                onChange={(e) => set({ notes: e.target.value })}
                placeholder="Warranty, assumptions, exclusions…"
              />
            </div>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Payment schedule</CardTitle>
                <CardSubtitle>One or more installments, fixed or percent.</CardSubtitle>
              </div>
              <Button variant="outline" size="sm" onClick={addInstallment} icon={<Plus className="h-3 w-3" />}>
                Add installment
              </Button>
            </CardHeader>
            {draft.installments.length === 0 ? (
              <p className="text-[12.5px] text-[color:var(--ink-muted)]">
                No payment schedule — the full amount is treated as due on completion.
              </p>
            ) : (
              <div className="divide-y divide-[color:var(--ink-line)]">
                {draft.installments.map((i, idx) => (
                  <div key={i.id} className="flex items-center gap-2 py-3">
                    <span className="w-5 shrink-0 text-center text-[11px] tabular text-[color:var(--ink-faint)]">
                      {idx + 1}
                    </span>
                    <input
                      aria-label="Installment label"
                      placeholder="Deposit / Materials delivered / Completion"
                      value={i.label}
                      onChange={(e) => updateInstallment(i.id, { label: e.target.value })}
                      className={cn(INSTALLMENT_FIELD, "min-w-0 flex-1")}
                    />
                    <input
                      type="number"
                      step="0.01"
                      aria-label="Installment amount"
                      value={i.amount}
                      onChange={(e) => updateInstallment(i.id, { amount: Number(e.target.value) })}
                      className={cn(
                        INSTALLMENT_FIELD,
                        "w-[88px] text-right tabular [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                      )}
                    />
                    <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Amount type">
                      <button
                        type="button"
                        aria-pressed={i.isPercent}
                        onClick={() => updateInstallment(i.id, { isPercent: true })}
                        className={cn(
                          "grid h-7 w-7 place-items-center rounded-[var(--r-sm)] text-[13px] font-medium transition-colors focus-ring",
                          i.isPercent
                            ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]"
                            : "text-[color:var(--ink-faint)] hover:bg-black/[0.04] hover:text-[color:var(--ink)]",
                        )}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        aria-pressed={!i.isPercent}
                        onClick={() => updateInstallment(i.id, { isPercent: false })}
                        className={cn(
                          "grid h-7 w-7 place-items-center rounded-[var(--r-sm)] text-[13px] font-medium transition-colors focus-ring",
                          !i.isPercent
                            ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]"
                            : "text-[color:var(--ink-faint)] hover:bg-black/[0.04] hover:text-[color:var(--ink)]",
                        )}
                      >
                        $
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeInstallment(i.id)}
                      aria-label="Remove installment"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] transition-colors hover:bg-rose-50 hover:text-[color:var(--rose)] focus-ring"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="flex gap-2 pt-2">
            <Button loading={saving} onClick={() => persist()} icon={<Save className="h-3.5 w-3.5" />}>
              {existingId ? "Save changes" : "Save draft"}
            </Button>
            <Button
              variant="outline"
              loading={sending}
              onClick={() => persist({ sendAfter: true })}
              icon={<Send className="h-3.5 w-3.5" />}
            >
              Save &amp; send
            </Button>
          </div>
        </div>

        <div className="xl:col-span-2">
          <ProposalPreview orgName={orgName} />
        </div>
      </div>

      {transfer && (
        <SavedTransferModal open proposalId={transfer.id} publicId={transfer.publicId} />
      )}
    </>
  );
}
