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
  requireOrg,
} from "@/lib/orgContext";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { longDate, money } from "@/lib/format";
import { titleCaseSlug, formatPlanPrice } from "@/lib/planCatalog";
import { getOrgPlanContext, getPlanCatalog } from "@/lib/planCatalogServer";
import { getOrgLimitUsage } from "@/lib/limitsEngine";
import { GMAIL_SCOPES } from "@/lib/sdk/gmail";
import { listSubscriptionInvoices } from "@/actions/billing";
import {
  META_DEFAULTS,
  parseGmailSettings,
  parseMetaSettings,
  parsePaymentSettings,
} from "@/lib/settings";
import { SettingsContent } from "@/components/v3/settings-blueprint/settings-content";
import {
  PAYMENT_HISTORY_INVOICE_LABEL,
  PLAN_UNLIMITED,
  parseNotificationPrefs,
} from "@/components/v3/settings-blueprint/settings-data";
import type {
  Badge,
  PaymentHistoryRow,
  PlanRow,
  SettingsData,
} from "@/components/v3/settings-blueprint/settings-data";

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

/** An absent limit means unlimited; 0 means the plan sells none of it. */
function limitCell(limit: number | undefined, suffix = ""): string {
  if (limit === undefined || limit === null || limit < 0) return PLAN_UNLIMITED;
  if (limit === 0) return "—";
  return `${limit}${suffix}`;
}

