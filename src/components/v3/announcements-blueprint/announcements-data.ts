// Announcements blueprint — demo fixture data, verbatim from the donor file
// jobflex-announcements-blueprint_1.html (script section). Values must not be
// edited independently of the donor: the page is a pixel-identical port,
// content included. Fields mirror the original page's Announcement shape:
// title, body, priority (0 normal | 1 warn | 2 high), expiresAt, createdAt.

export type Announcement = {
  id: string;
  title: string;
  priority: number;
  created: string | null;
  expires: string | null;
  expired: boolean;
  body: string;
};

/** Shape `bannerHtml` accepts: a stored record, or the dialog's live draft
 *  (which has no `id` and no `expired` yet). */
export type BannerModel = {
  id?: string;
  title: string;
  priority: number;
  created: string | null;
  expires: string | null;
  body: string;
};

/** Donor: `const PRIORITY = { 0: 'Normal', 1: 'Warn', 2: 'High' };` */
export const PRIORITY: Record<number, string> = { 0: "Normal", 1: "Warn", 2: "High" };

/** Donor: `let annSeq = 30;` — the id counter new announcements draw from.
 *  Annotated `: number` so the donor's arithmetic/comparisons compile
 *  unchanged (a bare literal would narrow to the type `30`). */
export const ANN_SEQ_START: number = 30;

export const ANN_SEED: Announcement[] = [
  { id: 'a1', title: 'Shop closed Friday', priority: 2, created: 'Jul 21, 2026', expires: 'Jul 25, 2026', expired: false,
    body: 'Annual equipment service — no crews dispatched Friday. Move any scheduled work to Thursday or Monday.' },
  { id: 'a2', title: 'New material supplier', priority: 0, created: 'Jul 18, 2026', expires: null, expired: false,
    body: 'Shingles now come from Bothell Building Supply. Use the new account number on all pickups.' },
  { id: 'a3', title: 'Heat advisory — start early', priority: 1, created: 'Jul 20, 2026', expires: 'Jul 24, 2026', expired: false,
    body: 'Highs above 95°F through Thursday. Shift roof work to 6 AM starts and pack extra water.' },
  { id: 'a4', title: 'Timesheets due Monday', priority: 0, created: 'Jul 06, 2026', expires: 'Jul 14, 2026', expired: true,
    body: 'Submit last week hours in the worker portal before Monday noon.' },
  { id: 'a5', title: 'Parking change at the yard', priority: 0, created: 'Jun 24, 2026', expires: 'Jul 02, 2026', expired: true,
    body: 'Trailers park along the north fence while the lot is resurfaced.' }
];
