/**
 * Fixture content for the Settings blueprint page.
 *
 * Every literal below is transcribed VERBATIM from the donor file
 * `jobflex-settings-blueprint (6).html`, lines 2004-2131. HTML entities are
 * stored as their real characters (¢ – — • & £ € ✓). Nothing here is derived
 * or rounded — if a value is in the donor, this is that exact value.
 *
 * Presentational only: no server actions, no API calls, no Prisma.
 */

/* ------------------------------------------------------------------ */
/* Shared primitive types                                              */
/* ------------------------------------------------------------------ */

/** Every sprite symbol id used by the settings page. */
export type IconName =
  | 'i-arrow'
  | 'i-bank'
  | 'i-bell'
  | 'i-board'
  | 'i-box'
  | 'i-cal'
  | 'i-card'
  | 'i-check'
  | 'i-clock'
  | 'i-download'
  | 'i-ext'
  | 'i-eye-off'
  | 'i-file'
  | 'i-globe'
  | 'i-google'
  | 'i-hardhat'
  | 'i-hourglass'
  | 'i-pen'
  | 'i-phone'
  | 'i-plus'
  | 'i-receipt'
  | 'i-send'
  | 'i-target'
  | 'i-thumb'
  | 'i-trash'
  | 'i-undo'
  | 'i-users'
  | 'i-x';

/** Donor `.badge2` tone classes. */
export type BadgeTone = 'bg-live' | 'bg-ok' | 'bg-off' | 'bg-bad';

export interface Badge {
  readonly label: string;
  readonly tone: BadgeTone;
}

/** Donor `.sc-h` card header. */
export interface CardHead {
  readonly title: string;
  readonly sub: string;
  readonly badge?: Badge;
}

/** Donor `.fld > .fin` text input. */
export interface FieldSpec {
  readonly label: string;
  readonly value: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
}

/** Donor `.trow` — a labelled row whose only control is a `.tg` switch. */
export interface ToggleRow {
  readonly name: string;
  readonly desc: string;
  readonly on: boolean;
}

/** A `.btn` inside a row / card. */
export interface ActionSpec {
  readonly label: string;
  readonly icon?: IconName;
  /** Donor `.btn-ghost` state modifier: `is-on` (blueprint) / `is-off` (bad). */
  readonly state?: 'is-on' | 'is-off';
}

/** A custom `Sel` dropdown: donor `<option>` list + the `selected` one. */
export interface SelectSpec {
  readonly label: string;
  readonly options: readonly string[];
  readonly defaultValue: string;
}

/* ------------------------------------------------------------------ */
/* Page chrome                                                         */
/* ------------------------------------------------------------------ */

export const PAGE_TITLE = 'Settings' as const;

/** `.pane-k` eyebrow above every pane title. */
export const PANE_KICKER = 'Settings' as const;

/** `.page-actions` button. */
export const HELP_ACTION: ActionSpec = { label: 'Help center', icon: 'i-ext' };

export const SAVE_LABEL = 'Save changes' as const;
export const SAVED_LABEL = 'Saved' as const;
export const COPY_LABEL = 'Copy' as const;
export const COPIED_LABEL = 'Copied' as const;

/* ------------------------------------------------------------------ */
/* Rail                                                                */
/* ------------------------------------------------------------------ */

export type RailKey =
  | 'account'
  | 'payments'
  | 'billing'
  | 'integrations'
  | 'notifications';

export interface RailItem {
  readonly key: RailKey;
  readonly label: string;
  readonly icon: IconName;
  /** Renders the `.rail-new` NEW badge. The `.kicker` still reads `label`. */
  readonly isNew?: boolean;
}

export const RAIL_ITEMS: readonly RailItem[] = [
  { key: 'account', label: 'Account', icon: 'i-users' },
  { key: 'payments', label: 'Payments', icon: 'i-card' },
  { key: 'billing', label: 'Billing', icon: 'i-receipt' },
  { key: 'integrations', label: 'Integrations', icon: 'i-globe' },
  { key: 'notifications', label: 'Notifications', icon: 'i-bell', isNew: true },
];

export const RAIL_NEW_BADGE = 'NEW' as const;

/** Donor default `.kicker` text (matches the initially active rail item). */
export const DEFAULT_RAIL: RailKey = 'account';

/* ------------------------------------------------------------------ */
/* Account pane                                                        */
/* ------------------------------------------------------------------ */