export default async function SettingsPage() {
  let ctx;
  try {
    ctx = await requireOrg();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Fsettings");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  const { organizationId, user, role } = ctx;

  const [me, org, sub, planContext, plans, usage, templates, appUrl] = await Promise.all([
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
    getPlanCatalog(),
    getOrgLimitUsage(organizationId),
    db.emailTemplate.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      take: 25,
    }),
    appBaseUrl(),
  ]);

  if (!org) redirect("/dashboard?error=forbidden");

  /* ── plan + seats ── */
  const planName = planContext.plan?.name ?? titleCaseSlug(planContext.rawPlan);
  const currentSlug = (planContext.plan?.slug ?? planContext.rawPlan).toLowerCase();
  const seatStatus = usage.find((u) => u.resource === "teamSeats");
  const seatsUsed = seatStatus?.used ?? 0;
  const seats =
    seatStatus && seatStatus.limit !== null
      ? `${seatsUsed} of ${seatStatus.limit}`
      : `${seatsUsed}`;
  const nextBillAt = sub?.currentPeriodEnd ?? sub?.trialEndsAt ?? null;

  const planRows: PlanRow[] = plans.map((p) => ({
    plan: p.name,
    seats: limitCell(p.limits.teamSeats),
    proposals: limitCell(p.limits.proposalsCreated, " / mo"),
    estimators: limitCell(p.limits.estimatorUses, " / mo"),
    price: formatPlanPrice(p.priceCents),
    current: p.slug.toLowerCase() === currentSlug,
  }));

  /* ── real Stripe subscription invoices ──
     listSubscriptionInvoices is owner-gated and returns { available: false }
     whenever Stripe is off or the org has no customer yet; a non-owner simply
     gets the same empty state rather than a page crash. */
  let history: PaymentHistoryRow[] = [];
  let historyAvailable = false;
  try {
    const res = await listSubscriptionInvoices();
    historyAvailable = res.available;
    history = res.invoices.map((inv) => ({
      id: inv.id,
      date: longDate(new Date(inv.created * 1000)),
      description: inv.number ? `${planName} · ${inv.number}` : planName,
      amount: money(inv.amountPaidCents / 100, inv.currency),
      invoiceLabel: PAYMENT_HISTORY_INVOICE_LABEL,
      invoiceIcon: "i-download",
      invoiceHref: inv.invoicePdf ?? inv.hostedInvoiceUrl,
    }));
  } catch {
    // Not the owner (or Stripe threw) — the card shows its empty state.
  }

  /* ── settings blobs ── */
  const payment = parsePaymentSettings(org.paymentSettingsJson);
  const gmail = parseGmailSettings(org.gmailSettingsJson);
  const meta = parseMetaSettings(org.metaSettingsJson);
  // The connection is the presence of real OAuth tokens, never the settings
  // blob's own flag (which the OAuth callback owns and the form must not set).
  const gmailConnected = Boolean(org.gmailTokensJson);

  // META_DEFAULTS.defaultPage is itself a leftover demo string ("Patel Roofing
  // & Co."), so an org that has never saved Meta settings must fall back to its
  // OWN name rather than surfacing that placeholder as a real page.
  const savedMetaPage =
    meta.defaultPage && meta.defaultPage !== META_DEFAULTS.defaultPage
      ? meta.defaultPage
      : "";
  const pageOptions = Array.from(
    new Set([org.name, savedMetaPage].filter((v) => Boolean(v))),
  );

  const data: SettingsData = {
    account: {
      name: me?.name ?? user.name ?? "",
      email: me?.email ?? user.email ?? "",
      phone: me?.phone ?? "",
      role: roleLabel(role),
      roleBadge: roleLabel(role),
      canEditBusiness: isOwnerOrManager(role),
      business: {
        name: org.name,
        address: org.address ?? "",
        website: org.website ?? "",
        phone: org.phone ?? "",
      },
      security: {
        passwordDesc: "Change it with a link sent to your email address.",
        twoFactorDesc: "Not available on this account yet.",
        sessionsDesc: "1 device · this browser.",
      },
      forgotHref: "/auth/forgot",
    },
    payments: {
      processors: {
        stripe: payment.stripe,
        square: payment.square,
        paypal: payment.paypal,
        ach: payment.ach,
      },
      currency: payment.currency,
      depositPct: String(payment.depositPct),
      netTerms: payment.netTerms,
      lateFeePct: payment.lateFeePct,
      automations: {
        autoRemind: payment.autoRemind,
        lateFees: payment.lateFees,
        receiptsOnPayment: payment.receiptsOnPayment,
      },
    },
    billing: {
      planName,
      planBadge: statusBadge(sub?.status ?? null),
      nextBill: nextBillAt ? longDate(nextBillAt) : "",
      seats,
      billingEmail: org.billingEmail ?? "",
      plans: planRows,
      history,
      historyAvailable,
      upgradeHref: "/dashboard/upgrade",
    },
    integrations: {
      gmail: {
        connected: gmailConnected,
        connectedEmail: gmail.connectedEmail,
        displayName: gmail.displayName,
        replyTo: gmail.replyTo,
        signature: gmail.signature,
        sendFromUser: gmail.sendFromUser,
        trackOpens: gmail.trackOpens,
        autoSync: gmail.autoSync,
        displayNamePlaceholder: org.name,
        replyToPlaceholder: me?.email ?? user.email ?? "",
        // The scopes the OAuth route really asks for, short form. Empty until a
        // connection exists — nothing has been granted before that.
        scopes: gmailConnected
          ? GMAIL_SCOPES.map((s) => s.split("/auth/")[1] ?? s)
          : [],
        connectHref: "/api/integrations/gmail/connect",
      },
      meta: {
        // META_DEFAULTS ships `connected: true` for the demo org. An org that
        // has never saved Meta settings has connected nothing, so the badge
        // must read "Not connected" until the column actually exists.
        connected: org.metaSettingsJson ? meta.connected : false,
        orgName: org.name,
        autoCreate: meta.autoCreate,
        autoText: meta.autoText,
        defaultPage: savedMetaPage || org.name,
        pageOptions,
        formCategory: meta.formCategory,
        callbackUrl: `${appUrl}/api/webhooks/meta`,
      },
      templates: templates.map((t) => ({
        id: t.id,
        kind: t.category ?? t.name,
        subject: t.subject,
        trigger: t.name,
      })),
      // Nothing records webhook deliveries — no model, no route.
      webhooks: [],
      emailConfigured: Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST),
    },
    notifications: parseNotificationPrefs(me?.notificationPrefsJson),
  };

  return <SettingsContent data={data} />;
}
