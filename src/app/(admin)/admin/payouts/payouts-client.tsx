"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Banknote } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import { money, relative } from "@/lib/format";
import { approvePayoutRequest, rejectPayoutRequest } from "@/actions/influencers";

export interface PayoutRequestDTO {
  id: string;
  influencerName: string;
  influencerEmail: string;
  payoutsEnabled: boolean;
  amountCents: number;
  status: string;
  rejectedReason: string | null;
  createdAt: string;
}
export interface TransferDTO {
  id: string;
  influencerName: string;
  amountCents: number;
  status: string;
  stripeTransferId: string | null;
  failureReason: string | null;
  createdAt: string;
}

const REQUEST_TONE: Record<string, "success" | "warn" | "neutral" | "danger" | "accent"> = {
  PENDING: "warn",
  APPROVED: "accent",
  PROCESSING: "neutral",
  PAID: "success",
  REJECTED: "danger",
};
const TRANSFER_TONE: Record<string, "success" | "warn" | "neutral" | "danger" | "accent"> = {
  PENDING: "warn",
  PAID: "success",
  FAILED: "danger",
  REVERSED: "danger",
};

export function PayoutsClient({
  requests,
  transfers,
}: {
  requests: PayoutRequestDTO[];
  transfers: TransferDTO[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function run(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusyId(id);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (err: unknown) {
      toast.error("Action failed", err instanceof Error ? err.message : undefined);
    } finally {
      setBusyId(null);
    }
  }

  const columns: Column<PayoutRequestDTO>[] = [
    {
      key: "who",
      header: "Partner",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-medium text-[color:var(--ink)] truncate">{r.influencerName}</div>
          <div className="text-[11px] text-[color:var(--ink-muted)] truncate">{r.influencerEmail}</div>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (r) => <span className="tabular">{money(r.amountCents / 100)}</span>,
    },
    {
      key: "requested",
      header: "Requested",
      render: (r) => <span className="text-[color:var(--ink-muted)] tabular">{relative(new Date(r.createdAt))}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <div>
          <Badge tone={REQUEST_TONE[r.status] ?? "neutral"} dot>
            {r.status.toLowerCase()}
          </Badge>
          {r.status === "REJECTED" && r.rejectedReason ? (
            <div className="mt-0.5 text-[11px] text-[color:var(--ink-faint)]">{r.rejectedReason}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) =>
        r.status === "PENDING" ? (
          <div className="flex justify-end gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              disabled={busyId === r.id}
              onClick={() => run(r.id, () => rejectPayoutRequest(r.id), "Request rejected")}
            >
              Reject
            </Button>
            <Button
              size="sm"
              loading={busyId === r.id}
              onClick={() => run(r.id, () => approvePayoutRequest(r.id), "Approved — queued for transfer")}
            >
              Approve
            </Button>
          </div>
        ) : null,
    },
  ];

  const pending = requests.filter((r) => r.status === "PENDING").length;

  return (
    <>
      <div className="mb-5 text-[11px] text-[color:var(--ink-muted)] tabular">
        {pending} pending request{pending === 1 ? "" : "s"} · {requests.length} total
      </div>

      <DataTable
        columns={columns}
        rows={requests}
        rowKey={(r) => r.id}
        empty={
          <EmptyState
            icon={<Banknote className="h-5 w-5" />}
            title="No payout requests"
            description="Partners request payouts from their dashboard once their cleared balance passes their minimum."
          />
        }
      />

      <Card className="mt-8">
        <CardHeader>
          <div>
            <CardTitle>Recent transfers</CardTitle>
            <CardSubtitle>Stripe Connect transfers executed by the payout cron</CardSubtitle>
          </div>
        </CardHeader>
        {transfers.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)]">No transfers yet.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {transfers.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
                    {t.influencerName}
                  </div>
                  <div className="text-[11px] text-[color:var(--ink-muted)] tabular truncate">
                    {relative(new Date(t.createdAt))}
                    {t.stripeTransferId ? ` · ${t.stripeTransferId}` : ""}
                    {t.failureReason ? ` · ${t.failureReason}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="tabular text-[13px]">{money(t.amountCents / 100)}</span>
                  <Badge tone={TRANSFER_TONE[t.status] ?? "neutral"}>{t.status.toLowerCase()}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
