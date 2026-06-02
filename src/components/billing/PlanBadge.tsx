import Link from "next/link";
import { cn } from "@/lib/cn";

const LABELS: Record<string, string> = {
  FREE: "Free",
  STARTER: "Starter",
  PROFESSIONAL: "Professional",
  ENTERPRISE: "Enterprise",
};

export function PlanBadge({ plan = "FREE" }: { plan?: string | null }) {
  const p = plan ?? "FREE";
  const paid = p !== "FREE";
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
        {LABELS[p] ?? p}
      </span>
    </Link>
  );
}
