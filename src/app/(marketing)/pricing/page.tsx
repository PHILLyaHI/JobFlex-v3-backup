import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatPlanPrice, priceCadence } from "@/lib/planCatalog";
import { getPlanCatalog } from "@/lib/planCatalogServer";

// ISR backstop — instant propagation comes from revalidatePlanSurfaces() firing
// on every admin plan write; this window only covers out-of-band DB edits.
export const revalidate = 3600;

export default async function PricingPage() {
  const plans = await getPlanCatalog();

  return (
    <main className="mx-auto max-w-[1200px] px-6 lg:px-10 py-20">
      <div className="text-center max-w-2xl mx-auto">
        <div className="quiet-caps mb-3">Pricing</div>
        <h1 className="font-display text-[56px] leading-[1.02] tracking-[-0.03em]">
          Pick the plan that matches your operation.
        </h1>
        <p className="mt-4 text-[15px] text-[color:var(--ink-muted)]">
          Every plan includes unlimited clients and a beautiful client portal. Upgrade any time.
        </p>
      </div>

      <div className="mt-14 grid md:grid-cols-3 gap-5">
        {plans.map((p) => (
          <div
            key={p.slug}
            className={
              "paper-card p-8 flex flex-col " +
              (p.highlight ? "shadow-pop bg-[color:var(--paper-deep)]/50" : "")
            }
          >
            {p.highlight && (
              <span className="quiet-caps self-start mb-4 bg-[color:var(--accent)] text-[color:var(--paper)] px-2 py-0.5 rounded-full">
                Most popular
              </span>
            )}
            <div className="font-display text-[24px] tracking-[-0.015em]">{p.name}</div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="stat-numeric text-[48px]">{formatPlanPrice(p.priceCents)}</span>
              <span className="text-[12px] text-[color:var(--ink-muted)]">{priceCadence()}</span>
            </div>
            {p.trialDays > 0 && (
              <div className="mt-1 text-[12px] text-[color:var(--ink-muted)]">
                {p.trialDays}-day free trial
              </div>
            )}
            <p className="mt-3 text-[13px] text-[color:var(--ink-muted)] min-h-[48px]">{p.description}</p>
            <ul className="mt-6 space-y-2.5 text-[13px] flex-1">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 mt-0.5 text-[color:var(--accent)]" />
                  <span className="text-[color:var(--ink-soft)]">{f}</span>
                </li>
              ))}
            </ul>
            <Link href={"/auth/register" as any} className="mt-7">
              <Button className="w-full" variant={p.highlight ? "primary" : "outline"}>
                Start {p.name}
              </Button>
            </Link>
          </div>
        ))}
      </div>
    </main>
  );
}
