// Post-import assertions, run against the target after the transaction commits.
//
// These are the conditions that decide whether the migrated customer can actually
// use the app, not just whether the rows landed.
import type { Writer } from "./client";
import type { Manifest } from "./phases";
import { isLapsed } from "./map";
import { DEFAULT_FREE_LIMITS, parsePlanLimits } from "../../src/lib/planLimits";

export interface Check {
  ok: boolean;
  label: string;
  detail: string;
}

export async function verify(db: Writer, manifest: Manifest, expectedHash?: string | null): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (ok: boolean, label: string, detail: string) => checks.push({ ok, label, detail });

  const user = await db.user.findUnique({ where: { id: manifest.userId } });
  const org = await db.organization.findUnique({ where: { id: manifest.organizationId } });

  add(!!user, "user exists", user ? `${user.email}` : "missing");

  // An account with no hash never had a password in the old app either — it signs
  // in with Google. That is fine as long as the Google link came across; without
  // one it can reach nothing and needs a set-a-password mail.
  const googleLink = await db.account.findFirst({ where: { userId: manifest.userId, provider: "google" } });
  const hashOk = !!user?.hashedPassword && /^\$2[aby]\$\d\d\$.{53}$/.test(user.hashedPassword);
  // v3's Google signIn callback (src/lib/auth.ts) resolves an EXISTING user by
  // email and returns true — the Account row is an audit trail, not a
  // requirement. So a verified address is enough on its own, which matters for
  // the old accounts whose Account row was never written.
  const googleCapable = !!googleLink || !!user?.emailVerified;
  add(
    hashOk || googleCapable,
    "can sign in",
    hashOk
      ? `password · ${user!.hashedPassword!.slice(0, 7)}… (${user!.hashedPassword!.length} chars)`
      : googleLink
        ? "Google — no password in the old app either; the Google link came across"
        : googleCapable
          ? "Google — no password and no stored link, but the address is verified so Google sign-in resolves it by email"
          : "NO PASSWORD, NO VERIFIED ADDRESS — this account needs a set-a-password mail",
  );
  add(user?.email === user?.email?.toLowerCase(), "email is lower-cased", user?.email ?? "-");
  if (expectedHash) {
    // The decisive check: the stored credential is byte-for-byte the old one, so
    // the customer's existing password verifies without anyone knowing it.
    add(
      user?.hashedPassword === expectedHash,
      "stored hash is exactly the old JobFlex hash",
      user?.hashedPassword === expectedHash ? "identical" : "DIFFERENT — the old password will not work",
    );
  }
  // credentialVersion only means something when this run touched the credential.
  // A fresh import must leave it at 0 (any change invalidates live sessions); a
  // password takeover must bump it; a re-run over an account already imported
  // asserts neither, because the value it finds is the earlier run's own work.
  const createdUser = (manifest.created["User"] ?? []).includes(manifest.userId);
  if (manifest.passwordTakeover) {
    add(
      (user?.credentialVersion ?? 0) > manifest.passwordTakeover.previousCredentialVersion,
      "credentialVersion bumped (sessions under the old password ended)",
      String(user?.credentialVersion),
    );
  } else if (createdUser) {
    add(user?.credentialVersion === 0, "credentialVersion untouched", String(user?.credentialVersion));
  }
  add(user?.activeOrgId === manifest.organizationId, "activeOrgId points at the new org", user?.activeOrgId ?? "null");

  // requireOrg(): a live membership is what stops every page redirecting.
  const membership = await db.membership.findFirst({
    where: { userId: manifest.userId, organizationId: manifest.organizationId, organization: { deletedAt: null } },
  });
  add(!!membership, "requireOrg() will resolve (live membership)", membership ? `role ${membership.role}` : "NO MEMBERSHIP");
  add(membership?.role === "OWNER", "role is OWNER", membership?.role ?? "-");
  add(org?.deletedAt === null, "organization is not soft-deleted", String(org?.deletedAt));

  // needsCompanySetup(): both empty means an endless bounce to the setup wizard.
  let trades: unknown = [];
  try {
    trades = JSON.parse(org?.tradeTypesJson ?? "[]");
  } catch {
    trades = [];
  }
  const hasTrade = Array.isArray(trades) && trades.length > 0;
  const needsSetup = !org?.address?.trim() && !hasTrade;
  add(!needsSetup, "will NOT be bounced to /auth/register?setup=1", needsSetup ? "address AND trades are both empty" : `address=${org?.address ? "set" : "-"} trades=${JSON.stringify(trades)}`);

  const sub = await db.subscription.findUnique({ where: { organizationId: manifest.organizationId } });
  add(!!sub, "subscription row exists", sub ? `${sub.plan} / ${sub.status}` : "none");
  if (manifest.billing) {
    // The shape decides who may rewrite the row later: STRIPE means Stripe's
    // syncs own it, MANUAL means they leave it alone.
    const want = manifest.billing === "stripe" ? "STRIPE" : "MANUAL";
    add(
      sub?.provider === want && (want === "STRIPE" ? !!sub?.externalSubId : !sub?.externalSubId),
      want === "STRIPE" ? "recorded as a Stripe-managed subscription" : "recorded as a hand grant the sync will not touch",
      `${sub?.provider} · ${sub?.externalSubId ?? "no stripe link"} · ends ${sub?.currentPeriodEnd?.toISOString().slice(0, 10) ?? "never"}`,
    );
  }
  const catalog = await db.pricingPlan.findMany({ select: { slug: true, name: true } });
  const catalogHit = catalog.find((p) => p.slug.toLowerCase() === (sub?.plan ?? "").toLowerCase());
  add(
    !!catalogHit,
    "plan names a real catalogue plan (else limits silently resolve to unlimited)",
    catalogHit ? `${sub?.plan} = "${catalogHit.name}"` : `${sub?.plan} matches no PricingPlan.slug`,
  );
  add(sub?.plan?.toUpperCase() !== "CUSTOM", "plan is not CUSTOM (would gate pages behind UpgradeGate)", sub?.plan ?? "-");

  const lapsed = sub
    ? isLapsed({ status: sub.status, currentPeriodEnd: sub.currentPeriodEnd, trialEndsAt: sub.trialEndsAt })
    : false;
  const plans = await db.pricingPlan.findMany({ select: { slug: true, limitsJson: true } });
  const planRow = plans.find((p) => p.slug.toLowerCase() === (lapsed ? "free" : (sub?.plan ?? "free").toLowerCase()));
  const limits = lapsed && !planRow ? DEFAULT_FREE_LIMITS : parsePlanLimits(planRow?.limitsJson ?? null);
  add(!lapsed, "subscription does not read as lapsed", lapsed ? `LAPSED — falls back to FREE limits` : `${sub?.status}, ends ${sub?.currentPeriodEnd?.toISOString() ?? "never"}`);

  // Lifetime-scoped limits are the ones that can brick an org on arrival.
  const [clients, proposals, jobs] = await Promise.all([
    db.client.count({ where: { organizationId: manifest.organizationId, deletedAt: null } }),
    db.proposal.count({ where: { organizationId: manifest.organizationId } }),
    db.job.count({ where: { organizationId: manifest.organizationId } }),
  ]);
  const cap = limits.clients;
  add(
    cap === undefined || cap < 0 || clients < cap,
    "room left under the lifetime client limit",
    `${clients} client(s), cap ${cap ?? "unlimited"}`,
  );

  // Orphans: a dangling FK renders as a blank or throws on the detail page.
  const orphanProposals = await db.proposal.count({
    where: { organizationId: manifest.organizationId, clientId: { not: null }, client: null },
  });
  add(orphanProposals === 0, "no proposal points at a missing client", `${orphanProposals} orphan(s)`);

  const items = await db.lineItem.findMany({
    where: { proposal: { organizationId: manifest.organizationId } },
    select: { proposalId: true, quantity: true, unitPrice: true, total: true },
  });
  const byProposal = new Map<string, { sum: number; sell: number }>();
  for (const i of items) {
    const e = byProposal.get(i.proposalId) ?? { sum: 0, sell: 0 };
    e.sum += i.total;
    e.sell += i.quantity * i.unitPrice;
    byProposal.set(i.proposalId, e);
  }
  const rows = await db.proposal.findMany({
    where: { organizationId: manifest.organizationId },
    select: { id: true, title: true, subtotal: true, total: true, status: true },
  });
  const drifters = rows.filter((p) => {
    const e = byProposal.get(p.id);
    return e ? Math.abs(e.sell - p.subtotal) > 0.01 : false;
  });
  add(
    drifters.length === 0,
    "every proposal re-prices to the same subtotal if edited",
    drifters.length ? drifters.map((d) => `${d.title} (${d.id})`).join(", ") : `${rows.length} proposal(s) checked`,
  );

  console.log(`\n  counts: ${clients} clients · ${proposals} proposals · ${jobs} jobs`);
  return checks;
}
