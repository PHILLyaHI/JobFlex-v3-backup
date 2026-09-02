/**
 * COPY + SHAPES for the Settings blueprint page.
 *
 * Every label, card title, sub-line and option list below is transcribed
 * VERBATIM from the donor file `jobflex-settings-blueprint (6).html`, lines
 * 2004-2131. HTML entities are stored as their real characters (¢ – — • & £ € ✓).
 *
 * What this file no longer holds is DATA. The donor's fixture values (the
 * "Ivan Petrov" profile, the two invented cards, the fake plan and payment
 * history, the imaginary Gmail/Meta connection, the notification matrix) were
 * replaced by the `SettingsData` object at the bottom of this file, which
 * src/app/dashboard/settings/page.tsx builds from the database and threads down
 * to each pane. The types and the copy are unchanged — only the values moved.
 *
 * No server imports here: this module is read by the server page AND by the
 * five "use client" panes, so it must stay free of Prisma and "use server".
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
};

/** Donor field labels. The values come from the signed-in User row. */
export const PROFILE_LABELS = {
  name: 'Full name',
  email: 'Email',
  phone: 'Phone',
  role: 'Role',
} as const;

export const BUSINESS_CARD: CardHead = {
  title: 'Business',
  sub: 'Shown on proposals, invoices and your public portal.',
};

/**
 * Donor field labels. The donor's fourth field was "License №", which has no
 * column on Organization — it is replaced by Phone, which does (and which
 * `updateBusiness` writes alongside the other three).
 */
export const BUSINESS_LABELS = {
  name: 'Business name',
  address: 'Address',
  website: 'Website',
  phone: 'Phone',
} as const;

export const SECURITY_CARD: CardHead = {
  title: 'Security',
  sub: 'Password, two-factor and where you are signed in.',
};

export type SecurityKey = 'password' | 'twofactor' | 'sessions';

/** F1 renders these three as one row of three `.seccol` columns. */
export interface SecurityItem {
  readonly key: SecurityKey;
  readonly icon: IconName;
  readonly name: string;
  readonly action: string;
  readonly badge?: Badge;
}

export const SECURITY_ITEMS: readonly SecurityItem[] = [
  { key: 'password', icon: 'i-eye-off', name: 'Password', action: 'Change' },
  {
    key: 'twofactor',
    icon: 'i-phone',
    name: 'Two-factor authentication',
    action: 'Turn on',
    badge: { label: 'Off', tone: 'bg-off' },
  },
  { key: 'sessions', icon: 'i-users', name: 'Active sessions', action: 'Sign out all' },
];

export const DANGER_CARD: CardHead = {
  title: 'Danger zone',
  sub: 'Irreversible. Exports run first.',
  badge: { label: 'Owner only', tone: 'bg-bad' },
};

export interface DangerZoneCopy {
  readonly name: string;
  readonly action: ActionSpec;
}

/** F2 puts `action` at the right end of the title+description row. */
export const DANGER_ZONE: DangerZoneCopy = {
  name: 'Delete organization',
  action: { label: 'Delete', icon: 'i-trash' },
};

/** The org name is spliced in at render time. */
export function dangerZoneDesc(orgName: string): string {
  return `Removes clients, proposals, jobs and payment history for ${orgName}. Cannot be undone.`;
}

/* ------------------------------------------------------------------ */
/* Payments pane — processors                                          */
/* ------------------------------------------------------------------ */

export const PROCESSORS_CARD: CardHead = {
  title: 'Processors',
  sub: 'Toggle the methods clients see at checkout.',
  badge: { label: 'Live', tone: 'bg-live' },
};

/** Key into `PaymentSettings` — the boolean this row actually reads and writes. */
export type ProcessorKey = 'stripe' | 'square' | 'paypal' | 'ach';

export interface Processor {
  readonly key: ProcessorKey;
  readonly icon: IconName;
  readonly name: string;
  readonly desc: string;
  /** Donor `.prow-conn` sub-line. Product copy, not a connection read-out. */
  readonly conn?: string;
}

