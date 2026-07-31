// Clients blueprint — demo fixture data, verbatim from the donor file
// jobflex-clients-blueprint_2.html (script section). Values must not be edited
// independently of the donor: the page is a pixel-identical port, content
// included. Fields mirror the original page's ClientRow shape: id, name,
// email, address (city, state), proposalCount, pipelineValue, tags
// [{label,color}], vip, updated.

export type ClientTag = {
  label: string;
  color?: string;
};

export type Client = {
  id: string;
  name: string;
  email: string | null;
  /** DISPLAY string for the Location column — "Kirkland, WA", the same
   *  `[city, state] || address` the classic list showed. */
  address: string;
  proposalCount: number;
  pipelineValue: number;
  vip: boolean;
  tags: ClientTag[];
  updated: string;
  // ---- raw database columns, carried so the edit dialog can round-trip a
  // record without wiping the fields the blueprint form has no input for.
  // `updateClient` writes the whole address block, so a save that omitted
  // line 1 / zip / phone would blank them. Optional because the donor fixture
  // below (used by the standalone mock route, which has no session) has none.
  phone?: string | null;
  /** `Client.address` in the database — street line, not the display string. */
  line1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export const CLIENTS_SEED: Client[] = [
  { id: 'c01', name: 'M. Henderson',   email: 'm.henderson@mail.com',  address: 'Bothell, WA',     proposalCount: 3, pipelineValue: 24600, vip: true,  tags: [{ label: 'Roofing' }], updated: 'Jul 22' },
  { id: 'c02', name: 'Cascade PM',     email: 'ops@cascadepm.com',     address: 'Redmond, WA',     proposalCount: 9, pipelineValue: 18700, vip: true,  tags: [{ label: 'Property mgmt' }, { label: 'Repeat' }], updated: 'Jul 22' },
  { id: 'c03', name: 'D. Reyes',       email: 'd.reyes@mail.com',      address: 'Kirkland, WA',    proposalCount: 2, pipelineValue: 12400, vip: false, tags: [{ label: 'Fencing' }, { label: 'Repeat' }], updated: 'Jul 21' },
  { id: 'c04', name: 'A. Kim',         email: 'a.kim@mail.com',        address: 'Bellevue, WA',    proposalCount: 1, pipelineValue: 21500, vip: false, tags: [{ label: 'Decking' }], updated: 'Jul 20' },
  { id: 'c05', name: 'Northgate LLC',  email: 'facilities@ngllc.com',  address: 'Everett, WA',     proposalCount: 6, pipelineValue: 9600,  vip: true,  tags: [{ label: 'Commercial' }, { label: 'Repeat' }], updated: 'Jul 19' },
  { id: 'c06', name: 'K. Marsh',       email: 'k.marsh@mail.com',      address: 'Woodinville, WA', proposalCount: 1, pipelineValue: 5400,  vip: false, tags: [{ label: 'Roofing' }], updated: 'Jul 19' },
  { id: 'c07', name: 'R. Okafor',      email: 'r.okafor@mail.com',     address: 'Redmond, WA',     proposalCount: 1, pipelineValue: 3800,  vip: false, tags: [], updated: 'Jul 18' },
  { id: 'c08', name: 'T. Bishop',      email: 't.bishop@mail.com',     address: 'Woodinville, WA', proposalCount: 2, pipelineValue: 7900,  vip: false, tags: [{ label: 'Roofing' }, { label: 'Repeat' }], updated: 'Jul 17' },
  { id: 'c09', name: 'S. Patel',       email: 's.patel@mail.com',      address: 'Mill Creek, WA',  proposalCount: 4, pipelineValue: 18700, vip: false, tags: [{ label: 'Property mgmt' }], updated: 'Jul 16' },
  { id: 'c10', name: 'L. Wong',        email: 'l.wong@mail.com',       address: 'Sammamish, WA',   proposalCount: 2, pipelineValue: 14800, vip: false, tags: [{ label: 'Decking' }], updated: 'Jul 15' },
  { id: 'c11', name: 'J. Whitfield',   email: 'j.whitfield@mail.com',  address: 'Everett, WA',     proposalCount: 1, pipelineValue: 9600,  vip: false, tags: [{ label: 'Roofing' }], updated: 'Jul 14' },
  { id: 'c12', name: 'P. Delgado',     email: 'p.delgado@mail.com',    address: 'Kenmore, WA',     proposalCount: 1, pipelineValue: 0,     vip: false, tags: [{ label: 'Fencing' }], updated: 'Jul 12' },
  { id: 'c13', name: 'N. Ivanov',      email: 'n.ivanov@mail.com',     address: 'Lynnwood, WA',    proposalCount: 1, pipelineValue: 6200,  vip: false, tags: [{ label: 'Fencing' }], updated: 'Jul 11' },
  { id: 'c14', name: 'C. Ferreira',    email: 'c.ferreira@mail.com',   address: 'Bothell, WA',     proposalCount: 2, pipelineValue: 0,     vip: false, tags: [{ label: 'Roofing' }, { label: 'Repeat' }], updated: 'Jul 10' },
  { id: 'c15', name: 'K. Sorensen',    email: 'k.sorensen@mail.com',   address: 'Kirkland, WA',    proposalCount: 1, pipelineValue: 0,     vip: false, tags: [{ label: 'Fencing' }], updated: 'Jul 08' },
  { id: 'c16', name: 'D. Pham',        email: 'd.pham@mail.com',       address: 'Redmond, WA',     proposalCount: 1, pipelineValue: 0,     vip: false, tags: [], updated: 'Jun 30' },
  { id: 'c17', name: 'T. Ortiz',       email: null,                    address: 'Bothell, WA',     proposalCount: 1, pipelineValue: 850,   vip: false, tags: [], updated: 'Jun 28' },
  { id: 'c18', name: 'R. Tran',        email: 'r.tran@mail.com',       address: 'Bothell, WA',     proposalCount: 1, pipelineValue: 0,     vip: false, tags: [{ label: 'Decking' }], updated: 'Jun 24' },
];

/** Donor: `const PAGE_SIZE = 12;` (the original page used usePagedList(rows, 20)). */
export const PAGE_SIZE = 12;
