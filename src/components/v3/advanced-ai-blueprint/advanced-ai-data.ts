// SMART PROPOSAL · ESTIMATE — BLUEPRINT · copy, lists and the donor fixture.
//
// ── WHO STILL READS THE FIXTURE ────────────────────────────────────
// `/dashboard/advanced-ai` is LIVE: it calls the real estimator actions and
// renders whatever comes back, so MAT / LAB / ASM / DISCOUNT / KEEP_CHANGES /
// DIFF_ROWS and the fixture half of ESTIMATE no longer reach the desktop page.
// They stay exported because `components/v3/mobile-smart-estimate` — a separate
// handheld surface, not this page's twin — imports them as its demo content.
// Deleting them here would break that page, so they are left exactly as the
// donor wrote them. Everything the live console reads is below them.
//
// The donor's `·` / `×` / `—` escapes are written as the literal characters
// they denote (·, ×, —), which is the same text.

export type MatRow = {
  id: string;
  n: string;
  q: number;
  u: number;
  /** Set by "Keep changes" — the donor's `New` / `Updated` row flag. */
  badge?: string;
  dims?: string;
  store?: string;
  img?: string;
};

export type LabRow = { id: string; n: string; q: number; u: number; badge?: string };

/** Donor: `const MAT = [ … ]`. */
export const MAT: MatRow[] = [
  {
    id: "m1",
    n: "Cedar pickets · 6 ft",
    q: 380,
    u: 3.4,
    dims: "5/8 in × 5-1/2 in × 6 ft",
    store: "Dunn Lumber",
    img: "https://images.unsplash.com/photo-1520880867055-1e30d1cb001c?w=160&q=60&auto=format&fit=crop",
  },
  {
    id: "m2",
    n: "Posts 4x4 · PT",
    q: 17,
    u: 24,
    dims: "4 in × 4 in × 8 ft",
    store: "Home Depot",
    img: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=160&q=60&auto=format&fit=crop",
  },
  {
    id: "m3",
    n: "Rails 2x4 · cedar",
    q: 34,
    u: 9,
    dims: "2 in × 4 in × 8 ft",
    store: "Dunn Lumber",
    img: "https://images.unsplash.com/photo-1516216628859-9bccecab13ca?w=160&q=60&auto=format&fit=crop",
  },
  {
    id: "m4",
    n: "Concrete bags · 60 lb",
    q: 34,
    u: 6.5,
    dims: "fast-setting · 60 lb",
    store: "Lowe's",
    img: "https://images.unsplash.com/photo-1518709594023-6eab9bab7b23?w=160&q=60&auto=format&fit=crop",
  },
  {
    id: "m5",
    n: "Gate hardware kit",
    q: 1,
    u: 145,
    dims: "self-closing · black",
    store: "Home Depot",
    img: "https://images.unsplash.com/photo-1609205807107-e8ec2120f9de?w=160&q=60&auto=format&fit=crop",
  },
];

/** Donor: `const LAB = [ … ]`. */
export const LAB: LabRow[] = [
  { id: "l1", n: "Post setting · dig & pour", q: 17, u: 38 },
  { id: "l2", n: "Rail & picket install", q: 128, u: 7 },
  { id: "l3", n: "Gate build & cleanup", q: 1, u: 310 },
];

/** Donor: `const DISCOUNT = 150`. */
export const DISCOUNT = 150;

/** Donor: `let ASM = [ … ]`. */
export const ASM: string[] = [
  "Existing fence hauled off — no buried concrete",
  "Soil is standard till; wet-soil concrete not included",
  "Property line staked by the owner before dig day",
];

/** Donor: the row `$id('spKeep')` appends, and the concrete row it rewrites. */
export const KEEP_CHANGES = {
  added: {
    id: "m6",
    n: "Post caps · cedar",
    q: 17,
    u: 6,
    badge: "New",
    dims: "4x4 pyramid",
    store: "Dunn Lumber",
    img: "https://images.unsplash.com/photo-1595429035839-c99c298ffdde?w=160&q=60&auto=format&fit=crop",
  } satisfies MatRow,
  /** Donor: `c.q = 40; c.badge = 'Updated'` on the row with id `m4`. */
  changedId: "m4",
  changedQty: 40,
  changedBadge: "Updated",
  /** Donor: `ASM.filter(a => a.indexOf('wet-soil') === -1)` then push. */
  dropAssumptionMatching: "wet-soil",
  addAssumption: "Wet-soil concrete included — 40 bags",
} as const;

/** Donor: the two rows of the "Review changes" diff panel. */
export const DIFF_ROWS = [
  { pill: "Added", mod: "sp-pill--add", b: "Post caps", i: "17 × $6 · +$102" },
  { pill: "Changed", mod: "sp-pill--chg", b: "Concrete bags", i: "34 → 40 · +$39" },
] as const;

/** Donor page head, `.content` block 1. */
export const ESTIMATE = {
  kicker: "Smart Proposal · Estimate",
  title: "Cedar privacy fence — 128 ft",
  brief: "from the brief · Nguyen residence, Bothell · 6 ft, one gate",
  scopeOfWork:
    "Tear out and haul off the existing fence line. Set 17 pressure-treated 4x4 posts in concrete at 8 ft on center, run doubled 2x4 cedar rails, and face with 6 ft cedar pickets. Build and hang one 42-inch gate with self-closing hardware. Site raked and magnet-swept before we leave.",
  refinePlaceholder:
    "Type it like a text — add, remove, or swap anything. The numbers update after you review.",
  discountLabel: "Discount · returning client",
} as const;

