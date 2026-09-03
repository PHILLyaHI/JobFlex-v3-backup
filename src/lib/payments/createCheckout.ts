// Mint a hosted checkout on the CONTRACTOR's account for one stage or the
// remaining balance. Amount is always derived server-side from the current
// schedule. Every guard the portal uses to show a button is re-checked here.
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { getStripeMode } from "@/lib/stripeMode";
import { parsePaymentSettings } from "@/lib/settings";
import { InstallmentStatus, ProposalStatus } from "@/lib/prismaEnums";
import {
  amountForTarget,
  isBelowMin,
  MIN_MINOR,
  NotPayableError,
  platformFeeMinor,
  resolveSchedule,
  type PayTarget,
} from "@/lib/paymentSchedule";
import { platformFeeBps } from "./fees";
import { getConnections } from "./connections";
import { resolvePayOptions, PAY_BLOCK_COPY } from "./payOptions";
import { stripeForConnection, expireStripeSession } from "./stripeConnect";
import { squareClientForConnection, deleteSquarePaymentLink } from "./squareConnect";
import { ensureSchedule } from "./settle";
import { expireOpenCheckoutsForProposal } from "./checkouts";

export type CheckoutProvider = "STRIPE" | "SQUARE";

export type CheckoutResult =
  | { ok: true; url: string; reused: boolean }
  | { ok: false; status: number; error: string; reason?: string };

const REUSE_WINDOW_MS = 55 * 60 * 1000; // sessions are minted with a 60-minute expiry

