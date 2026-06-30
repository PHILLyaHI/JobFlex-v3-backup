"use client";
import * as React from "react";
import { getLimitUsage } from "@/actions/limits";
import { LIMIT_DEFS, type LimitKey } from "@/lib/planLimits";
import { cn } from "@/lib/cn";

interface Usage {
  limit: number | null;
  used: number;
  remaining: number | null;
}

/**
 * Minimal "used of limit" meter with a depleting hairline. Renders nothing when
 * the resource is unlimited (limit === null) or still loading — so it only
 * appears when there's a real cap to count down against.
 *
 *   <UsageMeter resource="jobs" />   →   "Jobs · 2 of 5" + thin sage bar
 */
export function UsageMeter({
  resource,
  label,
  className,
}: {
  resource: LimitKey;
  label?: string;
  className?: string;
}) {
  const [usage, setUsage] = React.useState<Usage | null>(null);

  React.useEffect(() => {
    let alive = true;
    getLimitUsage(resource)
      .then((s) => alive && setUsage({ limit: s.limit, used: s.used, remaining: s.remaining }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [resource]);

  // Unlimited or not yet loaded → no counter (the spec: unlimited shows nothing).
  if (!usage || usage.limit === null) return null;

  const { used, limit } = usage;
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const atLimit = used >= limit;
  const text = label ?? LIMIT_DEFS.find((d) => d.key === resource)?.label ?? resource;

  return (
    <div className={cn("inline-flex w-full max-w-[200px] flex-col gap-1", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="quiet-caps !mb-0">{text}</span>
        <span
          className={cn(
            "tabular text-[11px]",
            atLimit ? "text-[color:var(--rose)]" : "text-[color:var(--ink-soft)]",
          )}
        >
          {used} of {limit}
        </span>
      </div>
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-[color:var(--ink-line)]"
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${pct}%`,
            background: atLimit ? "var(--rose)" : "var(--accent)",
          }}
        />
      </div>
    </div>
  );
}
