// Proposals blueprint — demo fixture data, verbatim from the donor file
// jobflex-proposals-blueprint.html (script section). Values must not be
// edited independently of the donor: the page is a pixel-identical port,
// content included. The array is mutated at runtime (duplicate / delete /
// mark completed / un-accept) — init clones this seed per mount.

export type Installment = {
  label: string;
  due: string | null;
  amount: number;
  pct: boolean;
};

export type Proposal = {
  id: number;
  title: string;
  client: string;
  city: string;
  status: string;
  total: number;
  updated: string;
  views: number;
  owner: string;
  mat: number;
  addr: boolean;
  accepted?: string;
  paid?: string;
  inst?: Installment[];
};

export const PROPOSALS_SEED: Proposal[] = [
  { id: 2851, title: "Asphalt reroof — 4812 Maple Ave", client: "M. Henderson", city: "Bothell", status: "SENT", total: 24600, updated: "25m", views: 0, owner: "Ivan", mat: 12, addr: true },
  { id: 2849, title: "Skylight install", client: "K. Marsh", city: "Woodinville", status: "VIEWED", total: 5400, updated: "2h", views: 3, owner: "Ivan", mat: 4, addr: true },
  { id: 2846, title: "Cedar fence, 140 ft", client: "D. Reyes", city: "Kirkland", status: "ACCEPTED", total: 12400, updated: "1d", views: 5, owner: "Ivan", mat: 6, addr: true, accepted: "JUL 18",
    inst: [ { label: "Deposit", due: "JUL 20", amount: 30, pct: true }, { label: "Material drop", due: "JUL 24", amount: 40, pct: true }, { label: "Final on completion", due: null, amount: 30, pct: true } ] },
  { id: 2845, title: "Gutter replacement", client: "R. Okafor", city: "Redmond", status: "DRAFT", total: 3800, updated: "6h", views: 0, owner: "Marcus", mat: 3, addr: false },
  { id: 2843, title: "Composite deck rebuild", client: "A. Kim", city: "Bellevue", status: "ACCEPTED", total: 21500, updated: "2d", views: 7, owner: "Ivan", mat: 9, addr: true, accepted: "JUL 15",
    inst: [ { label: "Deposit", due: "JUL 17", amount: 4300, pct: false }, { label: "Materials order", due: "JUL 22", amount: 3800, pct: false }, { label: "Progress — framing", due: "JUL 29", amount: 4300, pct: false }, { label: "Progress — decking", due: "AUG 05", amount: 4300, pct: false }, { label: "Railings + stairs", due: "AUG 12", amount: 2400, pct: false }, { label: "Final walkthrough", due: "AUG 20", amount: 2400, pct: false } ] },
  { id: 2842, title: "Vinyl fence, 220 ft", client: "P. Delgado", city: "Kenmore", status: "EXPIRED", total: 11300, updated: "1w", views: 2, owner: "Marcus", mat: 5, addr: true },
  { id: 2840, title: "Metal roof repair", client: "J. Whitfield", city: "Everett", status: "SENT", total: 9600, updated: "3d", views: 1, owner: "Ivan", mat: 7, addr: true },
  { id: 2838, title: "Deck power wash + seal", client: "R. Tran", city: "Bothell", status: "DECLINED", total: 1900, updated: "4d", views: 4, owner: "Sofia", mat: 2, addr: false },
  { id: 2836, title: "Chain-link fence, 90 ft", client: "N. Ivanov", city: "Lynnwood", status: "DRAFT", total: 6200, updated: "5d", views: 0, owner: "Ivan", mat: 4, addr: true },
  { id: 2834, title: "Pergola build", client: "L. Wong", city: "Sammamish", status: "VIEWED", total: 14800, updated: "6d", views: 9, owner: "Sofia", mat: 8, addr: true },
  { id: 2833, title: "Siding replacement", client: "S. Patel", city: "Mill Creek", status: "SENT", total: 18700, updated: "1w", views: 2, owner: "Marcus", mat: 11, addr: true },
  { id: 2830, title: "Roof inspection + tune-up", client: "T. Ortiz", city: "Bothell", status: "DRAFT", total: 850, updated: "1w", views: 0, owner: "Ivan", mat: 1, addr: true },
  { id: 2828, title: "Skylight + solar tube combo", client: "T. Bishop", city: "Woodinville", status: "ACCEPTED", total: 7900, updated: "2w", views: 6, owner: "Ivan", mat: 4, addr: true, accepted: "JUL 08",
    inst: [ { label: "Deposit", due: "JUL 10", amount: 50, pct: true }, { label: "Final on completion", due: null, amount: 50, pct: true } ] },
  { id: 2825, title: "Asphalt reroof — 61 Cypress Ln", client: "C. Ferreira", city: "Bothell", status: "PAID", total: 16400, updated: "2w", views: 8, owner: "Ivan", mat: 12, addr: true, accepted: "JUN 30", paid: "JUL 14",
    inst: [ { label: "Deposit", due: "JUL 02", amount: 30, pct: true }, { label: "Completion", due: null, amount: 70, pct: true } ] },
  { id: 2821, title: "Cedar privacy fence, 90 ft", client: "K. Sorensen", city: "Kirkland", status: "PAID", total: 6200, updated: "3w", views: 5, owner: "Sofia", mat: 5, addr: true, accepted: "JUN 22", paid: "JUL 05",
    inst: [ { label: "Deposit", due: "JUN 24", amount: 50, pct: true }, { label: "Completion", due: null, amount: 50, pct: true } ] },
  { id: 2816, title: "Gutter guards install", client: "D. Pham", city: "Redmond", status: "PAID", total: 2400, updated: "1mo", views: 3, owner: "Marcus", mat: 3, addr: true, accepted: "JUN 12", paid: "JUN 25",
    inst: [ { label: "Full on completion", due: null, amount: 100, pct: true } ] },
];

export const PSTATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "" },
  SENT: { label: "Sent", cls: "pstatus--sent" },
  VIEWED: { label: "Viewed", cls: "pstatus--viewed" },
  ACCEPTED: { label: "Accepted", cls: "pstatus--accepted" },
  DECLINED: { label: "Declined", cls: "pstatus--declined" },
  EXPIRED: { label: "Expired", cls: "pstatus--expired" },
  PAID: { label: "Completed", cls: "pstatus--paid" },
};

export const PAGE_ALL = 8;
export const PAGE_ACC = 3;
export const PAGE_DONE = 2;
