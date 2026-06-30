"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { startConversation } from "@/actions/messages";

interface WorkerOption {
  id: string;
  displayName: string;
}

export function StartConversationButton({ workers }: { workers: WorkerOption[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [workerId, setWorkerId] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const selected = workers.find((w) => w.id === workerId);

  async function submit() {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await startConversation({ title: selected.displayName });
      setOpen(false);
      setWorkerId("");
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
        description="Pick the person on your team you want to message."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy} disabled={!selected}>
              Start
            </Button>
          </>
        }
      >
        {workers.length === 0 ? (
          <p className="text-sm text-[color:var(--ink-muted)]">
            No workers yet. Add someone to your team first, then you can start a conversation with them.
          </p>
        ) : (
          <Select
            label="Worker"
            value={workerId}
            onChange={(e) => setWorkerId(e.target.value)}
          >
            <option value="" disabled>
              Choose a worker…
            </option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.displayName}
              </option>
            ))}
          </Select>
        )}
      </Dialog>
    </>
  );
}
