// Approving and declining a change order — the ONE place the contract moves.
//
// Plain module, not "use server": the public token routes and the office's
// "mark approved" action both call it, so its arguments (ip, user agent, the
// staff member) are set by the caller that knows them, never by a browser.
//
// APPROVAL, in one transaction:
//   · SENT → APPROVED by a conditional updateMany, so a double tap, or a
//     client tap racing an office tap, approves exactly once;
//   · the proposal's own subtotal / tax / total are NOT touched — the contract
//     value is derived (lib/contractTotal); a legacy row with no `total`
//     gets total = amount so it can be counted from now on;
//   · a positive total becomes its own fixed UNPAID installment, appended
//     after the existing stages — after ensureSchedule, so a proposal that
//     had only the implicit 100% stage keeps it as a real row;
//   · a PAID proposal reopens to ACCEPTED (money is owed again); a COMPLETED
//     one stays COMPLETED — the portal and checkout accept COMPLETED when
//     something is owed;
//   · a credit (total ≤ 0) creates no stage; it only lowers the contract
//     value, and settle's "nothing owed" rule then waives what is left.
// Afterwards every open checkout is expired: a "pay remaining" session now
// asks for the wrong amount, and the resolver cannot tell which session was
// which, so all of them are re-minted on the next click.
import { db } from "@/lib/db";
import { InstallmentStatus, ProposalStatus } from "@/lib/prismaEnums";
import { ensureSchedule } from "@/lib/payments/settle";
import { repriceOpenInvoices } from "@/lib/payments/invoiceRecord";
import { approvedChangeOrders } from "@/lib/changeOrders/extras";
import { contractSchedule } from "@/lib/contractTotal";
import { resolveSchedule } from "@/lib/paymentSchedule";
import { expireOpenCheckoutsForProposal } from "@/lib/payments/checkouts";
import { CO_STATUS } from "./types";

export type ApproveVia = "client" | "in_person";

export interface ApproveInput {
  coId: string;
  via: ApproveVia;
  /** The client's typed full name (client), or the name the office typed for them (in person). */
  name: string;
  ip: string | null;
  userAgent: string | null;
  /** The staff member recording an in-person approval; null for the client. */
  byUserId: string | null;
}

export type RespondResult = { ok: true; already: boolean } | { ok: false; error: string; status: 404 | 409 };

const r2 = (n: number) => Math.round(n * 100) / 100;

class AlreadyDecided extends Error {}

async function loadForDecision(coId: string) {
  return db.changeOrder.findUnique({
    where: { id: coId },
    include: {
      organization: { select: { deletedAt: true } },
      // total + currency: an approval re-prices the open invoice rows of the
      // contract (repriceOpenInvoices), which needs the resolved schedule.
      proposal: { select: { id: true, status: true, title: true, total: true, currency: true } },
    },
  });
}

