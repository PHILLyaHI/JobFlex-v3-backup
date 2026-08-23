"use client";

// JOB DETAIL — the write half, once, for both editions.
//
// The desktop port and the handheld build draw two different layouts over the
// SAME record, so they must also perform the same writes; a second copy of
// this wiring is a second set of rules about what a button does. Every call
// below is an EXISTING server action — nothing here is new data layer:
//
//   status picker      → updateJob                (actions/jobs.ts)
//   Add to schedule    → createJobEvent           (actions/jobs.ts)   + /dashboard/calendar
//   Assign worker      → assignWorker             (actions/workers.ts)
//   Remove from crew   → unassignAssignment       (actions/workers.ts)
//   Upload             → uploadJobPhoto           (actions/jobMedia.ts)
//   Change order Send  → sendChangeOrder          (actions/changeOrders.ts)
//   Change order Mark approved → approveChangeOrderPublic (actions/changeOrders.ts)
//
// ── ON "MARK APPROVED" ─────────────────────────────────────────────────────
// There is no manager-side approve action in this codebase: approval is the
// CLIENT's, made from /co/<publicToken>, and `approveChangeOrderPublic` is the
// only writer of that transition. The button therefore says "Mark approved" —
// the contractor recording an approval they already have — and not "Approve",
// which would claim the office can approve its own change order.
//
// ── REFRESH, NOT LOCAL STATE ───────────────────────────────────────────────
// Every write ends in `router.refresh()`, so the next paint comes from the
// database rather than from an optimistic guess. The one exception is the
// status picker, which flips locally first: it is the only control whose own
// pressed state IS the feedback, and a picker that waits ~300ms to move reads
// as broken.

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateJob, createJobEvent, setJobProgress } from "@/actions/jobs";
import { assignWorker, unassignAssignment } from "@/actions/workers";
import { uploadJobPhoto } from "@/actions/jobMedia";
import { sendChangeOrder, approveChangeOrderPublic } from "@/actions/changeOrders";
import { KEY_TO_STATUS, type JdBooking, type StatusKey } from "./job-detail-data";

/** Photos travel to the action as a base64 data URL, so the encoded body is
 *  ~4/3 of the file. The server action body limit is 8MB (next.config.ts), and
 *  5MB of JPEG is already a bigger photo than any jobsite record needs. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export type PhotoKind = "BEFORE" | "PROGRESS" | "AFTER";

/** Which control is mid-flight, so exactly that one can say so. */
export type JobBusy =
  | null
  | { kind: "status" }
  | { kind: "schedule" }
  | { kind: "assign"; id: string }
  | { kind: "unassign"; id: string }
  | { kind: "upload" }
  | { kind: "change"; id: string };

export function useJobDetailActions(
  jobId: string,
  booking: JdBooking,
  initial: StatusKey,
  // Worker edition: the status picker writes through setJobProgress (the
  // crew-gated, forward-only action) instead of the manager-only updateJob.
  workerViewer = false,
) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<JobBusy>(null);
  const [error, setError] = useState<string | null>(null);
  // The picker's own optimistic value. Reset to the server's answer whenever a
  // write fails, so a rejected status never sticks on screen.
  const [status, setStatus] = useState<StatusKey>(initial);
  const lastGood = useRef<StatusKey>(initial);

  /** Server actions redact their message in production; in dev this is the
   *  real one (including the plan-limit copy), which is what a contractor
   *  needs to see. */
  const say = (err: unknown, fallback: string) =>
    setError(err instanceof Error && err.message ? err.message : fallback);

  const run = useCallback(
    async (mark: JobBusy, fallback: string, fn: () => Promise<void>) => {
      setError(null);
      setBusy(mark);
      try {
        await fn();
        startTransition(() => router.refresh());
        return true;
      } catch (err) {
        say(err, fallback);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [router],
  );

  const pickStatus = useCallback(
    async (key: StatusKey) => {
      if (key === status) return;
      // A worker only moves work FORWARD — Scheduled/Canceled are office calls
      // and setJobProgress would refuse them anyway; refuse locally so the
      // picker never flashes an impossible state.
      if (workerViewer && key !== "prog" && key !== "done") return;
      const previous = lastGood.current;
      setStatus(key);
      const ok = await run({ kind: "status" }, "Could not change the status.", async () => {
        if (workerViewer) {
          await setJobProgress(jobId, KEY_TO_STATUS[key] as "IN_PROGRESS" | "COMPLETED");
        } else {
          await updateJob(jobId, { status: KEY_TO_STATUS[key] });
        }
      });
      if (ok) lastGood.current = key;
      else setStatus(previous);
    },
    [jobId, run, status, workerViewer],
  );

  /** Books the window the server picked, then LEAVES for the calendar, where
   *  the new card is. router.push, never location.assign: a hard navigation
   *  replays the blueprint shell's whole entrance. */
  const addToSchedule = useCallback(
    async (title: string) => {
      setError(null);
      setBusy({ kind: "schedule" });
      try {
        await createJobEvent({
          title,
          jobId,
          startsAt: booking.startsAtISO,
          endsAt: booking.endsAtISO,
        });
        router.push("/dashboard/calendar");
      } catch (err) {
        say(err, "Could not add this job to the schedule.");
        setBusy(null);
      }
    },
    [booking.endsAtISO, booking.startsAtISO, jobId, router],
  );

  const assign = useCallback(
    (workerId: string) =>
      run({ kind: "assign", id: workerId }, "Could not assign that worker.", async () => {
        await assignWorker(jobId, workerId);
      }),
    [jobId, run],
  );

  const unassign = useCallback(
    (assignmentId: string) =>
      run(
        { kind: "unassign", id: assignmentId },
        "Could not take that worker off the job.",
        async () => {
          await unassignAssignment(assignmentId);
        },
      ),
    [run],
  );

  const upload = useCallback(
    async (file: File, kind: PhotoKind) => {
      if (file.size > MAX_PHOTO_BYTES) {
        setError(`${file.name} is over 5 MB — shrink it or shoot at a lower resolution.`);
        return false;
      }
      let dataUrl: string;
      try {
        dataUrl = await readAsDataUrl(file);
      } catch {
        setError("Could not read that file.");
        return false;
      }
      return run({ kind: "upload" }, "Could not upload that photo.", async () => {
        await uploadJobPhoto(jobId, dataUrl, file.name, kind);
      });
    },
    [jobId, run],
  );

  const sendChange = useCallback(
    (id: string) =>
      run({ kind: "change", id }, "Could not send that change order.", async () => {
        await sendChangeOrder(id);
      }),
    [run],
  );

  const approveChange = useCallback(
    (id: string, publicToken: string) =>
      run({ kind: "change", id }, "Could not record that approval.", async () => {
        await approveChangeOrderPublic(publicToken, null);
      }),
    [run],
  );

  return {
    status,
    busy,
    error,
    dismissError: useCallback(() => setError(null), []),
    pickStatus,
    addToSchedule,
    assign,
    unassign,
    upload,
    sendChange,
    approveChange,
  };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
