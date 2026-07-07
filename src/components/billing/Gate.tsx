import Link from "next/link";
import { Lock, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  FEATURE_LABELS,
  MINIMUM_PLAN_FOR,
  hasFeature,
  type Feature,
  type Plan,
} from "@/lib/entitlements";
import { labelForTier } from "@/lib/planCatalog";

interface GateProps {
  feature: Feature;
  currentPlan: Plan;
  children: React.ReactNode;
  className?: string;
  description?: string;
}

export function Gate({ feature, currentPlan, children, className, description }: GateProps) {
  if (hasFeature(currentPlan, feature)) return <>{children}</>;
  return (
    <GateUpgradeCard
      feature={feature}
      currentPlan={currentPlan}
      description={description}
      className={className}
    />
  );
}

function GateUpgradeCard({
  feature,
  currentPlan,
  description,
  className,
}: {
  feature: Feature;
  currentPlan: Plan;
  description?: string;
  className?: string;
}) {
  const required = MINIMUM_PLAN_FOR[feature];
  const label = FEATURE_LABELS[feature] ?? feature;
  return (
    <div
      className={cn(
        "paper-card p-8 flex flex-col items-start gap-5 relative overflow-hidden",
        className,
      )}
    >
      <div
        aria-hidden
        className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-[color:var(--accent)]/[0.06] blur-2xl pointer-events-none"
      />
      <div className="h-10 w-10 rounded-[var(--r-md)] bg-[color:var(--accent-soft)] text-[color:var(--accent)] grid place-items-center">
        <Lock className="h-4 w-4" />
      </div>
      <div className="space-y-1.5">
        <div className="quiet-caps">{labelForTier(required)} feature</div>
        <h3 className="font-display text-[22px] tracking-[-0.015em]">{label}</h3>
        {description && (
          <p className="text-[13px] text-[color:var(--ink-muted)] leading-relaxed max-w-md">
            {description}
          </p>
        )}
      </div>
      <div className="text-[11px] text-[color:var(--ink-faint)] tabular">
        Currently on <span className="text-[color:var(--ink-soft)]">{labelForTier(currentPlan)}</span>
      </div>
      <div className="flex items-center gap-2 pt-2">
        <Link href={"/dashboard/settings/billing" as any}>
          <Button size="sm" icon={<ArrowUpRight className="h-3.5 w-3.5" />}>
            Upgrade to {labelForTier(required)}
          </Button>
        </Link>
        <Link href={"/pricing" as any}>
          <Button size="sm" variant="ghost">
            Learn more
          </Button>
        </Link>
      </div>
    </div>
  );
}

export function GateInline({
  feature,
  currentPlan,
  className,
}: {
  feature: Feature;
  currentPlan: Plan;
  className?: string;
}) {
  if (hasFeature(currentPlan, feature)) return null;
  const required = MINIMUM_PLAN_FOR[feature];
  return (
    <Link
      href={"/dashboard/settings/billing" as any}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)] hover:brightness-95 transition-all",
        className,
      )}
    >
      <Lock className="h-3 w-3" />
      {labelForTier(required)} · upgrade
    </Link>
  );
}