export const PROFILE_CARD: CardHead = {
  title: 'Profile',
  sub: 'Visible to your team and on outgoing emails.',
  badge: { label: 'Owner', tone: 'bg-live' },
};

export const PROFILE_FIELDS: readonly FieldSpec[] = [
  { label: 'Full name', value: 'Ivan Petrov' },
  { label: 'Email', value: 'ivan@patelroofing.com', disabled: true },
  { label: 'Phone', value: '(425) 555-0142' },
  { label: 'Role', value: 'Owner', disabled: true },
];

export const BUSINESS_CARD: CardHead = {
  title: 'Business',
  sub: 'Shown on proposals, invoices and your public portal.',
};

export const BUSINESS_FIELDS: readonly FieldSpec[] = [
  { label: 'Business name', value: 'Patel Roofing & Co.' },
  { label: 'Address', value: '1820 Monte Villa Pkwy, Bothell, WA 98021' },
  { label: 'Website', value: 'patelroofing.com' },
  { label: 'License №', value: 'WA-2847' },
];

export const SECURITY_CARD: CardHead = {
  title: 'Security',
  sub: 'Password, two-factor and where you are signed in.',
};

/** F1 renders these three as one row of three `.seccol` columns. */
export interface SecurityItem {
  readonly icon: IconName;
  readonly name: string;
  readonly desc: string;
  readonly action: string;
  readonly badge?: Badge;
}

export const SECURITY_ITEMS: readonly SecurityItem[] = [
  {
    icon: 'i-eye-off',
    name: 'Password',
    desc: 'Last changed 4 months ago.',
    action: 'Change',
  },
  {
    icon: 'i-phone',
    name: 'Two-factor authentication',
    desc: 'Codes by SMS to (425) 555-0142.',
    action: 'Turn on',
    badge: { label: 'Off', tone: 'bg-off' },
  },
  {
    icon: 'i-users',
    name: 'Active sessions',
    desc: '3 devices · Bothell WA, Seattle WA, iPhone.',
    action: 'Sign out all',
  },
];

export const DANGER_CARD: CardHead = {
  title: 'Danger zone',
  sub: 'Irreversible. Exports run first.',
  badge: { label: 'Owner only', tone: 'bg-bad' },
};

export interface DangerZoneCopy {
  readonly name: string;
  readonly desc: string;
  readonly action: ActionSpec;
}

/** F2 puts `action` at the right end of the title+description row. */
export const DANGER_ZONE: DangerZoneCopy = {
  name: 'Delete organization',
  desc:
    'Removes clients, proposals, jobs and payment history for Patel Roofing & Co. Cannot be undone.',
  action: { label: 'Delete', icon: 'i-trash' },
};

/* ------------------------------------------------------------------ */
/* Payments pane — processors                                          */
/* ------------------------------------------------------------------ */

export const PROCESSORS_CARD: CardHead = {
  title: 'Processors',
  sub: 'Toggle the methods clients see at checkout.',
  badge: { label: 'Live', tone: 'bg-live' },
};

export interface Processor {
  readonly icon: IconName;
  readonly name: string;
  readonly desc: string;
  /** Donor `.prow-conn` sub-line. */
  readonly conn?: string;
  readonly action: ActionSpec;
}

/**
 * F3: ACH bank transfer gains the same Connect action as Square / PayPal.
 * F4: no `.tg` toggles on processor rows — the row carries only its button.
 * F5: the "Add a processor" `.sactions` block is removed entirely.
 */
export const PROCESSORS: readonly Processor[] = [
  {
    icon: 'i-card',
    name: 'Stripe',
    desc: 'Cards, Apple Pay, Google Pay. Fee 2.9% + 30¢.',
    conn: 'Connected · acct_1Q7f…',
    action: { label: 'Disconnect', icon: 'i-x', state: 'is-off' },
  },
  {
    icon: 'i-bank',
    name: 'Square',
    desc: 'Cards + ACH for U.S. accounts. Fee 2.6% + 10¢.',
    action: { label: 'Connect', icon: 'i-plus', state: 'is-on' },
  },
  {
    icon: 'i-card',
    name: 'PayPal',
    desc: 'PayPal balance, cards, Pay Later.',
    action: { label: 'Connect', icon: 'i-plus', state: 'is-on' },
  },
  {
    icon: 'i-bank',
    name: 'ACH bank transfer',
    desc: 'Lower fees on large jobs. 1–3 business days to clear.',
    conn: 'Via Stripe',
    action: { label: 'Connect', icon: 'i-plus', state: 'is-on' },
  },
];

