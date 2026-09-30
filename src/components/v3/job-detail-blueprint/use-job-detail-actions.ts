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
import { updateJob, createJobEvent, setJobProgress, continueJobDay } from "@/actions/jobs";
import { uploadJobMedia, type UploadDoor } from "@/lib/media/uploadJobMedia";
import { assignWorker, unassignAssignment } from "@/actions/workers";
import { setAssignmentPaid, setAssignmentPay } from "@/actions/jobPay";
import { loadJobMaterials, returnJobMaterials } from "@/actions/inventory";
import { uploadJobPhoto } from "@/actions/jobMedia";
import { sendChangeOrder, markChangeOrderApproved } from "@/actions/changeOrders";
import { KEY_TO_STATUS, type JdBooking, type StatusKey } from "./job-detail-data";
import type { CrewDoor } from "@/components/v3/crew-board/crew-board-data";

export type PhotoKind = "BEFORE" | "PROGRESS" | "AFTER";

const SESSION_DOOR: UploadDoor = { session: true };

/** Which control is mid-flight, so exactly that one can say so. */
export type JobBusy =
  | null
  | { kind: "status" }
  | { kind: "schedule" }
  | { kind: "assign"; id: string }
  | { kind: "unassign"; id: string }
  | { kind: "pay"; id: string }
  | { kind: "load"; id: string }
  | { kind: "return"; id: string }
  | { kind: "upload" }
  | { kind: "continue" }
  | { kind: "respond" }
  | { kind: "change"; id: string };

export function useJobDetailActions(
  jobId: string,
  booking: JdBooking,
  initial: StatusKey,
  // Worker edition: the status picker writes through setJobProgress (the
  // crew-gated, forward-only action) instead of the manager-only updateJob.
  workerViewer = false,
  // The company's file store is on (the loader read the server's env): a
  // video or a big photo goes straight from the browser to the store.
  blobEnabled = false,
  // How writes are authenticated (stage C, 2026-09-30): the dashboard session,
  // or — in the worker portal, which renders these same editions — the
  // magic-link token, sent to the crew routes that take either.
  door: CrewDoor = { kind: "session" },
) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<JobBusy>(null);
  const [error, setError] = useState<string | null>(null);
  // The picker's own optimistic value. Reset to the server's answer whenever a
  // write fails, so a rejected status never sticks on screen.
  const [status, setStatus] = useState<StatusKey>(initial);
  const lastGood = useRef<StatusKey>(initial);

  /** A crew route through the portal's token: the same rule as the session actions. */
  const viaToken = useCallback(
    async (url: string, body: Record<string, unknown>) => {
      if (door.kind !== "token") throw new Error("No token");
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, token: door.token }) });
      if (!res.ok) {
        let msg = "That did not go through.";
        try {
          msg = ((await res.json()) as { error?: string }).error ?? msg;
        } catch {
          /* keep */
        }
        throw new Error(msg);
      }
    },
    [door],
  );

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
        if (door.kind === "token") {
          await viaToken(`/api/crew/${jobId}/day`, { action: key === "done" ? "complete" : "start" });
        } else if (workerViewer) {
          await setJobProgress(jobId, KEY_TO_STATUS[key] as "IN_PROGRESS" | "COMPLETED");
        } else {
          await updateJob(jobId, { status: KEY_TO_STATUS[key] });
        }
      });
      if (ok) lastGood.current = key;
      else setStatus(previous);
    },
    [door.kind, jobId, run, status, viaToken, workerViewer],
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

  // What the crew is paid for this job (2026-09-20). Manager-only writes; the
  // action refuses anything else, so the buttons only render where canWrite.
  const setPay = useCallback(
    (assignmentId: string, pay: number) =>
      run({ kind: "pay", id: assignmentId }, "Could not save that pay.", async () => {
        const res = await setAssignmentPay(assignmentId, pay);
        if (!res.ok) throw new Error(res.error);
      }),
    [run],
  );

  const markPaid = useCallback(
    (assignmentId: string, paid: boolean) =>
      run({ kind: "pay", id: assignmentId }, "Could not mark that pay.", async () => {
        const res = await setAssignmentPaid(assignmentId, paid);
        if (!res.ok) throw new Error(res.error);
      }),
    [run],
  );

  // The truck is loaded: the pick list leaves the warehouse (actions/inventory).
  const loadMaterials = useCallback(
    () =>
      run({ kind: "load", id: jobId }, "Could not mark the materials loaded.", async () => {
        const res = await loadJobMaterials(jobId);
        if (!res.ok) throw new Error(res.error);
      }),
    [jobId, run],
  );

  // Leftovers back on the shelf after the job (actions/inventory).
  const returnMaterials = useCallback(
    (lines: Array<{ itemId: string; quantity: number }>) =>
      run({ kind: "return", id: jobId }, "Could not book the leftovers.", async () => {
        const res = await returnJobMaterials(jobId, lines);
        if (!res.ok) throw new Error(res.error);
      }),
    [jobId, run],
  );

  // A photo or a video of the work (2026-09-27, lib/media/uploadJobMedia):
  // shrunk in the browser; through the store when it is on, else inline.
  const upload = useCallback(
    (file: File, kind: PhotoKind) =>
      run({ kind: "upload" }, "Could not upload that file.", async () => {
        await uploadJobMedia({
          jobId,
          door: door.kind === "token" ? { token: door.token } : SESSION_DOOR,
          file,
          kind,
          blobEnabled,
          inlineUpload: (dataUrl, filename, k) => uploadJobPhoto(jobId, dataUrl, filename, k),
        });
      }),
    [blobEnabled, door, jobId, run],
  );

  // "Back on site" — a new day on a job that runs more than one (2026-09-27).
  const backOnSite = useCallback(
    () =>
      run({ kind: "continue" }, "Could not mark the day.", async () => {
        if (door.kind === "token") await viaToken(`/api/crew/${jobId}/day`, { action: "continue" });
        else await continueJobDay(jobId);
      }),
    [door.kind, jobId, run, viaToken],
  );

  // The portal's Accept / Decline on the reader's own assignment — the
  // token-gated route the portal always used (a session has no such action).
  const respond = useCallback(
    (assignmentId: string, answer: "ACCEPTED" | "DECLINED") =>
      run({ kind: "respond" }, "Could not send your answer.", async () => {
        if (door.kind !== "token") throw new Error("Open the crew link from your invite to answer.");
        const res = await fetch(`/api/worker/assignment/${assignmentId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: door.token, status: answer }) });
        if (!res.ok) throw new Error((await res.text().catch(() => "")) || "Could not send your answer.");
      }),
    [door, run],
  );

  const sendChange = useCallback(
    (id: string) =>
      run({ kind: "change", id }, "Could not send that change order.", async () => {
        await sendChangeOrder(id);
      }),
    [run],
  );

  // The client said yes in person: the office types their name, and the
  // approval is recorded as in-person under the staff member who typed it —
  // it is never logged as the client's own click.
  const approveChange = useCallback(
    (id: string) =>
      run({ kind: "change", id }, "Could not record that approval.", async () => {
        const name = typeof window !== "undefined" ? window.prompt("Client's full name, as they approved it in person:") : null;
        if (!name || name.trim().length < 2) throw new Error("Type the client's full name to record their approval.");
        await markChangeOrderApproved(id, name.trim());
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
    setPay,
    markPaid,
    loadMaterials,
    returnMaterials,
    upload,
    backOnSite,
    respond,
    sendChange,
    approveChange,
  };
}
