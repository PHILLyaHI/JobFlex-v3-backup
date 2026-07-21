import { cn } from "@/lib/cn";

// One skeleton bone. Tinted ink via color-mix — the `bg-[color:var(--x)]/NN`
// shorthand emits no CSS in this project, so opacity lives in the mix.
function Bone({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-full bg-[color-mix(in_srgb,var(--ink)_7%,transparent)]",
        className,
      )}
    />
  );
}

/**
 * Content-area ghost shown by loading.tsx while a page's server render is in
 * flight. Mirrors the house page anatomy (quiet-caps eyebrow → display title →
 * toolbar → hairline ledger card) so the swap to real content feels like the
 * page sharpening into focus, not a layout jump. Deliberately quiet: one
 * uniform pulse, varied bone widths for editorial rhythm, no shimmer sweep.
 */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading page" className="animate-pulse">
      <span className="sr-only">Loading…</span>

      {/* PageHeader ghost */}
      <Bone className="h-2.5 w-28" />
      <Bone className="mt-3.5 h-8 w-72 max-w-full rounded-[var(--r-sm)]" />
      <Bone className="mt-3 h-3 w-96 max-w-full" />

      {/* Toolbar ghost — filter pills + a primary action */}
      <div className="mt-8 flex items-center gap-2">
        <Bone className="h-9 w-24" />
        <Bone className="h-9 w-20" />
        <Bone className="h-9 w-28" />
        <Bone className="ml-auto h-9 w-32 rounded-[var(--r-md)]" />
      </div>

      {/* Ledger card ghost */}
      <div className="paper-card mt-6 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <Bone className="h-3.5 w-40" />
          <Bone className="h-3 w-16" />
        </div>
        <div className="divide-y divide-[color:var(--ink-line)]">
          {["w-2/5", "w-1/4", "w-1/3", "w-3/12"].map((w, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-4">
              <Bone className="h-8 w-8 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Bone className={cn("h-3", w)} />
                <Bone className="h-2.5 w-1/5" />
              </div>
              <Bone className="h-5 w-14 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Secondary card ghost */}
      <div className="paper-card mt-4 space-y-2.5 p-5">
        <Bone className="h-3 w-1/3" />
        <Bone className="h-3 w-1/2" />
      </div>
    </div>
  );
}
