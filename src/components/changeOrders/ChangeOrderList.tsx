"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Copy, Check, Send, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import { money, shortDate, relative } from "@/lib/format";
import { cn } from "@/lib/cn";
import { NewChangeOrderSheet } from "./NewChangeOrderSheet";
import {
  deleteChangeOrder,
  sendChangeOrder,
} from "@/actions/changeOrders";

export interface ChangeOrderRow {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  status: string;
  publicToken: string;
  sentAt: Date | null;
  approvedAt: Date | null;
  declinedAt: Date | null;
  createdAt: Date;
}

interface Props {
  jobId: string;
  orders: ChangeOrderRow[];
}

const STATUS_TONES: Record<string, "neutral" | "accent" | "warn" | "success" | "danger"> = {
  DRAFT: "neutral",
  SENT: "accent",
  APPROVED: "success",
  DECLINED: "danger",
};

export function ChangeOrderList({ jobId, orders }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const total = orders
    .filter((o) => o.status === "APPROVED")
    .reduce((a, o) => a + o.amount, 0);

  async function send(id: string) {
    try {
      setBusy(id);
      await sendChangeOrder(id);
      toast.success("Sent to client");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't send", err?.message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    try {
      setBusy(id);
      await deleteChangeOrder(id);
      toast.success("Removed");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't remove", err?.message);
    } finally {
      setBusy(null);
    }
  }

  function copyLink(o: ChangeOrderRow) {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/co/${o.publicToken}`;
    navigator.clipboard.writeText(url);
    setCopiedId(o.id);
    toast.success("Link copied");
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Change orders</CardTitle>
            <CardSubtitle>
              {orders.length > 0
                ? `${orders.length} change order${orders.length === 1 ? "" : "s"} · approved net ${signed(total)}`
                : "Formal scope + price adjustments after a proposal is signed."}
            </CardSubtitle>
          </div>
          <Button
            size="sm"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setOpen(true)}
          >
            New change order
          </Button>
        </CardHeader>

        {orders.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)]">
            No change orders yet. Draft one when scope or pricing shifts and send it for client sign-off.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {orders.map((o) => {
              const positive = o.amount >= 0;
              return (
                <li key={o.id} className="flex items-start gap-4 py-4 group">
                  <div className={cn(
                    "stat-numeric text-[22px] leading-none shrink-0 w-[110px] text-right tabular",
                    positive ? "text-emerald-700" : "text-rose-700",
                  )}>
                    {positive ? "+" : "−"}
                    {money(Math.abs(o.amount))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
                        {o.title}
                      </div>
                      <Badge tone={STATUS_TONES[o.status] ?? "neutral"}>{o.status.toLowerCase()}</Badge>
                    </div>
                    {o.description && (
                      <div className="text-[12px] text-[color:var(--ink-muted)] max-w-xl line-clamp-2">
                        {o.description}
                      </div>
                    )}
                    <div className="text-[10px] text-[color:var(--ink-faint)] tabular mt-1.5">
                      {o.status === "APPROVED" && o.approvedAt
                        ? `Approved ${relative(o.approvedAt)}`
                        : o.status === "DECLINED" && o.declinedAt
                          ? `Declined ${relative(o.declinedAt)}`
                          : o.status === "SENT" && o.sentAt
                            ? `Sent ${relative(o.sentAt)}`
                            : `Created ${shortDate(o.createdAt)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                    {o.status === "DRAFT" && (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={busy === o.id}
                        onClick={() => send(o.id)}
                        icon={<Send className="h-3 w-3" />}
                      >
                        Send
                      </Button>
                    )}
                    {(o.status === "SENT" || o.status === "APPROVED") && (
                      <button
                        onClick={() => copyLink(o)}
                        aria-label="Copy public link"
                        className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.04]"
                      >
                        {copiedId === o.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </button>
                    )}
                    {o.status === "DRAFT" && (
                      <button
                        onClick={() => remove(o.id)}
                        aria-label="Delete"
                        className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <NewChangeOrderSheet
        jobId={jobId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function signed(n: number) {
  return `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;
}
