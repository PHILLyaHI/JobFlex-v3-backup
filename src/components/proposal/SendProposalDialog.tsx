"use client";
import * as React from "react";
import { Mail, AlertCircle } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";
import { sendProposal } from "@/actions/proposals";
import { useRouter } from "next/navigation";

interface SendProposalDialogProps {
  open: boolean;
  onClose: () => void;
  proposalId: string;
  proposalTitle: string;
  clientName: string;
  clientEmail?: string | null;
}

export function SendProposalDialog({
  open,
  onClose,
  proposalId,
  proposalTitle,
  clientName,
  clientEmail,
}: SendProposalDialogProps) {
  const router = useRouter();
  const [email, setEmail] = React.useState(clientEmail ?? "");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) setEmail(clientEmail ?? "");
  }, [open, clientEmail]);

  async function send() {
    if (!email.trim()) {
      toast.error("Need a recipient", "Add an email for the client first.");
      return;
    }
    setBusy(true);
    try {
      await sendProposal(proposalId);
      toast.success("Proposal sent", `${clientName} will get an email shortly.`);
      onClose();
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't send", err?.message ?? "Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const noEmail = !email.trim();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Send "${proposalTitle}"`}
      description="A branded email with the proposal link goes to the client. They can view, accept, and pay from a public page."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={noEmail}
            onClick={send}
            icon={<Mail className="h-3.5 w-3.5" />}
          >
            Send proposal
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          label="Recipient email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="client@example.com"
        />
        {!clientEmail && (
          <div className="paper-card px-3 py-2.5 flex items-start gap-2 border-l-[3px] border-l-amber-400">
            <AlertCircle className="h-3.5 w-3.5 text-amber-700 mt-0.5 shrink-0" />
            <div className="text-[11.5px] text-[color:var(--ink-soft)] leading-relaxed">
              No email on file for {clientName}. We'll send to the address above; consider saving
              it on the client record so you don't have to retype it.
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
