"use server";
// THE DECK STUDIO'S SERVER HALF (2026-10-04). The engine is pure and runs in
// the browser (lib/deck); the server keeps two things for it:
//
//   · the shop's own deck prices — a sparse book (lib/deck/rates) kept in
//     SyncState under `deckbook:<orgId>`, like the ad names on the traffic
//     page: no table of its own, so nothing has to be pushed to production
//     by hand before this ships;
//   · the proposal — the deck's priced lines written the way the fence
//     estimator writes its own (actions/fenceEstimator), and the deck itself
//     (design + frozen 3D) kept beside it as an ActivityEvent DECK_PLAN for
//     the client's page.
//
// Both are for admins while the estimator is marked Coming soon (lib/deck/access),
// the same rule the page applies.
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { NoOrgError, UnauthorizedError, requireEstimatorOrManager } from "@/lib/orgContext";
import { canUseDeckEstimator } from "@/lib/deck/access";
import { checkPlanLimit } from "@/lib/limitsEngine";
import { PLAN_LIMIT_MESSAGE, type LimitKey } from "@/lib/planLimits";
import { ProposalStatus } from "@/lib/prismaEnums";
import { clearFilingContext, filedClientId, leadProposalText, readFilingContext } from "@/lib/filingContext";
import { stateFromAddress, stateTaxRate } from "@/lib/pricing/salesTax";
import { applyMemberDiscount } from "@/lib/servicePlanBook";
import { recordInventoryLink } from "@/lib/inventoryPick";
import { logServerError } from "@/lib/server-events";
import { logActivity, TRAIL_KINDS } from "@/lib/activityLog";
import { sanitizeDeckRateBook, type DeckRateBook } from "@/lib/deck/rates";
import { deckBookKey as bookKey } from "@/lib/deck/rateBookStore";
import { DECK_PLAN_EVENT, DECK_PLAN_VERSION, deckConvertSchema, firstIssue, type DeckConvertInput } from "@/lib/deck/convertSchema";

type Gate = { ok: true; organizationId: string; userId: string; role: string } | { ok: false; error: string };

async function gate(): Promise<Gate> {
  try {
    const ctx = await requireEstimatorOrManager();
    if (!(await canUseDeckEstimator(ctx.user))) return { ok: false, error: "The deck estimator is coming soon — it is open to admins for testing only." };
    return { ok: true, organizationId: ctx.organizationId, userId: ctx.user.id, role: ctx.role };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { ok: false, error: "Only an estimator, a manager or the owner can do this." };
    if (err instanceof NoOrgError) return { ok: false, error: "Sign in to an organization first." };
    throw err;
  }
}

/** Save the shop's deck prices. Only what differs from the examples is kept; a blank row goes back to the example. */
export async function saveDeckRateBook(raw: unknown): Promise<{ ok: true; book: DeckRateBook } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;
  const book = sanitizeDeckRateBook(raw);
  try {
    if (Object.keys(book).length === 0) await db.syncState.deleteMany({ where: { key: bookKey(g.organizationId) } });
    else await db.syncState.upsert({ where: { key: bookKey(g.organizationId) }, create: { key: bookKey(g.organizationId), cursor: JSON.stringify(book) }, update: { cursor: JSON.stringify(book) } });
    return { ok: true, book };
  } catch (err) {
    logServerError("deck-rates", err, { kind: "action", organizationId: g.organizationId });
    return { ok: false, error: "Your prices could not be saved. Try again in a moment." };
  }
}

/** The result of a convert: a failure is RETURNED, never thrown (a thrown message is redacted in production). */
export type DeckConvertResult =
  | { ok: true; id: string }
  | { ok: false; code: "PLAN_LIMIT_REACHED"; error: string; resource?: LimitKey }
  | { ok: false; code: "FORBIDDEN" | "INVALID" | "FAILED"; error: string };

