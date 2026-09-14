"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/orgContext";
import { sendPaymentReminder } from "@/lib/payments/reminders";
// The customer/worker-facing senders live in src/lib/notify.ts (plain module,
// not invokable as actions) and are called only from the guarded actions /
// token-gated routes that own the resource. Only the payment reminder is
// genuinely user-triggered, so it stays a guarded action here — a thin
// wrapper over lib/payments/reminders, which the daily auto ladder shares.
export async function notifyPaymentReminder({
  proposalId,
  installmentId,
}: {
  proposalId: string;
  installmentId: string;
}) {
  const { organizationId } = await requireManager();
  const r = await sendPaymentReminder({ proposalId, installmentId: installmentId || null, source: "manual", organizationId });
  if (r.skipped === "not-found") return { skipped: true as const, reason: "unauthorized" as const };
  if (r.skipped === "no-client") return { skipped: true as const, reason: "no-client-email" as const };
  if (r.skipped === "nothing-owed") return { skipped: true as const, reason: "nothing-owed" as const };
  return {
    skipped: false as const,
    delivery: r.sent ? ("sent" as const) : ("disabled" as const),
    email: r.email,
    sms: r.sms,
  };
}

/** Per-proposal override of the company's reminder mode: true / false, or null to follow it. */
export async function setProposalReminders(proposalId: string, on: boolean | null) {
  const { organizationId } = await requireManager();
  const { count } = await db.proposal.updateMany({ where: { id: proposalId, organizationId }, data: { remindersOn: on } });
  if (count !== 1) throw new Error("Not found");
  revalidatePath("/dashboard/proposals");
  return { ok: true as const, remindersOn: on };
}
