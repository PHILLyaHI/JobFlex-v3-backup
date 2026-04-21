"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { sendProposal, updateProposalStatus, duplicateProposal } from "@/actions/proposals";

export function ProposalActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function wrap(key: string, fn: () => Promise<unknown>, successMsg: string) {
    try {
      setBusy(key);
      await fn();
      toast.success(successMsg);
      router.refresh();
    } catch (err: any) {
      toast.error("Action failed", err?.message);
    } finally {
      setBusy(null);
    }
  }

  const showSend = status === "DRAFT";
  const showMarkPaid = status === "ACCEPTED" || status === "SENT" || status === "VIEWED";

  return (
    <>
      {showSend && (
        <Button
          size="sm"
          loading={busy === "send"}
          onClick={() => wrap("send", () => sendProposal(id), "Sent")}
        >
          Send
        </Button>
      )}
      {showMarkPaid && (
        <Button
          size="sm"
          variant="outline"
          loading={busy === "paid"}
          onClick={() => wrap("paid", () => updateProposalStatus(id, "PAID"), "Marked paid")}
        >
          Mark paid
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        loading={busy === "dup"}
        onClick={async () => {
          setBusy("dup");
          try {
            const res = await duplicateProposal(id);
            toast.success("Duplicated");
            router.push(`/dashboard/proposals/${res.id}` as any);
          } catch (err: any) {
            toast.error("Duplicate failed", err?.message);
          } finally {
            setBusy(null);
          }
        }}
      >
        Duplicate
      </Button>
    </>
  );
}
