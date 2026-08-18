// MANUAL PROPOSAL / BLUEPRINT — the server read.
//
// This is the file that turns the builder from a fixture into a record. It runs
// on the server for the page at /dashboard/manual-blueprint and hands the
// client column four things: the org's clients, its projects, its saved
// markup/tax defaults, and — when the URL carries one — an existing proposal to
// reopen.
//
// THERE IS NO FIXTURE FALLBACK. An unresolvable `?proposal=` id returns
// `proposal: null` with `proposalMissing: true` and the page opens a NEW,
// EMPTY draft; it never invents a client, a line item or a scope paragraph.
// Same rule for `?client=`: an id belonging to another org resolves to nothing
// and the client field simply opens unset.
//
// The queries mirror /dashboard/proposals/new and /dashboard/proposals/[id]
// verbatim in intent — same org scoping, same selects — so the two builders
// describe the same org.
//
// DATES ARE FORMATTED HERE and travel as strings. A `new Date()` read during
// render is a guaranteed hydration mismatch, which is exactly why the fixture
// this replaces carried a hard-coded date string.

import { db } from "@/lib/db";
import { isEstimatorRole, isSalesRole } from "@/lib/orgContext";
import {
  draftFromProposal,
  proposalRef,
  UNSAVED_REF,
  type ManualClient,
  type ManualDefaults,
  type ManualProject,
  type ManualProposal,
  type SheetIdentity,
} from "./manual-blueprint-bridge";

export type ManualBuilderData = {
  /** Sender, reference, date and expiry for the sheet and the PDF. For a NEW
   *  proposal the reference is "DRAFT" and the dates are today / today + 14,
   *  which is the window `saveProposal` stamps on a fresh row. */
  identity: SheetIdentity;
  clients: ManualClient[];
  projects: ManualProject[];
  defaults: ManualDefaults;
  /** The proposal `?proposal=<id>` resolved to, or null for a new one. */
  proposal: ManualProposal | null;
  /** True when an id WAS supplied and did not resolve in this org. The page
   *  says so rather than opening a blank sheet that looks like a data loss. */
  proposalMissing: boolean;
  /** The client `?client=<id>` resolved to, or null. Ignored when a proposal
   *  was loaded — that record already names its own client. */
  initialClientId: string | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-08-15" — the masthead's drawing-annotation date style. */
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Aug 15, 2026", for the saved-record chip. */
export function dateLong(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${pad(d.getDate())}, ${d.getFullYear()}`;
}

/** The window `saveProposal` stamps on a new row, mirrored here so an UNSAVED
 *  sheet quotes the same expiry the record will carry the moment it is saved. */
const VALID_DAYS = 14;

function plusDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

const CLIENT_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  address: true,
  city: true,
  state: true,
  zip: true,
} as const;

export async function loadManualBuilder({
  organizationId,
  role,
  userId,
  clientId,
  proposalId,
}: {
  organizationId: string;
  /** Active-org membership role — SALES and ESTIMATOR may only reopen their
   *  own proposals, the same scoping `requireProposalStaff` applies to writes. */
  role: string;
  userId: string;
  clientId?: string;
  proposalId?: string;
}): Promise<ManualBuilderData> {
  const ownProposalsOnly = isSalesRole(role) || isEstimatorRole(role);

  const [clientRows, projectRows, org, proposalRow] = await Promise.all([
    db.client.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: CLIENT_SELECT,
    }),
    db.project.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true },
    }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        address: true,
        phone: true,
        defaultTaxRate: true,
        materialMarkupPct: true,
        laborMarkupPct: true,
      },
    }),
    proposalId
      ? db.proposal.findFirst({
          where: {
            id: proposalId,
            organizationId,
            ...(ownProposalsOnly ? { ownerId: userId } : {}),
          },
          include: {
            lineItems: { orderBy: { position: "asc" } },
            installments: { orderBy: { position: "asc" } },
            discounts: true,
          },
        })
      : Promise.resolve(null),
  ]);

  const clients: ManualClient[] = clientRows.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email ?? "",
    phone: c.phone ?? "",
    // The street line only — the pickers and `addressOf` join the tail
    // themselves, exactly as they did against the fixture.
    address: (c.address ?? "").split("\n")[0] ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
    zip: c.zip ?? "",
    tags: [],
  }));

  const projects: ManualProject[] = projectRows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description ?? "",
  }));

  const defaults: ManualDefaults = {
    // The column is a fraction; the builder's field is a percentage.
    taxPct: Math.round((org?.defaultTaxRate ?? 0) * 10000) / 100,
    materialMarkupPct: org?.materialMarkupPct ?? 0,
    laborMarkupPct: org?.laborMarkupPct ?? 0,
  };

  const proposal: ManualProposal | null = proposalRow
    ? {
        id: proposalRow.id,
        publicId: proposalRow.publicId,
        ref: proposalRef(proposalRow.publicId),
        status: proposalRow.status,
        clientId: proposalRow.clientId,
        draft: draftFromProposal(
          {
            title: proposalRow.title,
            description: proposalRow.description,
            scopeOfWork: proposalRow.scopeOfWork,
            notes: proposalRow.notes,
            address: proposalRow.address,
            taxRate: proposalRow.taxRate,
            materialMarkupPct: proposalRow.materialMarkupPct,
            laborMarkupPct: proposalRow.laborMarkupPct,
            overheadPct: proposalRow.overheadPct,
            profitPct: proposalRow.profitPct,
            discountTotal: proposalRow.discountTotal,
            subtotal: proposalRow.subtotal,
            discounts: proposalRow.discounts.map((d) => ({
              amount: d.amount,
              isPercent: d.isPercent,
            })),
            lineItems: proposalRow.lineItems.map((l) => ({
              name: l.name,
              description: l.description,
              measurementType: l.measurementType,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              materialCost: l.materialCost,
              laborCost: l.laborCost,
            })),
            installments: proposalRow.installments.map((i) => ({
              label: i.label,
              amount: i.amount,
              isPercent: i.isPercent,
            })),
          },
          defaults,
        ),
      }
    : null;

  // An id that resolved to nothing is worth saying out loud; no id at all is
  // just a new proposal.
  const proposalMissing = Boolean(proposalId) && proposal === null;

  const initialClientId =
    proposal?.clientId ??
    (clientId && clients.some((c) => c.id === clientId) ? clientId : null);

  const now = new Date();
  const identity: SheetIdentity = {
    orgName: org?.name ?? "",
    // Address is stored as a one-liner; the newline convention the client
    // record uses for a second line collapses to " · " here so a letterhead
    // stays one band tall.
    orgLine: [(org?.address ?? "").split("\n").filter(Boolean).join(" · "), org?.phone ?? ""]
      .filter((part) => part.trim().length > 0)
      .join(" · "),
    ref: proposal?.ref ?? UNSAVED_REF,
    date: isoDate(proposalRow?.createdAt ?? now),
    validUntil: isoDate(proposalRow?.validUntil ?? plusDays(now, VALID_DAYS)),
  };

  return {
    identity,
    clients,
    projects,
    defaults,
    proposal,
    proposalMissing,
    initialClientId,
  };
}
