"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { toast } from "@/components/ui/Toast";
import {
  sendProposal,
  updateProposalStatus,
  duplicateProposal,
} from "@/actions/proposals";
import { saveProposalAsTemplate } from "@/actions/templates";
import { reportPlanLimit, ensureWithinLimit } from "@/stores/usePlanLimitStore";

export function ProposalActions({
  id,
  status,
  defaultTemplateName,
}: {
  id: string;
  status: string;
  defaultTemplateName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [tplOpen, setTplOpen] = React.useState(false);
  const [tplName, setTplName] = React.useState(defaultTemplateName);
  const [tplDesc, setTplDesc] = React.useState("");
  const [tplSaving, setTplSaving] = React.useState(false);

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

  async function handleSaveTemplate() {
    if (!tplName.trim()) {
      toast.error("Name required");
      return;
    }
    setTplSaving(true);
    try {
      await saveProposalAsTemplate(id, tplName.trim(), tplDesc.trim() || null);
      toast.success("Template saved");
      setTplOpen(false);
    } catch (err: any) {
      toast.error("Couldn't save template", err?.message);
    } finally {
      setTplSaving(false);
    }
  }

  return (
    <>
      <a href={`/api/proposals/${id}/pdf`} target="_blank" rel="noopener noreferrer">
        <Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />}>
          PDF
        </Button>
      </a>
      <Button
        size="sm"
        variant="ghost"
        icon={<Bookmark className="h-3.5 w-3.5" />}
        onClick={() => setTplOpen(true)}
      >
        Save as template
      </Button>
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
          onClick={() =>
            wrap(
              "paid",
              async () => {
                const res = await updateProposalStatus(id, "PAID");
                if (!res.ok) {
                  throw new Error("This proposal can't be marked completed from here.");
                }
              },
              "Marked paid",
            )
          }
        >
          Mark paid
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        loading={busy === "dup"}
        onClick={async () => {
          if (!(await ensureWithinLimit("proposalsCreated"))) return;
          setBusy("dup");
          try {
            const res = await duplicateProposal(id);
            toast.success("Duplicated");
            router.push(`/dashboard/proposals/${res.id}` as any);
          } catch (err: any) {
            if (!reportPlanLimit(err)) toast.error("Duplicate failed", err?.message);
          } finally {
            setBusy(null);
          }
        }}
      >
        Duplicate
      </Button>

      <Sheet
        open={tplOpen}
        onClose={() => setTplOpen(false)}
        title="Save as template"
        description="Captures the current line items, scope, and schedule. Use it as a starting point for similar proposals."
        width="min(460px, 100vw)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTplOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} loading={tplSaving}>
              Save template
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Template name"
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
            placeholder="Roof Replacement — 30-yr Architectural"
          />
          <Textarea
            label="Description (optional)"
            rows={3}
            value={tplDesc}
            onChange={(e) => setTplDesc(e.target.value)}
            placeholder="Notes for your future self — when to reach for this template."
          />
        </div>
      </Sheet>
    </>
  );
}
