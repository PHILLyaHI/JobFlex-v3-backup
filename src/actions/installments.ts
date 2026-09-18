"use server";
// Contractor-side money on a proposal's schedule: record a payment that came
// in outside JobFlex (bank transfer, cash, check), or undo one. Provider-paid
// stages (Stripe / Square) are never touched here — a refund from the
// provider dashboard syncs back through the webhooks.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/orgContext";
import { ActivityKind, InstallmentStatus, PaymentStatus, ProposalStatus } from "@/lib/prismaEnums";
import { fromMinor, resolveSchedule, toMinor } from "@/lib/paymentSchedule";
import { ensureSchedule, settleInstallmentPayment } from "@/lib/payments/settle";
import { reopenInvoicesForPayment, repriceOpenInvoices } from "@/lib/payments/invoiceRecord";
import { contractSchedule } from "@/lib/contractTotal";
import { approvedChangeOrders } from "@/lib/changeOrders/extras";
import { expireOpenCheckoutsForProposal } from "@/lib/payments/checkouts";

const methodSchema = z.enum(["BANK_TRANSFER", "CASH", "CHECK", "OTHER"]);

const markSchema = z.object({
  installmentId: z.string().min(1),
  method: methodSchema,
  /** Dollars. Defaults to the stage's current amount. */
  amount: z.number().positive().optional(),
  paidAt: z.coerce.date().optional(),
  note: z.string().trim().max(300).optional(),
});

function revalidate(proposalId: string) {
  revalidatePath("/dashboard/proposals");
  revalidatePath(`/dashboard/proposals/${proposalId}`);
  revalidatePath("/v3/proposals-c");
  revalidatePath("/mobile-proposals-v2");
}

export async function markInstallmentPaid(raw: unknown) {
  const { organizationId, user } = await requireManager();
  const data = markSchema.parse(raw);
  const stage = await db.installment.findFirst({
    where: { id: data.installmentId, proposal: { organizationId } },
    include: { proposal: { select: { id: true, total: true, currency: true, clientId: true, installments: true, changeOrders: { where: { status: "APPROVED" }, select: { status: true, total: true } } } } },
  });
  if (!stage) throw new Error("Not found");
  if (stage.status === InstallmentStatus.PAID) throw new Error("That stage is already paid");
  if (stage.status === InstallmentStatus.WAIVED) throw new Error("That stage was closed out when the proposal was paid");
  if (stage.status === InstallmentStatus.PENDING) {
    // The client has a checkout open for it — kill that first so a card
    // payment can't land on top of the manual one.
    await expireOpenCheckoutsForProposal(stage.proposal.id);
  }
  const schedule = resolveSchedule({
    ...contractSchedule(stage.proposal.total, stage.proposal.changeOrders),
    currency: stage.proposal.currency,
    installments: stage.proposal.installments,
  });
  const resolved = schedule.stages.find((s) => s.id === stage.id);
  const amountMinor = data.amount !== undefined ? toMinor(data.amount) : (resolved?.amountMinor ?? 0);
  if (amountMinor <= 0) throw new Error("Enter the amount received");

  const res = await settleInstallmentPayment({
    provider: "MANUAL",
    externalId: null,
    organizationId,
    proposalId: stage.proposal.id,
    installmentIds: [stage.id],
    amountMinor,
    feeMinor: 0,
    currency: stage.proposal.currency,
    livemode: true,
    method: data.method,
    scheduleVersion: null,
    clientId: stage.proposal.clientId,
    paidAt: data.paidAt,
    actorId: user.id,
    note: data.note,
  });
  revalidate(stage.proposal.id);
  return res;
}

const remainingSchema = z.object({
  proposalId: z.string().min(1),
  method: methodSchema,
  /** Dollars. Defaults to everything still owed. */
  amount: z.number().positive().optional(),
  paidAt: z.coerce.date().optional(),
  note: z.string().trim().max(300).optional(),
});

/** One manual payment that clears (or partly clears) everything still owed. */
export async function recordRemainingPayment(raw: unknown) {
  const { organizationId, user } = await requireManager();
  const data = remainingSchema.parse(raw);
  const proposal = await db.proposal.findFirst({
    where: { id: data.proposalId, organizationId },
    select: { id: true, total: true, currency: true, clientId: true, status: true, changeOrders: { where: { status: "APPROVED" }, select: { status: true, total: true } } },
  });
  if (!proposal) throw new Error("Not found");
  // A COMPLETED proposal may still owe money (completion is about the work,
  // see updateProposalStatus); the "nothing is owed" check below is the real
  // guard.
  await expireOpenCheckoutsForProposal(proposal.id);
  const installments = await ensureSchedule(proposal.id);
  const schedule = resolveSchedule({ ...contractSchedule(proposal.total, proposal.changeOrders), currency: proposal.currency, installments });
  if (schedule.remainingMinor <= 0) throw new Error("Nothing is owed on this proposal");
  const amountMinor = data.amount !== undefined ? toMinor(data.amount) : schedule.remainingMinor;
  const openIds = schedule.stages
    .filter((s) => (s.status === "UNPAID" || s.status === "PENDING") && !s.synthetic)
    .map((s) => s.id);

  const res = await settleInstallmentPayment({
    provider: "MANUAL",
    externalId: null,
    organizationId,
    proposalId: proposal.id,
    installmentIds: amountMinor === schedule.remainingMinor ? openIds : [],
    amountMinor,
    feeMinor: 0,
    currency: proposal.currency,
    livemode: true,
    method: data.method,
    scheduleVersion: null,
    clientId: proposal.clientId,
    paidAt: data.paidAt,
    actorId: user.id,
    note: data.note,
  });
  revalidate(proposal.id);
  return res;
}