/**
 * F3: ACH bank transfer gains the same Connect action as Square / PayPal.
 * F4: no `.tg` toggles on processor rows — the row carries only its button.
 * F5: the "Add a processor" `.sactions` block is removed entirely.
 *
 * The donor's `Connected · acct_1Q7f…` sub-line under Stripe was an invented
 * account id and is gone; the row's button state now reflects the org's real
 * `paymentSettingsJson` flag.
 */
export const PROCESSORS: readonly Processor[] = [
  {
    key: 'stripe',
    icon: 'i-card',
    name: 'Stripe',
    desc: 'Cards, Apple Pay, Google Pay. Fee 2.9% + 30¢.',
  },
  {
    key: 'square',
    icon: 'i-bank',
    name: 'Square',
    desc: 'Cards + ACH for U.S. accounts. Fee 2.6% + 10¢.',
  },
  {
    key: 'paypal',
    icon: 'i-card',
    name: 'PayPal',
    desc: 'PayPal balance, cards, Pay Later.',
  },
  {
    key: 'ach',
    icon: 'i-bank',
    name: 'ACH bank transfer',
    desc: 'Lower fees on large jobs. 1–3 business days to clear.',
    conn: 'Via Stripe',
  },
];

/** The two donor button states a row can be in, reused wherever one is needed. */
export const CONNECT_ACTION: ActionSpec = { label: 'Connect', icon: 'i-plus', state: 'is-on' };
export const DISCONNECT_ACTION: ActionSpec = { label: 'Disconnect', icon: 'i-x', state: 'is-off' };

/* ------------------------------------------------------------------ */
/* Payments pane — payout account                                      */
/* ------------------------------------------------------------------ */

/** F8: the `bg-ok` "Verified" badge is deleted from this card header. */
export const PAYOUT_CARD: CardHead = {
  title: 'Payout account',
  sub: 'Where cleared money lands.',
};

/**
 * The donor's "Washington Federal · checking •••• 3391" row was invented — no
 * payout-account model exists — so the card renders this empty state instead.
 */
export const PAYOUT_EMPTY = {
  icon: 'i-bank' as IconName,
  name: 'No payout account',
  desc: 'Add a bank account to receive cleared money.',
} as const;

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

/** The two plain text inputs in the Defaults `.fgrid`. Values come from
 *  `paymentSettingsJson` (`depositPct`, `lateFeePct`). */
export const PAYMENT_DEFAULT_LABELS = {
  depositPct: 'Deposit %',
  lateFeePct: 'Late fee',
} as const;

/** `paymentSettingsJson.currency` is stored bare ("USD"); the donor's dropdown
 *  shows it with its symbol ("USD · $"). These two keep the pair in step. */
export function currencyOptionFor(code: string): string {
  const match = CURRENCY_OPTIONS.find((o) => o.split(' ')[0] === code);
  return match ?? CURRENCY_DEFAULT;
}
export function currencyCodeFor(option: string): string {
  return option.split(' ')[0] ?? 'USD';
}

/* ------------------------------------------------------------------ */
/* Payments pane — automations + compliance                            */
/* ------------------------------------------------------------------ */

export const PAYMENT_AUTOMATIONS_CARD: CardHead = {
  title: 'Automations',
  sub: 'Quiet, persistent reminders.',
};

/** Keys into `PaymentSettings`. */
export type PaymentAutomationKey = 'autoRemind' | 'lateFees' | 'receiptsOnPayment';

export interface PaymentAutomationRow {
  readonly key: PaymentAutomationKey;
  readonly name: string;
  readonly desc: string;
}

