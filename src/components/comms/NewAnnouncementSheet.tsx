"use client";
import * as React from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { AnnouncementBanner, type Announcement } from "./AnnouncementBanner";
import { toast } from "@/components/ui/Toast";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: {
    title: string;
    body: string;
    priority: number;
    expiresAt: Date | null;
  }) => Promise<void>;
}

export function NewAnnouncementSheet({ open, onClose, onSubmit }: Props) {
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [priority, setPriority] = React.useState("0");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function reset() {
    setTitle("");
    setBody("");
    setPriority("0");
    setExpiresAt("");
  }

  const preview: Announcement = {
    id: "preview",
    title: title || "Your announcement title",
    body: body || "Body text shows here in muted style next to the title.",
    priority: Number(priority),
    createdAt: new Date(),
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  };

  async function submit() {
    if (!title.trim() || !body.trim()) {
      toast.error("Missing content", "Title and body are required.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        title: title.trim(),
        body: body.trim(),
        priority: Number(priority),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });
      reset();
      onClose();
      toast.success("Announcement created");
    } catch (err: any) {
      toast.error("Couldn't create", err?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="New announcement"
      description="Shows as a banner above every dashboard page. Choose priority carefully."
      width="min(520px, 100vw)"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            Publish
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Shop closed Monday — heavy rain"
        />
        <Textarea
          label="Body"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Short context — one sentence or two."
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="0">Normal · indigo</option>
            <option value="1">Warn · rose</option>
            <option value="2">High · amber</option>
          </Select>
          <Input
            label="Expires (optional)"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>

        <div className="pt-4 border-t border-[color:var(--ink-line)]">
          <div className="quiet-caps mb-3">Live preview</div>
          <AnnouncementBanner announcements={[preview]} />
        </div>
      </div>
    </Sheet>
  );
}
