// WHO DID IT — the financials edition (2026-09-24). SERVER ONLY.
//
// Owner: "same thing in financials — show who did it, in colors." Every row
// the Financials sheet lists is a thing somebody did: a payment somebody
// recorded (or the client paid online), an expense somebody logged, an invoice
// somebody sent, a change order somebody drafted. The trail (ActivityEvent)
// carries the person on each of those; this module reads the org's trail once
// and hands back a book of marks keyed by row id, plus a 30-day "by person"
// breakdown for the strip under the Payments and Expenses heads.
//
// One read, two editions: the desk page (page.tsx) calls it directly and
// attaches the marks to its rows; the handheld edition asks through the
// org-scoped action beside it ((mobile)/mobile-financials-v2/who-action.ts).
//
// Nothing here is guessed loudly: a row the trail cannot place gets no mark.
// The one soft match is a change order, whose CREATED event names it only in
// its summary ("Drafted change order #3 "Skylight"") — matched by proposal and
// quoted title, which is what that sentence was written to carry.

import { db } from "@/lib/db";
import { actorsOf, type Actor } from "@/lib/activityLog";
import type { WhoLike } from "@/lib/team/who";
import type { FinancialsByPerson, WhoMark, WhoShare } from "@/components/v3/financials-blueprint/financials-data";

export type FinancialsWho = {
  expenses: Record<string, WhoMark>;
  invoices: Record<string, WhoMark>;
  orders: Record<string, WhoMark>;
  /** The last 30 days — the same window the stat strip reads. */
  byPerson: FinancialsByPerson;
};

export const EMPTY_FINANCIALS_WHO: FinancialsWho = {
  expenses: {},
  invoices: {},
  orders: {},
  byPerson: { payments: [], expenses: [] },
};

const KINDS = ["PAYMENT_RECEIVED", "PAYMENT_MARKED", "PAYMENT_UNMARKED", "EXPENSE", "EMAIL", "PAY", "CREATED", "SENT"];

const CLIENT_MARK: WhoMark = { who: { id: null, name: "Client", role: null } satisfies WhoLike, whoKind: "client" };

