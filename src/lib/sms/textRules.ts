// YOUR OWN TEXTS (2026-09-29) — the pure half: what can start a text, who it
// can go to, the fill-in fields, the ready-made ideas, and the renderer.
//
// Owner: "make option for user to create new text situation by themselves".
// A company writes its own texts: WHEN something happens (or so many hours
// before a visit, so many days after a job), WHO hears it (the client, the
// office, the rep on the deal, the crew on the job, named people) and WHAT
// it says, with {fields} filled from the job. The server half is
// ./rulesEngine; the screen is components/v3/texting-people/text-rules.
//
// PURE: no db, no Twilio — the settings screen imports it for the preview.

export type RuleTriggerKey =
  | "lead.created"
  | "proposal.sent"
  | "proposal.viewed"
  | "proposal.accepted"
  | "proposal.declined"
  | "proposal.unanswered"
  | "payment.received"
  | "change_order.answered"
  | "appointment.booked"
  | "appointment.moved"
  | "appointment.cancelled"
  | "appointment.before"
  | "job.scheduled"
  | "job.before"
  | "job.started"
  | "job.completed"
  | "job.after";

export type RuleRecipient = "client" | "office" | "rep" | "crew";

export interface RuleTrigger {
  key: RuleTriggerKey;
  group: "Leads & proposals" | "Money" | "Visits" | "Jobs";
  /** "When …" — how the list reads. */
  label: string;
  /** Timed: so many hours before, or days after, instead of the moment itself. */
  timed?: { dir: "before" | "after"; unit: "hours" | "days"; min: number; max: number; default: number };
  /** Who this moment can reach — the client only when there is one with a phone. */
  recipients: readonly RuleRecipient[];
  /** The fields this moment can fill. */
  fields: readonly RuleField[];
}

export type RuleField = "client" | "first" | "company" | "phone" | "job" | "when" | "address" | "total" | "amount" | "rep" | "link" | "note";

export const RULE_FIELDS: Record<RuleField, { label: string; sample: string; sub: string }> = {
  client: { label: "{client}", sample: "Sarah Mitchell", sub: "The client's name" },
  first: { label: "{first}", sample: "Sarah", sub: "The client's first name" },
  company: { label: "{company}", sample: "Ridgeline Roofing Co.", sub: "Your company's name" },
  phone: { label: "{phone}", sample: "(206) 555-0100", sub: "Your company phone" },
  job: { label: "{job}", sample: "Standing-seam metal roof", sub: "The proposal, visit or job title" },
  when: { label: "{when}", sample: "Tue Oct 13, 8 AM–4 PM", sub: "The day and hours" },
  address: { label: "{address}", sample: "18412 92nd Ave NE", sub: "The street" },
  total: { label: "{total}", sample: "$27,926", sub: "The proposal total" },
  amount: { label: "{amount}", sample: "$8,378", sub: "The payment or change-order amount" },
  rep: { label: "{rep}", sample: "Jake Torres", sub: "The rep on the deal" },
  link: { label: "{link}", sample: "jobflex.app/p/…", sub: "The client's page, or your page for the team" },
  note: { label: "{note}", sample: "Going with a lower bid", sub: "What the client wrote" },
};

const DEAL: readonly RuleField[] = ["client", "first", "company", "phone", "job", "total", "address", "rep", "link"];
const VISIT: readonly RuleField[] = ["client", "first", "company", "phone", "job", "when", "address", "rep", "link"];
const JOB: readonly RuleField[] = ["client", "first", "company", "phone", "job", "when", "address", "total", "rep", "link"];

export const RULE_TRIGGERS: readonly RuleTrigger[] = [
  { key: "lead.created", group: "Leads & proposals", label: "A new lead comes in", recipients: ["client", "office", "rep"], fields: ["client", "first", "company", "phone", "job", "address", "rep", "link"] },
  { key: "proposal.sent", group: "Leads & proposals", label: "A proposal is sent", recipients: ["client", "office", "rep"], fields: DEAL },
  { key: "proposal.viewed", group: "Leads & proposals", label: "The client opens the proposal (first time)", recipients: ["client", "office", "rep"], fields: DEAL },
  { key: "proposal.accepted", group: "Leads & proposals", label: "A proposal is accepted", recipients: ["client", "office", "rep"], fields: DEAL },
  { key: "proposal.declined", group: "Leads & proposals", label: "A proposal is declined", recipients: ["client", "office", "rep"], fields: [...DEAL, "note"] },
  { key: "proposal.unanswered", group: "Leads & proposals", label: "No answer on a proposal", timed: { dir: "after", unit: "days", min: 1, max: 30, default: 3 }, recipients: ["client", "office", "rep"], fields: DEAL },
  { key: "payment.received", group: "Money", label: "A payment comes in", recipients: ["client", "office", "rep"], fields: [...DEAL, "amount"] },
  { key: "change_order.answered", group: "Money", label: "A change order is approved or declined", recipients: ["client", "office", "rep", "crew"], fields: [...DEAL, "amount"] },
  { key: "appointment.booked", group: "Visits", label: "An appointment is booked", recipients: ["client", "office", "rep", "crew"], fields: VISIT },
  { key: "appointment.moved", group: "Visits", label: "An appointment is moved", recipients: ["client", "office", "rep", "crew"], fields: VISIT },
  { key: "appointment.cancelled", group: "Visits", label: "An appointment is cancelled", recipients: ["client", "office", "rep", "crew"], fields: VISIT },
  { key: "appointment.before", group: "Visits", label: "Before an appointment", timed: { dir: "before", unit: "hours", min: 1, max: 72, default: 24 }, recipients: ["client", "office", "rep", "crew"], fields: VISIT },
  { key: "job.scheduled", group: "Jobs", label: "A job gets its date", recipients: ["client", "office", "rep", "crew"], fields: JOB },
  { key: "job.before", group: "Jobs", label: "Before a job day starts", timed: { dir: "before", unit: "hours", min: 1, max: 72, default: 18 }, recipients: ["client", "office", "rep", "crew"], fields: JOB },
  { key: "job.started", group: "Jobs", label: "The crew starts the job", recipients: ["client", "office", "rep"], fields: JOB },
  { key: "job.completed", group: "Jobs", label: "The job is completed", recipients: ["client", "office", "rep"], fields: JOB },
  { key: "job.after", group: "Jobs", label: "After a job is completed", timed: { dir: "after", unit: "days", min: 1, max: 60, default: 2 }, recipients: ["client", "office", "rep"], fields: JOB },
];

