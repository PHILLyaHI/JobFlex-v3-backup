// Mobile phone (mobile-phone-v2) — demo fixture.
//
// Carried over VERBATIM from the desktop phone donor fixture
// (src/components/v3/phone-blueprint/phone-data.ts) so the handheld
// composition is judged against the same call log as the desktop sheet: same
// values, same field names, same Seattle-area contractor texture. Fields mirror
// the original page's AiPhoneCall shape — direction, fromNumber, toNumber,
// status, durationSeconds, recordingUrl, transcript, summary, leadId,
// startedAt — abbreviated by the donor to dir / from / to / status / dur / rec /
// script / summary / lead / when.
//
// Every STATE the surface can draw is reachable in this seed:
//  · c6  IN_PROGRESS, dur null, rec false, no script → the live badge, the
//        em-dash duration, and the disabled "Read transcript" row
//  · c8  FAILED inbound, 6 seconds, rec false, no script → the MISSED status
//        (danger tone) and the second disabled row
//  · c3  connected but no lead → the dashed "no lead" mark
//  · c1/c2/c5/c7 carry lead ids → the lead mark and the "Open lead" swap
//  · c4/c9 are OUTBOUND → the outbound tone
// Deleting every record reaches the "No calls yet" empty state; a search with
// no hits reaches "No matches".
//
// This is a design surface: the data layer is out of scope, so nothing here
// touches Prisma, a server action or the network. The array is mutated at
// runtime (create lead / delete / place call), so the component clones this
// seed per mount.

/** One transcript line: [who, text], where `who` is 'caller' or 'agent'. */
export type CallScriptLine = [string, string];

export type Call = {
  id: string;
  from: string;
  to: string;
  /** 'INBOUND' | 'OUTBOUND' — kept as `string`, the donor compares it to the
   *  active filter key, which is a plain string. */
  dir: string;
  /** 'COMPLETED' | 'FAILED' | 'IN_PROGRESS' — lower-cased for display. */
  status: string;
  /** Duration in seconds; null while a call is still in progress. */
  dur: number | null;
  rec: boolean;
  lead: string | null;
  when: string;
  summary: string | null;
  script: CallScriptLine[];
};

/** Donor: `const SHOP_NUMBER = '(425) 555-0100';` */
export const SHOP_NUMBER: string = "(425) 555-0100";

/** The webhook target printed in the donor's configuration banner. */
export const HOOK_URL = "https://app.jobflex.com/api/twilio/voice";

