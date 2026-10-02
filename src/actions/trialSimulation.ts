"use server";
import { randomUUID } from "node:crypto";
import { requirePlatformAdmin, requireBillingOwner } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { mintSigninTicket } from "@/lib/signinTicket";
import { getPlanCatalog } from "@/lib/planCatalogServer";
import { simulationKey } from "@/lib/trialSimulation";
import { cardlessKey } from "@/lib/trialState";

/** Dedicated real tenant per administrator. No Stripe request or live charge. */
export async function resetTrialSimulation() {
  const admin = await requirePlatformAdmin();
  const catalog = await getPlanCatalog();
  const plan = catalog.find(p => p.active && !p.isFree && p.highlight) ?? catalog.find(p => p.active && !p.isFree);
  if (!plan) throw new Error("Add an active paid plan before testing.");
  const ownerKey = "trialSimulation:admin:" + admin.id;
  const existing = await db.syncState.findUnique({ where: { key: ownerKey } });
  const orgId = existing ? JSON.parse(existing.cursor).orgId as string : "trial-" + randomUUID();
  const userId = existing ? JSON.parse(existing.cursor).userId as string : "trial-" + randomUUID();
  const start = new Date(); const end = new Date(start.getTime() + 5 * 60000);
  const subId = "simulation_" + orgId;
  await db.$transaction(async tx => {
    if (!existing) {
      await tx.organization.create({ data: { id: orgId, name: "Trial simulation — test workspace", slug: orgId, address: "Test workspace", tradeTypesJson: '["remodeling"]', smsClientsOn: false } });
      await tx.user.create({ data: { id: userId, name: "Trial tester", email: userId + "@jobflex.invalid", emailVerified: start, activeOrgId: orgId } });
      await tx.membership.create({ data: { organizationId: orgId, userId, role: "OWNER" } });
      await tx.syncState.create({ data: { key: ownerKey, cursor: JSON.stringify({ orgId, userId }) } });
      await tx.syncState.create({ data: { key: simulationKey(orgId), cursor: JSON.stringify({ adminId: admin.id, userId }) } });
    }
    const data = { plan: plan.slug.toUpperCase(), status: "TRIALING", provider: "STRIPE", externalSubId: subId, externalCustomerId: null, trialEndsAt: end, currentPeriodEnd: end };
    await tx.subscription.upsert({ where: { organizationId: orgId }, create: { organizationId: orgId, ...data }, update: data });
    const cursor = JSON.stringify({ simulationPending: true, subId, customerId: "", planSlug: plan.slug, interval: "MONTH", customPages: [], mode: "test", startedAt: start.toISOString(), endsAt: end.toISOString() });
    await tx.syncState.upsert({ where: { key: cardlessKey(orgId) }, create: { key: cardlessKey(orgId), cursor }, update: { cursor } });
  }, { maxWait: 10000, timeout: 30000 });
  return { ticket: await mintSigninTicket(userId), endsAt: end.toISOString() };
}

/** Start once the real workspace mounts, so compilation/login cannot spend the 15 seconds. */
export async function beginTrialSimulation() {
  const admin = await requirePlatformAdmin();
  const { organizationId, user } = await requireBillingOwner();
  const marker = await db.syncState.findUnique({ where: { key: simulationKey(organizationId) } });
  if (!marker) return;
  const owner = JSON.parse(marker.cursor);
  if (owner.adminId !== admin.id || owner.userId !== user.id) throw new Error("This test workspace belongs to another administrator.");
  return db.$transaction(async tx => {
    const row = await tx.syncState.findUnique({ where: { key: cardlessKey(organizationId) } });
    if (!row) return;
    const rec = JSON.parse(row.cursor);
    if (!rec.simulationPending) return rec.endsAt as string;
    const end = new Date(Date.now() + 15000);
    const claimed = await tx.syncState.updateMany({ where: { key: row.key, cursor: row.cursor }, data: { cursor: JSON.stringify({ ...rec, simulationPending: false, endsAt: end.toISOString() }) } });
    if (claimed.count) {
      await tx.subscription.update({ where: { organizationId }, data: { trialEndsAt: end, currentPeriodEnd: end } });
      return end.toISOString();
    }
    const current = await tx.syncState.findUnique({ where: { key: row.key } });
    return current ? JSON.parse(current.cursor).endsAt as string : undefined;
  }, { maxWait: 10000, timeout: 30000 });
}
