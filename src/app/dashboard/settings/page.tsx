// Settings — Blueprint edition. Port of the canonical settings donor
// (jobflex-settings-blueprint (6).html), with the owner's fix list applied on
// top (F1-F18: the three-column security row, the flush danger row, the
// processor cleanup, the custom dropdowns, the add-payout modal, the icon-less
// toggles, the notification event icons and column toggles).
//
// The sidebar, topbar, graph-paper field and shared sprite come from the shell
// mounted in ../layout.tsx, so this page renders only the donor's `.content`
// children. The classic settings index that used to serve this URL — a bare
// redirect to /dashboard/settings/account — was archived to
// old-design-pages/dashboard/settings/page.tsx.
//
// Its CHILD routes are untouched: /dashboard/settings/account, /billing,
// /team, /gmail, /meta and the rest still live under the (dashboard) route
// group and keep the classic layout.
//
// THIS PAGE IS THE SETTINGS READ. Every value the five panes render is loaded
// here and threaded down as one `SettingsData` object; components/v3/
// settings-blueprint/settings-data.ts keeps only the donor's copy, types and
// option lists. Reads live here rather than in a "use server" module on
// purpose: an exported async function in an action file is a public RPC
// endpoint, so a read keyed by a caller-supplied org id would be a data leak.
//
// Writes reuse what already existed wherever possible —
// `updatePaymentSettings` / `updateGmailSettings` / `updateMetaSettings` /
// `disconnectGmail` from src/actions/settings.ts — plus the three new
// account-scoped writes in src/actions/accountSettings.ts.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  NoOrgError,
  UnauthorizedError,
  isOwnerOrManager,
  isOwnerRole,
  requireOrg,
} from "@/lib/orgContext";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { longDate } from "@/lib/format";
import { titleCaseSlug } from "@/lib/planCatalog";
import { getOrgPlanContext } from "@/lib/planCatalogServer";
import { getOrgLimitUsage } from "@/lib/limitsEngine";
import { GMAIL_SCOPES } from "@/lib/sdk/gmail";
import { getPaymentConnectionStatus } from "@/lib/payments/connections";
import { parseNotificationPrefs } from "@/lib/notificationPrefsShared";
import { META_DEFAULTS, parseGmailSettings, parseMetaSettings, parsePaymentSettings } from "@/lib/settings";
import { SettingsContent } from "@/components/v3/settings-blueprint/settings-content";
import type { Badge, SettingsData } from "@/components/v3/settings-blueprint/settings-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Settings",
  description:
    "Settings — account, payments, billing, integrations and notifications on one sheet.",
};

/** "OWNER" → "Owner"; the Profile card's `.badge2` and read-only Role field. */
function roleLabel(role: string): string {
  const clean = role.replace(/_/g, " ").toLowerCase();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** Subscription status → the donor's `.badge2` tones. */
function statusBadge(status: string | null): Badge | null {
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

const PANE_KEYS = ["account", "payments", "billing", "integrations", "notifications"] as const;
type PaneKey = (typeof PANE_KEYS)[number];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ pane?: string }>;
}) {
  // ?pane= deep-link: the legacy /dashboard/settings/* child routes redirect
  // here and land on their pane. An unknown value falls back to the default.
  const rawPane = (await searchParams).pane;
  const initialPane = PANE_KEYS.includes(rawPane as PaneKey) ? (rawPane as PaneKey) : undefined;
  let ctx;
  try {
    ctx = await requireOrg();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Fsettings");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

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

  if (!org) redirect("/dashboard?error=forbidden");

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

  const data: SettingsData = {
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
        connected: org.metaSettingsJson ? meta.connected : false,
        orgName: org.name,
        // Round-tripped untouched through updateMetaSettings; the Default
        // lead handling card that edited these is gone.
        defaultPage: savedMetaPage || org.name,
        formCategory: meta.formCategory,
      },
      stripe: {
        key: "stripe",
        webhookUrl: `${appUrl}/api/webhooks/stripe-connect`,
        lastEventAt: fmtWhen(lastStripeEvt?.receivedAt),
      },
      square: {
        key: "square",
        webhookUrl: `${appUrl}/api/webhooks/square`,
        lastEventAt: fmtWhen(lastSquareEvt?.receivedAt),
      },
      connections,
    },
    notifications: {
      prefs: parseNotificationPrefs(me?.notificationPrefsJson),
    },
  };

  return <SettingsContent data={data} initialPane={initialPane} />;
}