/* ------------------------------------------------------------------ */
/* Payments pane — payout account                                      */
/* ------------------------------------------------------------------ */

/** F8: the `bg-ok` "Verified" badge is deleted from this card header. */
export const PAYOUT_CARD: CardHead = {
  title: 'Payout account',
  sub: 'Where cleared money lands.',
};

export interface PayoutAccount {
  readonly icon: IconName;
  readonly name: string;
  readonly desc: string;
  readonly badge: Badge;
  readonly action: ActionSpec;
}

export const PAYOUT_ACCOUNT: PayoutAccount = {
  icon: 'i-bank',
  name: 'Washington Federal · checking •••• 3391',
  desc: 'Default payout destination · verified.',
  badge: { label: 'Default', tone: 'bg-ok' },
  action: { label: 'Replace', icon: 'i-undo' },
};

/** F11: this button opens the Add-payout-account modal. */
export const ADD_PAYOUT_ACTION: ActionSpec = {
  label: 'Add payout account',
  icon: 'i-plus',
};

export const PAYOUT_SCHEDULE_OPTIONS: readonly string[] = [
  'Daily',
  'Every Friday',
  '1st and 15th',
  'Monthly',
];
export const PAYOUT_SCHEDULE_DEFAULT = 'Every Friday' as const;

/* ------------------------------------------------------------------ */
/* Payments pane — defaults                                            */
/* ------------------------------------------------------------------ */

export const PAYMENT_DEFAULTS_CARD: CardHead = {
  title: 'Defaults',
  sub: 'Used on every new proposal and invoice.',
};

export const CURRENCY_OPTIONS: readonly string[] = [
  'USD · $',
  'CAD · $',
  'GBP · £',
  'EUR · €',
];
export const CURRENCY_DEFAULT = 'USD · $' as const;

export const NET_TERMS_OPTIONS: readonly string[] = [
  'Due on receipt',
  'Net 7',
  'Net 14',
  'Net 30',
];
export const NET_TERMS_DEFAULT = 'Net 14' as const;

/** The two plain text inputs in the Defaults `.fgrid` (Deposit %, Late fee). */
export const PAYMENT_DEFAULT_FIELDS: readonly FieldSpec[] = [
  { label: 'Deposit %', value: '30' },
  { label: 'Late fee', value: '1.5%' },
];

/* ------------------------------------------------------------------ */
/* Payments pane — automations + compliance                            */
/* ------------------------------------------------------------------ */

export const PAYMENT_AUTOMATIONS_CARD: CardHead = {
  title: 'Automations',
  sub: 'Quiet, persistent reminders.',
};

export const PAYMENT_AUTOMATIONS: readonly ToggleRow[] = [
  {
    name: 'Auto-remind on overdue invoices',
    desc: 'Day 1, day 7, day 14 after due date.',
    on: true,
  },
  {
    name: 'Apply late fees automatically',
    desc: 'Adds the late fee to the next invoice.',
    on: true,
  },
  {
    name: 'Receipts on payment',
    desc: 'Emails the client a receipt the moment a payment clears.',
    on: true,
  },
];

/** F9: the `bg-ok` "Verified" badge is deleted from this card header. */
export const COMPLIANCE_CARD: CardHead = {
  title: 'Compliance',
  sub: 'Required for processor verification.',
};

/** The `.mono-box > code` copy (no Copy button on this one in the donor). */
export const COMPLIANCE_NOTE =
  'Business documents are on file with Stripe. Update them at stripe.com/dashboard if your tax ID, address, or beneficial owner changes.' as const;

/** Extra ghost button that sits beside Save changes on the Compliance card. */
export const SEND_TEST_CHARGE_ACTION: ActionSpec = {
  label: 'Send test charge',
  icon: 'i-send',
};

/* ------------------------------------------------------------------ */
/* Billing pane                                                        */
/* ------------------------------------------------------------------ */

export const PLAN_CARD: CardHead = {
  title: 'Your plan',
  sub: 'Active subscription',
  badge: { label: 'Active', tone: 'bg-ok' },
};

export interface PlanSummary {
  readonly name: string;
  readonly nextBill: string;
  readonly seats: string;
  readonly primaryAction: ActionSpec;
  readonly secondaryAction: ActionSpec;
}