export const PAYMENT_AUTOMATIONS: readonly PaymentAutomationRow[] = [
  {
    key: 'autoRemind',
    name: 'Auto-remind on overdue invoices',
    desc: 'Day 1, day 7, day 14 after due date.',
  },
  {
    key: 'lateFees',
    name: 'Apply late fees automatically',
    desc: 'Adds the late fee to the next invoice.',
  },
  {
    key: 'receiptsOnPayment',
    name: 'Receipts on payment',
    desc: 'Emails the client a receipt the moment a payment clears.',
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
};

/** Donor `.plan-meta` prefixes. The figures after them are read from the
 *  Subscription row and the plan's own seat limit. */
export const PLAN_META_PREFIX = {
  nextBill: 'Next bill · ',
  seats: 'Seats used · ',
} as const;

export const PLAN_PRIMARY_ACTION: ActionSpec = { label: 'Change plan', icon: 'i-arrow' };
export const PLAN_SECONDARY_ACTION: ActionSpec = { label: 'Cancel', icon: 'i-undo' };

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
}

/**
 * The donor's two invented cards (Visa •••• 4242 / Mastercard •••• 8821) are
 * gone. Nothing in this codebase reads the customer's stored cards off Stripe,
 * so the card renders this row until a payment method exists.
 */
export const PAYMENT_METHOD_EMPTY: PaymentMethod = {
  icon: 'i-card',
  name: 'No card on file',
  desc: 'Add a payment method at checkout to keep your subscription active.',
};

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

/**
 * One row per PricingPlan in the catalog (/admin/plans is the single source of
 * truth). Seats / Proposals / Estimators are that plan's own limits.
 */
export interface PlanRow {
  readonly plan: string;
  readonly seats: string;
  readonly proposals: string;
  readonly estimators: string;
  readonly price: string;
  /** Donor `<tr class="cur">` — the subscribed tier. */
  readonly current: boolean;
}

/** Donor em dash, used wherever a plan sets no cap for a column. */
export const PLAN_UNLIMITED = 'Unlimited' as const;
export const PLANS_EMPTY = 'No plans are published yet.' as const;

export const BILLING_CONTACT_CARD: CardHead = {
  title: 'Billing contact',
  sub: 'Where invoices and dunning notices go.',
};

/** The donor's second field, "Tax ID", has no column and no processor hand-off,
 *  so it is not rendered — a text box that saves nowhere is worse than none. */
export const BILLING_CONTACT_LABELS = { billingEmail: 'Billing email' } as const;

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

/** One settled Stripe subscription invoice. `invoiceHref` is null when Stripe
 *  returned no hosted invoice / PDF for the charge. */
export interface PaymentHistoryRow {
  readonly id: string;
  readonly date: string;
  readonly description: string;
  readonly amount: string;
  readonly invoiceLabel: string;
  readonly invoiceIcon: IconName;
  readonly invoiceHref: string | null;
}

export const PAYMENT_HISTORY_INVOICE_LABEL = 'PDF' as const;
export const PAYMENT_HISTORY_EMPTY = 'No subscription charges yet.' as const;

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
};

/** Donor badge pair — which one shows is decided by `gmailTokensJson`. */
export const CONNECTED_BADGE: Badge = { label: 'Connected', tone: 'bg-ok' };
export const NOT_CONNECTED_BADGE: Badge = { label: 'Not connected', tone: 'bg-off' };

export const GMAIL_CONNECT_ACTION: ActionSpec = {
  label: 'Connect Gmail',
  icon: 'i-google',
};

export const GMAIL_FROM_CARD: CardHead = {
  title: 'From address',
  sub: 'How outbound mail is signed.',
};

/** Donor field labels. The placeholders are the org's own name and the signed-in
 *  user's own email, not the donor's invented pair. */
export const GMAIL_FROM_LABELS = {
  displayName: 'Display name',
  replyTo: 'Reply-to address',
} as const;

export const SIGNATURE_OPTIONS: readonly string[] = [
  'Brand signature',
  'Personal signature',
  'No signature',
];
export const SIGNATURE_DEFAULT = 'Brand signature' as const;

