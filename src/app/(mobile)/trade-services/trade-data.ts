// Trade & Services — mobile batch 1 (Browse + triage)
// ---------------------------------------------------------------------------
// MOCK DATA LAYER. The real feature is backed by TradePost / TradePostRecipient
// / TradeConversation / TradeMessage in the original Job-FLEX app. None of that
// exists in joblfex-v3 yet (CLAUDE.md: data layer is approval-gated), so this
// batch drives the UI from in-memory seed data + local React state. The shapes
// below intentionally mirror the reference models so wiring to real server
// actions later is a swap, not a rewrite.
//
// Hydration note: seed rows carry *relative integers* (hoursAgo / hiddenDaysAgo)
// instead of timestamps, so the server and client render identical strings.

export type JobStatus = "OPEN" | "FILLED" | "CANCELLED";

/** The viewer's relationship to a job (mirrors TradeRecipientStatus). */
export type ViewerStatus = "NEW" | "INTERESTED" | "NOT_INTERESTED";

export type Urgency = "low" | "medium" | "high" | "urgent";

export type TabKey = "new" | "trades" | "posts" | "hidden";

export interface TradeJob {
  id: string;
  title: string;
  description: string;
  tradeType: string;
  specialties: string[];
  location?: string;
  budget?: string;
  timeWindow?: string;
  urgency?: Urgency;
  status: JobStatus;
  postedByName: string;
  postedByCompany?: string;
  /** Hours since the job was posted — relative so SSR/CSR agree. */
  hoursAgo: number;
  viewerStatus: ViewerStatus;
  /** Days since the viewer hid it (only meaningful when NOT_INTERESTED). */
  hiddenDaysAgo?: number;
}

// ─── Tabs ────────────────────────────────────────────────────────────────
export const TABS: { key: TabKey; label: string; eyebrow: string }[] = [
  { key: "new", label: "New Jobs", eyebrow: "Sent to you" },
  { key: "trades", label: "My Trades", eyebrow: "Engaged" },
  { key: "posts", label: "My Posts", eyebrow: "Broadcast" },
  { key: "hidden", label: "Hidden", eyebrow: "Passed" },
];

// ─── Urgency — semantic, never decorative (Status-Is-Not-Decoration) ───────
// Color is reserved for genuine time pressure (Status-Is-Not-Decoration). Quiet
// timelines stay neutral; only high/urgent earn a semantic fill + attention dot.
export const URGENCY: Record<
  Urgency,
  { label: string; tone: "neutral" | "warn" | "danger"; dot: boolean }
> = {
  low: { label: "Flexible", tone: "neutral", dot: false },
  medium: { label: "This month", tone: "neutral", dot: false },
  high: { label: "This week", tone: "warn", dot: true },
  urgent: { label: "Urgent", tone: "danger", dot: true },
};

export const STATUS: Record<
  JobStatus,
  { label: string; tone: "accent" | "success" | "danger" }
