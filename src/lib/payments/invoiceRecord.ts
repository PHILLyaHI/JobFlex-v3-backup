// THE INVOICE BOOK — the row behind a sent invoice, and the arithmetic that
// keeps it honest.
//
// Sending an invoice (lib/payments/invoices.ts) used to leave only a stamp on
// the stage and a line in the activity feed. The `Invoice` table was written
// by the seed and by nothing else, so the Invoices tab on Financials showed
// demo rows for ever and never gained one from real work. Every invoice that
// goes out now writes its row here, and settlement (lib/payments/settle.ts)
// closes it — one book, both editions of the page read it already.
//
// ── A ROW IS A CLAIM ON INSTALLMENTS ─────────────────────────────────────
// The first cut of this file keyed a row by what the office asked for:
// "stage:<installmentId>" for one stage, "remaining:<proposalId>" for the
// balance. Those two bill the SAME money, so a proposal could carry a $18,444
// balance invoice and a $5,533 deposit invoice and, once both settled, report
// $23,977 collected against $18,444 of payments. Every reader that SUMS the
// book — the handheld masthead, the desktop "collected" line, reports.ts —
// inherited that lie.
//
// So a row now records WHICH installments it bills, in `Invoice.externalId`:
//     "stages:<id>+<id>+…"       raised by the office and sent to the client
//     "paid:stages:<id>+…"       written by settlement for money that arrived
//                                with no invoice open against it
// and the writes below keep two rules true for every proposal:
//
//   · the OPEN rows of a proposal never overlap — a new invoice shrinks, or
//     supersedes (VOID), any open row whose stages it takes over;
//   · a row closes for what actually LANDED on its stages, and money that
//     landed with no open row gets a row of its own.
//
// Which gives the ledger its two invariants, checked by
// .cache/invoice-record/reconcile.mjs:
//   (A) Σ PAID rows of a proposal == Σ its PAID payments  (up to an
//       overpayment the schedule could not place, which settle.ts reports
//       separately as unapplied money);
//   (B) Σ open rows == what the schedule still says is owed, once the whole
//       balance has been invoiced — and never more than that.
//
// Rows written before this key existed (the seed's, and a provider's own id)
// are read as a claim on the WHOLE contract, so the first new invoice on that
// proposal supersedes them instead of double billing beside them.
//
// `amount` is what the row is worth in every money total — the ask while it is
// open, what landed once it is settled. `billedAmount` keeps the figure the
// client was ASKED for: it is stamped by the writes below that change the ask
// (a send, a re-send, a claim that shrank) and NEVER by settlement, so the book
// can print "billed $X · paid $Y" when a payment did not match the ask. A row
// nobody was sent — the receipt settlement writes itself — has none.
//
// Vocabulary is the one the table already speaks: PENDING is "sent, waiting
// for the money" — the rollup counts it as outstanding and calls it overdue
// past its due date — PAID is settled, and VOID is superseded: still visible
// in the book, never counted as money.
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fromMinor } from "@/lib/paymentSchedule";

type Tx = Prisma.TransactionClient;
type AnyDb = Tx | typeof db;

export const INVOICE_OPEN = "PENDING";
export const INVOICE_PAID = "PAID";
/** Superseded by a later invoice for the same money, or closed with nothing
 *  collected. Shown in the book, excluded from every money sum. */
export const INVOICE_VOID = "VOID";

const SENT_PREFIX = "stages:";
const AUTO_PREFIX = "paid:stages:";
const LEGACY_STAGE_PREFIX = "stage:";

/** Invoice numbers start here when an org has none. Matches the seed's run. */
const FIRST_NUMBER = 1001;

/** One installment as the resolver sees it — `ResolvedStage` narrowed to the
 *  five fields this book needs (lib/paymentSchedule). */
export interface StageFact {
  id: string;
  status: string;
  /** What the stage is worth right now; frozen to what was paid once settled. */
  amountMinor: number;
  paidAmountMinor: number;
  /** The synthetic full-payment row has no DB row and cannot be claimed. */
  synthetic?: boolean;
}

