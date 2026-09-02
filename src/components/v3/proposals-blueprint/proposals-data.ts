// Proposals blueprint — the row shape the page renders.
//
// There is NO fixture in this module any more. Every row the page draws is read
// from the database in src/app/dashboard/proposals/page.tsx and handed to
// `ProposalsContent`, which passes it to the behavior module (same
// write-once-useRef pattern as Workers). The donor's embedded demo array — 16
// invented proposals that used to render whenever `options.rows` was omitted —
// was deleted on 2026-08-13: a fallback that prints invented records is worse
// than an empty book, and the only caller always supplies real rows.
//
// Every field the row menu needs to reach a REAL implementation lives on the
// row: `id` is the proposal's cuid (the editor route and every server action
// key off it), `publicId` builds the portal link, `zillow` is the prebuilt
// search URL (null = the client has no address, which is what disables that
// menu item), `materials` is the line-item set the materials sheet shops, and
// `before` / `after` are the persisted completion photos.

import type { MaterialLine } from "@/components/proposal/MaterialsSheet";
import type { ProposalPhoto } from "@/components/v3/proposals-c/types";

export type Installment = {
  /** PaymentInstallment.id — what notifyPaymentReminder() keys its email off. */
  id: string;
  label: string;
  /** Short plate — "JUL 20" — or null for "no due date". */
  due: string | null;
  amount: number;
  pct: boolean;
};

export type ProposalRow = {
  /** Proposal.id — the cuid every server action and the editor route take. */
  id: string;
  /** Proposal.publicId — /portal/q/<publicId> is the client-facing page. */
  publicId: string;
  title: string;
  client: string;
  clientEmail: string | null;
  city: string;
  status: string;
  total: number;
  /** Ready-to-print relative label, e.g. "25m ago". */
  updated: string;
  views: number;
  owner: string;
  /** Count of shoppable material lines — the menu's "N items" hint. */
  mat: number;
  /** Prebuilt Zillow search URL, or null when the client has no address. */
  zillow: string | null;
  /** Prebuilt directions URL, or null when the client has no address. The
   *  handheld sheet's "Get directions" row; the desktop menu has no equivalent. */
  maps: string | null;
  accepted?: string;
  paid?: string;
  inst?: Installment[];
  materials: MaterialLine[];
  /** Proposal.beforePhotos / afterPhotos, already parsed. */
  before: ProposalPhoto[];
  after: ProposalPhoto[];
};

/** Deep-enough clone so a mount's runtime edits never leak into the next one. */
export function cloneRows(rows: ProposalRow[]): ProposalRow[] {
  return rows.map((p) => ({
    ...p,
    inst: p.inst ? p.inst.map((i) => ({ ...i })) : undefined,
    materials: p.materials.map((m) => ({ ...m })),
    before: p.before.map((x) => ({ ...x })),
    after: p.after.map((x) => ({ ...x })),
  }));
}

export const PSTATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "" },
  SENT: { label: "Sent", cls: "pstatus--sent" },
  VIEWED: { label: "Viewed", cls: "pstatus--viewed" },
  ACCEPTED: { label: "Accepted", cls: "pstatus--accepted" },
  DECLINED: { label: "Declined", cls: "pstatus--declined" },
  EXPIRED: { label: "Expired", cls: "pstatus--expired" },
  // COMPLETED = the linked job finished (stamped by updateJob); PAID = money
  // collected. Both wear the green plate; the words carry the difference.
  COMPLETED: { label: "Completed", cls: "pstatus--paid" },
  PAID: { label: "Paid", cls: "pstatus--paid" },
  // Not a donor status, but a real one in the schema — a row carrying it must
  // still render a plate instead of crashing the row builder.
  ARCHIVED: { label: "Archived", cls: "" },
};

/** The plate a status renders as, with a safe fallback for unknown values. */
export function statusPlate(status: string): { label: string; cls: string } {
  return PSTATUS[status] ?? { label: status, cls: "" };
}

export const PAGE_ALL = 8;
export const PAGE_ACC = 3;
export const PAGE_DONE = 2;
