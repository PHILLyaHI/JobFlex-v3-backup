// CRM blueprint — the donor's embedded demo data, hardcoded exactly as written
// in jobflex-crm-blueprint_1.html. Same order, same values, same nulls: the
// rendered numbers (conversion rate, active leads, LTV totals, queue counts)
// are all derived from these arrays, so any edit here changes the page.
//
// `RULES_SEED` and `QUEUE_SEED` are seeds — the ported behavior mutates rules
// and the follow-up queue at runtime, so each mount clones them.

export type CrmLead = {
  name: string;
  project: string;
  status: string;
  assignee: string | null;
  age: string;
};

export type ActivityItem = { summary: string; age: string };

export type Customer = {
  id: string;
  name: string;
  email: string;
  quotes: number;
  quoted: number;
  ltv: number;
  last: string;
  top: string;
};

export type Trigger = { value: string; label: string };

export type FollowUpRule = {
  id: string;
  name: string;
  triggerStatus: string;
  delayMinutes: number;
  enabled: boolean;
  template: string | null;
};

export type QueueItem = {
  id: string;
  client: string;
  title: string | null;
  date: string;
  rel: string;
  overdue: boolean;
  days: number;
};

// Overview counts by lead: conversion = won / (won + lost), active — still in play.
export const CRM_LEADS: CrmLead[] = [
  { name: 'M. Alvarez',   project: 'Asphalt reroof',        status: 'NEW',       assignee: null,     age: '2h ago' },
  { name: 'S. Rao',       project: 'Vinyl fence, 160 ft',   status: 'NEW',       assignee: null,     age: '5h ago' },
  { name: 'J. Whitfield', project: 'Metal roof repair',     status: 'ROUTED',    assignee: 'Marcus', age: '3h ago' },
  { name: 'T. Ortiz',     project: 'Roof inspection',       status: 'ROUTED',    assignee: null,     age: '9h ago' },
  { name: 'T. Bishop',    project: 'Skylight install',      status: 'CLAIMED',   assignee: 'Ivan',   age: '6h ago' },
  { name: 'S. Patel',     project: 'Siding replacement',    status: 'CLAIMED',   assignee: 'Marcus', age: '1w ago' },
  { name: 'R. Okafor',    project: 'Gutter replacement',    status: 'CONTACTED', assignee: 'Marcus', age: '1d ago' },
  { name: 'L. Wong',      project: 'Pergola build',         status: 'CONTACTED', assignee: 'Sofia',  age: '6d ago' },
  { name: 'M. Henderson', project: 'Asphalt reroof',        status: 'QUOTED',    assignee: 'Ivan',   age: '2d ago' },
  { name: 'A. Kim',       project: 'Composite deck rebuild',status: 'QUOTED',    assignee: 'Ivan',   age: '3d ago' },
  { name: 'D. Reyes',     project: 'Cedar fence, 140 ft',   status: 'WON',       assignee: 'Ivan',   age: '4d ago' },
  { name: 'K. Sorensen',  project: 'Cedar fence, 90 ft',    status: 'WON',       assignee: 'Sofia',  age: '1w ago' },
  { name: 'C. Ferreira',  project: 'Asphalt reroof',        status: 'WON',       assignee: 'Ivan',   age: '2w ago' },
  { name: 'P. Delgado',   project: 'Vinyl fence, 220 ft',   status: 'LOST',      assignee: 'Marcus', age: '2w ago' },
  { name: 'R. Tran',      project: 'Deck power wash',       status: 'LOST',      assignee: 'Sofia',  age: '3w ago' }
];

export const CONVERSATIONS_COUNT: number = 12;

export const ACTIVITY_FEED: ActivityItem[] = [
  { summary: 'Proposal #2851 sent to M. Henderson', age: '25m ago' },
  { summary: 'New lead: cedar fence, 140 ft — Bothell', age: '1h ago' },
  { summary: 'SMS reply from D. Reyes', age: '1h ago' },
  { summary: 'Invoice #1032 paid — $8,400', age: '3h ago' },
  { summary: 'Tear-off scheduled at 4812 Maple Ave', age: '5h ago' },
  { summary: 'Client added: R. Tran', age: '8h ago' }
];

