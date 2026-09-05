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
import { isSquareEnabled } from "@/lib/sdk/square";
import { isSecretBoxConfigured } from "@/lib/crypto/secretBox";
import { getPaymentConnectionStatus } from "@/lib/payments/connections";
import { parseNotificationPrefs } from "@/lib/notificationPrefsShared";
import {
  META_DEFAULTS,
  parseGmailSettings,
  parseMetaSettings,
  parsePaymentSettings,
} from "@/lib/settings";
import type { Badge, SettingsData } from "@/components/v3/settings-blueprint/settings-data";

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
        select: { name: true, email: true, phone: true, notificationPrefsJson: true },
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
  const meta = parseMetaSettings(org.metaSettingsJson);
  const gmailConnected = Boolean(org.gmailTokensJson);

  const savedMetaPage =
    meta.defaultPage && meta.defaultPage !== META_DEFAULTS.defaultPage ? meta.defaultPage : "";

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
        comingSoon: !(isGmailOAuthConfigured() && process.env.GMAIL_OAUTH_PUBLIC === "true"),
        connected: gmailConnected,
        connectedEmail: gmail.connectedEmail,
        // From address is PRE-FILLED with the company (owner's call,
        // 2026-09-03): the business name, and the billing email when the org
        // has one, else the signed-in user's address. Saving persists it.
        displayName: gmail.displayName || org.name,
        replyTo: gmail.replyTo || org.billingEmail || me?.email || user.email || "",
        signature: gmail.signature,
        sendFromUser: gmail.sendFromUser,
        trackOpens: gmail.trackOpens,
        autoSync: gmail.autoSync,
        displayNamePlaceholder: org.name,
        replyToPlaceholder: me?.email ?? user.email ?? "",
        scopes: gmailConnected ? GMAIL_SCOPES.map((s) => s.split("/auth/")[1] ?? s) : [],
        connectHref: "/api/integrations/gmail/connect",
      },
      meta: {
        // There is no Meta OAuth in the app: the switch is this org's own
        // forwarding flag, so the integration is not live for anyone yet.
        comingSoon: true,
        connected: org.metaSettingsJson ? meta.connected : false,
        orgName: org.name,
        // Round-tripped untouched through updateMetaSettings; the Default
        // lead handling card that edited these is gone.
        defaultPage: savedMetaPage || org.name,
        formCategory: meta.formCategory,
      },
      stripe: {
        key: "stripe",
        comingSoon: !isStripeConnectConfigured(),
        webhookUrl: `${appUrl}/api/webhooks/stripe-connect`,
        lastEventAt: fmtWhen(lastStripeEvt?.receivedAt),
      },
      square: {
        key: "square",
        comingSoon: !(isSquareEnabled() && isSecretBoxConfigured()),
        webhookUrl: `${appUrl}/api/webhooks/square`,
        lastEventAt: fmtWhen(lastSquareEvt?.receivedAt),
      },
      connections,
    },
    notifications: {
      prefs: parseNotificationPrefs(me?.notificationPrefsJson),
    },
  };
}
