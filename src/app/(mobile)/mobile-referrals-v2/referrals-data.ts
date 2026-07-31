// Mobile referrals (mobile-referrals-v2) — demo fixture.
//
// Carried over VERBATIM from the desktop referrals donor fixture
// (src/components/v3/referrals-blueprint/referrals-data.ts) so the handheld
// composition is judged against the same sheet as the desktop page: same eight
// records, same field names (id / email / status / reward / when), same values.
// The program constants (code, both share links, reward percentage) are lifted
// from the donor's hero markup with the same literal strings.
//
// Seattle-area contractor texture: eight trade shops that used the code —
// three PAID (credited $49 each), two CONVERTED (credit on the way), three
// PENDING (reward 0). That last group is what makes the row sheet's disabled
// "Apply credit" state reachable, and the PAID/CONVERTED group is what makes
// the disabled "Nudge to upgrade" state reachable — every record shows exactly
// one disabled row.
//
// This is a design surface: the data layer is out of scope, so nothing here
// touches Prisma, a server action or the network. The array is mutated at
// runtime by the row sheet (remove), so the component clones this seed per
// mount and mutations never leak between mounts.

export type ConversionStatus = "PENDING" | "CONVERTED" | "PAID";

export type Conversion = {
  id: string;
  email: string;
  status: ConversionStatus;
  /** reward in cents — `money()` divides by 100 */
  reward: number;
  when: string;
};

export const CONVERSIONS_SEED: Conversion[] = [
  { id: 'v1', email: 'ops@summitroofingnw.com',   status: 'PAID',      reward: 4900, when: '3d ago' },
  { id: 'v2', email: 'mike@ridgelinefence.com',   status: 'PAID',      reward: 4900, when: '1w ago' },
  { id: 'v3', email: 'hello@cascadeexteriors.co', status: 'CONVERTED', reward: 4900, when: '2w ago' },
  { id: 'v4', email: 'dana@northshoregutters.com', status: 'CONVERTED', reward: 4900, when: '2w ago' },
  { id: 'v5', email: 't.mercer@mercerdecks.com',  status: 'PENDING',   reward: 0,    when: '3w ago' },
  { id: 'v6', email: 'crew@evergreensiding.net',  status: 'PENDING',   reward: 0,    when: '1mo ago' },
  { id: 'v7', email: 'jr@harborfenceco.com',      status: 'PAID',      reward: 4900, when: '1mo ago' },
  { id: 'v8', email: 'admin@pugetpropertypm.com', status: 'PENDING',   reward: 0,    when: '2mo ago' }
];

/** The donor hero block's literals — the code and both share targets. */
export const REFERRAL_CODE = "BELL-4T9K";
export const SIGNUP_LINK = `jobflex.app/auth/register?ref=${REFERRAL_CODE}`;
export const HOMEOWNER_LINK = `jobflex.app/homeowners?ref=${REFERRAL_CODE}`;
export const REWARD_PCT = 50;

/**
 * The desktop list renders all eight at once. A handheld row is three lines
 * tall, so it pages at 6 — the same reasoning that took the clients ledger from
 * 12 to 8 and the proposals ledger from 8 to 6.
 */
export const PAGE_SIZE = 6;

export const ALL = "ALL";
export type FilterKey = typeof ALL | ConversionStatus;

/** The desktop chip rail's four buckets, in its order. */
export const FILTERS: { k: FilterKey; l: string }[] = [
  { k: ALL, l: "All" },
  { k: "PAID", l: "Credited" },
  { k: "CONVERTED", l: "Converted" },
  { k: "PENDING", l: "Pending" },
];

/** The donor's wording: a credited referral reads "credited", not "paid". */
export function statusLabel(st: ConversionStatus): string {
  return st === "PAID" ? "Credited" : st === "CONVERTED" ? "Converted" : "Pending";
}

/** `money(4900)` → "$49". Rounds so it is safe to call mid count-up. */
export function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

/**
 * Two letters from the mailbox, so eight rows are scannable at a glance:
 * "ops@…" → OP, "t.mercer@…" → TM. Punctuation is stripped first, which is what
 * keeps "t.mercer" from rendering as "T." — the donor's raw slice(0, 2).
 */
export function initials(email: string): string {
  const local = email.split("@")[0] ?? "";
  const letters = local.replace(/[^A-Za-z]/g, "");
  return (letters.slice(0, 2) || "?").toUpperCase();
}

/** The domain, which is how a contractor recognises the shop behind the email. */
export function domainOf(email: string): string {
  return email.split("@")[1] ?? email;
}

export function matchesStatus(c: Conversion, key: FilterKey): boolean {
  return key === ALL || c.status === key;
}

/** The whole address answers the search box — mailbox and domain both. */
export function matchesQuery(c: Conversion, query: string): boolean {
  if (!query) return true;
  return c.email.toLowerCase().includes(query.trim().toLowerCase());
}

export function statusCount(list: Conversion[], key: FilterKey): number {
  return list.filter((c) => matchesStatus(c, key)).length;
}

/** Credit already banked — the masthead's primary numeral, in cents. */
export function creditedCents(list: Conversion[]): number {
  return list.filter((c) => c.status === "PAID").reduce((a, c) => a + c.reward, 0);
}

/** Credit approved but not yet applied — the masthead's first annotation. */
export function pendingCents(list: Conversion[]): number {
  return list.filter((c) => c.status === "CONVERTED").reduce((a, c) => a + c.reward, 0);
}