export const PLAN_SUMMARY: PlanSummary = {
  name: 'Professional',
  nextBill: 'Next bill · August 1, 2026',
  seats: 'Seats used · 3 of 5',
  primaryAction: { label: 'Change plan', icon: 'i-arrow' },
  secondaryAction: { label: 'Cancel', icon: 'i-undo' },
};

export const PAYMENT_METHODS_CARD: CardHead = {
  title: 'Payment methods',
  sub: 'Charged on the first of each month.',
};

export interface PaymentMethod {
  readonly icon: IconName;
  readonly name: string;
  /** Rendered in its own flex slot straight after the `.prow-b` text block. */
  readonly badge?: Badge;
  readonly desc: string;
  readonly action: ActionSpec;
  /** aria-label on the trailing `.icon-sm` button. */
  readonly removeLabel: string;
}

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  {
    icon: 'i-card',
    name: 'Visa •••• 4242',
    badge: { label: 'Default', tone: 'bg-ok' },
    desc: 'Exp 08 / 27 · Ivan Petrov',
    action: { label: 'Edit', icon: 'i-pen' },
    removeLabel: 'Remove',
  },
  {
    icon: 'i-card',
    name: 'Mastercard •••• 8821',
    desc: 'Exp 02 / 28 · Ivan Petrov',
    action: { label: 'Make default', icon: 'i-check', state: 'is-on' },
    removeLabel: 'Remove',
  },
];

export const ADD_PAYMENT_METHOD_ACTION: ActionSpec = {
  label: 'Add payment method',
  icon: 'i-plus',
};
export const BILLING_DETAILS_ACTION: ActionSpec = {
  label: 'Billing details',
  icon: 'i-receipt',
};

export const PLANS_CARD: CardHead = {
  title: 'Plans',
  sub: 'What each tier unlocks.',
};

/** F14: this table renders through `.stab`, never `.ptab`. */
export const PLANS_COLUMNS: readonly string[] = [
  'Plan',
  'Seats',
  'Proposals',
  'Estimators',
  'Price / mo',
];

/** Donor `style="min-width:560px"` on the Plans table. */
export const PLANS_TABLE_MIN_WIDTH = '560px' as const;

export interface PlanRow {
  readonly plan: string;
  readonly seats: string;
  readonly proposals: string;
  readonly estimators: string;
  readonly price: string;
  /** Donor `<tr class="cur">` — the subscribed tier. */
  readonly current: boolean;
}

export const PLANS: readonly PlanRow[] = [
  {
    plan: 'Starter',
    seats: '1',
    proposals: '25 / mo',
    estimators: '—',
    price: '$0',
    current: false,
  },
  {
    plan: 'Professional',
    seats: '5',
    proposals: 'Unlimited',
    estimators: 'Roof + fence',
    price: '$79',
    current: true,
  },
  {
    plan: 'Advanced',
    seats: 'Unlimited',
    proposals: 'Unlimited',
    estimators: 'All estimators',
    price: '$149',
    current: false,
  },
];

export const BILLING_CONTACT_CARD: CardHead = {
  title: 'Billing contact',
  sub: 'Where invoices and dunning notices go.',
};

export const BILLING_CONTACT_FIELDS: readonly FieldSpec[] = [
  { label: 'Billing email', value: 'billing@patelroofing.com' },
  { label: 'Tax ID', value: '', placeholder: 'EIN 00-0000000' },
];

export const PAYMENT_HISTORY_CARD: CardHead = {
  title: 'Payment history',
  sub: 'Last twelve settled charges.',
};

/** F14: this table renders through `.stab`, never `.ptab`. */
export const PAYMENT_HISTORY_COLUMNS: readonly string[] = [
  'Date',
  'Description',
  'Amount',
  'Invoice',
];

/** Donor `style="min-width:480px"` on the Payment history table. */
export const PAYMENT_HISTORY_TABLE_MIN_WIDTH = '480px' as const;

export interface PaymentHistoryRow {
  readonly date: string;
  readonly description: string;
  readonly amount: string;
  readonly invoiceLabel: string;
  readonly invoiceIcon: IconName;
}

