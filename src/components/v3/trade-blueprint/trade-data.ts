// Trade board blueprint — demo fixture data, verbatim from the donor file
// jobflex-trade-board-blueprint.html (script section). Values must not be
// edited independently of the donor: the page is a pixel-identical port,
// content included.
//
// Types are annotated widely (`string`, not string literals) so the donor's
// comparisons (`p.status === 'CLOSED'`, `p.status === 'PAID'`) compile
// unchanged instead of tripping TS2367 on a narrowed literal type.

export type TradeCategory = {
  key: string;
  label: string;
  tone: string;
};

export type TradePost = {
  id: string;
  cat: string;
  status: string;
  title: string;
  author: string;
  when: string;
  replies: number;
  body: string;
};

export type InfluencerStatement = {
  name: string;
  handle: string;
  clicks: number;
  conv: number;
  earn: number;
};

export type InfluencerPayout = {
  name: string;
  period: string;
  method: string;
  status: string;
  amount: number;
};

export const CATEGORIES: TradeCategory[] = [
  { key: 'all', label: 'All', tone: '' },
  { key: 'equipment', label: 'Equipment', tone: 'var(--blueprint)' },
  { key: 'subcontractor', label: 'Subcontractor', tone: 'var(--warning)' },
  { key: 'job-share', label: 'Job share', tone: 'var(--success)' },
  { key: 'question', label: 'Question', tone: 'var(--muted-faint)' }
];

/** Donor `postSeq` starts at 40; the counter itself is per-mount state. */
export const POST_SEQ_START: number = 40;

export const POSTS_SEED: TradePost[] = [
  { id: 'p1', cat: 'equipment', status: 'OPEN', title: 'Selling a 2019 dump trailer', author: 'Marcus Bell', when: '2h ago', replies: 4,
    body: '14 ft, 14k GVWR, new brakes and lights last spring. Tarp kit included. Kept indoors. $8,900 firm, located in Bothell.' },
  { id: 'p2', cat: 'subcontractor', status: 'OPEN', title: 'Need a gutter crew for two days', author: 'Sofia Ramos', when: '5h ago', replies: 7,
    body: 'Two-story colonial in Kirkland, full perimeter plus guards. My crew is booked through the month — happy to hand the whole scope over or subcontract it.' },
  { id: 'p3', cat: 'job-share', status: 'OPEN', title: 'Overflow: three reroofs in Everett', author: 'Ivan Petrov', when: '1d ago', replies: 12,
    body: 'Took on more than we can schedule before the rain. Three straightforward asphalt tear-offs, homeowner already signed. Split on materials, you keep the labor.' },
  { id: 'p4', cat: 'question', status: 'OPEN', title: 'What are you charging for steep-pitch lately?', author: 'Dan Kowalski', when: '2d ago', replies: 9,
    body: 'Anything 10/12 and up around the east side. We have been adding $28 a square and it feels light with the crew time it eats.' },
  { id: 'p5', cat: 'equipment', status: 'CLOSED', title: 'Compressor and two nail guns — sold', author: 'Grant Mueller', when: '4d ago', replies: 3,
    body: 'Bostitch setup, ran fine, just upgraded. Gone to the first caller — thanks everyone.' },
  { id: 'p6', cat: 'subcontractor', status: 'OPEN', title: 'Fencing sub wanted, ongoing work', author: 'Amara Cole', when: '5d ago', replies: 2,
    body: 'Property manager account with steady cedar and vinyl runs. Looking for someone reliable to take the overflow every month.' },
  { id: 'p7', cat: 'question', status: 'CLOSED', title: 'Who do you use for dumpster drops?', author: 'Marcus Bell', when: '1w ago', replies: 15,
    body: 'Our usual hauler keeps slipping the drop window. Looking for someone dependable north of Seattle.' }
];

export const INF_PERIOD: string = '2026-07';

export const STATEMENTS: InfluencerStatement[] = [
  { name: 'Rooftop Ryan',    handle: '@rooftopryan',  clicks: 4820, conv: 61, earn: 3050 },
  { name: 'Fence Life',      handle: '@fencelife',    clicks: 3110, conv: 38, earn: 1900 },
  { name: 'Trade Talk Tess', handle: '@tradetalktess', clicks: 2240, conv: 19, earn: 950 },
  { name: 'BuildSide Media', handle: '@buildside',    clicks: 1180, conv: 7,  earn: 350 }
];

export const PAYOUTS: InfluencerPayout[] = [
  { name: 'Rooftop Ryan',    period: '2026-06', method: 'ACH',    status: 'PAID',    amount: 2740 },
  { name: 'Fence Life',      period: '2026-06', method: 'ACH',    status: 'PAID',    amount: 1610 },
  { name: 'Trade Talk Tess', period: '2026-06', method: 'PayPal', status: 'PAID',    amount: 880 },
  { name: 'Rooftop Ryan',    period: '2026-05', method: 'ACH',    status: 'PAID',    amount: 2210 },
  { name: 'BuildSide Media', period: '2026-06', method: 'PayPal', status: 'PENDING', amount: 420 },
  { name: 'Fence Life',      period: '2026-05', method: 'ACH',    status: 'FAILED',  amount: 1340 }
];
