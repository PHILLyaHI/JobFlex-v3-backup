"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Save, Send, Check, History } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toast";
import { money, relative } from "@/lib/format";
import { saveSnapshotManual } from "@/actions/proposals";

export interface Snapshot {
  id: string;
  reason: string;
  total: number;
  subtotal: number;
  taxTotal: number;
  createdAt: Date;
}

const iconMap: Record<string, React.ReactNode> = {
  sent: <Send className="h-3 w-3" />,
  accepted: <Check className="h-3 w-3" />,
  manual: <Save className="h-3 w-3" />,
  edited: <History className="h-3 w-3" />,
};

const labelMap: Record<string, string> = {
  sent: "Sent",
  accepted: "Accepted",
  manual: "Manual",
  edited: "Edited",
};

export function SnapshotHistory({
  proposalId,
  snapshots,
}: {
  proposalId: string;
  snapshots: Snapshot[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function onSave() {
    setBusy(true);
    try {
      await saveSnapshotManual(proposalId);
      router.refresh();
      toast.success("Snapshot saved");
    } catch (err: any) {
      toast.error("Couldn't save snapshot", err?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Pricing history</CardTitle>
          <CardSubtitle>Auto-captured on send and accept. Save manually anytime.</CardSubtitle>
        </div>
        <Button
          size="sm"
          variant="outline"
          loading={busy}
          onClick={onSave}
          icon={<Save className="h-3.5 w-3.5" />}
        >
          Save snapshot
        </Button>
      </CardHeader>

      {snapshots.length === 0 ? (
        <p className="text-[12px] text-[color:var(--ink-muted)]">
          No snapshots yet. One is captured automatically when you send or accept the proposal.
        </p>
      ) : (
        <ol className="relative pl-4">
          <span className="absolute top-1 left-[5px] bottom-1 w-px bg-[color:var(--ink-line)]" />
          {snapshots.map((s) => (
            <li key={s.id} className="relative pl-4 pb-4 last:pb-0">
              <span className="absolute left-[-1px] top-1 h-2.5 w-2.5 rounded-full bg-[color:var(--paper)] border border-[color:var(--ink-line)] grid place-items-center">
                <span className="h-1 w-1 rounded-full bg-[color:var(--accent)]" />
              </span>
              <div className="flex items-center gap-2 text-[color:var(--ink-muted)]">
                <span className="inline-flex items-center gap-1 text-[color:var(--ink-soft)]">
                  {iconMap[s.reason] ?? iconMap.manual}
                </span>
                <Badge tone={s.reason === "accepted" ? "success" : s.reason === "sent" ? "accent" : "neutral"}>
                  {labelMap[s.reason] ?? s.reason}
                </Badge>
                <span className="text-[11px] text-[color:var(--ink-faint)]">·</span>
                <span className="text-[11px] text-[color:var(--ink-faint)]">{relative(s.createdAt)}</span>
              </div>
              <div className="mt-1 font-display tabular text-[18px] text-[color:var(--ink)]">
                {money(s.total)}
                <span className="ml-2 text-[11px] text-[color:var(--ink-muted)] font-sans">
                  · sub {money(s.subtotal)}
                  {s.taxTotal > 0 && ` · tax ${money(s.taxTotal)}`}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