export function claimKey(stageIds: readonly string[], auto = false): string {
  const ids = [...new Set(stageIds)].filter(Boolean).sort();
  return (auto ? AUTO_PREFIX : SENT_PREFIX) + ids.join("+");
}

/** Written by settlement rather than sent to a client. */
export function isAutoClaim(externalId: string | null): boolean {
  return (externalId ?? "").startsWith(AUTO_PREFIX);
}

/** The installments a row bills. Anything without a claim key is read as a
 *  claim on the whole contract — that is what the seed's rows are. */
export function coverageOf(externalId: string | null, allStageIds: readonly string[]): string[] {
  const raw = (externalId ?? "").trim();
  const listed = (body: string) => body.split("+").filter(Boolean);
  if (raw.startsWith(AUTO_PREFIX)) return listed(raw.slice(AUTO_PREFIX.length));
  if (raw.startsWith(SENT_PREFIX)) return listed(raw.slice(SENT_PREFIX.length));
  if (raw.startsWith(LEGACY_STAGE_PREFIX)) return listed(raw.slice(LEGACY_STAGE_PREFIX.length));
  return [...allStageIds];
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

/** True once nothing more will be collected on a stage: paid, waived, or gone. */
function isSettled(id: string, facts: Map<string, StageFact>): boolean {
  const f = facts.get(id);
  return !f || f.status === "PAID" || f.status === "WAIVED";
}

/** What a set of stages still OWES, in dollars. A settled stage owes nothing —
 *  its `amountMinor` is frozen at what was collected, so counting it here is
 *  what would let a reopened claim bill money that is already in. */
function owedOf(ids: readonly string[], facts: Map<string, StageFact>): number {
  return fromMinor(
    ids.reduce((n, id) => n + (isSettled(id, facts) ? 0 : (facts.get(id)?.amountMinor ?? 0)), 0),
  );
}

/** What actually landed on a set of stages, in dollars. */
function collectedOf(ids: readonly string[], facts: Map<string, StageFact>): number {
  return fromMinor(ids.reduce((n, id) => n + (facts.get(id)?.paidAmountMinor ?? 0), 0));
}

/** INV-1044 after INV-1043 — continues the org's own run, never a global one. */
export async function nextInvoiceNumber(organizationId: string, tx: AnyDb = db): Promise<string> {
  const rows = await tx.invoice.findMany({ where: { organizationId }, select: { number: true } });
  let max = FIRST_NUMBER - 1;
  for (const r of rows) {
    const m = /^INV-(\d+)$/.exec(r.number.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `INV-${max + 1}`;
}

/** Create a row, allocating its number under the unique index on
 *  (organizationId, number). Two sends that race both read the same "next"
 *  number and one of them loses with P2002 — it simply takes the next one.
 *  Without the retry that loser would raise, and its invoice would go out with
 *  no row behind it. */
async function createNumbered(
  tx: Tx,
  organizationId: string,
  data: Omit<Prisma.InvoiceUncheckedCreateInput, "number" | "organizationId">,
): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const number = await nextInvoiceNumber(organizationId, tx);
    try {
      await tx.invoice.create({ data: { ...data, organizationId, number } });
      return number;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "P2002" || attempt === 5) throw err;
    }
  }
  throw new Error("Could not allocate an invoice number");
}

export interface RecordInvoiceInput {
  organizationId: string;
  proposalId: string;
  clientId: string | null;
  /** The installments this invoice bills. */
  stageIds: string[];
  /** Every DB-backed installment of the contract, resolved. */
  stages: StageFact[];
  /** What the client was asked for — the figure in the email. */
  amount: number;
  /** The rail the client will pay on: STRIPE | SQUARE | STAX | MANUAL. */
  provider: string;
  dueDate: Date | null;
}