> = {
  OPEN: { label: "Open", tone: "accent" },
  FILLED: { label: "Filled", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
};

/** Trade taxonomy — canonical list lives in src/lib/tradeTypes.ts (shared with Lead Center matching). */
export { TRADE_TYPES } from "@/lib/tradeTypes";

// ─── Helpers (pure, no Date — keeps SSR/CSR output identical) ──────────────
export const HIDDEN_TTL_DAYS = 7;

export function agoLabel(hoursAgo: number): string {
  if (hoursAgo < 1) return "just now";
  if (hoursAgo < 24) return `${Math.round(hoursAgo)}h ago`;
  const days = Math.floor(hoursAgo / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export function hiddenRemaining(hiddenDaysAgo: number | undefined): {
  days: number;
  label: string;
  expiring: boolean;
} {
  const elapsed = hiddenDaysAgo ?? 0;
  const days = Math.max(0, HIDDEN_TTL_DAYS - elapsed);
  if (days <= 0) return { days: 0, label: "Clears today", expiring: true };
  if (days === 1) return { days, label: "1 day left", expiring: true };
  return { days, label: `${days} days left`, expiring: false };
}

// ─── Seed data ─────────────────────────────────────────────────────────────
export const SEED_JOBS: TradeJob[] = [
  {
    id: "tj_01",
    title: "Master bath: full tile re-do, walk-in shower",
    description:
      "Homeowner wants the existing fiberglass surround torn out and replaced with a tiled walk-in shower plus a new floor. Roughly 120 sq ft of wall tile and 40 sq ft of floor. Waterproofing and a linear drain already speced. I'm booked through next month and can't get to it, so I'm happy to hand off the relationship. They're easy to work with.",
    tradeType: "Tile",
    specialties: ["Shower pans", "Waterproofing", "Large-format"],
    location: "Bend, OR · 12 mi",
    budget: "$4,800–6,200",
    timeWindow: "Start within 2 weeks",
    urgency: "high",
    status: "OPEN",
    postedByName: "Marcus Lendt",
    postedByCompany: "Lendt Renovation",
    hoursAgo: 2,
    viewerStatus: "NEW",
  },
  {
    id: "tj_02",
    title: "Epoxy garage floor: 2-car, light grind",
    description:
      "Clean slab, no major cracks. Customer wants a flake epoxy finish, mid-grey. About 480 sq ft. This is out of my lane (I do framing), but they're a past client and I'd like to send them to someone solid.",
    tradeType: "Concrete",
    specialties: ["Epoxy coatings", "Floor prep"],
    location: "Redmond, OR · 18 mi",
    budget: "$2,400–3,000",
    timeWindow: "Flexible",
    urgency: "low",
    status: "OPEN",
    postedByName: "Dana Ruiz",
    postedByCompany: "Ruiz Framing Co.",
    hoursAgo: 6,
    viewerStatus: "NEW",
  },
  {
    id: "tj_03",
    title: "Panel upgrade to 200A + EV charger circuit",
    description:
      "Older 100A panel, homeowner adding an EV. Needs a service upgrade and a dedicated 240V run to the garage. Permit-required work. I'm a GC and need a licensed electrician to take the whole scope.",
    tradeType: "Electrical",
    specialties: ["Service upgrades", "EV chargers", "Permitting"],
    location: "Bend, OR · 4 mi",
    budget: "$3,500+",
    timeWindow: "Customer ready now",
    urgency: "urgent",
    status: "OPEN",
    postedByName: "Priya N.",
    postedByCompany: "Cascade Build Group",
    hoursAgo: 9,
    viewerStatus: "NEW",
  },
  {
    id: "tj_04",
    title: "Interior repaint: 3 bed, 2 bath, ceilings included",
    description:
      "Whole-interior repaint after a flooring job I just finished. Walls, ceilings, trim and doors. Roughly 1,600 sq ft. Colors picked. I trust whoever takes this to keep it clean; it's a referral I care about.",
    tradeType: "Painting",
    specialties: ["Interior", "Trim & doors", "Ceilings"],
    location: "Sisters, OR · 22 mi",
    budget: "$5,000–7,500",
    timeWindow: "Within the month",
    urgency: "medium",
    status: "OPEN",
    postedByName: "Tomás Vega",
    postedByCompany: "Vega Floors",
    hoursAgo: 27,
    viewerStatus: "NEW",
  },
  {
    id: "tj_05",
    title: "Kitchen backsplash: subway with herringbone accent",
    description:
      "Small but nice job. Standard 30 sq ft backsplash, white subway with a herringbone strip behind the range. Counters going in Friday so I'd want it the week after. Too small for my crew to slot in.",
    tradeType: "Tile",
    specialties: ["Backsplash", "Herringbone"],
    location: "Bend, OR · 7 mi",
    budget: "$900–1,400",
    timeWindow: "Week of the 16th",
    urgency: "medium",
    status: "OPEN",
    postedByName: "Ellen Park",
    postedByCompany: "Park & Co. Kitchens",
    hoursAgo: 31,
    viewerStatus: "NEW",
  },
  {
    id: "tj_06",
    title: "Deck rebuild: tear-down plus new 16×20 composite",
    description:
      "Existing deck is rotted, needs full tear-out and a new composite build with railings and stairs. Footings likely need redoing. I'm slammed on a commercial job and can't take it.",
    tradeType: "Carpentry",
    specialties: ["Decks", "Composite", "Railings"],
    location: "La Pine, OR · 30 mi",
    budget: "$9,000–12,000",
    timeWindow: "Next 3–4 weeks",
    urgency: "low",
    status: "OPEN",
    postedByName: "Grant Mueller",
    postedByCompany: "Mueller Construction",
    hoursAgo: 44,
    viewerStatus: "NEW",
  },
  // Pre-engaged so the My Trades tab + chat are populated for review.
  {
    id: "tj_08",
    title: "Heated floor: bathroom tile over electric mat",
    description:
      "Small primary bath, about 55 sq ft. Electric heat mat is already on site, just needs a tile setter comfortable laying over it and tying in the thermostat run. I can hand it straight to you.",
    tradeType: "Tile",
    specialties: ["Heated floors", "Thermostat tie-in"],
    location: "Bend, OR · 5 mi",
    budget: "$1,600–2,100",
    timeWindow: "Next week",
    urgency: "high",
    status: "OPEN",
    postedByName: "Carla Boyd",
    postedByCompany: "Boyd Bath & Kitchen",
    hoursAgo: 20,
    viewerStatus: "INTERESTED",
  },
  {
    id: "tj_09",
    title: "Mini-split install: single head, 12k BTU",
    description:
      "Detached office, one zone. Customer bought the unit already. Needs a clean line-set run and a proper condensate plan. I do GC work and want a real HVAC tech on it.",
    tradeType: "HVAC",
    specialties: ["Mini-splits", "Line sets"],
    location: "Tumalo, OR · 11 mi",
    budget: "$1,200–1,800",
    timeWindow: "Within 2 weeks",
    urgency: "medium",
    status: "OPEN",
    postedByName: "Reed Salas",
    postedByCompany: "Salas Builders",
    hoursAgo: 52,
    viewerStatus: "INTERESTED",
  },
  // Pre-seeded as hidden so the Hidden tab demonstrates the 7-day countdown.
  {
    id: "tj_07",
    title: "Gutter cleaning + minor downspout repair",
    description:
      "Single-story, easy access. Clean the gutters and reattach one downspout that pulled loose. Small job, passing it along.",
    tradeType: "General Contractor",
    specialties: ["Gutters", "Handyman"],
    location: "Redmond, OR · 16 mi",
    budget: "$200–350",
    timeWindow: "Flexible",
    urgency: "low",
    status: "OPEN",
    postedByName: "Sam O.",
    postedByCompany: "Owens Home Services",
    hoursAgo: 80,
    viewerStatus: "NOT_INTERESTED",
    hiddenDaysAgo: 2,
  },
];

// ─── My Posts (poster's own broadcasts) ────────────────────────────────────
export interface OwnPost {
  id: string;
  title: string;
  tradeType: string;
  specialties: string[];
  location?: string;
  budget?: string;
  timeWindow?: string;
  urgency?: Urgency;
  status: JobStatus;
  hoursAgo: number;
  broadcastCount: number; // pros notified
  interestedCount: number; // raised a hand
}

export const SEED_OWN_POSTS: OwnPost[] = [
  {
    id: "op_01",
    title: "Excavator operator for a half-day dig",
    tradeType: "Concrete",
    specialties: ["Excavation", "Grading"],
    location: "Bend, OR · on-site",
    budget: "$600–900",
    timeWindow: "This Thursday",
    urgency: "high",
    status: "OPEN",
    hoursAgo: 5,
    broadcastCount: 84,
    interestedCount: 3,
  },
  {
    id: "op_02",
    title: "Finish carpenter for built-in shelving",
    tradeType: "Carpentry",
    specialties: ["Built-ins", "Trim"],
    location: "Redmond, OR · 18 mi",
    budget: "$2,000–2,800",
    timeWindow: "Flexible",
    urgency: "low",
    status: "FILLED",
    hoursAgo: 96,
    broadcastCount: 112,
    interestedCount: 6,
  },
];

// ─── Chat ──────────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  body: string;
  mine: boolean;
  atLabel: string;
}

/** Seeded threads for the pre-engaged jobs. Keyed by job id. */
export const SEED_CONVERSATIONS: Record<string, ChatMessage[]> = {
  tj_08: [
    {
      id: "m1",
      body: "Thanks for raising your hand. The mat's a Schluter Ditra-Heat, already loose-laid. Can you start next Tuesday?",
      mine: false,
      atLabel: "1h ago",
    },
    {
      id: "m2",
      body: "Tuesday works. I'll bring my own thermostat unless they have a preference. Is the tile on site?",
      mine: true,
      atLabel: "48m ago",
    },
    {
      id: "m3",
      body: "Tile's here, 12x24 porcelain. I'll text you the gate code.",
      mine: false,
      atLabel: "32m ago",
    },
  ],
  tj_09: [
    {
      id: "m1",
      body: "Appreciate it. Unit's a Mitsubishi 12k, still boxed. Office is about 40 ft from the panel.",
      mine: false,
      atLabel: "3h ago",
    },
  ],
};

/** First message from the poster when a freshly-engaged job has no thread yet. */
export function openerFor(job: TradeJob): ChatMessage[] {
  return [
    {
      id: "opener",
      body: `Thanks for raising your hand on "${job.title}". Want to talk timing and price?`,
      mine: false,
      atLabel: agoLabel(job.hoursAgo),
    },
  ];
}

/** Deterministic mock for "notified N pros" (no Math.random, capped at 500). */
export function broadcastEstimate(tradeType: string, specialties: string[]): number {
  const base = 38 + ((tradeType.length * 7) % 110);
  return Math.min(500, base + specialties.length * 16);
}

/** Skill suggestions surfaced in the post form, per trade. */
export const SKILLS_BY_TRADE: Record<string, string[]> = {
  Tile: ["Backsplash", "Shower pans", "Waterproofing", "Large-format", "Heated floors"],
  Flooring: ["LVP", "Hardwood", "Refinishing", "Subfloor prep", "Epoxy coatings"],
  Concrete: ["Excavation", "Grading", "Epoxy coatings", "Stamped", "Flatwork"],
  Electrical: ["Service upgrades", "EV chargers", "Permitting", "Lighting", "Panel swaps"],
  Plumbing: ["Repipe", "Water heaters", "Fixtures", "Drain cleaning", "Gas lines"],
  Carpentry: ["Decks", "Built-ins", "Trim", "Framing", "Railings"],
  Painting: ["Interior", "Exterior", "Trim & doors", "Cabinets", "Ceilings"],
  Roofing: ["Tear-off", "Composition", "Flashing", "Repairs", "Gutters"],
  HVAC: ["Mini-splits", "Line sets", "Furnaces", "Ductwork", "Thermostats"],
  Landscaping: ["Hardscape", "Irrigation", "Sod", "Retaining walls", "Cleanup"],
  Drywall: ["Hang", "Tape & mud", "Texture", "Patch & repair", "Skim coat"],
};

export const GENERAL_SKILLS = ["Cleanup", "Permitting", "Demo", "Haul-away", "Punch list"];

export function skillSuggestions(tradeType: string): string[] {
  return SKILLS_BY_TRADE[tradeType] ?? GENERAL_SKILLS;
}

// ─── Server <-> client DTOs (kept here so both layers share one shape) ──────
export interface TradeInboxDTO {
  newJobs: TradeJob[];
  engaged: TradeJob[];
  hidden: TradeJob[];
}

export interface TradeNetworkProfileDTO {
  optIn: boolean;
  tradeTypes: string[];
  specialties: string[];
  serviceArea: string | null;
}
