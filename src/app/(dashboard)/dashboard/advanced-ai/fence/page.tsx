import Link from "next/link";
import { ArrowRight, Boxes } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FenceEstimatorForm } from "@/components/estimator/fence/FenceEstimatorForm";

export default function FenceEstimatorPage() {
  return (
    <>
      <PageHeader
        eyebrow="Automation · AI"
        title="Fence estimator"
        description="Linear footage, material, gates, slope. Priced breakdown ready to convert to a proposal."
      />
      <div className="max-w-xl mx-auto mb-5">
        <Link
          href="/dashboard/advanced-ai/fence/studio"
          className="group flex items-center gap-3 rounded-[var(--r-lg)] bg-[color:var(--accent-soft)] hairline px-4 py-3 transition-shadow hover:shadow-[var(--shadow-sm)]"
        >
          <span className="grid h-9 w-9 place-items-center rounded-[var(--r-md)] bg-[color:var(--accent)] text-white shrink-0">
            <Boxes className="h-4 w-4" />
          </span>
          <span className="flex-1">
            <span className="block text-[13px] font-medium text-[color:var(--accent-ink)]">
              New · 3D Fence Studio
            </span>
            <span className="block text-[12px] text-[color:var(--ink-muted)]">
              Shape the run and price it live in an interactive 3D sandbox.
            </span>
          </span>
          <ArrowRight className="h-4 w-4 text-[color:var(--accent)] transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
      <FenceEstimatorForm />
    </>
  );
}