/** Donor: `let callsData = [ … ]`. */
export const CALLS_SEED: Call[] = [
  { id: "c1", from: "(425) 555-0142", to: SHOP_NUMBER, dir: "INBOUND", status: "COMPLETED", dur: 214, rec: true, lead: "L-6041", when: "25m ago",
    summary: "Homeowner in Bothell wants a full reroof quote — two layers of shingles, wants it before October.",
    script: [
      ["caller", "Hi, I saw your truck on Maple Ave. I need a quote for a new roof."],
      ["agent", "Happy to help. Is this for a single-family home, and do you know roughly the age of the roof?"],
      ["caller", "It's a rambler, roof is about twenty-two years old. There's two layers up there I think."],
      ["agent", "Got it — tear-off of two layers. What's the address, and when would you like us out?"],
      ["caller", "4812 Maple Ave in Bothell. Any time this week works, I work from home."],
      ["agent", "Perfect. I'll have someone out Thursday morning with a written estimate."],
    ] },
  { id: "c2", from: "(425) 555-0177", to: SHOP_NUMBER, dir: "INBOUND", status: "COMPLETED", dur: 96, rec: true, lead: "L-6039", when: "2h ago",
    summary: "Deck rebuild in Bellevue — existing frame is solid, wants composite decking and railings.",
    script: [
      ["caller", "Calling about a deck. The frame is fine but the boards are shot."],
      ["agent", "Composite or wood? And roughly how many square feet?"],
      ["caller", "Composite. About three hundred and twenty feet, plus railings and stairs."],
      ["agent", "I'll get an estimate over to you today."],
    ] },
  { id: "c3", from: "(425) 555-0119", to: SHOP_NUMBER, dir: "INBOUND", status: "COMPLETED", dur: 47, rec: true, lead: null, when: "4h ago",
    summary: "Wrong number — caller was looking for a plumbing outfit.",
    script: [["caller", "Is this Delgado Plumbing?"], ["agent", "No, this is Bell Roofing & Fence. I think you've got the wrong number."]] },
  { id: "c4", from: SHOP_NUMBER, to: "(425) 555-0148", dir: "OUTBOUND", status: "COMPLETED", dur: 133, rec: true, lead: null, when: "5h ago",
    summary: "Called D. Reyes to confirm the cedar fence start date and material drop.",
    script: [
      ["agent", "Hi Diego, just confirming we start the fence Friday and the cedar drops Thursday afternoon."],
      ["caller", "That works. Gate on the north side, right?"],
      ["agent", "That's right, single walk gate on the north run."],
    ] },
  { id: "c5", from: "(425) 555-0201", to: SHOP_NUMBER, dir: "INBOUND", status: "COMPLETED", dur: 168, rec: true, lead: "L-6035", when: "1d ago",
    summary: "Fence gate sags and drags — also wants 40 ft of adjoining fence repaired.",
    script: [
      ["caller", "My gate is dragging on the ground and a few pickets are rotted."],
      ["agent", "Sounds like the post has shifted. We can reset the post and swap the bad pickets."],
      ["caller", "How soon could you look at it?"],
      ["agent", "We're out that way Tuesday — I'll put you on the list."],
    ] },
  { id: "c6", from: "(425) 555-0166", to: SHOP_NUMBER, dir: "INBOUND", status: "IN_PROGRESS", dur: null, rec: false, lead: null, when: "1d ago",
    summary: null, script: [] },
  { id: "c7", from: "(425) 555-0114", to: SHOP_NUMBER, dir: "INBOUND", status: "COMPLETED", dur: 71, rec: true, lead: "L-6028", when: "2d ago",
    summary: "Gutter replacement in Redmond, full perimeter, wants guards included.",
    script: [
      ["caller", "I need gutters replaced all the way around, and I want the leaf guards."],
      ["agent", "Single story? I'll price the guards separately so you can see both options."],
    ] },
  { id: "c8", from: "(425) 555-0158", to: SHOP_NUMBER, dir: "INBOUND", status: "FAILED", dur: 6, rec: false, lead: null, when: "2d ago",
    summary: null, script: [] },
  { id: "c9", from: SHOP_NUMBER, to: "(425) 555-0132", dir: "OUTBOUND", status: "COMPLETED", dur: 89, rec: true, lead: null, when: "3d ago",
    summary: "Follow-up on proposal #2851 — homeowner is comparing two bids, decides this week.",
    script: [
      ["agent", "Checking in on the reroof estimate we sent Monday."],
      ["caller", "Still looking at it — I've got one more bid coming Thursday."],
      ["agent", "Understood. Call me with any questions on the scope."],
    ] },
  { id: "c10", from: "(425) 555-0195", to: SHOP_NUMBER, dir: "INBOUND", status: "COMPLETED", dur: 38, rec: true, lead: null, when: "4d ago",
    summary: "Vendor calling about a delivery window for shingles.",
    script: [["caller", "Delivery is scheduled for Thursday between eight and noon."], ["agent", "Works for us, thanks."]] },
];

/* ============================================================
   DERIVED VOCABULARY
   ============================================================ */

/**
 * Direction is the STATUS on this surface, so it is one derived value rather
 * than two independent fields. Four states, three status tones plus blueprint:
 * inbound = success, outbound = blueprint, missed = danger, live = warning.
 * Missed being danger is the point — a missed call is lost work.
 */
