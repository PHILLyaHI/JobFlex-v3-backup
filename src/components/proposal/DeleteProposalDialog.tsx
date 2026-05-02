"use client";
import * as React from "react";
import { Trash2, AlertTriangle } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { bulkDeleteProposals } from "@/actions/proposals";
import { useRouter } from "next/navigation";

interface DeleteProposalDialogProps {
  open: boolean;
  onClose: () => void;
  proposalId: string;
  proposalTitle: string;
}

export function DeleteProposalDialog({
  open,
  onClose,
  proposalId,
  proposalTitle,
}: DeleteProposalDialogProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await bulkDeleteProposals([proposalId]);
      toast.success("Deleted", `"${proposalTitle}" is gone.`);
      onClose();
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't delete", err?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Delete proposal?"
      description="This permanently removes the proposal, its line items, payment schedule, and snapshots. Public links stop working."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={confirm}
            icon={<Trash2 className="h-3.5 w-3.5" />}
          >
            Delete forever
          </Button>
        </>
      }
    >
      <div className="paper-card p-4 flex items-start gap-3 border-l-[3px] border-l-rose-500">
        <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
        <div className="text-[12.5px] text-[color:var(--ink-soft)] leading-relaxed">
          You're about to delete{" "}
          <span className="font-medium text-[color:var(--ink)]">{proposalTitle}</span>. This can't
          be undone.
        </div>
      </div>
    </Dialog>
  );
}
