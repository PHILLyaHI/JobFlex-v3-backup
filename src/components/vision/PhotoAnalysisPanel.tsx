"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toast";

export interface PhotoAnalysis {
  materials?: string[];
  estimatedMeasurements?: string;
  conditionNotes?: string;
  suggestedScope?: string;
}

export function PhotoAnalysisPanel({
  photoId,
  analysis,
  aiEnabled,
}: {
  photoId: string;
  analysis: PhotoAnalysis | null;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<PhotoAnalysis | null>(analysis);

  async function analyze() {
    setBusy(true);
    try {
      const res = await fetch(`/api/vision/photo/${photoId}/analyze`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Analyze failed");
      if (data?.disabled) {
        toast.info("AI disabled", "Add OPENAI_API_KEY to enable photo analysis.");
        return;
      }
      setResult(data.analysis);
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't analyze", err?.message);
    } finally {
      setBusy(false);
    }
  }

  if (!result) {
    return (
      <div className="mt-2 relative overflow-hidden rounded-[var(--r-md)] hairline bg-white/50 dark:bg-white/[0.02] px-3 py-2.5">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-70"
          style={{
            background:
              "radial-gradient(ellipse at top right, rgba(31,122,82,0.08), transparent 60%)",
          }}
        />
        <div className="relative flex items-center justify-between gap-2">
          <span className="text-[11px] text-[color:var(--ink-muted)]">
            {aiEnabled ? "Not yet analyzed" : "AI disabled · add OPENAI_API_KEY"}
          </span>
          <Button
            size="sm"
            variant="ghost"
            loading={busy}
            onClick={analyze}
            icon={<Sparkles className="h-3 w-3" />}
          >
            Analyze with AI
          </Button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="mt-2 paper-card p-4"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="quiet-caps">AI analysis</span>
        <button
          onClick={analyze}
          disabled={busy}
          className="h-6 w-6 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.04] disabled:opacity-40"
          aria-label="Re-analyze"
          title="Re-analyze"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px]">
        <AnalysisCell label="Materials">
          {result.materials && result.materials.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {result.materials.map((m) => (
                <Badge key={m} tone="neutral">
                  {m}
                </Badge>
              ))}
            </div>
          ) : (
            <Muted>—</Muted>
          )}
        </AnalysisCell>
        <AnalysisCell label="Measurements">
          {result.estimatedMeasurements ? (
            <span className="tabular text-[color:var(--ink-soft)]">
              {result.estimatedMeasurements}
            </span>
          ) : (
            <Muted>—</Muted>
          )}
        </AnalysisCell>
        <AnalysisCell label="Condition">
          {result.conditionNotes ? (
            <span className="text-[color:var(--ink-soft)]">{result.conditionNotes}</span>
          ) : (
            <Muted>—</Muted>
          )}
        </AnalysisCell>
      </div>
      {result.suggestedScope && (
        <blockquote className="mt-4 pt-3 border-t border-[color:var(--ink-line)] font-display italic text-[13px] leading-relaxed text-[color:var(--ink-soft)]">
          "{result.suggestedScope}"
        </blockquote>
      )}
    </motion.div>
  );
}

function AnalysisCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="quiet-caps mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-[color:var(--ink-faint)]">{children}</span>;
}