export type Kind = "in" | "out" | "missed" | "live";

export function kindOf(c: Call): Kind {
  if (c.status === "IN_PROGRESS") return "live";
  if (c.status === "FAILED") return "missed";
  return c.dir === "OUTBOUND" ? "out" : "in";
}

export const KIND_LABEL: Record<Kind, string> = {
  in: "Inbound",
  out: "Outbound",
  missed: "Missed",
  live: "Live",
};

/** Donor: `fmtDur`. A call still ringing has no duration — it reads as a dash. */
export function fmtDur(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The feed's date dividers. The fixture stores relative offsets, so the group
 * is derived from the offset rather than from a calendar date that would drift
 * every time the file is read. "now" (a call placed from the keypad) and any
 * minutes/hours offset are today.
 */
export function dayGroup(when: string): string {
  const m = /^(\d+)d ago$/.exec(when);
  if (!m) return "Today";
  const d = Number(m[1]);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}

/* ---- filter -------------------------------------------------------------
   The desktop's four chips (All / Inbound / Outbound / Became leads) plus
   Missed, which is the one thing a contractor opens this page to find. A chip
   rail does not survive 320px, so all five live in one dropdown. */
export const ALL = "ALL";
export const INBOUND = "INBOUND";
export const OUTBOUND = "OUTBOUND";
export const MISSED = "MISSED";
export const LEADS = "LEADS";

export const FILTERS: Array<{ k: string; l: string }> = [
  { k: ALL, l: "All calls" },
  { k: INBOUND, l: "Inbound" },
  { k: OUTBOUND, l: "Outbound" },
  { k: MISSED, l: "Missed" },
  { k: LEADS, l: "Leads" },
];

export function matchesFilter(c: Call, f: string): boolean {
  if (f === LEADS) return Boolean(c.lead);
  if (f === MISSED) return kindOf(c) === "missed";
  if (f === INBOUND) return c.dir === "INBOUND";
  if (f === OUTBOUND) return c.dir === "OUTBOUND";
  return true;
}

/** Numbers, the written summary, the lead id AND what was actually said. */
export function matchesQuery(c: Call, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    c.from.toLowerCase().includes(q) ||
    c.to.toLowerCase().includes(q) ||
    (c.summary ?? "").toLowerCase().includes(q) ||
    (c.lead ?? "").toLowerCase().includes(q) ||
    c.script.some((l) => l[1].toLowerCase().includes(q))
  );
}

export function filterCount(list: Call[], f: string): number {
  return list.filter((c) => matchesFilter(c, f)).length;
}

/** The other party — the shop's own number is never the interesting one. */
export function counterparty(c: Call): string {
  return c.dir === "OUTBOUND" ? c.to : c.from;
}

/* ---- keypad ------------------------------------------------------------- */

export const KEYS: Array<{ d: string; s: string }> = [
  { d: "1", s: "" }, { d: "2", s: "ABC" }, { d: "3", s: "DEF" },
  { d: "4", s: "GHI" }, { d: "5", s: "JKL" }, { d: "6", s: "MNO" },
  { d: "7", s: "PQRS" }, { d: "8", s: "TUV" }, { d: "9", s: "WXYZ" },
  { d: "*", s: "" }, { d: "0", s: "+" }, { d: "#", s: "" },
];

/** Progressive US formatting while the keypad is being typed into. */
export function fmtDial(raw: string): string {
  if (!/^\d+$/.test(raw)) return raw;
  if (raw.length <= 3) return raw;
  if (raw.length <= 6) return `(${raw.slice(0, 3)}) ${raw.slice(3)}`;
  if (raw.length <= 10) return `(${raw.slice(0, 3)}) ${raw.slice(3, 6)}-${raw.slice(6)}`;
  return `+${raw.slice(0, raw.length - 10)} (${raw.slice(-10, -7)}) ${raw.slice(-7, -4)}-${raw.slice(-4)}`;
}
