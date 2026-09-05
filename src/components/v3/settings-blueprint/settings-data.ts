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
import type { PaymentConnectionStatusView } from '@/lib/payments/connections';
import type { NotificationPrefs, PrefKey } from '@/lib/notificationPrefsShared';

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
  | 'i-grid'
  | 'i-hardhat'
  | 'i-hourglass'
  | 'i-mail'
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
export type BadgeTone = 'bg-live' | 'bg-ok' | 'bg-off' | 'bg-bad' | 'bg-warn';

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
  sub: 'Password and where you are signed in.',
};

export type SecurityKey = 'password' | 'sessions';

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
  { key: 'sessions', icon: 'i-users', name: 'Active sessions', action: 'Log out everywhere' },
];

export const SIGN_OUT_LABEL = 'Log out' as const;

/** Delete account — a launch-time debugging aid (owner's call, 2026-09-03):
 *  HARD delete of the signed-in user and any company they alone belong to,
 *  so the same address can be registered again. Slated for removal at launch. */
export const DELETE_ACCOUNT_CARD: CardHead = {
  title: 'Delete account',
  sub: 'Removes you and any company you are the only member of. Immediate, no undo.',
  badge: { label: 'Testing', tone: 'bg-warn' },
};
export const DELETE_ACCOUNT_ROW = {
  name: 'Delete my account',
  action: { label: 'Delete', icon: 'i-trash' } as ActionSpec,
} as const;
export const DELETE_ACCOUNT_MODAL = {
  title: 'Delete account',
  sub: 'Type your email address exactly to confirm.',
  inputLabel: 'Email address',
  confirmLabel: 'Delete my account',
  cancelLabel: 'Keep it',
  mismatch: "That doesn't match your email address.",
} as const;
export function deleteAccountDesc(email: string, orgName: string): string {
  return `Deletes ${email} for good — proposals, leads, jobs and payment history of ${orgName} included if nobody else is a member. You can register the same address again afterwards.`;
}

/* ------------------------------------------------------------------ */
/* Payments pane — processors                                          */
/* ------------------------------------------------------------------ */

export const PROCESSORS_CARD: CardHead = {
  title: 'Get paid',
  sub: 'Connect your own Stripe or Square — clients pay each stage of an accepted proposal straight to you.',
};

/** Which row this is. Stripe / Square are OAuth connections; bank is manual. */
export type ProcessorKey = 'stripe' | 'square' | 'bank';

export interface Processor {
  readonly key: ProcessorKey;
  readonly icon: IconName;
  readonly name: string;
  readonly desc: string;
}

export const PROCESSORS: readonly Processor[] = [
  {
    key: 'stripe',
    icon: 'i-card',
    name: 'Stripe',
    desc: 'Cards, Apple Pay, Google Pay — and ACH bank debits if you switch them on.',
  },
  {
    key: 'square',
    icon: 'i-grid',
    name: 'Square',
    desc: 'Square-hosted checkout on your Square account.',
  },
  {
    key: 'bank',
    icon: 'i-bank',
    name: 'Bank transfer',
    desc: 'Show your bank details on accepted proposals; you mark each stage paid when it lands.',
  },
];

/** A processor the platform has not enabled yet — the row's action slot
 *  carries this instead of an empty column, so every row ends at the same
 *  right edge. */
export const PROCESSOR_UNAVAILABLE_BADGE: Badge = { label: 'Unavailable', tone: 'bg-off' };

export const CONNECT_ACTION: ActionSpec = { label: 'Connect', icon: 'i-plus', state: 'is-on' };
export const DISCONNECT_ACTION: ActionSpec = { label: 'Disconnect', icon: 'i-x', state: 'is-off' };
export const MANAGE_ACTION: ActionSpec = { label: 'Manage', icon: 'i-arrow' };
export const RECONNECT_ACTION: ActionSpec = { label: 'Reconnect', icon: 'i-undo', state: 'is-on' };

