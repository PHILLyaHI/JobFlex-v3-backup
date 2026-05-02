"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";
import { startConversation } from "@/actions/messages";

export function StartConversationButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await startConversation({ title: title.trim() || undefined });
      setOpen(false);
      setTitle("");
      router.push(`/dashboard/messages?c=${res.id}` as any);
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't start", err?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>
        New conversation
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New conversation"
        description="Give it a short title — you can add participants inline later."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy}>
              Start
            </Button>
          </>
        }
      >
        <Input
          label="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Patel roof scheduling"
        />
      </Dialog>
    </>
  );
}