export const PAYMENT_HISTORY: readonly PaymentHistoryRow[] = [
  {
    date: 'Jul 01, 2026',
    description: 'Professional · monthly',
    amount: '$79.00',
    invoiceLabel: 'PDF',
    invoiceIcon: 'i-download',
  },
  {
    date: 'Jun 01, 2026',
    description: 'Professional · monthly',
    amount: '$79.00',
    invoiceLabel: 'PDF',
    invoiceIcon: 'i-download',
  },
  {
    date: 'May 01, 2026',
    description: 'Professional · monthly',
    amount: '$79.00',
    invoiceLabel: 'PDF',
    invoiceIcon: 'i-download',
  },
  {
    date: 'Apr 01, 2026',
    description: 'Professional · monthly',
    amount: '$79.00',
    invoiceLabel: 'PDF',
    invoiceIcon: 'i-download',
  },
  {
    date: 'Mar 01, 2026',
    description: 'Professional · monthly',
    amount: '$79.00',
    invoiceLabel: 'PDF',
    invoiceIcon: 'i-download',
  },
  {
    date: 'Feb 01, 2026',
    description: 'Starter → Professional',
    amount: '$79.00',
    invoiceLabel: 'PDF',
    invoiceIcon: 'i-download',
  },
];

/* ------------------------------------------------------------------ */
/* Integrations pane — subtabs                                         */
/* ------------------------------------------------------------------ */

export type SubTabKey = 'gmail' | 'meta' | 'email';

export interface SubTab {
  readonly key: SubTabKey;
  readonly label: string;
}

export const INTEGRATION_SUBTABS: readonly SubTab[] = [
  { key: 'gmail', label: 'Gmail' },
  { key: 'meta', label: 'Meta business' },
  { key: 'email', label: 'Email templates' },
];

export const DEFAULT_SUBTAB: SubTabKey = 'gmail';

/* ------------------------------------------------------------------ */
/* Integrations — Gmail                                                */
/* ------------------------------------------------------------------ */

export const GMAIL_CONNECTION_CARD: CardHead = {
  title: 'Connection',
  sub: 'Send proposals and follow-ups from your own address.',
  badge: { label: 'Not connected', tone: 'bg-off' },
};

export const GMAIL_CONNECT_ACTION: ActionSpec = {
  label: 'Connect Gmail',
  icon: 'i-google',
};

export const GMAIL_FROM_CARD: CardHead = {
  title: 'From address',
  sub: 'How outbound mail is signed.',
};

export const GMAIL_FROM_FIELDS: readonly FieldSpec[] = [
  { label: 'Display name', value: '', placeholder: 'Patel Roofing & Co.' },
  { label: 'Reply-to address', value: '', placeholder: 'ivan@patelroofing.com' },
];

export const SIGNATURE_OPTIONS: readonly string[] = [
  'Brand signature',
  'Personal signature',
  'No signature',
];
export const SIGNATURE_DEFAULT = 'Brand signature' as const;

export const GMAIL_BEHAVIOR_CARD: CardHead = {
  title: 'Behavior',
  sub: 'Quietly improve every send.',
};

export const GMAIL_BEHAVIOR_TOGGLES: readonly ToggleRow[] = [
  {
    name: 'Send from my Gmail',
    desc: 'Outbound mail leaves from your connected address.',
    on: true,
  },
  {
    name: 'Track opens',
    desc: 'Adds an invisible pixel so you know when it landed.',
    on: true,
  },
  {
    name: 'Two-way thread sync',
    desc: 'Replies come back into JobFlex conversations.',
    on: false,
  },
];

export const GMAIL_PERMISSIONS_CARD: CardHead = {
  title: 'Permissions',
  sub: 'Granted scopes — you can review or revoke any time.',
};

/** Donor `&#10003;` inside each `.scope > i`. */
export const SCOPE_CHECK = '✓' as const;

export const GMAIL_SCOPES: readonly string[] = [
  'gmail.send',
  'gmail.readonly',
  'gmail.modify',
  'userinfo.email',
];

/* ------------------------------------------------------------------ */
/* Integrations — Meta business                                        */
/* ------------------------------------------------------------------ */

export const META_CONNECTION_CARD: CardHead = {
  title: 'Connection',
  sub: 'Pull Facebook and Instagram leads straight into JobFlex.',
  badge: { label: 'Connected', tone: 'bg-ok' },
};

export interface MetaConnection {
  readonly icon: IconName;
  readonly name: string;
  readonly desc: string;
  /** F15: rendered side by side, kept toward the left of the row. */
  readonly actions: readonly ActionSpec[];
}

