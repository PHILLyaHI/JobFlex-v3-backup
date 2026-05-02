"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus, ExternalLink } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toast";
import { longDate } from "@/lib/format";
import { createLeadFromCall } from "@/actions/aiPhoneCalls";
import type { CallRow } from "./CallLogTable";

export function TranscriptSheet({
  call,
  onClose,
}: {
  call: CallRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const open = !!call;
  if (!call) {
    return (
      <Sheet open={false} onClose={onClose} width="min(560px, 100vw)">
        <div />
      </Sheet>
    );
  }

  async function createLead() {
    if (!call) return;
    setBusy(true);
    try {
      const res = await createLeadFromCall(call.id);
      toast.success("Lead created");
      router.push(`/dashboard/leads/${res.leadId}` as any);
    } catch (err: any) {
      toast.error("Couldn't create lead", err?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Call from ${call.fromNumber}`}
      description={longDate(call.startedAt)}
      width="min(560px, 100vw)"
      footer={
        call.leadId ? (
          <div className="flex justify-end">
            <Link href={`/dashboard/leads/${call.leadId}` as any}>
              <Button variant="outline" size="sm" icon={<ExternalLink className="h-3 w-3" />}>
                Open lead
              </Button>
            </Link>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button
              loading={busy}
              onClick={createLead}
              icon={<UserPlus className="h-3.5 w-3.5" />}
            >
              Create lead
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={call.direction === "INBOUND" ? "accent" : "neutral"}>
            {call.direction.toLowerCase()}
          </Badge>
          <Badge
            tone={
              call.status === "COMPLETED"
                ? "success"
                : call.status === "FAILED"
                  ? "danger"
                  : "warn"
            }
          >
            {call.status.toLowerCase().replace("_", " ")}
          </Badge>
        </div>

        {call.recordingUrl && (
          <div className="paper-card p-3">
            <div className="quiet-caps mb-2">Recording</div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio controls src={call.recordingUrl} className="w-full h-9" />
          </div>
        )}

        {call.summary && (
          <div className="paper-card p-4">
            <div className="quiet-caps mb-2">AI summary</div>
            <p className="text-[13px] leading-relaxed text-[color:var(--ink-soft)]">
              {call.summary}
            </p>
          </div>
        )}

        <div>
          <div className="quiet-caps mb-2">Transcript</div>
          {call.transcript ? (
            <blockquote
              className="font-display italic text-[14px] leading-[1.75] text-[color:var(--ink-soft)] border-l-2 border-[color:var(--accent)] pl-4 whitespace-pre-wrap"
            >
              {call.transcript}
            </blockquote>
          ) : (
            <p className="text-[12px] text-[color:var(--ink-muted)]">
              No transcript yet — Twilio posts it once the recording completes.
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}