/** Write (or re-state) the row for an invoice that has just gone out, and make
 *  room for it: no other OPEN row may keep billing what this one bills. */
export async function recordInvoiceSent(input: RecordInvoiceInput, tx?: Tx): Promise<string> {
  if (!tx) return db.$transaction((t) => recordInvoiceSent(input, t));

  const facts = new Map(input.stages.map((s) => [s.id, s]));
  const allIds = input.stages.filter((s) => !s.synthetic).map((s) => s.id);
  const mine = new Set(input.stageIds.filter((id) => facts.has(id)));
  if (!mine.size) {
    // Nothing claimable: an under-scheduled contract whose remainder sits on no
    // installment (schedule.balanceMinor). A row with an empty claim could
    // never be closed or superseded, and one would be minted on every re-send,
    // so the ask goes out without a book row and the caller logs it.
    throw new Error("This invoice bills no installment — nothing to record in the book.");
  }
  const key = claimKey([...mine]);

  const open = await tx.invoice.findMany({
    where: { organizationId: input.organizationId, proposalId: input.proposalId, status: INVOICE_OPEN },
    select: { id: true, number: true, externalId: true },
  });

  let restate: { id: string; number: string } | null = null;
  for (const row of open) {
    // Stages that no longer exist are dropped first: a claim left pointing at a
    // deleted installment would otherwise survive beside the new invoice and
    // bill the same debt twice.
    const cov = coverageOf(row.externalId, allIds).filter((id) => facts.has(id));
    const rest = cov.filter((id) => !mine.has(id));
    if (cov.length && rest.length === cov.length) continue; // bills something else entirely
    if (!rest.length) {
      // The new invoice takes over everything this row claimed.
      if (!restate && sameSet(cov, [...mine])) {
        restate = { id: row.id, number: row.number }; // the same ask again
        continue;
      }
      await tx.invoice.update({ where: { id: row.id }, data: { status: INVOICE_VOID } });
      continue;
    }
    // Partly taken over: it keeps only the stages the new invoice leaves it —
    // unless what is left owes nothing, in which case the row is closed out
    // rather than kept alive as a $0 claim.
    const restOwed = owedOf(rest, facts);
    await tx.invoice.update({
      where: { id: row.id },
      data: restOwed > 0
        ? { externalId: claimKey(rest), amount: restOwed, billedAmount: restOwed }
        : { status: INVOICE_VOID },
    });
  }

  if (restate) {
    // A re-send is the same debt: the amount and the rail can have moved (a
    // change order landed, the office switched to bank), the number cannot.
    await tx.invoice.update({
      where: { id: restate.id },
      // Re-keyed as well: a row that predates the claim key (the seed's, or a
      // "remaining:" row from the first cut) says exactly what it bills from
      // here on, instead of being read as "the whole contract" for ever.
      data: {
        amount: input.amount,
        billedAmount: input.amount,
        provider: input.provider,
        dueDate: input.dueDate,
        externalId: key,
      },
    });
    return restate.number;
  }

  return createNumbered(tx, input.organizationId, {
    proposalId: input.proposalId,
    clientId: input.clientId,
    amount: input.amount,
    billedAmount: input.amount,
    status: INVOICE_OPEN,
    provider: input.provider,
    externalId: key,
    dueDate: input.dueDate,
  });
}

export interface SettleInvoicesInput {
  organizationId: string;
  proposalId: string;
  clientId: string | null;
  /** The installments THIS payment marked paid. */
  justPaidIds: string[];
  /** stage id → the stage that inherited its unpaid part, when a payment only
   *  partly covered it (settle.ts writes a "(remainder)" installment). The
   *  claim follows, or the rest of that debt would be billed to nobody. */
  successors?: Record<string, string>;
  /** Every DB-backed installment, resolved AFTER the payment was applied. */
  stages: StageFact[];
  paidAt: Date;
  /** The rail the money arrived on, for a row settlement has to write itself. */
  provider: string;
}