export const META_CONNECTION: MetaConnection = {
  icon: 'i-globe',
  name: 'Patel Roofing & Co.',
  desc: 'App ID 8842… · connected Feb 12, 2026.',
  actions: [{ label: 'Test event' }, { label: 'Disconnect' }],
};

export interface CopyField {
  readonly label: string;
  readonly value: string;
}

export const META_CALLBACK_URL: CopyField = {
  label: 'Callback URL',
  value: 'https://api.jobflex.com/webhooks/meta',
};

export const META_VERIFY_TOKEN: CopyField = {
  label: 'Verify token',
  value: 'jf_mt_8f42c1d90ba7',
};

export const META_LEAD_CARD: CardHead = {
  title: 'Default lead handling',
  sub: 'What we do the second a form arrives.',
};

export const META_PAGE_OPTIONS: readonly string[] = [
  'Patel Roofing & Co.',
  'Patel Roofing — Austin',
  'Patel Roofing — Dallas',
];
export const META_PAGE_DEFAULT = 'Patel Roofing & Co.' as const;

export const META_CATEGORY_OPTIONS: readonly string[] = [
  'Auto-detect from form name',
  'Always Roofing',
  'Always Fencing',
  'Always Other',
];
export const META_CATEGORY_DEFAULT = 'Auto-detect from form name' as const;

export const META_LEAD_TOGGLES: readonly ToggleRow[] = [
  {
    name: 'Auto-create Lead',
    desc: 'Every submission becomes a lead in the pipeline.',
    on: true,
  },
  {
    name: 'Auto-text the prospect',
    desc: 'Sends the first touch within a minute.',
    on: true,
  },
];

export const WEBHOOKS_CARD: CardHead = {
  title: 'Recent webhook deliveries',
  sub: 'Last 24 hours.',
};

export interface WebhookDelivery {
  readonly status: string;
  readonly detail: string;
  readonly time: string;
  /** Donor `<b class="err">` on the non-2xx row. */
  readonly error: boolean;
}

export const WEBHOOK_DELIVERIES: readonly WebhookDelivery[] = [
  {
    status: '200',
    detail: 'lead_gen · Patel Roofing & Co.',
    time: '2 min ago',
    error: false,
  },
  {
    status: '200',
    detail: 'lead_gen · Patel Roofing — Austin',
    time: '41 min ago',
    error: false,
  },
  {
    status: '200',
    detail: 'lead_gen · Patel Roofing & Co.',
    time: '3 h ago',
    error: false,
  },
  { status: '410', detail: 'page unsubscribed', time: '9 h ago', error: true },
];

/* ------------------------------------------------------------------ */
/* Integrations — Email templates                                      */
/* ------------------------------------------------------------------ */

export const EMAIL_TEMPLATES_CARD: CardHead = {
  title: 'Templates',
  sub: 'Reusable copy behind Send, Thank-you, Reminder and every follow-up rule.',
};

export const EMAIL_TEMPLATE_NEW_ACTION: ActionSpec = {
  label: 'New',
  icon: 'i-plus',
};

export interface EmailTemplate {
  readonly kind: string;
  readonly subject: string;
  readonly trigger: string;
  readonly editLabel: string;
}

export const EMAIL_TEMPLATES: readonly EmailTemplate[] = [
  {
    kind: 'Send',
    subject: 'Your estimate from {{org}}',
    trigger: 'Proposal sent',
    editLabel: 'Edit',
  },
  {
    kind: 'Reminder',
    subject: 'Still thinking it over?',
    trigger: 'Follow-up · day 3',
    editLabel: 'Edit',
  },
  {
    kind: 'Thank-you',
    subject: 'Thanks for choosing {{org}}',
    trigger: 'Thank you',
    editLabel: 'Edit',
  },
  {
    kind: 'Review',
    subject: 'How was the work?',
    trigger: 'Review request',
    editLabel: 'Edit',
  },
];

export interface NoteCopy {
  readonly icon: IconName;
  readonly title: string;
  readonly bodyStart: string;
  readonly code1: string;
  readonly bodyMid: string;
  readonly code2: string;
  readonly bodyEnd: string;
}

/**
 * F18: this note no longer lives in its own `<section class="sc">` — it is
 * appended inside the Templates card `.sc-b` with `margin-top:14px`.
 */
