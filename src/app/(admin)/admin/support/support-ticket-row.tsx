"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { relative } from "@/lib/format";
import { updateTicketStatus } from "@/actions/admin";

const STATUS_TONES: Record<string, "accent" | "success" | "warn" | "neutral"> = {
  OPEN: "accent",
  IN_PROGRESS: "warn",
  RESOLVED: "success",
  CLOSED: "neutral",
};

const CATEGORY_LABEL: Record<string, string> = {
  billing: "Billing",
  technical: "Technical",
  account: "Account",
  feature: "Feature idea",
  general: "General",
};

export function SupportTicketRow({
  id,
  subject,
  body,
  category,
  priority,
  status,
  orgName,
  submitterEmail,
  createdAt,
  unread,
}: {
  id: string;
  subject: string;
  body: string;
  category: string;
  priority: string;
  status: string;
  orgName: string;
  submitterEmail?: string | null;
  createdAt: Date;
  unread?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function change(next: string) {
    setBusy(true);
    try {
      await updateTicketStatus(id, next);
      router.refresh();
    } catch (err: unknown) {
      toast.error("Couldn't update", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-start gap-4 py-3">
      {/* Unread marker — sage dot for tickets that arrived since the last visit. */}
      <span
        className={cn(
          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
          unread ? "bg-[color:var(--accent)]" : "bg-transparent",
        )}
        aria-label={unread ? "New" : undefined}
      />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={cn(
              "text-[13px] truncate",
              unread ? "font-semibold text-[color:var(--ink)]" : "font-medium text-[color:var(--ink)]",
            )}
          >
            {subject}
          </div>
          <Badge tone={STATUS_TONES[status] ?? "neutral"}>{status.toLowerCase()}</Badge>
          <span className="rounded-full bg-[color:var(--paper-deep)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--ink-soft)]">
            {CATEGORY_LABEL[category] ?? "General"}
          </span>
          {priority === "high" && (
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.03em] text-rose-700">
              Urgent
            </span>
          )}
        </div>
        <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5 tabular">
          {orgName}
          {submitterEmail && <> · {submitterEmail}</>} · {relative(createdAt)}
        </div>
        <div className="text-[12px] text-[color:var(--ink-soft)] mt-1 max-w-2xl line-clamp-2">
          {body}
        </div>
      </div>
      <Select disabled={busy} value={status} onChange={(e) => change(e.target.value)}>
        <option value="OPEN">Open</option>
        <option value="IN_PROGRESS">In progress</option>
        <option value="RESOLVED">Resolved</option>
        <option value="CLOSED">Closed</option>
      </Select>
    </li>
  );
}