/** Money landed → close what it paid for. Runs inside the settlement
 *  transaction, so the book can never say "outstanding" about a stage the same
 *  commit marked PAID. Returns the rows it closed. */
export async function settleInvoicesForPayment(tx: Tx, input: SettleInvoicesInput): Promise<string[]> {
  const facts = new Map(input.stages.map((s) => [s.id, s]));
  const allIds = input.stages.filter((s) => !s.synthetic).map((s) => s.id);
  const settled = (id: string) => isSettled(id, facts);
  const justPaid = input.justPaidIds.filter((id) => facts.get(id)?.status === "PAID");
  const successors = input.successors ?? {};

  const open = await tx.invoice.findMany({
    where: { organizationId: input.organizationId, proposalId: input.proposalId, status: INVOICE_OPEN },
    select: { id: true, externalId: true, provider: true, dueDate: true },
  });

  const closed: string[] = [];
  const claimed = new Set<string>();
  for (const row of open) {
    const cov = coverageOf(row.externalId, allIds).filter((id) => facts.has(id));
    const done = cov.filter(settled);
    if (!done.length) continue;
    done.forEach((id) => claimed.add(id));
    const collected = collectedOf(done, facts);
    const rest = cov.filter((id) => !settled(id));
    // A stage that was only part paid left its remainder on a new installment:
    // this claim carries on over that one.
    for (const id of done) {
      const heir = successors[id];
      if (heir && facts.has(heir) && !rest.includes(heir) && !cov.includes(heir)) rest.push(heir);
    }

    if (!collected) {
      // Everything it billed was waived or deleted: the claim is closed out,
      // not collected. A $0 "paid" row would be a lie in every total.
      await tx.invoice.update({ where: { id: row.id }, data: { status: INVOICE_VOID } });
      continue;
    }
    await tx.invoice.update({
      where: { id: row.id },
      data: {
        status: INVOICE_PAID,
        paidAt: input.paidAt,
        // The row is worth what landed on it, and now claims only that. What
        // was ASKED stays in billedAmount, untouched.
        amount: collected,
        externalId: claimKey(done),
      },
    });
    closed.push(row.id);
    const restOwed = owedOf(rest, facts);
    if (rest.length && restOwed > 0) {
      // Part of what it billed is still owed: that part carries on as its own
      // open row, the way settle.ts splits a part-paid stage.
      await createNumbered(tx, input.organizationId, {
        proposalId: input.proposalId,
        clientId: input.clientId,
        amount: restOwed,
        billedAmount: restOwed,
        status: INVOICE_OPEN,
        provider: row.provider,
        externalId: claimKey(rest),
        dueDate: row.dueDate,
      });
    }
  }

  // Money nobody invoiced — a client who paid from the portal without being
  // asked, or the office marking a stage paid by hand. It belongs in the book
  // too, or "collected" there would be less than the money in the bank.
  const uncovered = justPaid.filter((id) => !claimed.has(id));
  if (uncovered.length) {
    const amount = collectedOf(uncovered, facts);
    if (amount > 0) {
      await createNumbered(tx, input.organizationId, {
        proposalId: input.proposalId,
        clientId: input.clientId,
        amount,
        status: INVOICE_PAID,
        provider: input.provider,
        externalId: claimKey(uncovered, true),
        paidAt: input.paidAt,
      });
    }
  }
  return closed;
}

export interface ReopenInvoicesInput {
  organizationId: string;
  proposalId: string;
  /** The installments the undo put back on the table. */
  stageIds: string[];
  /** Every DB-backed installment, resolved AFTER the undo. */
  stages: StageFact[];
  /** The row the voided payment pointed at, if any. */
  invoiceId: string | null;
}

/** The undo of the above: money that is taken back is owed again. A row is
 *  split rather than flipped whole — one payment of several can be undone, and
 *  the part other payments are still holding must stay collected. A row
 *  settlement wrote for itself is deleted: it was a receipt, never an ask. */