/** `gmailSettingsJson.signature` stores the bare key ("brand"); the dropdown
 *  shows the donor's label. */
const SIGNATURE_BY_KEY: Record<string, string> = {
  brand: 'Brand signature',
  personal: 'Personal signature',
  none: 'No signature',
};
export function signatureOptionFor(key: string): string {
  return SIGNATURE_BY_KEY[key] ?? SIGNATURE_DEFAULT;
}
export function signatureKeyFor(option: string): string {
  const hit = Object.entries(SIGNATURE_BY_KEY).find(([, label]) => label === option);
  return hit?.[0] ?? 'brand';
}

export const GMAIL_BEHAVIOR_CARD: CardHead = {
  title: 'Behavior',
  sub: 'Quietly improve every send.',
};

/** Keys into `GmailSettings` — the flag each donor row reads and writes. */
export type GmailToggleKey = 'sendFromUser' | 'trackOpens' | 'autoSync';

export interface GmailToggleRow {
  readonly key: GmailToggleKey;
  readonly name: string;
  readonly desc: string;
}

export const GMAIL_BEHAVIOR_TOGGLES: readonly GmailToggleRow[] = [
  {
    key: 'sendFromUser',
    name: 'Send from my Gmail',
    desc: 'Outbound mail leaves from your connected address.',
  },
  {
    key: 'trackOpens',
    name: 'Track opens',
    desc: 'Adds an invisible pixel so you know when it landed.',
  },
  {
    key: 'autoSync',
    name: 'Two-way thread sync',
    desc: 'Replies come back into JobFlex conversations.',
  },
];

export const GMAIL_PERMISSIONS_CARD: CardHead = {
  title: 'Permissions',
  sub: 'Granted scopes — you can review or revoke any time.',
};

/** Donor `&#10003;` inside each `.scope > i`. */
export const SCOPE_CHECK = '✓' as const;

/** Shown only once a connection exists; the list itself comes from
 *  `GMAIL_SCOPES` in src/lib/sdk/gmail.ts (two scopes, not the donor's four). */
export const GMAIL_SCOPES_EMPTY = 'No scopes granted — Gmail is not connected.' as const;

/* ------------------------------------------------------------------ */
/* Integrations — Meta business                                        */
/* ------------------------------------------------------------------ */

export const META_CONNECTION_CARD: CardHead = {
  title: 'Connection',
  sub: 'Pull Facebook and Instagram leads straight into JobFlex.',
};

/** The row's name is the org's own name; the sub-line states the real rule.
 *  The donor's "App ID 8842… · connected Feb 12, 2026." was invented, and its
 *  "Test event" button had nothing behind it, so neither survives. */
export const META_CONNECTION_ICON: IconName = 'i-globe';
export const META_CONNECTED_DESC =
  'Lead forms on this page create leads in your pipeline.' as const;
export const META_DISCONNECTED_DESC =
  'Lead forwarding is off. Turn it on to receive form submissions.' as const;
export const META_CONNECT_ACTION: ActionSpec = { label: 'Connect' };
export const META_DISCONNECT_ACTION: ActionSpec = { label: 'Disconnect' };

export interface CopyField {
  readonly label: string;
  readonly value: string;
}

/** Only the label is fixed copy — the URL is built from the live app origin.
 *  The donor's second field, "Verify token", is gone: no verify token exists in
 *  the env contract, so there was nothing real to print. */
export const META_CALLBACK_LABEL = 'Callback URL' as const;

export const META_LEAD_CARD: CardHead = {
  title: 'Default lead handling',
  sub: 'What we do the second a form arrives.',
};

/** The donor's three invented page names are replaced at render time by the
 *  org's own name plus whatever `metaSettingsJson.defaultPage` already holds. */
export const META_PAGE_LABEL = 'Default page' as const;