export async function convertDeckEstimateToProposal(raw: unknown): Promise<DeckConvertResult> {
  const g = await gate();
  if (!g.ok) return { ok: false, code: "FORBIDDEN", error: g.error };
  const quota = await checkPlanLimit(g.organizationId, "proposalsCreated");
  if (!quota.allowed) return { ok: false, code: "PLAN_LIMIT_REACHED", error: PLAN_LIMIT_MESSAGE, resource: quota.cappedBy ?? "proposalsCreated" };
  const parsed = deckConvertSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID", error: firstIssue(parsed.error) };
  try {
    return { ok: true, id: await writeProposal(g.organizationId, g.userId, g.role, parsed.data) };
  } catch (err) {
    logServerError("deck-convert", err, { kind: "action", organizationId: g.organizationId });
    return { ok: false, code: "FAILED", error: "The proposal could not be saved. Try again in a moment; if it keeps failing, tell support the time it happened." };
  }
}

const unitToType = (unit: string | undefined) => (unit === "sqft" ? "SQFT" : unit === "ln ft" ? "LINEAR_FT" : unit === "lot" ? "LUMP_SUM" : "UNIT");
const round2 = (n: number) => Math.round(n * 100) / 100;

async function writeProposal(organizationId: string, userId: string, role: string, data: DeckConvertInput): Promise<string> {
  // A client id from the browser must belong to this org.
  const named = data.clientId ? ((await db.client.findFirst({ where: { id: data.clientId, organizationId }, select: { id: true } }))?.id ?? null) : null;
  // Started from a project, a client or a lead, the picker recorded where this estimate files (lib/filingContext).
  const filing = await readFilingContext(organizationId);
  const clientId = named ?? (await filedClientId(organizationId, role, filing));
  const projectId = filing?.projectId ?? null;
  const text = leadProposalText(filing?.lead ?? null, data.scope ?? "");

  // The studio's prices are SELLING prices (owner, 2026-10-01): the proposal
  // is the ticket to the cent, with no markup on top.
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { defaultTaxRate: true } });
  const lines = data.lines.map((l, i) => {
    const unitPrice = round2(l.materialCost + l.laborCost);
    return { name: l.name, description: l.description, measurementType: unitToType(l.unit), quantity: l.quantity, unitPrice, materialCost: l.materialCost, laborCost: round2(unitPrice - l.materialCost), total: l.quantity * unitPrice, position: i };
  });
  const subtotal = lines.reduce((a, l) => a + l.total, 0);
  const address = data.address?.trim() || null;
  const taxRate = stateTaxRate(stateFromAddress(address)) ?? org?.defaultTaxRate ?? 0;
  const taxTotal = subtotal * taxRate;

  const proposal = await db.proposal.create({
    data: {
      trade: "deck",
      publicId: randomUUID(),
      organizationId,
      ownerId: userId,
      clientId,
      projectId,
      title: data.title,
      scopeOfWork: text.scopeOfWork,
      description: text.overview,
      address,
      status: ProposalStatus.DRAFT,
      subtotal,
      taxRate,
      taxTotal,
      total: subtotal + taxTotal,
      materialMarkupPct: 0,
      laborMarkupPct: 0,
      validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
      lineItems: { create: lines },
      installments: {
        create: [
          { label: "Deposit", amount: 30, isPercent: true, position: 0 },
          { label: "Completion", amount: 70, isPercent: true, position: 1 },
        ],
      },
    },
  });
  await applyMemberDiscount(proposal.id).catch(() => {});
  await recordInventoryLink(organizationId, proposal.id, data.inventoryLinked, userId);
  // The deck rides with the proposal: the design (to open it again) and the frozen 3D (for the client's page).
  if (data.plan) {
    try {
      const plan = { v: DECK_PLAN_VERSION, design: data.plan.design, scene: data.plan.scene, address };
      await db.activityEvent.create({ data: { organizationId, actorId: userId, proposalId: proposal.id, kind: DECK_PLAN_EVENT, summary: `Deck designed for the proposal — ${data.plan.scene.facts}`, meta: JSON.stringify(plan) } });
    } catch {
      /* the picture never blocks the proposal */
    }
  }
  await logActivity({ organizationId, actorId: userId, kind: TRAIL_KINDS.ESTIMATE, proposalId: proposal.id, summary: `Priced a deck — ${data.plan?.scene.facts ?? data.title}, $${Math.round(subtotal).toLocaleString("en-US")}`, meta: { trade: "deck", amount: Math.round(subtotal) } });
  if (filing) await clearFilingContext();
  if (projectId) revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/proposals");
  return proposal.id;
}
