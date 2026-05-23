"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Save, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EstimateBreakdown } from "@/components/proposal/EstimateBreakdown";
import { useProposalDraftStore } from "@/stores/useProposalDraftStore";
import { toast } from "@/components/ui/Toast";
import { saveProposal, sendProposal } from "@/actions/proposals";
import { BasicsBlock, type ProjectLite } from "./BasicsBlock";
import { LineItemsBlock } from "./LineItemsBlock";
import { ScopeNotesBlock } from "./ScopeNotesBlock";
import { OptionsBlock } from "./OptionsBlock";
import { TermsBlock } from "./TermsBlock";
import { PaymentScheduleBlock } from "./PaymentScheduleBlock";
import { FilesBlock } from "./FilesBlock";
import { ProposalPreview } from "./ProposalPreview";
import { FloatingCostsCard } from "./FloatingCostsCard";
import type { ClientLite } from "./ClientField";

interface ProposalEditorProps {
  clients: ClientLite[];
  projects: ProjectLite[];
  orgName?: string;
}

export function ProposalEditor({
  clients,
  projects,
  orgName,
}: ProposalEditorProps) {
  const router = useRouter();
  const draft = useProposalDraftStore((s) => s.draft);
  const [saving, setSaving] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  // Auto-hide the floating costs card once the preview's own totals block is
  // on screen — at that point the full numbers are already visible.
  const totalsRef = React.useRef<HTMLDivElement>(null);
  const [previewVisible, setPreviewVisible] = React.useState(false);
  React.useEffect(() => {
    const el = totalsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setPreviewVisible(entry.isIntersecting),
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  async function persist(opts?: { sendAfter?: boolean }) {
    setSaving(true);
    try {
      const res = await saveProposal({
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
        toast.success(
          "Proposal sent",
          "The client will receive an email once Resend is configured.",
        );
      } else {
        toast.success("Saved", "Your proposal is up to date.");
      }
      // v3 has no edit page yet — bounce to the existing edit so the saved
      // proposal opens in the live builder where status / send actions live.
      router.push(`/dashboard/proposals/${res.id}` as never);
      router.refresh();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Check your line items.";
      toast.error("Save failed", message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Two-column at 2xl+ so contractors on real desktop monitors see the
          live preview alongside the form. Laptop and smaller stack the preview
          below — see also FloatingCostsCard for the in-corner running total. */}
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-5">
        <div className="space-y-5 2xl:col-span-3">
          <BasicsBlock clients={clients} projects={projects} />
          <LineItemsBlock clients={clients} />
          <EstimateBreakdown />
          <ScopeNotesBlock />
          <OptionsBlock />
          <TermsBlock />
          <PaymentScheduleBlock />
          <FilesBlock />

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              loading={saving}
              onClick={() => persist()}
              icon={<Save className="h-3.5 w-3.5" />}
            >
              Save draft
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

        <div className="2xl:col-span-2">
          <div className="2xl:sticky 2xl:top-20">
            <ProposalPreview orgName={orgName} totalsRef={totalsRef} />
          </div>
        </div>
      </div>

      <FloatingCostsCard hidden={previewVisible} />
    </>
  );
}