export const META_CATEGORY_OPTIONS: readonly string[] = [
  'Auto-detect from form name',
  'Always Roofing',
  'Always Fencing',
  'Always Other',
];
export const META_CATEGORY_DEFAULT = 'Auto-detect from form name' as const;

/** `metaSettingsJson.formCategory` stores the bare key ("auto"). */
const META_CATEGORY_BY_KEY: Record<string, string> = {
  auto: 'Auto-detect from form name',
  roofing: 'Always Roofing',
  fencing: 'Always Fencing',
  other: 'Always Other',
};
export function metaCategoryOptionFor(key: string): string {
  return META_CATEGORY_BY_KEY[key] ?? META_CATEGORY_DEFAULT;
}
export function metaCategoryKeyFor(option: string): string {
  const hit = Object.entries(META_CATEGORY_BY_KEY).find(([, label]) => label === option);
  return hit?.[0] ?? 'auto';
}

/** Keys into `MetaSettings`. */
export type MetaToggleKey = 'autoCreate' | 'autoText';

export interface MetaToggleRow {
  readonly key: MetaToggleKey;
  readonly name: string;
  readonly desc: string;
}

export const META_LEAD_TOGGLES: readonly MetaToggleRow[] = [
  {
    key: 'autoCreate',
    name: 'Auto-create Lead',
    desc: 'Every submission becomes a lead in the pipeline.',
  },
  {
    key: 'autoText',
    name: 'Auto-text the prospect',
    desc: 'Sends the first touch within a minute.',
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

/** Nothing records webhook deliveries — there is no model and no
 *  /api/webhooks/meta route — so this list is always empty today. */
export const WEBHOOKS_EMPTY = 'No deliveries recorded.' as const;

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

/** One row per EmailTemplate the org actually has. */
export interface EmailTemplate {
  readonly id: string;
  readonly kind: string;
  readonly subject: string;
  readonly trigger: string;
}

export const EMAIL_TEMPLATE_EDIT_LABEL = 'Edit' as const;
export const EMAIL_TEMPLATES_EMPTY = 'No templates yet.' as const;

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
};

/** Donor `<span class="badge2 bg-live">14 events</span>` — counted, not typed. */
export function notificationCountBadge(count: number): Badge {
  return { label: `${count} event${count === 1 ? '' : 's'}`, tone: 'bg-live' };
}

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
  /** Stable storage key inside `User.notificationPrefsJson`. Never rendered. */
  readonly key: string;
  /** F16 icon map. */
  readonly icon: IconName;
  readonly name: string;
  readonly sub: string;
  /** Seed state used when the user has never saved the matrix. */
  readonly channels: NotificationChannels;
}

