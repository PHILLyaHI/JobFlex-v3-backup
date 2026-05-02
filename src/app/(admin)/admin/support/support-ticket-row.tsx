"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { relative } from "@/lib/format";
import { updateTicketStatus } from "@/actions/admin";

const STATUS_TONES: Record<string, "accent" | "success" | "warn" | "neutral"> = {
  OPEN: "accent",
  IN_PROGRESS: "warn",
  RESOLVED: "success",
  CLOSED: "neutral",
};

export function SupportTicketRow({
  id,
  subject,
  body,
  status,
  orgName,
  createdAt,
}: {
  id: string;
  subject: string;
  body: string;
  status: string;
  orgName: string;
  createdAt: Date;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function change(next: string) {
    setBusy(true);
    try {
      await updateTicketStatus(id, next);
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't update", err?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-start gap-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">{subject}</div>
          <Badge tone={STATUS_TONES[status] ?? "neutral"}>{status.toLowerCase()}</Badge>
        </div>
        <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5 tabular">
          {orgName} · {relative(createdAt)}
        </div>
        <div className="text-[12px] text-[color:var(--ink-soft)] mt-1 max-w-2xl line-clamp-2">
          {body}
        </div>
      </div>
      <Select
        disabled={busy}
        value={status}
        onChange={(e) => change(e.target.value)}
      >
        <option value="OPEN">Open</option>
        <option value="IN_PROGRESS">In progress</option>
        <option value="RESOLVED">Resolved</option>
        <option value="CLOSED">Closed</option>
      </Select>
    </li>
  );
}
