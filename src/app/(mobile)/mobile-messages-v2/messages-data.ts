// Mobile messages (mobile-messages-v2) — demo fixture.
//
// Carried over VERBATIM from the desktop messages donor fixture
// (src/components/v3/messages-blueprint/messages-data.ts): same values, same
// field names, so the handheld composition is judged against the same threads
// as the desktop sheet. Seattle-area contractor texture — a tear-off on Maple
// Ave, a deck estimate, a gate post on Fern St, a phase-2 material drop.
//
// Every state the surface can show is reachable from this seed:
//  · unread threads          — k1 (2) and k4 (1)
//  · read threads            — k2, k3, k5
//  · GROUP threads with a job — k2 (J-1042), k5 (J-1051)
//  · DIRECT threads with NO job — k1, k3, k4 → the actions sheet's DISABLED
//    "Open job" row is driven by that missing field, not by a flag
//  · a multi-author run       — k2, so the group author label renders
//  · every day divider form   — "Today", "Yesterday", and a dated "Jul 20"
// The empty thread ("No messages yet") arrives via Clear chat or a brand-new
// conversation; the empty book arrives by deleting every thread.
//
// This is a design surface: the data layer is out of scope, so nothing here
// touches Prisma, a server action or the network. The arrays are mutated at
// runtime (sending, clearing, deleting, creating), so the component clones this
// seed per mount and mutations never leak between mounts.

export type Member = {
  id: string;
  name: string;
  role: string;
};

export type Msg = {
  id: string;
  who: string;
  me: boolean;
  day: string;
  at: string;
  body: string;
};

export type Conv = {
  id: string;
  kind: "DIRECT" | "GROUP";
  title: string;
  job: string | null;
  unread: number;
  when: string;
  msgs: Msg[];
};

export const TEAM: Member[] = [
  { id: 'u1', name: 'Marcus Bell',   role: 'Lead installer' },
  { id: 'u2', name: 'Sofia Ramos',   role: 'Estimator' },
  { id: 'u3', name: 'Dan Kowalski',  role: 'Installer' },
  { id: 'u4', name: 'Grant Mueller', role: 'Installer' },
  { id: 'u5', name: 'Amara Cole',    role: 'Sales' }
];

/** Donor: `let convSeq = 20, msgSeq = 200;`. Annotated `number` so the page can
 *  keep incrementing them without literal-type narrowing. */
export const CONV_SEQ_START: number = 20;
export const MSG_SEQ_START: number = 200;

export const CONV_SEED: Conv[] = [
  { id: 'k1', kind: 'DIRECT', title: 'Marcus Bell', job: null, unread: 2, when: '12m',
    msgs: [
      { id: 'm1', who: 'Marcus Bell', me: false, day: 'Today', at: '7:42 AM', body: 'Dumpster is on the driveway at Maple Ave, we started the tear-off.' },
      { id: 'm2', who: 'Ivan', me: true, day: 'Today', at: '7:55 AM', body: 'Good. Watch the sheathing over the garage, it looked soft on the walkthrough.' },
      { id: 'm3', who: 'Marcus Bell', me: false, day: 'Today', at: '11:20 AM', body: 'You were right — about 40 sq ft is rotted through.' },
      { id: 'm4', who: 'Marcus Bell', me: false, day: 'Today', at: '11:21 AM', body: 'Want me to write it up as a change order before we close it back up?' }
    ] },
  { id: 'k2', kind: 'GROUP', title: 'Maple Ave crew', job: 'J-1042', unread: 0, when: '1h',
    msgs: [
      { id: 'm5', who: 'Ivan', me: true, day: 'Yesterday', at: '4:10 PM', body: 'Start is 7:00 sharp tomorrow. Dan, bring the second nail gun.' },
      { id: 'm6', who: 'Dan Kowalski', me: false, day: 'Yesterday', at: '4:26 PM', body: 'Got it. Compressor is already in the truck.' },
      { id: 'm7', who: 'Marcus Bell', me: false, day: 'Today', at: '6:58 AM', body: "On site, gate's unlocked." },
      { id: 'm8', who: 'Sofia Ramos', me: false, day: 'Today', at: '9:30 AM', body: 'Homeowner asked about the ridge vent upgrade — I sent the numbers.' }
    ] },
  { id: 'k3', kind: 'DIRECT', title: 'Sofia Ramos', job: null, unread: 0, when: '3h',
    msgs: [
      { id: 'm9', who: 'Sofia Ramos', me: false, day: 'Today', at: '8:05 AM', body: 'Kim deck estimate is ready for your review.' },
      { id: 'm10', who: 'Ivan', me: true, day: 'Today', at: '8:12 AM', body: 'Send it. If the margin holds above 20 percent, ship it today.' },
      { id: 'm11', who: 'Sofia Ramos', me: false, day: 'Today', at: '8:14 AM', body: '23 percent with the composite railing. Sending now.' }
    ] },
  { id: 'k4', kind: 'DIRECT', title: 'Dan Kowalski', job: null, unread: 1, when: '1d',
    msgs: [
      { id: 'm12', who: 'Ivan', me: true, day: 'Yesterday', at: '2:00 PM', body: 'Can you swing by Fern St Wednesday to reset that gate post?' },
      { id: 'm13', who: 'Dan Kowalski', me: false, day: 'Yesterday', at: '2:31 PM', body: 'Yes, morning works. Do we have a bag of fast-set left?' }
    ] },
  { id: 'k5', kind: 'GROUP', title: 'Alder Ridge — phase 2', job: 'J-1051', unread: 0, when: '2d',
    msgs: [
      { id: 'm14', who: 'Ivan', me: true, day: 'Jul 20', at: '10:00 AM', body: 'Materials for lots 4 through 7 land Thursday.' },
      { id: 'm15', who: 'Grant Mueller', me: false, day: 'Jul 20', at: '10:18 AM', body: 'I will stage them behind lot 5.' }
    ] }
];

