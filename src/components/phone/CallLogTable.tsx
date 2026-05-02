"use client";
import * as React from "react";
import { Phone, PhoneIncoming, PhoneOutgoing } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TranscriptSheet } from "./TranscriptSheet";
import { relative } from "@/lib/format";

export interface CallRow {
  id: string;
  fromNumber: string;
  toNumber: string;
  direction: string;
  status: string;
  durationSeconds: number | null;
  recordingUrl: string | null;
  transcript: string | null;
  summary: string | null;
  leadId: string | null;
  startedAt: Date;
}

export function CallLogTable({
  rows,
  webhookUrl,
}: {
  rows: CallRow[];
  webhookUrl: string;
}) {
  const [selected, setSelected] = React.useState<CallRow | null>(null);

  if (rows.length === 0) {
    return (
      <>
        <EmptyState
          icon={<Phone className="h-5 w-5" />}
          title="No calls yet"
          description="Wire up your Twilio number to this webhook to start auto-capturing inbound calls as leads."
        />
        <div className="mt-5 paper-card p-5">
          <div className="quiet-caps mb-2">Webhook URL</div>
          <code className="block font-mono text-[11.5px] text-[color:var(--ink-soft)] bg-black/[0.03] rounded-[var(--r-sm)] px-3 py-2 break-all">
            {webhookUrl}
          </code>
          <p className="text-[11px] text-[color:var(--ink-muted)] mt-2 leading-relaxed">
            Set this as the <span className="font-mono">A CALL COMES IN</span> webhook on your
            Twilio number. Locally, expose the server with ngrok and paste the tunneled URL.
          </p>
        </div>
      </>
    );
  }

  const columns: Column<CallRow>[] = [
    {
      key: "from",
      header: "From",
      render: (r) => (
        <span className="font-mono tabular text-[color:var(--ink)] text-[12.5px]">
          {r.fromNumber}
        </span>
      ),
    },
    {
      key: "direction",
      header: "Direction",
      render: (r) => (
        <Badge tone={r.direction === "INBOUND" ? "accent" : "neutral"}>
          <span className="inline-flex items-center gap-1">
            {r.direction === "INBOUND" ? (
              <PhoneIncoming className="h-3 w-3" />
            ) : (
              <PhoneOutgoing className="h-3 w-3" />
            )}
            {r.direction.toLowerCase()}
          </span>
        </Badge>
      ),
    },
    {
      key: "duration",
      header: "Duration",
      align: "right",
      render: (r) => (
        <span className="tabular text-[color:var(--ink-muted)]">
          {formatDuration(r.durationSeconds)}
        </span>
      ),
    },
    {
      key: "summary",
      header: "Summary",
      render: (r) => (
        <span
          className="text-[color:var(--ink-muted)] italic line-clamp-1 max-w-md"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {r.summary ?? "No transcript yet"}
        </span>
      ),
    },
    {
      key: "when",
      header: "When",
      render: (r) => <span className="text-[color:var(--ink-muted)]">{relative(r.startedAt)}</span>,
    },
  ];

  return (
    <>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={setSelected} />
      <TranscriptSheet call={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function formatDuration(s: number | null) {
  if (!s || s <= 0) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
