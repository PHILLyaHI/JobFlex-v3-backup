"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Save, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { EstimateBreakdown } from "@/components/proposal/EstimateBreakdown";
import { useProposalDraftStore } from "@/stores/useProposalDraftStore";
import { toast } from "@/components/ui/Toast";
import { saveProposal, sendProposal } from "@/actions/proposals";
import { reportPlanLimit, ensureWithinLimit, checkWithinLimit } from "@/stores/usePlanLimitStore";
import { BasicsBlock, type ProjectLite } from "./BasicsBlock";
import { LineItemsBlock } from "./LineItemsBlock";
import { ScopeNotesBlock } from "./ScopeNotesBlock";
import { OptionsBlock } from "./OptionsBlock";
import { TermsBlock } from "./TermsBlock";
import { PaymentScheduleBlock } from "./PaymentScheduleBlock";
import { FilesBlock } from "./FilesBlock";
import { ProposalPreview } from "./ProposalPreview";
import { FloatingCostsCard } from "./FloatingCostsCard";
import { SavedTransferModal } from "./SavedTransferModal";
import type { ClientLite } from "./ClientField";

interface ProposalEditorProps {
  clients: ClientLite[];
  projects: ProjectLite[];
  existingId?: string;
  orgName?: string;
  /** Status of the proposal being edited; autosave only runs for new or DRAFT proposals. */
  initialStatus?: string;
}

