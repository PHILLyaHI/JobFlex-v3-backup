// Phone blueprint — demo fixture data, verbatim from the donor file
// jobflex-phone-blueprint_1.html (script section). Values must not be edited
// independently of the donor: the page is a pixel-identical port, content
// included. Fields mirror the original page's AiPhoneCall shape: direction,
// fromNumber, toNumber, status, durationSeconds, recordingUrl, transcript,
// summary, leadId, startedAt — abbreviated by the donor to
// dir / from / to / status / dur / rec / script / summary / lead / when.

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
export const SHOP_NUMBER: string = '(425) 555-0100';

/** Donor: `let callsData = [ … ]`. */
export const CALLS_SEED: Call[] = [
  { id: 'c1', from: '(425) 555-0142', to: SHOP_NUMBER, dir: 'INBOUND', status: 'COMPLETED', dur: 214, rec: true, lead: 'L-6041', when: '25m ago',
    summary: 'Homeowner in Bothell wants a full reroof quote — two layers of shingles, wants it before October.',
    script: [
      ['caller', 'Hi, I saw your truck on Maple Ave. I need a quote for a new roof.'],
      ['agent', 'Happy to help. Is this for a single-family home, and do you know roughly the age of the roof?'],
      ['caller', "It's a rambler, roof is about twenty-two years old. There's two layers up there I think."],
      ['agent', "Got it — tear-off of two layers. What's the address, and when would you like us out?"],
      ['caller', '4812 Maple Ave in Bothell. Any time this week works, I work from home.'],
      ['agent', "Perfect. I'll have someone out Thursday morning with a written estimate."]
    ] },
  { id: 'c2', from: '(425) 555-0177', to: SHOP_NUMBER, dir: 'INBOUND', status: 'COMPLETED', dur: 96, rec: true, lead: 'L-6039', when: '2h ago',
    summary: 'Deck rebuild in Bellevue — existing frame is solid, wants composite decking and railings.',
    script: [
      ['caller', 'Calling about a deck. The frame is fine but the boards are shot.'],
      ['agent', 'Composite or wood? And roughly how many square feet?'],
      ['caller', 'Composite. About three hundred and twenty feet, plus railings and stairs.'],
      ['agent', "I'll get an estimate over to you today."]
    ] },
  { id: 'c3', from: '(425) 555-0119', to: SHOP_NUMBER, dir: 'INBOUND', status: 'COMPLETED', dur: 47, rec: true, lead: null, when: '4h ago',
    summary: 'Wrong number — caller was looking for a plumbing outfit.',
    script: [['caller', 'Is this Delgado Plumbing?'], ['agent', "No, this is Bell Roofing & Fence. I think you've got the wrong number."]] },
  { id: 'c4', from: SHOP_NUMBER, to: '(425) 555-0148', dir: 'OUTBOUND', status: 'COMPLETED', dur: 133, rec: true, lead: null, when: '5h ago',
    summary: 'Called D. Reyes to confirm the cedar fence start date and material drop.',
    script: [
      ['agent', 'Hi Diego, just confirming we start the fence Friday and the cedar drops Thursday afternoon.'],
      ['caller', "That works. Gate on the north side, right?"],
      ['agent', "That's right, single walk gate on the north run."]
    ] },
  { id: 'c5', from: '(425) 555-0201', to: SHOP_NUMBER, dir: 'INBOUND', status: 'COMPLETED', dur: 168, rec: true, lead: 'L-6035', when: '1d ago',
    summary: 'Fence gate sags and drags — also wants 40 ft of adjoining fence repaired.',
    script: [
      ['caller', 'My gate is dragging on the ground and a few pickets are rotted.'],
      ['agent', 'Sounds like the post has shifted. We can reset the post and swap the bad pickets.'],
      ['caller', 'How soon could you look at it?'],
      ['agent', "We're out that way Tuesday — I'll put you on the list."]
    ] },
  { id: 'c6', from: '(425) 555-0166', to: SHOP_NUMBER, dir: 'INBOUND', status: 'IN_PROGRESS', dur: null, rec: false, lead: null, when: '1d ago',
    summary: null, script: [] },
  { id: 'c7', from: '(425) 555-0114', to: SHOP_NUMBER, dir: 'INBOUND', status: 'COMPLETED', dur: 71, rec: true, lead: 'L-6028', when: '2d ago',
    summary: 'Gutter replacement in Redmond, full perimeter, wants guards included.',
    script: [
      ['caller', 'I need gutters replaced all the way around, and I want the leaf guards.'],
      ['agent', "Single story? I'll price the guards separately so you can see both options."]
    ] },
  { id: 'c8', from: '(425) 555-0158', to: SHOP_NUMBER, dir: 'INBOUND', status: 'FAILED', dur: 6, rec: false, lead: null, when: '2d ago',
    summary: null, script: [] },
  { id: 'c9', from: SHOP_NUMBER, to: '(425) 555-0132', dir: 'OUTBOUND', status: 'COMPLETED', dur: 89, rec: true, lead: null, when: '3d ago',
    summary: 'Follow-up on proposal #2851 — homeowner is comparing two bids, decides this week.',
    script: [
      ['agent', 'Checking in on the reroof estimate we sent Monday.'],
      ['caller', "Still looking at it — I've got one more bid coming Thursday."],
      ['agent', "Understood. Call me with any questions on the scope."]
    ] },
  { id: 'c10', from: '(425) 555-0195', to: SHOP_NUMBER, dir: 'INBOUND', status: 'COMPLETED', dur: 38, rec: true, lead: null, when: '4d ago',
    summary: 'Vendor calling about a delivery window for shingles.',
    script: [['caller', 'Delivery is scheduled for Thursday between eight and noon.'], ['agent', 'Works for us, thanks.']] }
];