export const EMAIL_TEMPLATES_NOTE: NoteCopy = {
  icon: 'i-bell',
  title: 'Email is not configured.',
  bodyStart:
    'Templates still save and the preview works, but outgoing mail is a no-op until ',
  code1: 'RESEND_API_KEY',
  bodyMid: ' or ',
  code2: 'SMTP_*',
  bodyEnd: ' is set.',
};

/* ------------------------------------------------------------------ */
/* Notifications pane                                                  */
/* ------------------------------------------------------------------ */

export const NOTIFICATIONS_CARD: CardHead = {
  title: 'What reaches you',
  sub: 'Pick a channel per event. In-app always keeps a copy in the bell.',
  badge: { label: '14 events', tone: 'bg-live' },
};

/** Column order is load-bearing: index 1 is the "Email only" column. */
export const NOTIFICATION_CHANNELS: readonly string[] = [
  'In-app',
  'Email',
  'SMS',
];

/** F17: the per-column `.colt` badge becomes a real `.colw` toggle. */
export const NOTIFICATION_COLUMN_LABEL = 'All' as const;

export const NOTIFICATION_EVENT_COLUMN = 'Event' as const;

/** `[in-app, email, sms]` — donor `aria-checked` values, row by row. */
export type NotificationChannels = readonly [boolean, boolean, boolean];

export interface NotificationEvent {
  /** F16 icon map. */
  readonly icon: IconName;
  readonly name: string;
  readonly sub: string;
  readonly channels: NotificationChannels;
}

export const NOTIFICATION_EVENTS: readonly NotificationEvent[] = [
  {
    icon: 'i-target',
    name: 'New lead assigned',
    sub: 'A platform or web lead lands in your pipeline',
    channels: [true, true, true],
  },
  {
    icon: 'i-hourglass',
    name: 'Lead offer expiring',
    sub: 'Under two hours left to accept',
    channels: [true, true, true],
  },
  {
    icon: 'i-file',
    name: 'Proposal viewed',
    sub: 'The client opened your estimate',
    channels: [true, false, false],
  },
  {
    icon: 'i-check',
    name: 'Proposal accepted',
    sub: 'Signed and ready to schedule',
    channels: [true, true, true],
  },
  {
    icon: 'i-x',
    name: 'Proposal declined',
    sub: 'With the reason the client gave',
    channels: [true, true, false],
  },
  {
    icon: 'i-bank',
    name: 'Payment received',
    sub: 'A deposit or installment cleared',
    channels: [true, true, false],
  },
  {
    icon: 'i-clock',
    name: 'Payment overdue',
    sub: 'Past the net terms on an invoice',
    channels: [true, true, true],
  },
  {
    icon: 'i-pen',
    name: 'Change order submitted',
    sub: 'Waiting on client approval',
    channels: [true, true, false],
  },
  {
    icon: 'i-cal',
    name: 'Job scheduled',
    sub: 'A crew is booked for a date',
    channels: [true, false, false],
  },
  {
    icon: 'i-box',
    name: 'Job completed',
    sub: 'Crew marked the work done',
    channels: [true, true, false],
  },
  {
    icon: 'i-hardhat',
    name: 'Worker responded',
    sub: 'Accepted or declined an assignment',
    channels: [true, false, true],
  },
  {
    icon: 'i-thumb',
    name: 'Review received',
    sub: 'A homeowner left a rating',
    channels: [true, true, false],
  },
  {
    icon: 'i-board',
    name: 'Trade board reply',
    sub: 'Someone answered your post',
    channels: [true, false, false],
  },
  {
    icon: 'i-users',
    name: 'Team mention',
    sub: 'A teammate tagged you in a note',
    channels: [true, true, false],
  },
];

export type MatrixAction = 'enable-all' | 'email-only' | 'test';

export interface MatrixFooterAction {
  readonly label: string;
  readonly icon: IconName;
  readonly action: MatrixAction;
}

export const NOTIFICATION_FOOTER_ACTIONS: readonly MatrixFooterAction[] = [
  { label: 'Enable all', icon: 'i-check', action: 'enable-all' },
  { label: 'Email only', icon: 'i-x', action: 'email-only' },
  { label: 'Send test notification', icon: 'i-send', action: 'test' },
];

/** "Email only" turns on this column index and clears the rest. */
export const EMAIL_COLUMN_INDEX = 1 as const;

export const DELIVERY_CARD: CardHead = {
  title: 'Delivery',
  sub: 'When and how the noise is allowed through.',
};

