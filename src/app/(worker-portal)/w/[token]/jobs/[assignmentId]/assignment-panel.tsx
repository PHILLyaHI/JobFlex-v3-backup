"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { PhotoUploadDrawer, type PhotoDraft } from "@/components/jobs/PhotoUploadDrawer";
import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { toast } from "@/components/ui/Toast";
import { Check, X, Upload, Play } from "lucide-react";

interface WorkerAssignmentPanelProps {
  assignmentId: string;
  jobId: string;
  status: string;
  jobStatus: string;
  token: string;
  photos: PhotoDraft[];
}

export function WorkerAssignmentPanel({
  assignmentId,
  jobId,
  status,
  jobStatus,
  token,
  photos,
}: WorkerAssignmentPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [drawer, setDrawer] = React.useState(false);

  // Workers can only move the job forward (start / complete). Reschedule,
  // reassignment, and edits stay with the office.
  async function updateJobStatus(newStatus: "IN_PROGRESS" | "COMPLETED") {
    try {
      setBusy(newStatus);
      const res = await fetch(`/api/worker/job/${jobId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, status: newStatus }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(newStatus === "COMPLETED" ? "Marked complete" : "Work started");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't update", err?.message);
    } finally {
      setBusy(null);
    }
  }

  async function respond(newStatus: "ACCEPTED" | "DECLINED") {
    try {
      setBusy(newStatus);
      const res = await fetch(`/api/worker/assignment/${assignmentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, status: newStatus }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(newStatus === "ACCEPTED" ? "Confirmed" : "Declined");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't update", err?.message);
    } finally {
      setBusy(null);
    }
  }

  async function uploadFile(file: File, kind: "BEFORE" | "PROGRESS" | "AFTER") {
    const reader = new FileReader();
    const dataUrl: string = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await fetch("/api/worker/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        jobId,
        dataUrl,
        filename: file.name,
        kind,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    router.refresh();
  }

  return (
    <>
      {status === "PENDING" && (
        <Card className="mt-5">
          <CardHeader>
            <div>
              <CardTitle>Can you take this job?</CardTitle>
              <CardSubtitle>Let the office know so they can plan the crew.</CardSubtitle>
            </div>
          </CardHeader>
          <div className="flex gap-2">
            <Button
              loading={busy === "ACCEPTED"}
              onClick={() => respond("ACCEPTED")}
              icon={<Check className="h-4 w-4" />}
            >
              Confirm
            </Button>
            <Button
              variant="outline"
              loading={busy === "DECLINED"}
              onClick={() => respond("DECLINED")}
              icon={<X className="h-4 w-4" />}
            >
              Decline
            </Button>
          </div>
        </Card>
      )}

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>Job status</CardTitle>
            <CardSubtitle>Keep the office in the loop as you work.</CardSubtitle>
          </div>
          <JobStatusBadge status={jobStatus} />
        </CardHeader>
        {jobStatus === "SCHEDULED" && (
          <Button
            loading={busy === "IN_PROGRESS"}
            onClick={() => updateJobStatus("IN_PROGRESS")}
            icon={<Play className="h-4 w-4" />}
          >
            Start work
          </Button>
        )}
        {jobStatus === "IN_PROGRESS" && (
          <Button
            loading={busy === "COMPLETED"}
            onClick={() => updateJobStatus("COMPLETED")}
            icon={<Check className="h-4 w-4" />}
          >
            Mark completed
          </Button>
        )}
        {jobStatus === "COMPLETED" && (
          <p className="text-[12px] text-[color:var(--ink-muted)]">
            This job is marked complete. Thanks for the work.
          </p>
        )}
        {jobStatus === "CANCELED" && (
          <p className="text-[12px] text-[color:var(--ink-muted)]">
            This job was canceled by the office.
          </p>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>Site photos</CardTitle>
            <CardSubtitle>
              Snap before / progress / after — they'll appear in the office view instantly.
            </CardSubtitle>
          </div>
          <Button
            size="sm"
            onClick={() => setDrawer(true)}
            icon={<Upload className="h-3.5 w-3.5" />}
          >
            Upload
          </Button>
        </CardHeader>
        {photos.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)]">No photos yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <div
                key={p.id}
                className="relative aspect-square rounded-[var(--r-sm)] overflow-hidden hairline bg-black/[0.03]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.kind} className="w-full h-full object-cover" />
                <div className="absolute top-1 left-1 text-[9px] uppercase tracking-[0.1em] bg-black/60 text-white rounded px-1.5 py-0.5">
                  {p.kind.toLowerCase()}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <PhotoUploadDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        existing={photos}
        onUpload={uploadFile}
      />
    </>
  );
}
