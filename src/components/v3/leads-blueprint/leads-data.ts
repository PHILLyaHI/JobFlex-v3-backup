// Leads blueprint — the donor's demo dataset, hardcoded exactly as authored in
// jobflex-leads-blueprint_3.html. Kept in its own module (same pattern as
// proposals-data.ts) so the behavior file stays readable; every field, string,
// number and null is verbatim from the donor script.
//
// LeadRow shape in the donor: name, email, phone, city/state, projectType,
// description, status, source, aiCategory (specialty), aiConfidence, assignee,
// createdAt.

export type Lead = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  city: string;
  project: string;
  spec: string | null;
  conf: number;
  status: string;
  source: string;
  assignee: string | null;
  age: string;
  desc: string;
};

export type Offer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string;
  project: string;
  spec: string;
  conf: number;
  attempt: number;
  mins: number;
  age: string;
  desc: string;
};

export type StagedRow = {
  name: string;
  email: string | null;
  phone: string | null;
  project: string | null;
  source: string;
};

export const STAGES: Array<{ key: string; label: string }> = [
  { key: 'NEW', label: 'New' }, { key: 'ROUTED', label: 'Routed' },
  { key: 'CLAIMED', label: 'Claimed' }, { key: 'CONTACTED', label: 'Contacted' },
  { key: 'QUOTED', label: 'Quoted' }, { key: 'WON', label: 'Won' }, { key: 'LOST', label: 'Lost' }
];

export const LEAD_STATUSES = ['ALL', 'NEW', 'ROUTED', 'CLAIMED', 'CONTACTED', 'QUOTED', 'WON', 'LOST', 'ARCHIVED'];

export const SRC: Record<string, string> = { MANUAL: 'Manual entry', EMAIL: 'Email paste', FACEBOOK: 'Facebook', IMPORT: 'Imported', FORM: 'Homeowner form', LEAD_CENTER: 'Lead center' };

/** Donor: `let seq = 700` — the id counter for imported/accepted rows. */
export const SEQ_START = 700;