export const QUIET_FROM_OPTIONS: readonly string[] = [
  '18:00',
  '19:00',
  '20:00',
  '21:00',
  '22:00',
];
export const QUIET_FROM_DEFAULT = '20:00' as const;

export const QUIET_TO_OPTIONS: readonly string[] = [
  '05:00',
  '06:00',
  '07:00',
  '08:00',
  '09:00',
];
export const QUIET_TO_DEFAULT = '07:00' as const;

export const DIGEST_OPTIONS: readonly string[] = [
  'Off',
  '08:00',
  '12:00',
  '18:00',
];
export const DIGEST_DEFAULT = '08:00' as const;

export const SMS_NUMBER_FIELD: FieldSpec = {
  label: 'SMS number',
  value: '(425) 555-0142',
};

export const DELIVERY_TOGGLES: readonly ToggleRow[] = [
  {
    name: 'Mute everything on weekends',
    desc: 'Nothing but payment failures gets through Sat and Sun.',
    on: false,
  },
  {
    name: 'Desktop push',
    desc: 'Browser notifications while JobFlex is open.',
    on: true,
  },
  { name: 'Sound on new lead', desc: 'A short chime, once per lead.', on: true },
];

/* ------------------------------------------------------------------ */
/* F10 — every donor <select> as a custom Sel dropdown                 */
/* ------------------------------------------------------------------ */

export const PAYOUT_SCHEDULE_SELECT: SelectSpec = {
  label: 'Payout schedule',
  options: PAYOUT_SCHEDULE_OPTIONS,
  defaultValue: PAYOUT_SCHEDULE_DEFAULT,
};

export const CURRENCY_SELECT: SelectSpec = {
  label: 'Currency',
  options: CURRENCY_OPTIONS,
  defaultValue: CURRENCY_DEFAULT,
};

export const NET_TERMS_SELECT: SelectSpec = {
  label: 'Net terms',
  options: NET_TERMS_OPTIONS,
  defaultValue: NET_TERMS_DEFAULT,
};

export const SIGNATURE_SELECT: SelectSpec = {
  label: 'Default signature',
  options: SIGNATURE_OPTIONS,
  defaultValue: SIGNATURE_DEFAULT,
};

export const META_PAGE_SELECT: SelectSpec = {
  label: 'Default page',
  options: META_PAGE_OPTIONS,
  defaultValue: META_PAGE_DEFAULT,
};

export const META_CATEGORY_SELECT: SelectSpec = {
  label: 'Form to lead category',
  options: META_CATEGORY_OPTIONS,
  defaultValue: META_CATEGORY_DEFAULT,
};

export const QUIET_FROM_SELECT: SelectSpec = {
  label: 'Quiet hours from',
  options: QUIET_FROM_OPTIONS,
  defaultValue: QUIET_FROM_DEFAULT,
};

export const QUIET_TO_SELECT: SelectSpec = {
  label: 'Quiet hours to',
  options: QUIET_TO_OPTIONS,
  defaultValue: QUIET_TO_DEFAULT,
};

export const DIGEST_SELECT: SelectSpec = {
  label: 'Daily digest',
  options: DIGEST_OPTIONS,
  defaultValue: DIGEST_DEFAULT,
};

/* ------------------------------------------------------------------ */
/* F11 — Add payout account modal                                      */
/* ------------------------------------------------------------------ */

export const ACCOUNT_TYPE_OPTIONS: readonly string[] = ['Checking', 'Savings'];
export const ACCOUNT_TYPE_DEFAULT = 'Checking' as const;

export const ACCOUNT_TYPE_SELECT: SelectSpec = {
  label: 'Account type',
  options: ACCOUNT_TYPE_OPTIONS,
  defaultValue: ACCOUNT_TYPE_DEFAULT,
};

export interface ModalCopy {
  readonly title: string;
  readonly sub: string;
  readonly fields: readonly FieldSpec[];
  readonly select: SelectSpec;
  readonly submitLabel: string;
  readonly cancelLabel: string;
}

export const ADD_PAYOUT_MODAL: ModalCopy = {
  title: 'Add payout account',
  sub: 'Where cleared money lands.',
  fields: [
    { label: 'Account holder', value: '' },
    { label: 'Routing number', value: '' },
    { label: 'Account number', value: '' },
  ],
  select: ACCOUNT_TYPE_SELECT,
  submitLabel: 'Add payout account',
  cancelLabel: 'Cancel',
};
