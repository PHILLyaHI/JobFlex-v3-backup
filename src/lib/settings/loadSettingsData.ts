// SETTINGS READ — the one loader behind both settings surfaces.
//
// Lifted verbatim out of src/app/dashboard/settings/page.tsx so the handheld
// route (/mobile-settings-v1) and the desktop hub (/dashboard/settings) build
// the SAME `SettingsData` object from the SAME queries. Two copies of this fold
// would drift the moment either page gained a field.
//
// THIS IS NOT A "use server" MODULE, on purpose. An exported async function in
// an action file is a public RPC endpoint; a read keyed by a caller-supplied
// org id would be a data leak. It therefore takes the ALREADY-RESOLVED org
// context (what `requireOrg()` returned to the page) as an argument and never
// resolves one itself — there is no way to call it for an org the caller has
// not already been authorised for.
//
// It also does not redirect: `null` means the org row is gone, and each page
// answers that in its own vocabulary.
//
// NOTE ON THE PATH: `src/lib/settings.ts` (the JSON blob parsers) and this
// directory coexist. Node/TS extension resolution takes the FILE for
// `@/lib/settings`, and this module is only ever reached by its full path.

import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { longDate } from "@/lib/format";
import { isOwnerOrManager, isOwnerRole, type requireOrg } from "@/lib/orgContext";
import { titleCaseSlug } from "@/lib/planCatalog";
import { getOrgPlanContext } from "@/lib/planCatalogServer";
import { getOrgLimitUsage } from "@/lib/limitsEngine";
import { GMAIL_SCOPES, isGmailOAuthConfigured } from "@/lib/sdk/gmail";
import { isStripeConnectConfigured } from "@/lib/sdk/integrations";
import { isSecretBoxConfigured } from "@/lib/crypto/secretBox";
import { metaAllowed } from "@/lib/meta/graph";
import { metaConnectionView } from "@/lib/meta/connections";
import { getPaymentConnectionStatus } from "@/lib/payments/connections";
import { parseNotificationPrefs } from "@/lib/notificationPrefsShared";
import {
  parseGmailSettings,
  parsePaymentSettings,
} from "@/lib/settings";
import type { Badge, SettingsData, SmsSettingsData } from "@/components/v3/settings-blueprint/settings-data";

/** Emails allowed to use the Gmail connector while the Google app is still in
 *  Testing — GMAIL_OAUTH_TEST_USERS, comma-separated, case-insensitive. */
function isGmailTestUser(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.GMAIL_OAUTH_TEST_USERS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}


/** Exactly what `requireOrg()` hands back — the page resolves it, not this. */
export type SettingsOrgContext = Awaited<ReturnType<typeof requireOrg>>;

