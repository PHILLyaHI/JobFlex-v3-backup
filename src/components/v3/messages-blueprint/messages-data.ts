// Messages blueprint — demo fixture data, verbatim from the donor file
// jobflex-messages-blueprint_1.html (script section, "MESSAGES: ДАННЫЕ").
// Values must not be edited independently of the donor: the page is a
// pixel-identical port, content included.
//
// Shapes mirror the original page's models:
//   Conversation: kind (DIRECT | GROUP), title, jobId, unreadCount, participants
//   Message: body, authorName, isMe, createdAt

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

/** Donor: `let convSeq = 20, msgSeq = 200;`. Annotated `number` so the ported
 *  script can keep incrementing them without literal-type narrowing. */
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
      { id: 'm15', who: 'Grant Mueller', me: false, day: 'Jul 20', at: '10:18 AM', body: 'Copy. I will stage them behind lot 5.' }
    ] }
];
