"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Send } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { LineItemRow } from "@/components/proposal/LineItemRow";
import { EstimateBreakdown } from "@/components/proposal/EstimateBreakdown";
import { ProposalPreview } from "@/components/proposal/ProposalPreview";
import { useProposalDraftStore } from "@/stores/useProposalDraftStore";
import { toast } from "@/components/ui/Toast";
import { saveProposal, sendProposal } from "@/actions/proposals";

interface ClientOption {
  id: string;
  name: string;
}

interface ProposalEditorProps {
  clients: ClientOption[];
  existingId?: string;
  orgName?: string;
}

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

  async function persist(opts?: { sendAfter?: boolean }) {
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
        lineItems: draft.lineItems.map((l) => ({
          name: l.name,
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
      } else {
        toast.success("Saved", "Your proposal is up to date.");
      }
      router.push(`/dashboard/proposals/${res.id}` as any);
      router.refresh();
    } catch (err: any) {
      toast.error("Save failed", err?.message ?? "Check your line items.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
      <div className="xl:col-span-3 space-y-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Basics</CardTitle>
              <CardSubtitle>Who it's for and what it's about</CardSubtitle>
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
              <CardSubtitle>What's included, in plain English.</CardSubtitle>
            </div>
          </CardHeader>
          <Textarea
            label="Scope of work"
            rows={6}
            value={draft.scopeOfWork}
            onChange={(e) => set({ scopeOfWork: e.target.value })}
            placeholder="Remove existing shingles, install underlayment…"
          />
          <div className="mt-4">
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
          <div className="space-y-2">
            {draft.installments.map((i) => (
              <div
                key={i.id}
                className="grid grid-cols-12 gap-2 items-center p-3 rounded-[var(--r-md)] hairline bg-white/40 dark:bg-white/[0.02]"
              >
                <div className="col-span-6">
                  <Input
                    placeholder="Deposit / Materials delivered / Completion"
                    value={i.label}
                    onChange={(e) => updateInstallment(i.id, { label: e.target.value })}
                  />
                </div>
                <div className="col-span-3">
                  <Input
                    type="number"
                    step="0.01"
                    value={i.amount}
                    onChange={(e) => updateInstallment(i.id, { amount: Number(e.target.value) })}
                  />
                </div>
                <div className="col-span-2">
                  <Select
                    value={i.isPercent ? "pct" : "flat"}
                    onChange={(e) => updateInstallment(i.id, { isPercent: e.target.value === "pct" })}
                  >
                    <option value="pct">%</option>
                    <option value="flat">$</option>
                  </Select>
                </div>
                <button
                  type="button"
                  onClick={() => removeInstallment(i.id)}
                  className="col-span-1 h-8 grid place-items-center text-[color:var(--ink-muted)] hover:text-rose-700"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
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
  );
}