/** Undo a MANUAL mark. Provider payments must be refunded at the provider. */
export async function unmarkInstallmentPaid(raw: unknown) {
  const { organizationId, user } = await requireManager();
  const installmentId = z.string().min(1).parse(raw);
  const stage = await db.installment.findFirst({
    where: { id: installmentId, proposal: { organizationId } },
    include: {
      payment: true,
      proposal: { select: { id: true, title: true, status: true, total: true, currency: true, clientId: true } },
    },
  });
  if (!stage) throw new Error("Not found");
  if (stage.status !== InstallmentStatus.PAID || !stage.payment) throw new Error("That stage isn't marked paid");
  if (stage.payment.provider !== "MANUAL") {
    return {
      ok: false as const,
      reason: "provider_paid" as const,
      message: `Paid through ${stage.payment.provider === "SQUARE" ? "Square" : "Stripe"} — refund it from that dashboard and it will sync back here.`,
    };
  }

  await db.$transaction(async (tx) => {
    // Every stage this manual payment covered comes back open — read before
    // the update clears the link, because the invoice book keys on them.
    const covered = await tx.installment.findMany({
      where: { paymentId: stage.payment!.id },
      select: { id: true },
    });
    await tx.installment.updateMany({
      where: { paymentId: stage.payment!.id },
      data: { status: InstallmentStatus.UNPAID, paidAt: null, paidAmount: null, paymentId: null },
    });
    await tx.payment.update({ where: { id: stage.payment!.id }, data: { status: PaymentStatus.VOID } });

    const after = resolveSchedule({
      ...contractSchedule(stage.proposal.total, await approvedChangeOrders(stage.proposal.id, tx)),
      currency: stage.proposal.currency,
      installments: await tx.installment.findMany({ where: { proposalId: stage.proposal.id } }),
    });
    if (after.remainingMinor > 0) {
      await tx.installment.updateMany({
        where: { proposalId: stage.proposal.id, status: InstallmentStatus.WAIVED },
        data: { status: InstallmentStatus.UNPAID, paidAmount: null },
      });
      if (stage.proposal.status === ProposalStatus.PAID) {
        await tx.proposal.update({
          where: { id: stage.proposal.id },
          data: { status: ProposalStatus.ACCEPTED, paidAt: null },
        });
      }
    }
    // Money that is taken back is owed again: the invoices this payment closed
    // go back to outstanding, and the receipt row settlement wrote for itself
    // goes away, rather than leaving the tab claiming money that isn't in.
    // Read after the restore above, so the rows are re-priced at what the
    // stages are worth again.
    const restored = resolveSchedule({
      ...contractSchedule(stage.proposal.total, await approvedChangeOrders(stage.proposal.id, tx)),
      currency: stage.proposal.currency,
      installments: await tx.installment.findMany({ where: { proposalId: stage.proposal.id } }),
    });
    await reopenInvoicesForPayment(tx, {
      organizationId,
      proposalId: stage.proposal.id,
      stageIds: covered.map((c) => c.id),
      stages: restored.stages,
      invoiceId: stage.payment!.invoiceId,
    });
    // The resolver clamps what unpaid stages may ask for to the balance, and an
    // undo leaves the split remainder behind, so the reopened rows are priced
    // against the schedule as it now reads.
    await repriceOpenInvoices(tx, {
      organizationId,
      proposalId: stage.proposal.id,
      stages: resolveSchedule({
        ...contractSchedule(stage.proposal.total, await approvedChangeOrders(stage.proposal.id, tx)),
        currency: stage.proposal.currency,
        installments: await tx.installment.findMany({ where: { proposalId: stage.proposal.id } }),
      }).stages,
    });
    await tx.activityEvent.create({
      data: {
        organizationId,
        actorId: user.id,
        proposalId: stage.proposal.id,
        clientId: stage.proposal.clientId ?? undefined,
        kind: ActivityKind.PAYMENT_UNMARKED,
        summary: `Unmarked "${stage.label}" on ${stage.proposal.title} (${fmt(stage.payment!.amount)})`,
      },
    });
  });
  revalidate(stage.proposal.id);
  return { ok: true as const };
}

/** Resolved schedule for a proposal — for UIs that need the live view. */
export async function getProposalSchedule(proposalId: string) {
  const { organizationId } = await requireManager();
  const p = await db.proposal.findFirst({
    where: { id: proposalId, organizationId },
    select: { total: true, currency: true, installments: { orderBy: { position: "asc" } }, changeOrders: { where: { status: "APPROVED" }, select: { status: true, total: true } } },
  });
  if (!p) throw new Error("Not found");
  const s = resolveSchedule({ ...contractSchedule(p.total, p.changeOrders), currency: p.currency, installments: p.installments });
  return {
    remaining: fromMinor(s.remainingMinor),
    paid: fromMinor(s.paidMinor),
    stages: s.stages.map((st) => ({ id: st.id, label: st.label, status: st.status, amount: fromMinor(st.amountMinor) })),
  };
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