export async function reopenInvoicesForPayment(tx: Tx, input: ReopenInvoicesInput): Promise<number> {
  const facts = new Map(input.stages.map((s) => [s.id, s]));
  const allIds = input.stages.filter((s) => !s.synthetic).map((s) => s.id);
  const back = new Set(input.stageIds.filter(Boolean));
  if (!back.size && !input.invoiceId) return 0;

  const rows = await tx.invoice.findMany({
    where: { organizationId: input.organizationId, proposalId: input.proposalId, status: INVOICE_PAID },
    select: { id: true, externalId: true, provider: true, dueDate: true, clientId: true },
  });
  let touched = 0;
  for (const row of rows) {
    const cov = coverageOf(row.externalId, allIds).filter((id) => facts.has(id));
    const gone = cov.filter((id) => back.has(id));
    if (!gone.length) {
      // Nothing this row billed came back. A row the voided payment pointed at
      // whose stages have all been deleted is closed out; anything else stands.
      if (row.id === input.invoiceId && !cov.length) {
        await tx.invoice.update({ where: { id: row.id }, data: { status: INVOICE_VOID } });
        touched += 1;
      }
      continue;
    }
    touched += 1;
    if (isAutoClaim(row.externalId)) {
      await tx.invoice.delete({ where: { id: row.id } });
      continue;
    }
    const kept = cov.filter((id) => !back.has(id));
    const owed = owedOf(gone, facts);
    if (kept.length) {
      // Part of what it collected is still collected: the row keeps that part,
      // and the money that came back becomes its own open row.
      await tx.invoice.update({
        where: { id: row.id },
        data: { amount: collectedOf(kept, facts), externalId: claimKey(kept) },
      });
      if (owed > 0) {
        await createNumbered(tx, input.organizationId, {
          proposalId: input.proposalId,
          clientId: row.clientId,
          amount: owed,
          billedAmount: owed,
          status: INVOICE_OPEN,
          provider: row.provider,
          externalId: claimKey(gone),
          dueDate: row.dueDate,
        });
      }
      continue;
    }
    await tx.invoice.update({
      where: { id: row.id },
      data: owed > 0
        ? { status: INVOICE_OPEN, paidAt: null, amount: owed, billedAmount: owed, externalId: claimKey(gone) }
        : { status: INVOICE_VOID, paidAt: null },
    });
  }
  return touched;
}

/** Re-price a proposal's open rows against the schedule as it stands now.
 *
 *  Raising and settling are not the only things that move what is owed: a
 *  CREDIT change order lowers the contract value, and the schedule editor can
 *  re-amount or delete the very stages an invoice bills. Without this, the open
 *  rows of such a proposal keep asking for the old figure for ever — the one
 *  way (B) can be broken by an action that is not a payment. */
export async function repriceOpenInvoices(
  tx: AnyDb,
  input: { organizationId: string; proposalId: string; stages: StageFact[] },
): Promise<number> {
  const facts = new Map(input.stages.map((s) => [s.id, s]));
  const allIds = input.stages.filter((s) => !s.synthetic).map((s) => s.id);
  const open = await tx.invoice.findMany({
    where: { organizationId: input.organizationId, proposalId: input.proposalId, status: INVOICE_OPEN },
    select: { id: true, externalId: true, amount: true },
  });
  let changed = 0;
  for (const row of open) {
    const live = coverageOf(row.externalId, allIds).filter((id) => facts.has(id) && !isSettled(id, facts));
    const owed = owedOf(live, facts);
    if (!live.length || owed <= 0) {
      await tx.invoice.update({ where: { id: row.id }, data: { status: INVOICE_VOID } });
      changed += 1;
      continue;
    }
    const key = claimKey(live);
    if (key === row.externalId && Math.abs(row.amount - owed) < 0.005) continue;
    await tx.invoice.update({
      where: { id: row.id },
      data: { externalId: key, amount: owed, billedAmount: owed },
    });
    changed += 1;
  }
  return changed;
}
