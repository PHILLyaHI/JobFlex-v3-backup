import type { Metadata } from "next";
import { db } from "@/lib/db";
import { acceptServicePlanPublic } from "@/actions/servicePlans";
import { money, parseBenefits, planPhase, planTermsLine } from "@/lib/servicePlans";

// THE CLIENT'S PLAN PAGE (2026-09-22) — public, keyed by the plan's accept
// token (the link in the email). Before signing: the plan card and a
// typed-name signature. After: the membership — term, next visit, discount.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your service plan", description: "Accept your maintenance plan and see your visits." };

const day = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—");

export default async function PlanAcceptPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await params;
  const sp = (await searchParams) ?? {};
  const plan = await db.servicePlan.findUnique({
    where: { acceptToken: token },
    include: { organization: { select: { name: true, phone: true, billingEmail: true } }, client: { select: { name: true } }, visits: { where: { status: "SCHEDULED" }, orderBy: { dueAt: "asc" }, take: 2, include: { appointment: { select: { startsAt: true } } } } },
  });
  const org = plan?.organization.name ?? "Your contractor";
  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen bg-[color:var(--paper,#f4f2ec)] px-4 py-10">
      <div className="mx-auto w-full max-w-lg rounded-[14px] border border-[color:var(--ink-line,#ddd)] bg-white overflow-hidden">{children}</div>
    </main>
  );
  if (!plan) {
    return shell(
      <div className="p-6">
        <div className="quiet-caps mb-2">Service plan</div>
        <h1 className="text-[20px] font-semibold">This link is not active</h1>
        <p className="mt-2 text-[14px]">The plan may have been replaced. Please contact your contractor for a fresh link.</p>
      </div>,
    );
  }
  const benefits = parseBenefits(plan.benefitsJson);
  const phase = planPhase(plan);
  const signed = plan.status === "ACTIVE" || plan.status === "EXPIRED" || plan.status === "CANCELED";
  const next = plan.visits[0];
  return shell(
    <>
      <div className="p-6 border-b border-[color:var(--ink-line,#ddd)]">
        <div className="quiet-caps mb-2">{org} · service plan</div>
        <h1 className="text-[26px] font-semibold leading-tight">{plan.name}</h1>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat big={String(plan.visitsPerYear)} small={`visit${plan.visitsPerYear === 1 ? "" : "s"} per year`} />
          <Stat big={String(plan.termMonths === 12 ? 1 : plan.termMonths)} small={plan.termMonths === 12 ? "year in duration" : "months in duration"} />
          <Stat big={money(plan.priceCents)} small={plan.billing === "YEARLY" ? "plan cost every year" : "plan cost every month"} />
          <Stat big={`${plan.discountPct}%`} small="discount on jobs" />
        </div>
      </div>
      <div className="p-6 text-[14px] leading-relaxed">
        {plan.description && <p>{plan.description}</p>}
        {benefits.length > 0 && (
          <>
            <div className="quiet-caps mt-5 mb-2">Member benefits</div>
            <ul className="list-disc pl-5 space-y-1">
              {benefits.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </>
        )}
        <div className="quiet-caps mt-5 mb-1">Terms</div>
        <p>{planTermsLine(plan)}. {plan.autoRenew ? "Renews at the end of the term unless you tell us to stop." : "Ends at the end of the term."}</p>

        {signed ? (
          <div className="mt-6 rounded-[10px] border border-[color:var(--ink,#111)] p-4" data-plan-signed>
            <div className="quiet-caps mb-1">{phase === "active" || phase === "expiring" ? "You're a member" : phase === "canceled" ? "Canceled" : "Ended"}</div>
            {sp.accepted === "1" && <p className="font-medium">Thank you — your plan starts today.</p>}
            <p>
              {plan.startsAt ? `${day(plan.startsAt)} – ${day(plan.endsAt)}` : ""}
              {next ? ` · next visit: ${next.label.toLowerCase()} on ${day(next.appointment?.startsAt ?? next.dueAt)} (we'll confirm the time)` : ""}
            </p>
            {plan.discountPct > 0 && <p className="mt-1">Repairs and services for you are billed {plan.discountPct}% off while the plan runs.</p>}
          </div>
        ) : (
          <form action={acceptServicePlanPublic.bind(null, token)} className="mt-6 rounded-[10px] border border-[color:var(--ink,#111)] p-4" data-plan-accept>
            <div className="quiet-caps mb-2">Accept the plan</div>
            <p className="mb-3">Type your full name to accept. Your plan starts today; {org} puts your visits on the calendar and emails the first bill.</p>
            <label className="block text-[12px] font-medium mb-1" htmlFor="plan-name">Full name</label>
            <input id="plan-name" name="name" required minLength={2} defaultValue={plan.client.name} className="w-full rounded-[10px] border border-[color:var(--ink-line,#ccc)] px-3 py-2 text-[14px]" />
            {sp.err === "name" && <p className="mt-2 text-[13px] text-[color:var(--rose,#a33)]">Please type your name.</p>}
            <button type="submit" className="mt-4 rounded-[10px] bg-[color:var(--ink,#111)] px-4 py-2.5 text-[13px] font-medium text-[color:var(--paper,#fff)]">
              Accept and start my plan
            </button>
          </form>
        )}
        <p className="mt-6 text-[12px] text-[color:var(--ink-muted,#666)]">
          Questions? {org}{plan.organization.phone ? ` · ${plan.organization.phone}` : ""}{plan.organization.billingEmail ? ` · ${plan.organization.billingEmail}` : ""}
        </p>
      </div>
    </>,
  );
}

function Stat({ big, small }: { big: string; small: string }) {
  return (
    <div>
      <div className="text-[22px] font-semibold leading-none">{big}</div>
      <div className="mt-1 text-[12px] text-[color:var(--ink-muted,#666)]">{small}</div>
    </div>
  );
}