type Meta = Record<string, unknown>;
function metaOf(raw: string | null): Meta {
  if (!raw) return {};
  try {
    const m = JSON.parse(raw) as unknown;
    return m && typeof m === "object" ? (m as Meta) : {};
  } catch {
    return {};
  }
}
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export async function getFinancialsWho(organizationId: string): Promise<FinancialsWho> {
  try {
    const since = new Date(Date.now() - 30 * 86400_000);
    const [events, actors, expenseRows, invoiceRows, orderRows] = await Promise.all([
      db.activityEvent.findMany({
        where: { organizationId, kind: { in: KINDS } },
        orderBy: { createdAt: "desc" },
        take: 1000,
        select: { actorId: true, proposalId: true, kind: true, summary: true, meta: true, createdAt: true },
      }),
      actorsOf(organizationId),
      // The same 200 newest rows the snapshot lists — for the 30-day split,
      // which needs each row's amount and date. JobExpense keeps no author of
      // its own, so the trail is the only record of who logged it.
      db.jobExpense.findMany({
        where: { job: { organizationId } },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { id: true, amount: true, createdAt: true },
      }),
      db.invoice.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { id: true, proposalId: true, status: true },
      }),
      db.changeOrder.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { id: true, proposalId: true, title: true },
      }),
    ]);

    const member = (actorId: string | null): WhoMark | null => {
      if (!actorId) return null;
      const a: Actor | undefined = actors.get(actorId);
      return { who: a ? { id: a.id, name: a.name, role: a.role } : { id: actorId, name: "Member", role: null }, whoKind: "member" };
    };

    // ---- payments: the event names the payment, the payment names the invoice
    const paymentEvents = events.filter((e) => e.kind === "PAYMENT_RECEIVED");
    const paymentIds = Array.from(new Set(paymentEvents.map((e) => str(metaOf(e.meta).paymentId)).filter((x): x is string => !!x)));
    const payments = paymentIds.length
      ? await db.payment.findMany({
          where: { id: { in: paymentIds } },
          select: { id: true, invoiceId: true, proposalId: true, amount: true, provider: true },
        })
      : [];
    const paymentById = new Map(payments.map((p) => [p.id, p]));

    /** A payment nobody on the team recorded came in through the client's link. */
    const payerOf = (actorId: string | null, provider: string | null | undefined): WhoMark =>
      member(actorId) ?? (provider && provider !== "MANUAL" ? CLIENT_MARK : { who: null, whoKind: "system" });

    const invoices: Record<string, WhoMark> = {};
    const invoiceById = new Map(invoiceRows.map((i) => [i.id, i]));
    // Per proposal: the marks of every payment-shaped event, for the PAID rows
    // the payment table cannot tie to an invoice (older receipts). Used only
    // when they all agree — one person, or the client alone.
    const byProposal = new Map<string, WhoMark[]>();
    const paymentShares = new Map<string, WhoShare>();

    for (const e of events) {
      if (e.kind !== "PAYMENT_RECEIVED" && e.kind !== "PAYMENT_MARKED") continue;
      const meta = metaOf(e.meta);
      const pay = paymentById.get(str(meta.paymentId) ?? "");
      const mark = payerOf(e.actorId, pay?.provider ?? (e.kind === "PAYMENT_MARKED" ? "MANUAL" : null));
      if (pay?.invoiceId && !invoices[pay.invoiceId]) invoices[pay.invoiceId] = mark;
      const invoiceId = str(meta.invoiceId);
      if (invoiceId && invoiceById.has(invoiceId) && !invoices[invoiceId]) invoices[invoiceId] = mark;
      const pid = e.proposalId ?? pay?.proposalId ?? null;
      if (pid) byProposal.set(pid, [...(byProposal.get(pid) ?? []), mark]);
      // The strip: what each person took in over the window.
      if (e.kind === "PAYMENT_RECEIVED" && e.createdAt >= since) {
        const amount = pay?.amount ?? (typeof meta.amount === "number" ? meta.amount : 0);
        addShare(paymentShares, mark, amount);
      }
    }
    for (const inv of invoiceRows) {
      if (invoices[inv.id]) continue;
      if (inv.status === "PAID" && inv.proposalId) {
        const marks = byProposal.get(inv.proposalId) ?? [];
        const key = (m: WhoMark) => m.who?.id ?? m.whoKind;
        if (marks.length && marks.every((m) => key(m) === key(marks[0]))) invoices[inv.id] = marks[0];
      }
    }
    // An open invoice: the person who sent it, when the EMAIL row names it.
    for (const e of events) {
      if (e.kind !== "EMAIL") continue;
      const invoiceId = str(metaOf(e.meta).invoiceId);
      if (!invoiceId || invoices[invoiceId]) continue;
      const m = member(e.actorId);
      if (m) invoices[invoiceId] = m;
    }

    // ---- expenses: the trail's expenseId
    const expenses: Record<string, WhoMark> = {};
    for (const e of events) {
      if (e.kind !== "EXPENSE") continue;
      const meta = metaOf(e.meta);
      if (meta.deleted) continue;
      const id = str(meta.expenseId);
      if (!id || expenses[id]) continue;
      const m = member(e.actorId);
      if (m) expenses[id] = m;
    }
    const expenseShares = new Map<string, WhoShare>();
    for (const row of expenseRows) {
      const mark = expenses[row.id];
      if (mark && row.createdAt >= since) addShare(expenseShares, mark, row.amount);
    }

    // ---- change orders: the CREATED sentence names the order it drafted
    const orders: Record<string, WhoMark> = {};
    for (const e of events) {
      if (e.kind !== "CREATED" && e.kind !== "SENT") continue;
      const meta = metaOf(e.meta);
      const direct = str(meta.changeOrderId);
      const m = member(e.actorId);
      if (!m) continue;
      if (direct) {
        if (!orders[direct]) orders[direct] = m;
        continue;
      }
      if (!e.summary.includes("change order")) continue;
      for (const co of orderRows) {
        if (orders[co.id] || co.proposalId !== e.proposalId) continue;
        if (e.summary.includes(`"${co.title}"`)) orders[co.id] = m;
      }
    }

    const shares = (m: Map<string, WhoShare>) => Array.from(m.values()).sort((a, b) => b.amount - a.amount);
    return { expenses, invoices, orders, byPerson: { payments: shares(paymentShares), expenses: shares(expenseShares) } };
  } catch {
    // A mark is a courtesy. The book must still draw without it.
    return EMPTY_FINANCIALS_WHO;
  }
}

function addShare(into: Map<string, WhoShare>, mark: WhoMark, amount: number) {
  const key = mark.who?.id ?? mark.whoKind;
  const cur = into.get(key) ?? { who: mark.who, whoKind: mark.whoKind, amount: 0, count: 0 };
  cur.amount += amount || 0;
  cur.count += 1;
  into.set(key, cur);
}