export async function approveChangeOrder(input: ApproveInput): Promise<RespondResult> {
  const co = await loadForDecision(input.coId);
  if (!co || co.organization.deletedAt) return { ok: false, error: "Not found", status: 404 };
  if (co.status === CO_STATUS.APPROVED) return { ok: true, already: true };
  if (co.status === CO_STATUS.DECLINED) return { ok: false, error: "This change order was declined.", status: 409 };
  if (co.status === CO_STATUS.VOID) return { ok: false, error: "This change order was withdrawn.", status: 409 };
  // The client can only answer what was sent; the office may record an
  // in-person yes on a draft it never got round to sending.
  const allowedFrom: string[] = input.via === "client" ? [CO_STATUS.SENT] : [CO_STATUS.DRAFT, CO_STATUS.SENT];
  if (!allowedFrom.includes(co.status)) return { ok: false, error: "This change order hasn't been sent yet.", status: 409 };
  if (co.proposal && (co.proposal.status === ProposalStatus.DECLINED || co.proposal.status === ProposalStatus.ARCHIVED)) {
    return { ok: false, error: "The proposal this change order amends is closed.", status: 409 };
  }
  const total = r2(co.total ?? co.amount);
  const now = new Date();
  try {
    await db.$transaction(async (tx) => {
      const { count } = await tx.changeOrder.updateMany({
        where: { id: co.id, status: { in: allowedFrom } },
        data: {
          status: CO_STATUS.APPROVED,
          approvedAt: now,
          approvedIp: input.ip ?? undefined,
          approvedName: input.name,
          approvedVia: input.via,
          approvedByUserId: input.byUserId,
          approvedUserAgent: input.userAgent?.slice(0, 300) ?? null,
          // A legacy row (pre-itemized) becomes countable from here on.
          ...(co.total == null ? { total, taxTotal: 0, taxRate: 0 } : {}),
        },
      });
      if (count !== 1) throw new AlreadyDecided();

      if (co.proposalId && co.proposal) {
        if (total > 0) {
          await ensureSchedule(co.proposalId, tx);
          const max = await tx.installment.aggregate({ where: { proposalId: co.proposalId }, _max: { position: true } });
          await tx.installment.create({
            data: {
              proposalId: co.proposalId,
              label: `Change order${co.number ? ` #${co.number}` : ""} · ${co.title}`.slice(0, 120),
              amount: total,
              isPercent: false,
              position: (max._max.position ?? -1) + 1,
              status: InstallmentStatus.UNPAID,
              changeOrderId: co.id,
            },
          });
        }
        if (co.proposal.status === ProposalStatus.PAID) {
          await tx.proposal.update({ where: { id: co.proposalId }, data: { status: ProposalStatus.ACCEPTED, paidAt: null } });
        }
        // An approved change order moves the contract value, so the percent
        // stages an open invoice bills are worth something else now — a CREDIT
        // lowers them. Re-price those rows against the schedule as it stands,
        // or the Invoices tab keeps asking for the old figure (invoiceRecord).
        const stages = resolveSchedule({
          ...contractSchedule(co.proposal.total, await approvedChangeOrders(co.proposalId, tx)),
          currency: co.proposal.currency,
          installments: await tx.installment.findMany({ where: { proposalId: co.proposalId }, orderBy: { position: "asc" } }),
        }).stages;
        await repriceOpenInvoices(tx, {
          organizationId: co.organizationId,
          proposalId: co.proposalId,
          stages,
        });
      }

      await tx.activityEvent.create({
        data: {
          organizationId: co.organizationId,
          actorId: input.byUserId,
          proposalId: co.proposalId ?? null,
          kind: "CO_APPROVED",
          summary:
            input.via === "client"
              ? `Client approved change order "${co.title}"`
              : `Change order "${co.title}" approved in person${input.name ? ` (${input.name})` : ""}`,
        },
      });
    });
  } catch (err) {
    if (err instanceof AlreadyDecided) {
      const again = await db.changeOrder.findUnique({ where: { id: co.id }, select: { status: true } });
      return again?.status === CO_STATUS.APPROVED ? { ok: true, already: true } : { ok: false, error: "This change order was already answered.", status: 409 };
    }
    throw err;
  }
  if (co.proposalId && total > 0) {
    await expireOpenCheckoutsForProposal(co.proposalId).catch((e) => console.warn("[changeOrders] expire checkouts failed:", e));
  }
  return { ok: true, already: false };
}

export interface DeclineInput {
  coId: string;
  reason: string | null;
  ip: string | null;
}

export async function declineChangeOrder(input: DeclineInput): Promise<RespondResult> {
  const co = await loadForDecision(input.coId);
  if (!co || co.organization.deletedAt) return { ok: false, error: "Not found", status: 404 };
  if (co.status === CO_STATUS.DECLINED) return { ok: true, already: true };
  if (co.status === CO_STATUS.APPROVED) return { ok: false, error: "This change order was already approved.", status: 409 };
  if (co.status !== CO_STATUS.SENT) return { ok: false, error: "This change order hasn't been sent yet.", status: 409 };
  const { count } = await db.changeOrder.updateMany({
    where: { id: co.id, status: CO_STATUS.SENT },
    data: { status: CO_STATUS.DECLINED, declinedAt: new Date(), declineReason: input.reason?.slice(0, 2000) || null },
  });
  if (count !== 1) return { ok: false, error: "This change order was already answered.", status: 409 };
  await db.activityEvent.create({
    data: {
      organizationId: co.organizationId,
      proposalId: co.proposalId ?? null,
      kind: "CO_DECLINED",
      summary: `Client declined change order "${co.title}"${input.reason ? ` — ${input.reason.slice(0, 120)}` : ""}`,
    },
  });
  return { ok: true, already: false };
}