/* ============================================================
   INTAKE CONSOLE — step 1, the form that produces the estimate above.

   Carried over verbatim from the previous build of this page (the
   jobflex-smart-proposal-blueprint_4 donor): same project types, same state
   list, same sample briefs, same copy. The estimate donor covers only the
   result screen, so the console it is reached FROM keeps its own design.
   ============================================================ */

export type ProjectType = { id: string; label: string; icon: string };

export const PROJECT_TYPES: ProjectType[] = [
  { id: "roof", label: "Roofing", icon: "i-roof" },
  { id: "fence", label: "Fencing", icon: "i-fence" },
  { id: "deck", label: "Decking", icon: "i-jobs" },
  { id: "siding", label: "Siding", icon: "i-building" },
  { id: "gutters", label: "Gutters", icon: "i-box" },
  { id: "other", label: "Other work", icon: "i-pen" },
];

export const SAMPLES: string[] = [
  "Replace 2400 sqft architectural shingle roof — tear-off, ridge vents, ice & water shield. Bothell, WA.",
  "Install 180 linear ft cedar privacy fence, 7ft tall, one gate, sloped yard.",
  "Rebuild 320 sqft composite deck on existing frame — railings and stairs.",
  "Replace gutters and downspouts on a two-story colonial, add leaf guards.",
];

export const INTAKE = {
  kicker: "Sales · Estimating",
  title: "Smart Proposal",
  consoleTitle: "Estimate console",
  lede: "Describe the job. Real materials with retail pricing, labor and scope come back as separate, editable breakdowns.",
  steps: {
    type: { h: "Project type", hint: "Shapes the pricing model." },
    location: {
      h: "Location",
      hint: "Regional pricing. City typos are corrected before we price.",
    },
    brief: { h: "The brief", hint: "The more specific, the tighter the estimate." },
  },
  briefPlaceholder:
    "Materials, finishes, conditions, access, square footage if you have it…",
  addressPlaceholder: "Search address or city…",
  cta: "Generate estimate",
  /** Shown in the bar's live region while the estimate is being built. */
  running: "Pricing materials, labor and scope…",
} as const;

export const STATES: [string, string][] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"],
  ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"],
  ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];

/** Donor: `const money = n => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })`. */
export const money = (n: number): string =>
  "$" + (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });

/** Donor: `const moneyU = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })`. */
export const moneyU = (n: number): string =>
  "$" +
  n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

/** Donor: `function sum(a) { return a.reduce((t, r) => t + r.q * r.u, 0) }`. */
export const sum = (a: Array<{ q: number; u: number }>): number =>
  a.reduce((t, r) => t + r.q * r.u, 0);

/* ============================================================
   LIVE CONSOLE — everything below is read by the wired page.
   ============================================================ */

/** Signed money, for the discount line (which is the only negative one). */
export const moneySigned = (n: number): string => (n > 0 ? "−" : "") + money(Math.abs(n));

/**
 * The generation overlay's checklist.
 *
 * `analyze` is its own stage because it is the one boundary the client can
 * actually observe — `analyzeEstimatePrompt` resolves before
 * `generateAdvancedEstimate` is called. The three inside `generate` are a
 * single server round trip with no progress events, so they advance on a dwell
 * and then HOLD on "Building the estimate" until the promise settles. Nothing
 * here claims progress that has not happened; the last stage simply waits.
 */
export const GEN_STAGES: { id: string; label: string; dwellMs: number }[] = [
  { id: "brief", label: "Reading the brief", dwellMs: 0 },
  { id: "plan", label: "Planning materials", dwellMs: 7000 },
  { id: "price", label: "Live pricing", dwellMs: 14000 },
  { id: "build", label: "Building the estimate", dwellMs: 0 },
];

export const GEN_DONE = "Smart Proposal generated";

/** Copy the wired estimate panel owns (the fixture's ESTIMATE is mobile-only). */
export const LIVE = {
  kicker: "Smart Proposal · Estimate",
  refinePlaceholder:
    "Type it like a text — add, remove, or swap anything. The numbers update after you review.",
  /** Step 1's free-text branch, revealed by "Other work". */
  otherLabel: "What kind of work?",
  otherPlaceholder: "Skylights, pergola, storm repair…",
  otherError: "Say what the work is",
  photos: {
    h: "Site photos",
    hint: "Optional. Read by the estimator to price what is actually there.",
    cta: "Drop photos here, or click to choose",
    /** The one thing a contractor must be able to read before dropping a photo. */
    privacy: "Photos are read once to price this job. Nothing is uploaded or stored.",
  },
} as const;

/** Client-side photo guards. The server caps again (MAX_PHOTOS / MAX_PHOTO_CHARS). */
export const PHOTO_MAX_COUNT = 6;
export const PHOTO_MAX_TOTAL_BYTES = 18 * 1024 * 1024;

/** A price field accepts nothing wider than the money cells can paint. */
export const MAX_MONEY = 9_999_999;
export const MAX_QTY = 999_999;