// Customer book: clients with >=1 proposal, sorted by LTV
export const CUSTOMERS_DATA: Customer[] = [
  { id: 'c1', name: 'Cascade PM',      email: 'ops@cascadepm.com',    quotes: 9, quoted: 96400,  ltv: 78200, last: '4h ago',  top: 'PAID' },
  { id: 'c2', name: 'Northgate LLC',   email: 'facilities@ngllc.com', quotes: 6, quoted: 128900, ltv: 61400, last: '3d ago',  top: 'ACCEPTED' },
  { id: 'c3', name: 'M. Henderson',    email: 'm.henderson@mail.com', quotes: 3, quoted: 41200,  ltv: 24800, last: '25m ago', top: 'VIEWED' },
  { id: 'c4', name: 'C. Ferreira',     email: 'c.ferreira@mail.com',  quotes: 2, quoted: 18000,  ltv: 18000, last: '2w ago',  top: 'PAID' },
  { id: 'c5', name: 'S. Patel',        email: 's.patel@mail.com',     quotes: 4, quoted: 52300,  ltv: 14600, last: '1w ago',  top: 'SENT' },
  { id: 'c6', name: 'D. Reyes',        email: 'd.reyes@mail.com',     quotes: 2, quoted: 18600,  ltv: 6200,  last: '1d ago',  top: 'ACCEPTED' },
  { id: 'c7', name: 'K. Sorensen',     email: 'k.sorensen@mail.com',  quotes: 1, quoted: 6200,   ltv: 6200,  last: '1w ago',  top: 'PAID' },
  { id: 'c8', name: 'A. Kim',          email: 'a.kim@mail.com',       quotes: 1, quoted: 21500,  ltv: 0,     last: '2d ago',  top: 'ACCEPTED' },
  { id: 'c9', name: 'T. Bishop',       email: 't.bishop@mail.com',    quotes: 2, quoted: 14300,  ltv: 0,     last: '2w ago',  top: 'VIEWED' },
  { id: 'c10', name: 'L. Wong',        email: 'l.wong@mail.com',      quotes: 2, quoted: 22600,  ltv: 0,     last: '6d ago',  top: 'SENT' },
  { id: 'c11', name: 'R. Okafor',      email: 'r.okafor@mail.com',    quotes: 1, quoted: 3800,   ltv: 0,     last: '6h ago',  top: 'DRAFT' },
  { id: 'c12', name: 'P. Delgado',     email: 'p.delgado@mail.com',   quotes: 1, quoted: 11300,  ltv: 0,     last: '1w ago',  top: 'EXPIRED' },
  { id: 'c13', name: 'R. Tran',        email: 'r.tran@mail.com',      quotes: 1, quoted: 1900,   ltv: 0,     last: '4d ago',  top: 'DECLINED' }
];

export const STATUS_ORDER = ['PAID', 'ACCEPTED', 'VIEWED', 'SENT', 'DRAFT', 'DECLINED', 'EXPIRED', 'ARCHIVED'];

export const STATUS_CLS: Record<string, string> = {
  PAID: 'pstatus--paid', ACCEPTED: 'pstatus--accepted', VIEWED: 'pstatus--viewed',
  SENT: 'pstatus--sent', DRAFT: '', DECLINED: 'pstatus--declined',
  EXPIRED: 'pstatus--expired', ARCHIVED: ''
};

export const STATUS_DOT: Record<string, string> = {
  PAID: 'var(--success-dark)', ACCEPTED: 'var(--success)', VIEWED: 'var(--blueprint)',
  SENT: 'var(--sky)', DRAFT: 'var(--muted-faint)', DECLINED: 'var(--danger)',
  EXPIRED: 'var(--warning)', ARCHIVED: 'var(--muted-faint)'
};

// Workflows: FollowUpRule — name, triggerStatus, delayMinutes, enabled, template
export const TRIGGERS: Trigger[] = [
  { value: 'SENT', label: 'Proposal sent' }, { value: 'VIEWED', label: 'Proposal viewed' },
  { value: 'ACCEPTED', label: 'Proposal accepted' }, { value: 'PAID', label: 'Proposal paid' },
  { value: 'DECLINED', label: 'Proposal declined' }
];

export const TEMPLATES = ['nudge-after-send', 'viewed-no-reply', 'thanks-and-review', 'win-back'];

export const RULE_SEQ_START = 20;

export const RULES_SEED: FollowUpRule[] = [
  { id: 'r1', name: 'Nudge after send',      triggerStatus: 'SENT',     delayMinutes: 60 * 24 * 2, enabled: true,  template: 'nudge-after-send' },
  { id: 'r2', name: 'Viewed but quiet',      triggerStatus: 'VIEWED',   delayMinutes: 60 * 24,     enabled: true,  template: 'viewed-no-reply' },
  { id: 'r3', name: 'Thank you + review',    triggerStatus: 'PAID',     delayMinutes: 60 * 24 * 3, enabled: true,  template: 'thanks-and-review' },
  { id: 'r4', name: 'Win-back after decline',triggerStatus: 'DECLINED', delayMinutes: 60 * 24 * 30, enabled: false, template: 'win-back' }
];

// Follow-up queue: unfinished, ascending by runAt
export const QUEUE_SEED: QueueItem[] = [
  { id: 'f1', client: 'M. Henderson', title: 'Asphalt reroof — 4812 Maple Ave', date: 'Jul 19, 2026', rel: '3d ago',    overdue: true,  days: 3 },
  { id: 'f2', client: 'T. Bishop',    title: 'Skylight + solar tube combo',     date: 'Jul 14, 2026', rel: '8d ago',    overdue: true,  days: 8 },
  { id: 'f3', client: 'L. Wong',      title: 'Pergola build',                   date: 'Jul 22, 2026', rel: 'today',     overdue: true,  days: 0 },
  { id: 'f4', client: 'S. Patel',     title: 'Siding replacement',              date: 'Jul 21, 2026', rel: '1d ago',    overdue: true,  days: 1 },
  { id: 'f5', client: 'A. Kim',       title: 'Composite deck rebuild',          date: 'Jul 24, 2026', rel: 'in 2 days', overdue: false, days: 0 },
  { id: 'f6', client: 'R. Okafor',    title: 'Gutter replacement',              date: 'Jul 26, 2026', rel: 'in 4 days', overdue: false, days: 0 },
  { id: 'f7', client: 'K. Marsh',     title: 'Skylight install',                date: 'Jul 29, 2026', rel: 'in 1 week', overdue: false, days: 0 },
  { id: 'f8', client: 'C. Ferreira',  title: null,                              date: 'Aug 02, 2026', rel: 'in 11 days',overdue: false, days: 0 }
];

export const Q_PAGE = 20;