/** Sub-line under a connected row. */
export function stripeConnLine(s: {
  accountId: string | null;
  livemode: boolean | null;
  chargesEnabled: boolean;
}): string {
  const id = s.accountId ? s.accountId.slice(0, 12) + '…' : 'connected';
  return `${id} · ${s.livemode === false ? 'Test mode' : 'Live'} · ${s.chargesEnabled ? 'charges enabled' : 'charges paused'}`;
}
export function squareConnLine(s: { merchantId: string | null; locationName: string | null; env: string }): string {
  return `${s.locationName ?? s.merchantId ?? 'connected'} · ${s.env === 'sandbox' ? 'Sandbox' : 'Production'}`;
}

/** One line of copy per non-healthy state. */
export const PROCESSOR_STATE_COPY = {
  not_configured: 'Not available on this platform yet.',
  disconnected: 'Not connected.',
  restricted: 'Connected, but the account cannot take payments right now — check your provider dashboard.',
  mode_mismatch: 'Connected in a different mode than the platform is running. Reconnect to fix.',
  revoked: 'Access was removed from the provider dashboard. Reconnect to take payments again.',
  token_expired: 'The connection expired. Reconnect to take payments again.',
  connected: '',
} as const;

export const STRIPE_ACH_TOGGLE = {
  name: 'Accept ACH bank debits',
  desc: 'Adds "US bank account" to your Stripe checkout. Clears in 1–3 business days.',
} as const;

export const BANK_TRANSFER_LABELS = {
  enabled: 'Offer bank transfer',
  enabledDesc: 'Shown to clients on accepted proposals, next to the card buttons.',
  instructions: 'Bank details shown to clients',
  placeholder: 'Bank name · Account name · Routing / Account number · Reference: proposal number',
} as const;

/** Card footnote — two annotations, not a paragraph. */
export const PAYOUT_NOTE_KICKER = 'Payouts' as const;
export const PAYOUT_NOTE = 'Land in your own Stripe or Square account on their normal schedule.' as const;
export const FEE_NOTE_KICKER = 'Platform fee' as const;
export function platformFeeLine(pct: number): string {
  return `${pct}% of payments collected through Stripe or Square. Bank transfers carry no fee.`;
}

/* ------------------------------------------------------------------ */
/* Payments pane — defaults                                            */
/* ------------------------------------------------------------------ */