export async function createCheckout(input: {
  provider: CheckoutProvider;
  publicId: string;
  target: PayTarget;
}): Promise<CheckoutResult> {
  const proposal = await db.proposal.findUnique({
    where: { publicId: input.publicId },
    include: {
      installments: { orderBy: { position: "asc" } },
      client: { select: { id: true, email: true, name: true } },
      organization: { select: { id: true, name: true, deletedAt: true, paymentSettingsJson: true } },
    },
  });
  if (!proposal || proposal.organization.deletedAt) {
    return { ok: false, status: 404, error: "Not found" };
  }
  if (proposal.status !== ProposalStatus.ACCEPTED) {
    if (proposal.status === ProposalStatus.PAID)
      return { ok: false, status: 409, error: "This proposal is already paid", reason: "paid" };
    if (proposal.status === ProposalStatus.DECLINED || proposal.status === ProposalStatus.ARCHIVED)
      return { ok: false, status: 409, error: "This proposal is closed", reason: "closed" };
    return { ok: false, status: 409, error: "Accept the proposal first", reason: "not_accepted" };
  }

  const [conns, mode] = await Promise.all([getConnections(proposal.organizationId), getStripeMode()]);
  const options = resolvePayOptions({
    settings: parsePaymentSettings(proposal.organization.paymentSettingsJson),
    stripeConn: conns.stripe,
    squareConn: conns.square,
    proposalCurrency: proposal.currency,
    stripeMode: mode,
  });
  const opt = input.provider === "STRIPE" ? options.stripe : options.square;
  if (!opt.ok) {
    return { ok: false, status: 409, error: PAY_BLOCK_COPY[opt.reason ?? "not_connected"], reason: opt.reason };
  }
  const conn = input.provider === "STRIPE" ? conns.stripe! : conns.square!;

  const installments = proposal.installments.length
    ? proposal.installments
    : await ensureSchedule(proposal.id);
  const schedule = resolveSchedule({
    total: proposal.total,
    currency: proposal.currency,
    installments,
  });

  let pay;
  try {
    pay = amountForTarget(schedule, input.target);
  } catch (err) {
    if (err instanceof NotPayableError) {
      const msg =
        err.reason === "not_next"
          ? "Stages are paid in order — pay the earlier one first."
          : err.reason === "nothing_due"
            ? "Nothing is owed on this proposal."
            : "That stage can't be paid.";
      return { ok: false, status: 409, error: msg, reason: err.reason };
    }
    throw err;
  }
  if (isBelowMin(pay.amountMinor, input.provider)) {
    return {
      ok: false,
      status: 400,
      error: `The minimum ${input.provider === "SQUARE" ? "Square" : "card"} payment is $${(MIN_MINOR[input.provider] / 100).toFixed(2)} — pay the remaining balance instead.`,
      reason: "below_min",
    };
  }
  // A "remaining" target on an implicit schedule has no DB stage id yet —
  // ensureSchedule above created one; map the synthetic id onto it.
  const stageIds = pay.installmentIds.length ? pay.installmentIds : installments.map((i) => i.id);
  const feeMinor = platformFeeMinor(pay.amountMinor, input.provider, platformFeeBps());

  // ── reuse an open checkout for exactly this target ────────────────────
  const pendingRows = installments.filter((i) => stageIds.includes(i.id) && i.status === InstallmentStatus.PENDING);
  if (
    pendingRows.length === stageIds.length &&
    pendingRows.length > 0 &&
    pendingRows.every((r) => r.checkoutProvider === input.provider && r.checkoutRef === pendingRows[0].checkoutRef) &&
    pendingRows[0].checkoutOpenedAt &&
    Date.now() - pendingRows[0].checkoutOpenedAt.getTime() < REUSE_WINDOW_MS
  ) {
    const url = await openUrlFor(input.provider, conn, pendingRows[0].checkoutRef!);
    if (url) return { ok: true, url, reused: true };
  }

  // ── release any other open checkout on this proposal ──────────────────
  await expireOpenCheckoutsForProposal(proposal.id);

  // ── atomic claim ──────────────────────────────────────────────────────
  const openedAt = new Date();
  const claim = await db.installment.updateMany({
    where: { id: { in: stageIds }, status: InstallmentStatus.UNPAID },
    data: { status: InstallmentStatus.PENDING, checkoutProvider: input.provider, checkoutOpenedAt: openedAt },
  });
  if (claim.count !== stageIds.length) {
    await db.installment.updateMany({
      where: { id: { in: stageIds }, status: InstallmentStatus.PENDING, checkoutOpenedAt: openedAt, checkoutRef: null },
      data: { status: InstallmentStatus.UNPAID, checkoutProvider: null, checkoutOpenedAt: null },
    });
    return { ok: false, status: 409, error: "This payment is already being processed in another window.", reason: "in_progress" };
  }

  const origin = await appBaseUrl();
  const prevRef = pendingRows[0]?.checkoutRef ?? "0";
  const idempotencyKey = `pay:${proposal.id}:${[...stageIds].sort().join(",")}:v${proposal.scheduleVersion}:${prevRef}`.slice(0, 200);
  const metadata = {
    proposalId: proposal.id,
    publicId: proposal.publicId,
    organizationId: proposal.organizationId,
    installmentIds: stageIds.join(","),
    scheduleVersion: String(proposal.scheduleVersion),
    kind: pay.kind,
    amountMinor: String(pay.amountMinor),
  };
  const itemName = `${proposal.title} — ${pay.label}`.slice(0, 120);

  try {
    if (input.provider === "STRIPE") {
      const bound = stripeForConnection(conn)!;
      const session = await bound.stripe.checkout.sessions.create(
        {
          mode: "payment",
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: proposal.currency.toLowerCase(),
                unit_amount: pay.amountMinor,
                product_data: { name: itemName },
              },
            },
          ],
          payment_method_types: opt.ok && "ach" in opt && opt.ach ? ["card", "us_bank_account"] : ["card"],
          payment_intent_data: {
            application_fee_amount: feeMinor,
            metadata,
            description: itemName,
          },
          metadata,
          client_reference_id: proposal.id,
          customer_email: proposal.client?.email ?? undefined,
          expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
          success_url: `${origin}/portal/q/${proposal.publicId}?paid=1&ref={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/portal/q/${proposal.publicId}?canceled=1`,
        },
        { stripeAccount: bound.accountId, idempotencyKey },
      );
      if (!session.url) throw new Error("Stripe returned no checkout URL");
      await db.installment.updateMany({
        where: { id: { in: stageIds } },
        data: { checkoutRef: session.id },
      });
      return { ok: true, url: session.url, reused: false };
    }

    // ── Square ────────────────────────────────────────────────────────
    const client = await squareClientForConnection(conn);
    if (!client || !conn.squareLocationId) throw new Error("Square connection unavailable");
    const currency = proposal.currency.toUpperCase();
    const res = await client.checkout.paymentLinks.create({
      idempotencyKey,
      order: {
        locationId: conn.squareLocationId,
        referenceId: proposal.id.slice(0, 40),
        lineItems: [
          {
            name: itemName,
            quantity: "1",
            basePriceMoney: { amount: BigInt(pay.amountMinor), currency: currency as never },
          },
        ],
        metadata,
      },
      checkoutOptions: {
        appFeeMoney: feeMinor > 0 ? { amount: BigInt(feeMinor), currency: currency as never } : undefined,
        redirectUrl: `${origin}/portal/q/${proposal.publicId}?paid=1&ref=`,
        allowTipping: false,
        askForShippingAddress: false,
      },
      prePopulatedData: proposal.client?.email ? { buyerEmail: proposal.client.email } : undefined,
      paymentNote: itemName.slice(0, 500),
    });
    const link = res.paymentLink;
    if (!link?.id || !link.url) throw new Error("Square returned no payment link");
    // Square appends nothing reliable on sandbox; we bake our own ref in.
    await db.installment.updateMany({
      where: { id: { in: stageIds } },
      data: { checkoutRef: link.id, checkoutOrderId: link.orderId ?? null },
    });
    return { ok: true, url: link.url, reused: false };
  } catch (err) {
    console.error("[createCheckout]", input.provider, proposal.id, err instanceof Error ? err.message : err);
    await db.installment.updateMany({
      where: { id: { in: stageIds }, status: InstallmentStatus.PENDING, checkoutOpenedAt: openedAt },
      data: { status: InstallmentStatus.UNPAID, checkoutProvider: null, checkoutRef: null, checkoutOrderId: null, checkoutOpenedAt: null },
    });
    return { ok: false, status: 502, error: "Couldn't start checkout — please try again.", reason: "provider_error" };
  }
}

/** URL of a still-open session/link, or null when it is no longer usable. */
async function openUrlFor(
  provider: CheckoutProvider,
  conn: NonNullable<Awaited<ReturnType<typeof getConnections>>["stripe"]>,
  ref: string,
): Promise<string | null> {
  try {
    if (provider === "STRIPE") {
      const bound = stripeForConnection(conn);
      if (!bound) return null;
      const s = await bound.stripe.checkout.sessions.retrieve(ref, undefined, { stripeAccount: bound.accountId });
      return s.status === "open" && s.url ? s.url : null;
    }
    const client = await squareClientForConnection(conn);
    if (!client) return null;
    const r = await client.checkout.paymentLinks.get({ id: ref });
    return r.paymentLink?.url ?? null;
  } catch {
    return null;
  }
}

export { expireStripeSession, deleteSquarePaymentLink };