export const LEADS_SEED: Lead[] = [
  { id: 601, name: 'M. Alvarez',   email: 'm.alvarez@mail.com',   phone: '(425) 555-0111', city: 'Bothell, WA',     project: 'Asphalt reroof',         spec: 'Roofing', conf: 0.94, status: 'NEW',       source: 'FORM',        assignee: null,     age: '2h ago', desc: 'Two layers of shingles, curling on the south slope. Wants a quote this week.' },
  { id: 602, name: 'J. Whitfield', email: 'j.whitfield@mail.com', phone: '(425) 555-0112', city: 'Everett, WA',     project: 'Metal roof repair',      spec: 'Roofing', conf: 0.88, status: 'ROUTED',    source: 'LEAD_CENTER', assignee: 'Marcus', age: '3h ago', desc: 'Leak above the garage after the last storm. Metal panels, single story.' },
  { id: 603, name: 'T. Bishop',    email: 't.bishop@mail.com',    phone: '(425) 555-0113', city: 'Woodinville, WA', project: 'Skylight install',       spec: 'Roofing', conf: 0.79, status: 'CLAIMED',   source: 'FORM',        assignee: 'Ivan',   age: '6h ago', desc: 'Two fixed skylights over the kitchen.' },
  { id: 604, name: 'R. Okafor',    email: 'r.okafor@mail.com',    phone: '(425) 555-0114', city: 'Redmond, WA',     project: 'Gutter replacement',     spec: 'Gutters', conf: 0.91, status: 'CONTACTED', source: 'FACEBOOK',    assignee: 'Marcus', age: '1d ago', desc: 'Full perimeter, wants guards included.' },
  { id: 605, name: 'M. Henderson', email: 'm.henderson@mail.com', phone: '(425) 555-0132', city: 'Bothell, WA',     project: 'Asphalt reroof',         spec: 'Roofing', conf: 0.96, status: 'QUOTED',    source: 'FORM',        assignee: 'Ivan',   age: '2d ago', desc: 'Estimate sent, waiting on the decision.' },
  { id: 606, name: 'D. Reyes',     email: 'd.reyes@mail.com',     phone: '(425) 555-0148', city: 'Kirkland, WA',    project: 'Cedar fence, 140 ft',    spec: 'Fencing', conf: 0.93, status: 'WON',       source: 'MANUAL',      assignee: 'Ivan',   age: '4d ago', desc: 'Signed; deposit received.' },
  { id: 607, name: 'S. Rao',       email: 's.rao@mail.com',       phone: '(425) 555-0116', city: 'Sammamish, WA',   project: 'Vinyl fence, 160 ft',    spec: 'Fencing', conf: 0.85, status: 'NEW',       source: 'FACEBOOK',    assignee: null,     age: '5h ago', desc: 'Corner lot, wants privacy panels along the street side.' },
  { id: 608, name: 'K. Sorensen',  email: 'k.sorensen@mail.com',  phone: '(425) 555-0117', city: 'Kirkland, WA',    project: 'Cedar fence, 90 ft',     spec: 'Fencing', conf: 0.9,  status: 'WON',       source: 'FORM',        assignee: 'Sofia',  age: '1w ago', desc: 'Completed and paid.' },
  { id: 609, name: 'L. Wong',      email: 'l.wong@mail.com',      phone: '(425) 555-0118', city: 'Sammamish, WA',   project: 'Pergola build',          spec: 'Decking', conf: 0.72, status: 'CONTACTED', source: 'IMPORT',      assignee: 'Sofia',  age: '6d ago', desc: 'Cedar posts, 12x14 footprint.' },
  { id: 610, name: 'P. Delgado',   email: 'p.delgado@mail.com',   phone: '(425) 555-0119', city: 'Kenmore, WA',     project: 'Vinyl fence, 220 ft',    spec: 'Fencing', conf: 0.81, status: 'LOST',      source: 'EMAIL',       assignee: 'Marcus', age: '2w ago', desc: 'Went with another shop on price.' },
  { id: 611, name: 'A. Kim',       email: 'a.kim@mail.com',       phone: '(425) 555-0177', city: 'Bellevue, WA',    project: 'Composite deck rebuild', spec: 'Decking', conf: 0.95, status: 'QUOTED',    source: 'FORM',        assignee: 'Ivan',   age: '3d ago', desc: 'Estimate accepted, scheduling next.' },
  { id: 612, name: 'S. Patel',     email: 's.patel@mail.com',     phone: '(425) 555-0120', city: 'Mill Creek, WA',  project: 'Siding replacement',     spec: 'Siding',  conf: 0.87, status: 'CLAIMED',   source: 'MANUAL',      assignee: 'Marcus', age: '1w ago', desc: 'Four-plex, property manager contact.' },
  { id: 613, name: 'T. Ortiz',     email: null,                   phone: '(425) 555-0122', city: 'Bothell, WA',     project: 'Roof inspection',        spec: 'Roofing', conf: 0.68, status: 'ROUTED',    source: 'LEAD_CENTER', assignee: null,     age: '9h ago', desc: 'Phone-in inquiry, no email on file.' }
];

// Lead Center offers: a 24-hour window, counted down in hours/minutes.
export const OFFERS_SEED: Offer[] = [
  { id: 'o1', name: 'B. Cole',     email: null, phone: '(425) 555-0201', city: 'Bothell, WA', project: 'Fence gate + repair', spec: 'Fencing', conf: 0.89, attempt: 1, mins: 22 * 60 + 14, age: '1h ago', desc: 'Gate sags and drags; 40 ft of adjoining fence needs repair.' },
  { id: 'o2', name: 'H. Nakamura', email: 'h.nakamura@mail.com', phone: null, city: 'Redmond, WA', project: 'Deck resurfacing', spec: 'Decking', conf: 0.76, attempt: 2, mins: 3 * 60 + 41, age: '4h ago', desc: 'Frame is solid, boards need replacing. About 320 sq ft.' }
];

export const PAGE_SIZE = 20;
