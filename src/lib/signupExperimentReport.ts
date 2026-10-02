import "server-only";
import { db } from "@/lib/db";
import { SIGNUP_EXPERIMENT, type SignupAssignment } from "@/lib/signupExperiment";

type Registration = SignupAssignment & { orgId: string; userId: string; customerId?: string; registeredAt: number };
type Invoice = { customerId: string; paidAt: number; cents: number; live: boolean };
const WINDOW = 14 * 86400000;
export async function signupExperimentReport() {
  const rows = await db.syncState.findMany({ where: { key: { startsWith: SIGNUP_EXPERIMENT + ":" } }, select: { key: true, cursor: true } });
  const browsers: SignupAssignment[] = [], registrations: Registration[] = [], invoices: Invoice[] = [];
  for (const row of rows) {
    const value = JSON.parse(row.cursor);
    if (row.key.includes(":browser:") && value.environment === "production") browsers.push(value);
    if (row.key.includes(":org:") && value.environment === "production") registrations.push(value);
    if (row.key.includes(":invoice:") && value.live && value.cents > 0) invoices.push(value);
  }
  const subs = registrations.length ? await db.subscription.findMany({ where: { organizationId: { in: registrations.map(r => r.orgId) } }, select: { organizationId: true, externalCustomerId: true } }) : [];
  const customers = new Map(subs.map(s => [s.organizationId, s.externalCustomerId]));
  const paidByCustomer = new Map<string, number[]>();
  for (const i of invoices) {
    const times = paidByCustomer.get(i.customerId) ?? [];
    times.push(i.paidAt);
    paidByCustomer.set(i.customerId, times);
  }
  // Stripe can confirm a payment just before the registration transaction
  // commits. Compare with browser assignment, not the later account timestamp.
  const firstPayment = (r: Registration) => {
    const cid = r.customerId || customers.get(r.orgId);
    const times = cid ? (paidByCustomer.get(cid) ?? []).filter(t => t >= r.at && t <= Date.now()) : [];
    return times.length ? Math.min(...times) : null;
  };
  const now = Date.now();
  const cohorts = (["a", "b"] as const).map(variant => {
    const assigned = browsers.filter(b => b.variant === variant);
    const ids = new Set(assigned.map(b => b.id));
    const registered = registrations.filter(r => r.variant === variant && ids.has(r.id));
    // Legacy assignments predate the switch and were all randomized 50/50.
    const randomized = assigned.filter(b => !b.allocation || b.allocation === "split");
    const mature = randomized.filter(b => b.at <= now - WINDOW);
    const matureIds = new Set(mature.map(b => b.id));
    const paid = registered.filter(r => firstPayment(r) !== null);
    const converted = paid.filter(r => {
      const at = firstPayment(r);
      return at !== null && at <= r.at + WINDOW && matureIds.has(r.id);
    });
    const registeredBrowsers = new Set(registered.map(r => r.id)).size;
    const paidBrowsers = new Set(converted.map(r => r.id)).size;
    return { variant, assigned: assigned.length, registered: registered.length, registeredBrowsers, paid: new Set(paid.map(r => r.userId)).size,
      randomized: randomized.length, singleVariant: assigned.length - randomized.length,
      mature: mature.length, converted: paidBrowsers, registrationRate: assigned.length ? registeredBrowsers / assigned.length : 0,
      paidRate: mature.length ? paidBrowsers / mature.length : 0 };
  });
  const [a,b] = cohorts;
  const pooled = (a.converted + b.converted) / Math.max(1,a.mature+b.mature);
  const se = Math.sqrt(pooled*(1-pooled)*(1/Math.max(1,a.mature)+1/Math.max(1,b.mature)));
  const oldest = browsers.filter(b => !b.allocation || b.allocation === "split").reduce((min,b) => Math.min(min,b.at), now);
  // Fixed planning assumptions: baseline 5%, relative lift 25%, alpha .05, power .80.
  // Do not call a winner while cohorts are still immature or underpowered.
  const ready = a.mature >= 5400 && b.mature >= 5400 && now-oldest >= 28*86400000;
  const significant = ready && se > 0 && Math.abs(a.paidRate-b.paidRate)/se >= 1.96;
  return { cohorts, winner: significant ? (a.paidRate>b.paidRate ? "A" : "B") : null, updatedAt: new Date(now).toISOString() };
}