export function ProposalEditor({
  clients,
  projects,
  existingId,
  orgName,
  initialStatus,
}: ProposalEditorProps) {
  const router = useRouter();
  const draft = useProposalDraftStore((s) => s.draft);
  const [saving, setSaving] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  // After a plain Save, this holds the saved proposal's ids and drives the
  // post-save transfer modal (5s countdown → public portal).
  const [transfer, setTransfer] = React.useState<{ id: string; publicId: string } | null>(null);
  // The proposal id we're writing to. Seeded ONLY from the route's existingId
  // (the edit page); a brand-new proposal starts undefined so the first save
  // INSERTs, then setDraftId captures the returned id so later writes in this
  // same session UPDATE that row instead of creating duplicates.
  //
  // Deliberately NOT seeded from the persisted draft store: every non-edit entry
  // point (new, AI studio, v3 builder) resets or overwrites the draft on mount,
  // so a leftover store id is always stale — and because this initializer runs
  // during render (before ResetDraft's effect clears the store), reading it made
  // a "new" proposal silently overwrite the previously opened/created one.
  const [draftId, setDraftId] = React.useState<string | undefined>(existingId);
  const [autoState, setAutoState] = React.useState<"idle" | "saving" | "saved">("idle");

  // Autosave applies to brand-new drafts and to existing DRAFT proposals only —
  // never to SENT/ACCEPTED/etc., which must not be silently rewritten.
  const autosaveEnabled = !existingId || initialStatus === "DRAFT";

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

  // Single source of truth for the saveProposal payload — shared by the explicit
  // Save button and the debounced autosave so they never drift apart.
  const buildPayload = React.useCallback(
    () => ({
      id: draftId,
      title: draft.title,
      clientId: draft.clientId,
      description: draft.description,
      scopeOfWork: draft.scopeOfWork,
      notes: draft.notes,
      address: draft.address,
      taxRate: draft.taxRate,
      // Drop empty placeholder rows — only line items with a name are persisted
      // (saveProposal requires every line item to have a name).
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
          // Preserve product metadata so autosave's delete+recreate keeps it.
          store: l.store,
          productUrl: l.productUrl,
          imageUrl: l.imageUrl,
          dimensions: l.dimensions,
        })),
      installments: draft.installments.map((i) => ({
        // The DB id rides along so a paid stage is updated, never recreated.
        id: i.id,
        label: i.label,
        amount: i.amount,
        isPercent: i.isPercent,
      })),
      materialMarkupPct: draft.materialMarkupPct,
      laborMarkupPct: draft.laborMarkupPct,
      overheadPct: draft.overheadPct,
      profitPct: draft.profitPct,
    }),
    [draft, draftId],
  );

  // Debounced autosave: keeps an in-progress DRAFT durable without an explicit
  // Save. Skips empty/invalid drafts (saveProposal requires a title + ≥1 line item),
  // suppresses while an explicit save/send runs, and only fires when content changed.
  const inFlight = React.useRef(false);
  const lastSig = React.useRef<string>("");
  React.useEffect(() => {
    if (!autosaveEnabled || saving || sending) return;
    const hasTitle = draft.title.trim().length > 0;
    if (!hasTitle) return;
    const payload = buildPayload();
    // Compare without `id` (it stringifies away when undefined) so assigning the
    // new id after the first save doesn't re-trigger a redundant autosave.
    const sig = JSON.stringify({ ...payload, id: undefined });
    if (sig === lastSig.current) return;
    const t = setTimeout(async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      setAutoState("saving");
      try {
        // Don't autosave-create past the monthly proposal cap. Silent here (no
        // dialog on the keystroke loop); the explicit Save surfaces the upgrade.
        if (!draftId && !(await checkWithinLimit("proposalsCreated"))) {
          setAutoState("idle");
          return;
        }
        const res = await saveProposal(buildPayload());
        lastSig.current = sig;
        // Track the created row's id in local state only — never write it back
        // into the persisted draft store, or it would leak across sessions and
        // make the next "new" proposal overwrite this one.
        if (res?.id) setDraftId(res.id);
        setAutoState("saved");
      } catch {
        // Stay quiet on autosave failure; the explicit Save button surfaces errors.
        setAutoState("idle");
      } finally {
        inFlight.current = false;
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [draft, autosaveEnabled, saving, sending, buildPayload]);

  async function persist(opts?: { sendAfter?: boolean }) {
    // Friendly client-side checks before hitting the server's stricter validation.
    if (!draft.title.trim()) {
      toast.error("Add a title", "Give the proposal a name before saving.");
      return;
    }
    // New proposal — gate on the monthly cap; opens the upgrade dialog if blocked.
    if (!draftId && !(await ensureWithinLimit("proposalsCreated"))) return;
    setSaving(true);
    try {
      const res = await saveProposal(buildPayload());
      setDraftId(res.id);
      if (opts?.sendAfter) {
        setSending(true);
        await sendProposal(res.id);
        setSending(false);
        toast.success(
          "Proposal sent",
          "The client will receive an email once Resend is configured.",
        );
        // Sending is its own completion — land on the proposal so status /
        // resend actions are right there.
        router.push(`/dashboard/proposals/${res.id}` as never);
        router.refresh();
      } else {
        toast.success("Saved", "Your proposal is up to date.");
        // Open the transfer modal instead of redirecting: it counts down to the
        // public portal and offers the portal / proposal / list as shortcuts.
        setTransfer({ id: res.id, publicId: res.publicId });
      }
    } catch (err: unknown) {
      if (reportPlanLimit(err)) return;
      // zod errors serialize to a JSON array — never surface that raw; show a
      // human message and fall back to a friendly hint for validation failures.
      const raw = err instanceof Error ? err.message : "";
      const message =
        raw && !raw.trim().startsWith("[")
          ? raw
          : "Check the title and that each line item has a name, then try again.";
      toast.error("Save failed", message);
    } finally {
      setSaving(false);
      // Reset the send spinner too — sendProposal can now throw on email failure,
      // which would otherwise leave the button stuck loading and (here) block autosave.
      setSending(false);
    }
  }

  // A long proposal outgrows a sidebar. Once it has many line items, drop the
  // two-column layout so the live preview runs full-width below the form instead
  // of being cramped into a narrow, internally-scrolling column.
  const namedItemCount = draft.lineItems.filter((l) => l.name.trim().length > 0).length;
  const previewFullWidth = namedItemCount > 10;

  return (
    <>
      {/* Two columns at 2xl when the preview fits beside the form; a long
          proposal drops to one full-width column (FloatingCostsCard still shows
          the running total while you scroll). */}
      <div className={cn("grid grid-cols-1 gap-8", !previewFullWidth && "2xl:grid-cols-5")}>
        <div className={cn("space-y-6 pb-32", !previewFullWidth && "2xl:col-span-3")}>
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
            {autosaveEnabled && autoState !== "idle" && (
              <span
                className="inline-flex items-center self-center text-[11px] text-[color:var(--ink-muted)]"
                aria-live="polite"
              >
                {autoState === "saving" ? "Saving…" : "Draft saved"}
              </span>
            )}
          </div>
        </div>

        <div className={!previewFullWidth ? "2xl:col-span-2" : undefined}>
          {/* Short preview: a pinned sidebar, bounded to the viewport so its own
              Total/Scope never clip (6rem = top-20 5rem + a 1rem gap). Long
              preview: full-width section below the form, no sticky, scrolls with
              the page. */}
          <div
            className={cn(
              !previewFullWidth &&
                "2xl:sticky 2xl:top-20 2xl:max-h-[calc(100dvh_-_6rem)] 2xl:overflow-y-auto",
            )}
          >
            <ProposalPreview orgName={orgName} totalsRef={totalsRef} />
          </div>
        </div>
      </div>

      <FloatingCostsCard hidden={previewVisible} />

      {transfer && (
        <SavedTransferModal open proposalId={transfer.id} publicId={transfer.publicId} />
      )}
    </>
  );
}