export const RULE_RECIPIENTS: Record<RuleRecipient, { label: string; sub: string }> = {
  client: { label: "The client", sub: "When they have a phone and Text clients is on — signed with your company, with the STOP line" },
  office: { label: "Owner & managers", sub: "Everyone in the office with a mobile on this page" },
  rep: { label: "The rep on it", sub: "Who owns the proposal, booked the visit, or has the lead" },
  crew: { label: "The crew on it", sub: "Workers put on the visit or the job, with texting on" },
};

export function triggerOf(key: string): RuleTrigger | null {
  return RULE_TRIGGERS.find((t) => t.key === key) ?? null;
}

/** "Before an appointment — 24 hours before" / "A proposal is accepted". */
export function whenText(key: string, offset: number | null | undefined): string {
  const t = triggerOf(key);
  if (!t) return key;
  if (!t.timed) return t.label;
  const n = offset ?? t.timed.default;
  const unit = t.timed.unit === "hours" ? (n === 1 ? "hour" : "hours") : n === 1 ? "day" : "days";
  return `${t.label} — ${n} ${unit} ${t.timed.dir}`;
}

/** Fill the {fields}. A field the moment cannot fill reads as nothing, and the
 *  spaces and dangling punctuation it leaves are tidied. */
export function renderRuleText(body: string, vars: Partial<Record<RuleField, string | null | undefined>>): string {
  const out = body.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k as RuleField];
    return typeof v === "string" ? v : "";
  });
  return out
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

/** The {fields} a message uses that its moment cannot fill. */
export function unknownFields(body: string, key: string): string[] {
  const t = triggerOf(key);
  const ok = new Set<string>(t?.fields ?? []);
  const used = [...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  return [...new Set(used.filter((f) => !ok.has(f)))];
}

export const SAMPLE_VARS: Record<RuleField, string> = Object.fromEntries(Object.entries(RULE_FIELDS).map(([k, v]) => [k, v.sample])) as Record<RuleField, string>;

/** The company's name leads a text — unless the words already say who it is from. */
export function signed(company: string | null | undefined, text: string): string {
  const name = (company ?? "").replace(/\s+/g, " ").trim();
  if (!name || text.toLowerCase().includes(name.toLowerCase())) return text;
  return `${name}: ${text}`;
}

/** Client texts carry the STOP line; added when the owner's words do not. */
export function withStopLine(body: string): string {
  return /\bSTOP\b/i.test(body) ? body : `${body.replace(/\s+$/, "")} Reply STOP to opt out.`;
}

export const RULE_BODY_MAX = 300;
export const MAX_RULES = 30;

export interface RulePreset {
  id: string;
  name: string;
  trigger: RuleTriggerKey;
  offset?: number;
  to: readonly RuleRecipient[];
  body: string;
}

/** Ready-made ideas: one tap fills the editor, everything stays editable. */
export const RULE_PRESETS: readonly RulePreset[] = [
  { id: "thanks-accepted", name: "Thank the client for accepting", trigger: "proposal.accepted", to: ["client"], body: "Hi {first}, thank you for choosing {company}! We'll call you within a day to schedule {job}. Questions: {phone}." },
  { id: "visit-reminder", name: "Remind the client the day before a visit", trigger: "appointment.before", offset: 24, to: ["client"], body: "Hi {first}, a reminder from {company}: we'll see you {when} at {address}. Reply here if anything changed." },
  { id: "nudge-proposal", name: "Nudge a proposal with no answer", trigger: "proposal.unanswered", offset: 3, to: ["client"], body: "Hi {first}, just checking you saw your proposal for {job} ({total}) from {company}: {link}" },
  { id: "rep-viewed", name: "Tell the rep the client opened it", trigger: "proposal.viewed", to: ["rep"], body: "{client} just opened \"{job}\" — a good moment to call." },
  { id: "crew-evening", name: "Crew heads-up before a job day", trigger: "job.before", offset: 18, to: ["crew"], body: "{when}: {job} at {address}. Questions — call {rep}." },
  { id: "payment-thanks", name: "Thank the client for a payment", trigger: "payment.received", to: ["client"], body: "Thank you, {first} — {company} received {amount} for {job}." },
  { id: "review-ask", name: "Ask for a review after the job", trigger: "job.after", offset: 2, to: ["client"], body: "Hi {first}, thank you for trusting {company} with {job}. Would you leave us a quick review? It means a lot to a local crew." },
  { id: "job-date", name: "Tell the client their install date", trigger: "job.scheduled", to: ["client"], body: "Hi {first}, {company} has you on the calendar: {job}, {when}. We'll text the evening before." },
];
