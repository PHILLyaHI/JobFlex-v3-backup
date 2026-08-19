import Link from "next/link";
import { cn } from "@/lib/cn";
import { labelForTier } from "@/lib/planCatalog";

export function PlanBadge({ plan = null }: { plan?: string | null }) {
  // No subscription → a quiet dash, not a plan name (the Free tier is gone).
  const paid = plan !== null;
  return (
    <Link
      href={"/dashboard/settings/billing" as any}
      className="group inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full hairline bg-white/60 dark:bg-white/[0.04] hover:bg-[color:var(--accent-soft)]/50 transition-colors"
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          paid ? "bg-[color:var(--accent)] shadow-[0_0_0_3px_rgba(31,122,82,0.15)]" : "bg-[color:var(--ink-faint)]",
        )}
      />
      <span className="text-[10px] tracking-[0.14em] uppercase font-medium text-[color:var(--ink-soft)]">
        {labelForTier(plan)}
      </span>
    </Link>
  );
}