export const PAYMENT_DEFAULTS_CARD: CardHead = {
  title: 'Defaults',
  sub: 'Seeded into every new proposal.',
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

/** Deposit % is the first stage of a new proposal's payment schedule. */
export const PAYMENT_DEFAULT_LABELS = {
  depositPct: 'Default deposit %',
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
  sub: 'What happens on its own when money lands.',
};

/** Keys into `PaymentSettings`. */
export type PaymentAutomationKey = 'receiptsOnPayment';

export interface PaymentAutomationRow {
  readonly key: PaymentAutomationKey;
  readonly name: string;
  readonly desc: string;
}

export const PAYMENT_AUTOMATIONS: readonly PaymentAutomationRow[] = [
  {
    key: 'receiptsOnPayment',
    name: 'Receipts on payment',
    desc: 'Emails the client a receipt the moment a stage is paid — card, Square or recorded by hand.',
  },
];

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

export const PLAN_PRIMARY_ACTION: ActionSpec = { label: 'Manage subscription', icon: 'i-arrow' };
export const PLAN_ASK_OWNER = {
  label: 'Ask your owner',
  desc: 'Only the organization owner can change the plan or billing.',
} as const;
export const PLAN_CARD_NOTE = 'Plans, payment method and invoices live on the subscription page.' as const;

export const BILLING_CONTACT_CARD: CardHead = {
  title: 'Billing contact',
  sub: 'Where invoices and dunning notices go.',
};

/** The donor's second field, "Tax ID", has no column and no processor hand-off,
 *  so it is not rendered — a text box that saves nowhere is worse than none. */
export const BILLING_CONTACT_LABELS = { billingEmail: 'Billing email' } as const;

/* ------------------------------------------------------------------ */
/* Integrations pane — subtabs                                         */
/* ------------------------------------------------------------------ */

export type SubTabKey = 'gmail' | 'meta' | 'stripe' | 'square';

export interface SubTab {
  readonly key: SubTabKey;
  readonly label: string;
}

/** An integration the PLATFORM has not switched on yet. The person can still
 *  read the tab (and an operator with access can still connect), but the badge
 *  says plainly that it is not open to everyone yet. It clears itself the
 *  moment the platform credentials are in place — see loadSettingsData. */
export const COMING_SOON_BADGE: Badge = { label: 'Coming soon', tone: 'bg-off' };
export const COMING_SOON_TAB = 'Soon' as const;

/** The line above a not-yet-live integration's cards. */
export function comingSoonNote(name: string): string {
  return `${name} isn't switched on for everyone yet. We're finishing the setup — you'll be able to connect it here as soon as it goes live.`;
}

export const INTEGRATION_SUBTABS: readonly SubTab[] = [
  { key: 'gmail', label: 'Gmail' },
  { key: 'meta', label: 'Meta business' },
  { key: 'stripe', label: 'Stripe' },
  { key: 'square', label: 'Square' },
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
  'Lead forms on your pages create leads in your pipeline.' as const;
export const META_CONNECT_ACTION: ActionSpec = { label: 'Connect Meta Business account' };
export const META_DISCONNECT_ACTION: ActionSpec = { label: 'Disconnect', state: 'is-off' };

/* ------------------------------------------------------------------ */
/* Integrations — Stripe / Square (the deep view of a payment link)     */
/* ------------------------------------------------------------------ */

export const PROCESSOR_CONNECTION_CARD: CardHead = {
  title: 'Connection',
  sub: 'Your own account, joined by OAuth. JobFlex never holds your keys.',
};
export const PROCESSOR_BEHAVIOR_CARD: CardHead = {
  title: 'Behavior',
  sub: 'What the checkout offers.',
};
export const PROCESSOR_PERMISSIONS_CARD: CardHead = {
  title: 'Permissions',
  sub: 'Granted scopes — revoke any time from the provider dashboard.',
};
export const PROCESSOR_WEBHOOK_CARD: CardHead = {
  title: 'Webhook',
  sub: 'Where the provider reports payments. Platform-level; nothing to configure.',
};
export const PROCESSOR_SCOPES_EMPTY = 'No scopes granted — not connected.' as const;
export const PROCESSOR_LAST_EVENT_PREFIX = 'Last event received · ' as const;
export const PROCESSOR_NO_EVENTS = 'No events yet.' as const;
export const OPEN_DASHBOARD_LABEL = { stripe: 'Open Stripe dashboard', square: 'Open Square dashboard' } as const;
export const DASHBOARD_HREF = {
  stripe: 'https://dashboard.stripe.com',
  square: 'https://squareup.com/dashboard',
} as const;
export const OFFER_TOGGLE = {
  name: 'Offer at checkout',
  desc: 'Show this option to clients on accepted proposals.',
} as const;

/* ------------------------------------------------------------------ */
/* Notifications pane                                                  */
/* ------------------------------------------------------------------ */

export const NOTIFICATIONS_CARD: CardHead = {
  title: 'What reaches you',
  sub: 'Pick a channel per event. The bell always keeps a copy.',
};

/** Column order is load-bearing: index 1 is the "Email only" column. */
export const NOTIFICATION_CHANNELS: readonly string[] = ['In-app', 'Email'];

/** F17: the per-column `.colt` badge becomes a real `.colw` toggle. */
export const NOTIFICATION_COLUMN_LABEL = 'All' as const;

export const NOTIFICATION_EVENT_COLUMN = 'Event' as const;

/** F16 icon per event key (src/lib/notificationPrefsShared.ts owns the list). */
export const NOTIFICATION_ICONS: Record<PrefKey, IconName> = {
  'lead-assigned': 'i-target',
  'proposal-viewed': 'i-file',
  'proposal-accepted': 'i-check',
  'proposal-declined': 'i-x',
  'payment-received': 'i-bank',
  'change-order': 'i-pen',
  'job-scheduled': 'i-cal',
  'job-completed': 'i-box',
  'worker-responded': 'i-hardhat',
  'review-received': 'i-thumb',
  'trade-reply': 'i-board',
};

export const EMAIL_UNAVAILABLE_TITLE = 'In-app only — nothing in the app emails this yet.' as const;
/** Drawn IN the cell instead of a ghost checkbox, so it cannot be mistaken
 *  for an unchecked box. */
export const EMAIL_UNAVAILABLE_TAG = 'In-app only' as const;

export type MatrixAction = 'enable-all' | 'email-only' | 'test';

export interface MatrixFooterAction {
  readonly label: string;
  readonly icon: IconName;
  readonly action: MatrixAction;
}

export const NOTIFICATION_FOOTER_ACTIONS: readonly MatrixFooterAction[] = [
  { label: 'Enable all', icon: 'i-check', action: 'enable-all' },
  { label: 'Email only', icon: 'i-mail', action: 'email-only' },
  { label: 'Send test notification', icon: 'i-send', action: 'test' },
];

/** "Email only" turns on this column index and clears the rest. */
export const EMAIL_COLUMN_INDEX = 1 as const;

export const TEST_RESULT_COPY = {
  sent: 'Sent to the bell and to your email.',
  off: 'Sent to the bell — every Email cell is off.',
  disabled: 'Sent to the bell — email is not configured on this platform.',
  'no-address': 'Sent to the bell — your account has no email address.',
} as const;

/* ------------------------------------------------------------------ */
/* F10 — every donor <select> as a custom Sel dropdown                 */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Notification preferences — User.notificationPrefsJson               */
/* ------------------------------------------------------------------ */

// The blob's shape, parser and event list live in the pure half of the prefs
// module so the bell feed and the mail senders read the same thing this page
// writes. Re-exported here so the panes keep one import.
export {
  PREF_EVENTS,
  defaultNotificationPrefs,
  parseNotificationPrefs,
} from '@/lib/notificationPrefsShared';
export type { NotificationPrefs, PrefKey } from '@/lib/notificationPrefsShared';

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
  /** Strictly OWNER — delete organization. */
  isOwner: boolean;
  business: { name: string; address: string; website: string; phone: string };
  security: { passwordDesc: string; sessionsDesc: string };
  /** Where the Security card's password "Change" button goes. */
  forgotHref: string;
}

export interface PaymentsData {
  connections: PaymentConnectionStatusView;
  currency: string;
  depositPct: string;
  receiptsOnPayment: boolean;
  /** PLATFORM_FEE_BPS / 100. */
  platformFeePct: number;
}

export interface BillingData {
  planName: string;
  planBadge: Badge | null;
  /** Already prefixed, or "" when there is nothing to show. */
  nextBill: string;
  seats: string;
  billingEmail: string;
  isOwner: boolean;
  canEditBilling: boolean;
  /** The real subscription page (owner-only). */
  subscriptionHref: string;
}

export interface GmailData {
  connected: boolean;
  /** Google app still in Testing (or unconfigured) — only test users can
   *  connect, so everyone else sees "Coming soon". */
  comingSoon: boolean;
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
  /** No Meta OAuth exists yet — the toggle is a local forwarding flag. */
  comingSoon: boolean;
  orgName: string;
  /** Stored values, round-tripped untouched through updateMetaSettings. */
  defaultPage: string;
  formCategory: string;
}

/** The deep view of one payment link (Integrations → Stripe / Square). */
export interface ProcessorIntegrationData {
  key: 'stripe' | 'square';
  /** Platform credentials missing — the tab is marked "Coming soon". */
  comingSoon: boolean;
  webhookUrl: string;
  /** Formatted, or null when no event has ever arrived. */
  lastEventAt: string | null;
}

export interface IntegrationsData {
  gmail: GmailData;
  meta: MetaData;
  stripe: ProcessorIntegrationData;
  square: ProcessorIntegrationData;
  connections: PaymentConnectionStatusView;
}

export interface NotificationsData {
  prefs: NotificationPrefs;
}

export interface SettingsData {
  account: AccountData;
  payments: PaymentsData;
  billing: BillingData;
  integrations: IntegrationsData;
  notifications: NotificationsData;
}

/** Every pane takes exactly this. `navigate` jumps rails (and subtabs). */
export interface PaneProps {
  data: SettingsData;
  navigate: (rail: RailKey, sub?: SubTabKey) => void;
  /** Integrations only: the subtab the page wants open. */
  sub?: SubTabKey;
}
