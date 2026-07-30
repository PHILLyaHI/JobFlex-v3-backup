// Hire blueprint — the donor's embedded demo data, hardcoded verbatim from
// jobflex-hire-blueprint_4.html. Every id, string, phone number, role, source
// and relative timestamp is the donor's exact value; only the shape is typed.
//
// `APPLICANTS_SEED` is the seed: the behavior clones it per mount so the
// runtime mutations the donor performs (drag between columns, save, convert,
// delete, add) never leak across navigations.

export type HireColumnKey = "APPLIED" | "INTERVIEWING" | "HIRED" | "REJECTED";

export type HireColumn = {
  key: HireColumnKey;
  label: string;
  tone: string;
};

export type Applicant = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: HireColumnKey;
  source: string | null;
  age: string;
  notes: string;
};

export type HubDoor = {
  icon: string;
  kicker: string;
  title: string;
  body: string;
  cta: string;
};

export type HubTally = {
  label: string;
  value: string;
  hint: string;
};

export type HubLink = {
  icon: string;
  label: string;
  sub: string;
  goto?: string;
  soon?: boolean;
};

// Applicant: fullName, email, phone, role, status, source, notes, createdAt.
export const HK_COLUMNS: HireColumn[] = [
  { key: "APPLIED", label: "Applied", tone: "var(--blueprint)" },
  { key: "INTERVIEWING", label: "Interviewing", tone: "var(--warning)" },
  { key: "HIRED", label: "Hired", tone: "var(--success)" },
  { key: "REJECTED", label: "Rejected", tone: "var(--danger)" },
];

export const SOURCES: string[] = ["Indeed", "Referral", "Walk-in", "LinkedIn", "Job fair", "Other"];

export const AP_SEQ_START = 20;

export const APPLICANTS_SEED: Applicant[] = [
  { id: 'a1', name: 'Casey Stone',    email: 'casey.stone@mail.com',  phone: '(425) 555-0210', role: 'Roofer',            status: 'APPLIED',      source: 'Indeed',   age: '2h ago', notes: '6 years on asphalt and metal. Has own truck and basic hand tools.' },
  { id: 'a2', name: 'Priya Raman',    email: 'p.raman@mail.com',      phone: '(425) 555-0211', role: 'Estimator',         status: 'APPLIED',      source: 'LinkedIn', age: '1d ago', notes: 'Came from a fencing shop; comfortable with takeoffs and client calls.' },
  { id: 'a3', name: 'Owen Fletcher',  email: 'owen.f@mail.com',       phone: null,             role: 'Laborer',           status: 'APPLIED',      source: 'Walk-in',  age: '3d ago', notes: 'No experience, eager. Available immediately.' },
  { id: 'a4', name: 'Marisol Vega',   email: 'm.vega@mail.com',       phone: '(425) 555-0212', role: 'Foreman',           status: 'INTERVIEWING', source: 'Referral', age: '5d ago', notes: 'Referred by Marcus. Ran three-man crews for eight years.' },
  { id: 'a5', name: 'Derek Olsen',    email: 'derek.olsen@mail.com',  phone: '(425) 555-0213', role: 'Gutter installer',  status: 'INTERVIEWING', source: 'Indeed',   age: '1w ago', notes: 'Phone screen done — wants $34/hr, ok with early starts.' },
  { id: 'a6', name: 'Hana Whitmore',  email: 'hana.w@mail.com',       phone: '(425) 555-0214', role: 'Siding installer',  status: 'HIRED',        source: 'Job fair', age: '2w ago', notes: 'Starts Monday. Paperwork signed, portal invite pending.' },
  { id: 'a7', name: 'Bruno Salas',    email: 'bruno.salas@mail.com',  phone: null,             role: 'Deck carpenter',    status: 'REJECTED',     source: 'Other',    age: '3w ago', notes: 'Wanted subcontract work only; not a fit for crew slots right now.' },
];

export const HUB_DOORS: HubDoor[] = [
  { icon: 'i-search', kicker: 'For hirers', title: 'Discover talent',
    body: 'Browse worker profiles, view portfolios, and find the right contractor for your next project.',
    cta: 'Browse the marketplace' },
  { icon: 'i-userplus', kicker: 'For workers', title: 'Publish your profile',
    body: 'Showcase your skills and past work, then get discovered by companies looking to hire.',
    cta: 'Manage your profile' },
];

export const HUB_TALLY: HubTally[] = [
  { label: 'Active contracts', value: '0', hint: 'None in progress' },
  { label: 'Job posts', value: '0', hint: 'None live' },
  { label: 'Applications', value: '0', hint: 'None sent' },
];

export const HUB_LINKS: HubLink[] = [
  { icon: 'i-users',   label: 'Applicant pipeline', sub: 'Track candidates through your hiring funnel', goto: 'pipeline' },
  { icon: 'i-jobs',    label: 'Job posts',          sub: 'Manage your job listings', soon: true },
  { icon: 'i-file',    label: 'Contracts',          sub: 'View active agreements', soon: true },
  { icon: 'i-send',    label: 'Applications',       sub: "Track what you've applied to", soon: true },
];