export const NOTIFICATION_EVENTS: readonly NotificationEvent[] = [
  {
    key: 'lead-assigned',
    icon: 'i-target',
    name: 'New lead assigned',
    sub: 'A platform or web lead lands in your pipeline',
    channels: [true, true, true],
  },
  {
    key: 'lead-offer-expiring',
    icon: 'i-hourglass',
    name: 'Lead offer expiring',
    sub: 'Under two hours left to accept',
    channels: [true, true, true],
  },
  {
    key: 'proposal-viewed',
    icon: 'i-file',
    name: 'Proposal viewed',
    sub: 'The client opened your estimate',
    channels: [true, false, false],
  },
  {
    key: 'proposal-accepted',
    icon: 'i-check',
    name: 'Proposal accepted',
    sub: 'Signed and ready to schedule',
    channels: [true, true, true],
  },
  {
    key: 'proposal-declined',
    icon: 'i-x',
    name: 'Proposal declined',
    sub: 'With the reason the client gave',
    channels: [true, true, false],
  },
  {
    key: 'payment-received',
    icon: 'i-bank',
    name: 'Payment received',
    sub: 'A deposit or installment cleared',
    channels: [true, true, false],
  },
  {
    key: 'payment-overdue',
    icon: 'i-clock',
    name: 'Payment overdue',
    sub: 'Past the net terms on an invoice',
    channels: [true, true, true],
  },
  {
    key: 'change-order',
    icon: 'i-pen',
    name: 'Change order submitted',
    sub: 'Waiting on client approval',
    channels: [true, true, false],
  },
  {
    key: 'job-scheduled',
    icon: 'i-cal',
    name: 'Job scheduled',
    sub: 'A crew is booked for a date',
    channels: [true, false, false],
  },
  {
    key: 'job-completed',
    icon: 'i-box',
    name: 'Job completed',
    sub: 'Crew marked the work done',
    channels: [true, true, false],
  },
  {
    key: 'worker-responded',
    icon: 'i-hardhat',
    name: 'Worker responded',
    sub: 'Accepted or declined an assignment',
    channels: [true, false, true],
  },
  {
    key: 'review-received',
    icon: 'i-thumb',
    name: 'Review received',
    sub: 'A homeowner left a rating',
    channels: [true, true, false],
  },
  {
    key: 'trade-reply',
    icon: 'i-board',
    name: 'Trade board reply',
    sub: 'Someone answered your post',
    channels: [true, false, false],
  },
  {
    key: 'team-mention',
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

export const SMS_NUMBER_LABEL = 'SMS number' as const;

/** Keys into the stored notification blob. */
export type DeliveryToggleKey = 'muteWeekends' | 'desktopPush' | 'soundOnLead';

export interface DeliveryToggleRow {
  readonly key: DeliveryToggleKey;
  readonly name: string;
  readonly desc: string;
  /** Seed state used when the user has never saved the blob. */
  readonly on: boolean;
}

export const DELIVERY_TOGGLES: readonly DeliveryToggleRow[] = [
  {
    key: 'muteWeekends',
    name: 'Mute everything on weekends',
    desc: 'Nothing but payment failures gets through Sat and Sun.',
    on: false,
  },
  {
    key: 'desktopPush',
    name: 'Desktop push',
    desc: 'Browser notifications while JobFlex is open.',
    on: true,
  },
  {
    key: 'soundOnLead',
    name: 'Sound on new lead',
    desc: 'A short chime, once per lead.',
    on: true,
  },
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

/* META_PAGE_SELECT is gone: its option list is the org's own page names, built
   on the server, so the Meta pane passes `META_PAGE_LABEL` + `pageOptions`
   straight to `Sel` instead of a fixed SelectSpec. */

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

/* ------------------------------------------------------------------ */
/* Notification preferences — User.notificationPrefsJson               */
/* ------------------------------------------------------------------ */

/** One `[in-app, email, sms]` triple per event key, plus the delivery rules. */
export interface NotificationPrefs {
  matrix: Record<string, [boolean, boolean, boolean]>;
  quietFrom: string;
  quietTo: string;
  digest: string;
  sms: string;
  muteWeekends: boolean;
  desktopPush: boolean;
  soundOnLead: boolean;
}

/** What a user who has never touched the page sees: the donor's own seed
 *  matrix, the donor's quiet-hours/digest defaults, and no SMS number. */
export function defaultNotificationPrefs(): NotificationPrefs {
  const matrix: Record<string, [boolean, boolean, boolean]> = {};
  for (const e of NOTIFICATION_EVENTS) {
    matrix[e.key] = [e.channels[0], e.channels[1], e.channels[2]];
  }
  return {
    matrix,
    quietFrom: QUIET_FROM_DEFAULT,
    quietTo: QUIET_TO_DEFAULT,
    digest: DIGEST_DEFAULT,
    sms: '',
    muteWeekends: false,
    desktopPush: true,
    soundOnLead: true,
  };
}

function isTriple(v: unknown): v is [boolean, boolean, boolean] {
  return Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'boolean');
}

/**
 * Hydrate the stored blob over the defaults. Unknown event keys are dropped and
 * new ones fall back to their seed row, so adding an event to the matrix never
 * needs a migration.
 */
export function parseNotificationPrefs(json: string | null | undefined): NotificationPrefs {
  const base = defaultNotificationPrefs();
  if (!json) return base;
  let raw: Record<string, unknown>;
  try {
    const v: unknown = JSON.parse(json);
    if (!v || typeof v !== 'object') return base;
    raw = v as Record<string, unknown>;
  } catch {
    return base;
  }

  const storedMatrix =
    raw.matrix && typeof raw.matrix === 'object'
      ? (raw.matrix as Record<string, unknown>)
      : {};
  for (const key of Object.keys(base.matrix)) {
    const cells = storedMatrix[key];
    if (isTriple(cells)) base.matrix[key] = cells;
  }

  const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

  return {
    matrix: base.matrix,
    quietFrom: str(raw.quietFrom, base.quietFrom),
    quietTo: str(raw.quietTo, base.quietTo),
    digest: str(raw.digest, base.digest),
    sms: str(raw.sms, base.sms),
    muteWeekends: bool(raw.muteWeekends, base.muteWeekends),
    desktopPush: bool(raw.desktopPush, base.desktopPush),
    soundOnLead: bool(raw.soundOnLead, base.soundOnLead),
  };
}

/* ------------------------------------------------------------------ */
/* SettingsData — everything the server page reads and threads down    */
/* ------------------------------------------------------------------ */

export interface AccountData {
  /** The signed-in user. `email` and `role` are read-only on the page. */
  name: string;
  email: string;
  phone: string;
  role: string;
  /** Membership role, title-cased, shown as the Profile card's `.badge2`. */
  roleBadge: string;
  /** True for OWNER / ADMIN / MANAGER — the only roles that may edit the org. */
  canEditBusiness: boolean;
  business: { name: string; address: string; website: string; phone: string };
  security: { passwordDesc: string; twoFactorDesc: string; sessionsDesc: string };
  /** Where the Security card's password "Change" button goes. */
  forgotHref: string;
}

export interface PaymentsData {
  processors: Record<ProcessorKey, boolean>;
  currency: string;
  depositPct: string;
  netTerms: string;
  lateFeePct: string;
  automations: Record<PaymentAutomationKey, boolean>;
}

export interface BillingData {
  planName: string;
  planBadge: Badge | null;
  /** Already prefixed, or "" when there is nothing to show. */
  nextBill: string;
  seats: string;
  billingEmail: string;
  plans: readonly PlanRow[];
  history: readonly PaymentHistoryRow[];
  /** False when Stripe is off or the org has no Stripe customer yet. */
  historyAvailable: boolean;
  /** Real checkout — where "Change plan" / "Add payment method" lead. */
  upgradeHref: string;
}

export interface GmailData {
  connected: boolean;
  connectedEmail: string;
  displayName: string;
  replyTo: string;
  signature: string;
  sendFromUser: boolean;
  trackOpens: boolean;
  autoSync: boolean;
  /** Placeholders for the two From-address inputs. */
  displayNamePlaceholder: string;
  replyToPlaceholder: string;
  /** Scopes actually requested by the OAuth route, short form. */
  scopes: readonly string[];
  connectHref: string;
}

export interface MetaData {
  connected: boolean;
  orgName: string;
  autoCreate: boolean;
  autoText: boolean;
  defaultPage: string;
  pageOptions: readonly string[];
  formCategory: string;
  callbackUrl: string;
}

export interface IntegrationsData {
  gmail: GmailData;
  meta: MetaData;
  templates: readonly EmailTemplate[];
  webhooks: readonly WebhookDelivery[];
  /** True once RESEND_API_KEY or the SMTP_* block is configured. */
  emailConfigured: boolean;
}

export interface SettingsData {
  account: AccountData;
  payments: PaymentsData;
  billing: BillingData;
  integrations: IntegrationsData;
  notifications: NotificationPrefs;
}

/** Every pane takes exactly this. */
export interface PaneProps {
  data: SettingsData;
}