/**
 * A handheld conversation row is three lines tall, so the rail pages rather
 * than running forever. The desktop scrolls its rail inside a fixed-height
 * card, which a phone has no room for; six is roughly one screen of rows.
 */
export const PAGE_SIZE = 6;

/** Filter keys. `DIRECT` / `GROUP` are the fixture's own `kind` values. */
export const ALL = "ALL";
export const UNREAD = "UNREAD";
export const DIRECT = "DIRECT";
export const GROUP = "GROUP";

export const FILTERS: Array<{ k: string; l: string }> = [
  { k: ALL, l: "All" },
  { k: UNREAD, l: "Unread" },
  { k: DIRECT, l: "Direct" },
  { k: GROUP, l: "Groups" },
];

/**
 * Two letters, so a rail of threads is scannable: "Marcus Bell" → MB,
 * "Maple Ave crew" → MC, a single word → its first two letters. Punctuation is
 * stripped first, which is what keeps "Alder Ridge — phase 2" from picking the
 * em dash. Same routine the desktop donor ships.
 */
export function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function lastMsg(c: Conv): Msg | null {
  return c.msgs.length ? c.msgs[c.msgs.length - 1] : null;
}

/** The rail's preview line, exactly as the desktop composes it. */
export function preview(c: Conv): string {
  const last = lastMsg(c);
  if (!last) return "No messages yet";
  return (last.me ? "You: " : "") + last.body;
}

export function matchesFilter(c: Conv, f: string): boolean {
  if (f === ALL) return true;
  if (f === UNREAD) return c.unread > 0;
  return c.kind === f;
}

/**
 * Title or last-message body — the donor's own search predicate, kept so the
 * handheld box answers the same queries as the desktop one.
 */
export function matchesQuery(c: Conv, query: string): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const last = lastMsg(c);
  return c.title.toLowerCase().includes(q) || (last !== null && last.body.toLowerCase().includes(q));
}

export function filterCount(list: Conv[], f: string): number {
  return list.filter((c) => matchesFilter(c, f)).length;
}

export function totalUnread(list: Conv[]): number {
  return list.reduce((a, c) => a + c.unread, 0);
}

export function totalMessages(list: Conv[]): number {
  return list.reduce((a, c) => a + c.msgs.length, 0);
}

/** Deep enough that runtime mutation of a thread cannot reach the module seed. */
export function cloneSeed(): Conv[] {
  return CONV_SEED.map((c) => ({ ...c, msgs: c.msgs.map((m) => ({ ...m })) }));
}

/** "7:42 AM" from a Date — the donor's clock format for a sent message. */
export function clockOf(d: Date): string {
  let h = d.getHours();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, "0")} ${ap}`;
}
