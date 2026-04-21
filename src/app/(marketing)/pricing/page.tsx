import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";

const PLANS = [
  {
    name: "Starter",
    price: "$29",
    per: "per month",
    description: "For solo operators who just need to send polished proposals.",
    features: ["10 proposals / month", "Manual builder", "Client portal", "Stripe payments", "Email support"],
  },
  {
    name: "Professional",
    price: "$89",
    per: "per month",
    featured: true,
    description: "For growing crews who want AI and automation.",
    features: [
      "Unlimited proposals",
      "AI proposal drafts",
      "AI estimator",
      "Team seats (up to 5)",
      "Gmail + Stripe + Square",
      "Follow-up automation",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    per: "annual",
    description: "Multi-crew operators with white-label and API needs.",
    features: [
      "Everything in Pro",
      "Unlimited seats",
      "White-label portal",
      "Custom domain",
      "API + webhooks",
      "Dedicated CSM",
    ],
  },
];

export default function PricingPage() {
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
        {PLANS.map((p) => (
          <div
            key={p.name}
            className={
              "paper-card p-8 flex flex-col " +
              (p.featured ? "shadow-pop bg-[color:var(--paper-deep)]/50" : "")
            }
          >
            {p.featured && (
              <span className="quiet-caps self-start mb-4 bg-[color:var(--accent)] text-[color:var(--paper)] px-2 py-0.5 rounded-full">
                Most popular
              </span>
            )}
            <div className="font-display text-[24px] tracking-[-0.015em]">{p.name}</div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="stat-numeric text-[48px]">{p.price}</span>
              <span className="text-[12px] text-[color:var(--ink-muted)]">{p.per}</span>
            </div>
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
              <Button className="w-full" variant={p.featured ? "primary" : "outline"}>
                Start {p.name}
              </Button>
            </Link>
          </div>
        ))}
      </div>
    </main>
  );
}