/** "OWNER" → "Owner"; the Profile card's `.badge2` and read-only Role field. */
export function roleLabel(role: string): string {
  const clean = role.replace(/_/g, " ").toLowerCase();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** Subscription status → the donor's `.badge2` tones. */
export function statusBadge(status: string | null): Badge | null {
  if (!status) return null;
  const label = roleLabel(status);
  if (status === "ACTIVE" || status === "TRIALING" || status === "FREE") {
    return { label, tone: "bg-ok" };
  }
  if (status === "PAST_DUE" || status === "CANCELED" || status === "EXPIRED") {
    return { label, tone: "bg-bad" };
  }
  return { label, tone: "bg-off" };
}

/** Everything the five panes render, from the database. `null` = no org row. */
export async function loadSettingsData(ctx: SettingsOrgContext): Promise<SettingsData | null> {
  const { organizationId, user, role } = ctx;

  const [me, org, sub, planContext, usage, appUrl, connections, lastStripeEvt, lastSquareEvt] =
    await Promise.all([
      db.user.findUnique({
        where: { id: user.id },
        select: { name: true, email: true, phone: true, notificationPrefsJson: true, smsPhone: true, smsVerifiedAt: true },
      }),
      db.organization.findUnique({
        where: { id: organizationId },
        select: {
          name: true,
          address: true,
          website: true,
          phone: true,
          billingEmail: true,
          paymentSettingsJson: true,
          gmailSettingsJson: true,
          gmailTokensJson: true,
          metaSettingsJson: true,
        },
      }),
      db.subscription.findUnique({ where: { organizationId } }),
      getOrgPlanContext(organizationId),
      getOrgLimitUsage(organizationId),
      appBaseUrl(),
      getPaymentConnectionStatus(organizationId),
      // Platform-level: WebhookEvent has no org column. "Last event received"
      // says the pipe is alive, not that THIS org's payment arrived.
      db.webhookEvent.findFirst({
        where: { provider: "STRIPE", type: { startsWith: "checkout.session" } },
        orderBy: { receivedAt: "desc" },
        select: { receivedAt: true },
      }),
      db.webhookEvent.findFirst({
        where: { provider: "SQUARE" },
        orderBy: { receivedAt: "desc" },
        select: { receivedAt: true },
      }),
    ]);

  if (!org) return null;

  /* ── plan + seats ── */
  const planName = planContext.plan?.name ?? titleCaseSlug(planContext.rawPlan);
  const seatStatus = usage.find((u) => u.resource === "teamSeats");
  const seatsUsed = seatStatus?.used ?? 0;
  const seats =
    seatStatus && seatStatus.limit !== null ? `${seatsUsed} of ${seatStatus.limit}` : `${seatsUsed}`;
  const nextBillAt = sub?.currentPeriodEnd ?? sub?.trialEndsAt ?? null;

  /* ── settings blobs ── */
  const payment = parsePaymentSettings(org.paymentSettingsJson);
  const gmail = parseGmailSettings(org.gmailSettingsJson);
  const meta = await metaConnectionView(organizationId, user.id);
  const gmailConnected = Boolean(org.gmailTokensJson);

  const isOwner = isOwnerRole(role);
  const fmtWhen = (d: Date | null | undefined) => (d ? `${longDate(d)} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : null);

  return {
    account: {
      name: me?.name ?? user.name ?? "",
      email: me?.email ?? user.email ?? "",
      phone: me?.phone ?? "",
      role: roleLabel(role),
      roleBadge: roleLabel(role),
      canEditBusiness: isOwnerOrManager(role),
      isOwner,
      business: {
        name: org.name,
        address: org.address ?? "",
        website: org.website ?? "",
        phone: org.phone ?? "",
      },
      security: {
        passwordDesc: "Change it with a link sent to your email address.",
        sessionsDesc: "Logs out every device, including this one.",
      },
      forgotHref: "/auth/forgot",
    },
    payments: {
      connections,
      currency: payment.currency,
      depositPct: String(payment.depositPct),
      receiptsOnPayment: payment.receiptsOnPayment,
      platformFeePct: connections.platformFeePct,
    },
    billing: {
      planName,
      planBadge: statusBadge(sub?.status ?? null),
      nextBill: nextBillAt ? longDate(nextBillAt) : "",
      seats,
      billingEmail: org.billingEmail ?? "",
      isOwner,
      canEditBilling: isOwnerOrManager(role),
      subscriptionHref: "/dashboard/subscription",
    },
    integrations: {
      gmail: {
        // Google keeps an app in "Testing" until it passes verification, and
        // only listed test users may consent — so the tab says "Coming soon"
        // until the operator flips GMAIL_OAUTH_PUBLIC after verification.
        // While it is in Testing, GMAIL_OAUTH_TEST_USERS (comma-separated
        // emails, the same list as the console's Audience → Test users) lets
        // those accounts see and use the connector ahead of everyone else.
        comingSoon: !(isGmailOAuthConfigured() && (process.env.GMAIL_OAUTH_PUBLIC === "true" || isGmailTestUser(me?.email ?? user.email))),
        connected: gmailConnected,
        connectedEmail: gmail.connectedEmail,
        // From address is PRE-FILLED with the company (owner's call,
        // 2026-09-03): the business name, and the billing email when the org
        // has one, else the signed-in user's address. Saving persists it.
        displayName: gmail.displayName || org.name,
        replyTo: gmail.replyTo || org.billingEmail || me?.email || user.email || "",
        sendFromUser: gmail.sendFromUser,
        revokedAt: gmail.revokedAt,
        revokedReason: gmail.revokedReason,
        displayNamePlaceholder: org.name,
        replyToPlaceholder: me?.email ?? user.email ?? "",
        scopes: gmailConnected ? GMAIL_SCOPES.map((s) => s.split("/auth/")[1] ?? s) : [],
        connectHref: "/api/integrations/gmail/connect",
      },
      meta: {
        ...meta,
        comingSoon: !metaAllowed(me?.email ?? user.email),
        canManage: isOwnerOrManager(role),
        orgName: org.name,
        defaultPage: meta.pageName,
        formCategory: "auto",
      },
      stripe: {
        key: "stripe",
        // Usable by OAuth (Connect configured) or by a pasted key (secret box).
        comingSoon: !(isStripeConnectConfigured() || isSecretBoxConfigured()),
        webhookUrl:
          connections.stripe.auth === "key" && connections.stripe.connectionId
            ? `${appUrl}/api/webhooks/stripe-key/${connections.stripe.connectionId}`
            : `${appUrl}/api/webhooks/stripe-connect`,
        lastEventAt: fmtWhen(lastStripeEvt?.receivedAt),
      },
      square: {
        key: "square",
        // Usable by OAuth (platform app) or by a pasted access token (secret box).
        comingSoon: !isSecretBoxConfigured(),
        webhookUrl:
          connections.square.auth === "token" && connections.square.connectionId
            ? `${appUrl}/api/webhooks/square-key/${connections.square.connectionId}`
            : `${appUrl}/api/webhooks/square`,
        lastEventAt: fmtWhen(lastSquareEvt?.receivedAt),
      },
      connections,
    },
    notifications: {
      prefs: parseNotificationPrefs(me?.notificationPrefsJson),
      sms: await loadSmsSettings(organizationId, me?.smsPhone ?? null, me?.smsVerifiedAt ?? null, role, sub?.plan ?? null),
    },
  };
}

/** "(206) 555-0100" for a stored E.164 number. */
function prettyPhone(e164: string): string {
  const d = e164.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}` : e164;
}

/** The Text messages card (2026-09-24): the member's mobile, the company's
 *  extra numbers, this month's count. A missing table costs the card, never
 *  the page. */
async function loadSmsSettings(organizationId: string, smsPhone: string | null, smsVerifiedAt: Date | null, role: string, plan: string | null): Promise<SmsSettingsData> {
  const { isTwilioEnabled } = await import("@/lib/sdk/twilio");
  const { smsAllowanceFor } = await import("@/lib/entitlements");
  const base: SmsSettingsData = {
    configured: await isTwilioEnabled(),
    phone: smsPhone ? prettyPhone(smsPhone) : null,
    verifiedAt: smsVerifiedAt ? smsVerifiedAt.toISOString() : null,
    stopped: false,
    extras: [],
    monthCount: 0,
    allowance: smsAllowanceFor(plan),
    canManage: ["OWNER", "ADMIN", "MANAGER"].includes(role),
    clientsOn: true,
    ownNumber: null,
  };
  try {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const orgSms = await db.organization.findUnique({ where: { id: organizationId }, select: { smsClientsOn: true, smsFromNumber: true } });
    const [extras, stops, monthCount] = await Promise.all([
      db.notificationPhone.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, phone: true, active: true } }),
      db.smsOptOut.findMany({ where: { phone: { in: [smsPhone ?? "", ...(await db.notificationPhone.findMany({ where: { organizationId }, select: { phone: true } })).map((x) => x.phone)] } }, select: { phone: true } }),
      db.smsMessage.count({ where: { organizationId, direction: "OUT", status: { in: ["SENT", "DELIVERED", "QUEUED"] }, createdAt: { gte: monthStart } } }),
    ]);
    const stopped = new Set(stops.map((x) => x.phone));
    return {
      ...base,
      stopped: Boolean(smsPhone && stopped.has(smsPhone)),
      extras: extras.map((x) => ({ id: x.id, name: x.name, phone: prettyPhone(x.phone), active: x.active, stopped: stopped.has(x.phone) })),
      monthCount,
      clientsOn: orgSms?.smsClientsOn ?? true,
      ownNumber: orgSms?.smsFromNumber ? prettyPhone(orgSms.smsFromNumber) : null,
    };
  } catch {
    return base;
  }
}
