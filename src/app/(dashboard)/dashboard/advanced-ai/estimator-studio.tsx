"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Wand2, RotateCcw, Undo2, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { toast } from "@/components/ui/Toast";
import { type ProjectType } from "@/components/estimator/ProjectTypePicker";
import { EstimatorIntakeV2 } from "./estimator-intake-v2";
import {
  EstimatorBreakdown,
  type EstimateLine,
} from "@/components/estimator/EstimatorBreakdown";
import { EstimatorSummary } from "@/components/estimator/EstimatorSummary";
import { ClarifyingQuestions } from "@/components/estimator/ClarifyingQuestions";
import { GenerationProgress, ESTIMATE_STEPS } from "@/components/estimator/GenerationProgress";
import {
  analyzeEstimatePrompt,
  generateAdvancedEstimate,
  refineAdvancedEstimate,
  saveEstimate,
  convertEstimateToProposal,
} from "@/actions/advancedEstimator";
import type {
  ClarifyQuestion,
  EstimateDiscount,
  GeneratedEstimate,
} from "@/lib/estimatorSchema";
import { diffEstimate, type RefineDiff } from "./refine-diff";
import { money } from "@/lib/format";
import {
  reportPlanLimit,
  reportPlanLimitResult,
  ensureWithinLimit,
} from "@/stores/usePlanLimitStore";

// Everything a refine apply can touch — snapshotted before applying so one
// Undo restores the exact previous state (lines, meta, badges, memory).
type Snapshot = {
  title: string;
  scope: string;
  timelineDays: number | null;
  discount: EstimateDiscount | null;
  assumptions: string[];
  baselineAssumptions: string[];
  materials: EstimateLine[];
  labor: EstimateLine[];
  changedIds: Set<string>;
  history: string[];
};

// An AI refine result parked for review — nothing is applied until confirmed.
type PendingRefine = {
  data: GeneratedEstimate;
  warnings: string[];
  reshopFailed: boolean;
  diff: RefineDiff;
  metaChanges: string[];
  instructions: string;
};

// Narrates the refine wait on a fixed cadence (mirrors the generate stepper's
// scripted dwell — the server action is a single call with no progress events).
const REFINE_STAGES = [
  "Editing your estimate…",
  "Re-shopping changed items…",
  "Linking real products…",
];

function DeltaPill({
  tone,
  children,
}: {
  tone: "accent" | "rose" | "neutral";
  children: React.ReactNode;
}) {
  const cls =
    tone === "accent"
      ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]"
      : tone === "rose"
        ? "bg-rose-50 text-rose-700"
        : "bg-[color:var(--paper-deep)] text-[color:var(--ink-soft)]";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

export function EstimatorStudio({
  aiEnabled,
  clientId = null,
  clientName = null,
}: {
  aiEnabled: boolean;
  // When launched from a client's detail page, the created proposal is linked
  // to this client.
  clientId?: string | null;
  clientName?: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState<1 | 2>(1);
  const [projectType, setProjectType] = React.useState<ProjectType | null>(null);
  const [location, setLocation] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [assumptions, setAssumptions] = React.useState<string[]>([]);
  // Snapshot of the assumptions the last estimate was built from. When the live
  // `assumptions` drift from this, the contextual Regenerate button reveals.
  const [baselineAssumptions, setBaselineAssumptions] = React.useState<string[]>([]);
  const [title, setTitle] = React.useState("");
  const [materials, setMaterials] = React.useState<EstimateLine[]>([]);
  const [labor, setLabor] = React.useState<EstimateLine[]>([]);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [progressIndex, setProgressIndex] = React.useState(0);
  const [progressDone, setProgressDone] = React.useState(false);
  const [clarify, setClarify] = React.useState<ClarifyQuestion[] | null>(null);
  const [disabledBanner, setDisabledBanner] = React.useState(!aiEnabled);
  const [convertBusy, setConvertBusy] = React.useState(false);
  const [saveBusy, setSaveBusy] = React.useState(false);
  const [refineText, setRefineText] = React.useState("");
  const [refineBusy, setRefineBusy] = React.useState(false);
  // AI-authored scope + timeline (previously computed by the model and thrown
  // away). Scope seeds from the generate result and carries into the proposal.
  const [scope, setScope] = React.useState("");
  const [timelineDays, setTimelineDays] = React.useState<number | null>(null);
  const [discount, setDiscount] = React.useState<EstimateDiscount | null>(null);
  // Applied change requests (oldest first) — the refine's short-term memory.
  const [history, setHistory] = React.useState<string[]>([]);
  // Refine result awaiting review; the edit rail swaps to the diff panel.
  const [pendingRefine, setPendingRefine] = React.useState<PendingRefine | null>(null);
  const [undoSnap, setUndoSnap] = React.useState<Snapshot | null>(null);
  // Rows touched by the last applied refine — "Updated" badges.
  const [changedIds, setChangedIds] = React.useState<Set<string>>(new Set());
  const [refineStage, setRefineStage] = React.useState(0);
  // Two-step Start over: first click arms, 3s to confirm, then disarms.
  const [confirmReset, setConfirmReset] = React.useState(false);

  // Advance the progress stepper on a graduated cadence while the (single)
  // generate call runs: each step dwells for its own `dwellMs` (live pricing is
  // the slow one), then parks on the final step until the result lands
  // `progressDone`, which completes it. `progressIndex` is reset to 0 in
  // runGenerate before `generating` flips true, so this always starts clean.
  React.useEffect(() => {
    if (!generating || progressDone) return;
    const last = ESTIMATE_STEPS.length - 1;
    let i = 0;
    let timer: number;
    const advance = () => {
      if (i >= last) return; // hold on "Assembling…" until the estimate returns
      timer = window.setTimeout(() => {
        i += 1;
        setProgressIndex(i);
        advance();
      }, ESTIMATE_STEPS[i].dwellMs ?? 2000);
    };
    advance();
    return () => window.clearTimeout(timer);
  }, [generating, progressDone]);

  // Refine narration — fixed cadence matched to the real pipeline: the edit
  // call, then (only when lines changed) live re-shopping + product linking.
  // Stage resets to 0 in onRefine, right before `refineBusy` flips true.
  React.useEffect(() => {
    if (!refineBusy) return;
    const t1 = window.setTimeout(() => setRefineStage(1), 6000);
    const t2 = window.setTimeout(() => setRefineStage(2), 14000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [refineBusy]);

  // The actual estimate generation. `extraDetail` = clarifying answers appended
  // to the brief; `assumptions` = the Regenerate-with-AI constraints.
  async function runGenerate(opts?: { assumptions?: string[]; extraDetail?: string[] }) {
    if (!projectType || !description.trim()) {
      toast.error("Missing info", "Pick a project type and describe the work.");
      return;
    }
    const enriched = opts?.extraDetail?.length
      ? `${description}\n\nAdditional details from the contractor:\n${opts.extraDetail.join("\n")}`
      : description;

    setProgressIndex(0);
    setProgressDone(false);
    setGenerating(true);
    try {
      const res = await generateAdvancedEstimate({
        projectType,
        description: enriched,
        location: location || undefined,
        assumptions: opts?.assumptions,
      });
      if (!res.ok) {
        setGenerating(false);
        if (reportPlanLimitResult(res)) return;
        toast.error("Generation failed", res.error);
        return;
      }
      if (res.disabled) setDisabledBanner(true);
      setTitle(res.data.title);
      // The model authors scope + timeline on every generate — keep them
      // instead of silently dropping them (they carry into the proposal).
      setScope(res.data.scope || enriched);
      setTimelineDays(res.data.estimatedTimelineDays ?? null);
      setDiscount(res.data.discount ?? null);
      setAssumptions(res.data.assumptions);
      setBaselineAssumptions(res.data.assumptions);
      setChangedIds(new Set());
      setUndoSnap(null);
      setPendingRefine(null);
      setHistory([]);
      setMaterials(
        res.data.materials.map((m) => ({
          id: nanoid(6),
          name: m.name,
          quantity: m.quantity,
          unitPrice: m.unitPrice,
          unit: m.unit,
          // Preserve the live product data so it reaches the proposal LineItems.
          store: m.store,
          productUrl: m.productUrl,
          imageUrl: m.imageUrl,
          dimensions: m.dimensions,
          // The AI's waste/packaging rationale, shown under the line.
          notes: m.notes,
        })),
      );
      setLabor(
        res.data.labor.map((m) => ({
          id: nanoid(6),
          name: m.name,
          quantity: m.quantity,
          unitPrice: m.unitPrice,
          unit: m.unit,
          notes: m.notes,
        })),
      );
      // Land on 100% for a beat before swapping to the results view.
      setProgressDone(true);
      window.setTimeout(() => {
        setGenerating(false);
        setStep(2);
      }, 500);
      toast.success(
        res.disabled ? "Sample loaded · demo mode" : "Estimate ready",
        opts?.assumptions?.length
          ? "Re-estimated with your assumptions."
          : "Edit anything on the left.",
      );
    } catch (err: any) {
      setGenerating(false);
      toast.error("Generation failed", err?.message);
    }
  }

  // Generate button → intake gate first. Corrects the city, and if the brief is
  // thin, opens the clarifying questions before generating.
  async function onGenerate() {
    if (!projectType || !description.trim()) {
      toast.error("Missing info", "Pick a project type and describe the work.");
      return;
    }
    setAnalyzing(true);
    const res = await analyzeEstimatePrompt({
      projectType,
      description,
      location: location || undefined,
    });
    setAnalyzing(false);
    if (!res.ok) {
      if (reportPlanLimitResult(res)) return;
      toast.error("Couldn't start", res.error);
      return;
    }
    const a = res.data;
    if (a.correctedLocation && a.correctedLocation !== location.trim()) {
      setLocation(a.correctedLocation);
      toast.success("Location corrected", `Using “${a.correctedLocation}”.`);
    }
    if (!a.enoughDetail && a.questions.length > 0) {
      setClarify(a.questions);
      return;
    }
    await runGenerate();
  }

  // Apply changes — the incremental refine. One surgical AI pass that edits the
  // existing estimate per the free-text request + edited assumptions. The result
  // is NOT applied directly: it parks in `pendingRefine` and the contractor
  // reviews an exact diff (with any warnings) before confirming.
  async function onRefine() {
    if (!projectType) return;
    const instructions = refineText.trim();
    const cleaned = assumptions.map((a) => a.trim()).filter(Boolean);
    if (!instructions && !assumptionsDirty) return;
    setRefineStage(0);
    setRefineBusy(true);
    try {
      const res = await refineAdvancedEstimate({
        projectType,
        location: location || undefined,
        instructions,
        history: history.slice(-5),
        assumptions: cleaned,
        // Lines go up WITH their ids — identity survives the model round-trip,
        // so a rename stays the same row (and keeps its price + product link).
        current: {
          title,
          scope: scope || description,
          assumptions: cleaned,
          materials,
          labor,
          discount,
        },
      });
      if (!res.ok) {
        if (reportPlanLimitResult(res)) return;
        toast.error("Couldn't apply", res.error);
        return;
      }
      // Demo mode returns the estimate unchanged (assumption edits folded in) —
      // nothing to review, keep the old direct path.
      if (res.disabled) {
        setAssumptions(res.data.assumptions);
        setBaselineAssumptions(res.data.assumptions);
        toast.success("Demo mode", "Add OPENAI_API_KEY to apply AI edits.");
        return;
      }

      const diff = diffEstimate({ materials, labor }, res.data);
      const metaChanges: string[] = [];
      if (res.data.title !== title) metaChanges.push("Title updated");
      if ((res.data.scope || "") !== (scope || description)) metaChanges.push("Scope wording updated");
      const newTimeline = res.data.estimatedTimelineDays ?? null;
      if (newTimeline !== timelineDays) {
        metaChanges.push(
          newTimeline == null
            ? "Timeline removed"
            : timelineDays == null
              ? `Timeline set — ${newTimeline} days`
              : `Timeline ${timelineDays} → ${newTimeline} days`,
        );
      }
      const newDiscount = res.data.discount ?? null;
      const discountKey = (d: EstimateDiscount | null) =>
        d ? `${d.label}|${d.amount}|${d.isPercent}` : "";
      if (discountKey(newDiscount) !== discountKey(discount)) {
        metaChanges.push(
          newDiscount
            ? `Discount — ${newDiscount.label} (${
                newDiscount.isPercent ? `${newDiscount.amount}% off` : `${money(newDiscount.amount)} off`
              })`
            : "Discount removed",
        );
      }

      if (diff.isEmpty && metaChanges.length === 0 && res.warnings.length === 0) {
        toast.info("No changes detected", "The AI reported nothing to change — try being more specific.");
        return;
      }
      setPendingRefine({
        data: res.data,
        warnings: res.warnings,
        reshopFailed: res.reshopFailed,
        diff,
        metaChanges,
        instructions,
      });
    } catch (err: any) {
      toast.error("Couldn't apply", err?.message);
    } finally {
      setRefineBusy(false);
    }
  }

  // Confirm the reviewed refine: snapshot for Undo, swap in the new estimate,
  // badge every touched row, and remember the applied request.
  function applyPending() {
    const p = pendingRefine;
    if (!p) return;
    setUndoSnap({
      title,
      scope,
      timelineDays,
      discount,
      assumptions,
      baselineAssumptions,
      materials,
      labor,
      changedIds,
      history,
    });
    setTitle(p.data.title);
    setScope(p.data.scope || scope);
    setTimelineDays(p.data.estimatedTimelineDays ?? null);
    setDiscount(p.data.discount ?? null);
    setAssumptions(p.data.assumptions);
    setBaselineAssumptions(p.data.assumptions);
    const badge = new Set<string>();
    const seen = new Set<string>();
    const mapLines = (
      lines: GeneratedEstimate["materials"],
      group: "materials" | "labor",
    ): EstimateLine[] =>
      lines.map((m, i) => {
        // Reuse the round-tripped id so unchanged rows keep their React
        // identity (no remount, in-progress edits elsewhere survive).
        const id = m.id && !seen.has(m.id) ? m.id : nanoid(6);
        seen.add(id);
        if (p.diff.changedKeys.has(`${group}:${i}`)) badge.add(id);
        return {
          id,
          name: m.name,
          quantity: m.quantity,
          unitPrice: m.unitPrice,
          unit: m.unit,
          store: m.store,
          productUrl: m.productUrl,
          imageUrl: m.imageUrl,
          dimensions: m.dimensions,
          notes: m.notes,
        };
      });
    setMaterials(mapLines(p.data.materials, "materials"));
    setLabor(mapLines(p.data.labor, "labor"));
    setChangedIds(badge);
    if (p.instructions) setHistory((h) => [...h, p.instructions].slice(-8));
    setRefineText("");
    setPendingRefine(null);
    if (p.reshopFailed) {
      toast.info("Applied with caveats", "Live pricing failed — check the flagged lines before sending.");
    } else {
      toast.success("Estimate updated", "Changes applied. Undo is available until your next edit.");
    }
  }

  function discardPending() {
    setPendingRefine(null);
    toast.info("Discarded", "Nothing was changed.");
  }

  function undoApply() {
    const s = undoSnap;
    if (!s) return;
    setTitle(s.title);
    setScope(s.scope);
    setTimelineDays(s.timelineDays);
    setDiscount(s.discount);
    setAssumptions(s.assumptions);
    setBaselineAssumptions(s.baselineAssumptions);
    setMaterials(s.materials);
    setLabor(s.labor);
    setChangedIds(s.changedIds);
    setHistory(s.history);
    setUndoSnap(null);
    toast.success("Reverted", "Restored the previous version.");
  }

  // Start over is destructive and sits next to Apply — first click arms it,
  // the second within 3s actually resets.
  function onStartOverClick() {
    if (!confirmReset) {
      setConfirmReset(true);
      window.setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    reset();
  }

  async function onConvert() {
    if (!projectType) return;
    if (!(await ensureWithinLimit("proposalsCreated"))) return;
    setConvertBusy(true);
    try {
      const res = await convertEstimateToProposal({
        projectType,
        title,
        // The AI-authored (and contractor-edited) scope — falls back to the
        // original brief for estimates generated before scope was kept.
        scope: scope || description,
        materials: materials.map(({ id: _, ...rest }) => rest),
        labor: labor.map(({ id: _, ...rest }) => rest),
        assumptions,
        clientId,
        // Carries the estimate's location into the proposal's job-address
        // field (and its state into the tax rate) — still editable there.
        location: location || undefined,
        // Materializes as a Discount row + discountTotal on the proposal.
        discount,
      });
      toast.success("Proposal created");
      router.push(`/dashboard/proposals/${res.id}` as any);
    } catch (err: any) {
      if (!reportPlanLimit(err)) toast.error("Couldn't convert", err?.message);
    } finally {
      setConvertBusy(false);
    }
  }

  async function onSave() {
    if (!projectType) return;
    setSaveBusy(true);
    if (!(await ensureWithinLimit("estimatorUses"))) {
      setSaveBusy(false);
      return;
    }
    try {
      await saveEstimate({
        projectType,
        location: location || null,
        data: {
          title,
          scope: scope || description,
          assumptions,
          materials: materials.map(({ id: _, ...rest }) => rest),
          labor: labor.map(({ id: _, ...rest }) => rest),
          estimatedTimelineDays: timelineDays ?? undefined,
          discount,
        },
      });
      toast.success("Estimate saved");
    } catch (err: any) {
      if (reportPlanLimit(err)) return;
      toast.error("Couldn't save", err?.message);
    } finally {
      setSaveBusy(false);
    }
  }

  function reset() {
    setStep(1);
    setMaterials([]);
    setLabor([]);
    setAssumptions([]);
    setBaselineAssumptions([]);
    setTitle("");
    setScope("");
    setTimelineDays(null);
    setDiscount(null);
    setHistory([]);
    setPendingRefine(null);
    setUndoSnap(null);
    setChangedIds(new Set());
    setRefineText("");
    setConfirmReset(false);
  }

  const materialsTotal = materials.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const laborTotal = labor.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  // Has the contractor changed the assumptions since this estimate was built?
  // Compared on the same trimmed, blank-filtered basis the refine sends, so a
  // bare "+ Add assumption" row (or whitespace-only edit) never arms a no-op
  // apply. canApply also trips on a typed change request.
  const cleanedAssumptions = assumptions.map((a) => a.trim()).filter(Boolean);
  const cleanedBaseline = baselineAssumptions.map((a) => a.trim()).filter(Boolean);
  const assumptionsDirty =
    cleanedAssumptions.length !== cleanedBaseline.length ||
    cleanedAssumptions.some((a, i) => a !== cleanedBaseline[i]);
  const canApply = refineText.trim().length > 0 || assumptionsDirty;
  // Freeze the whole estimate while a refine is in flight or awaiting review —
  // anything typed mid-flight would be clobbered when the result lands.
  const uiLocked = refineBusy || !!pendingRefine;

  return (
    <>
      {step === 1 ? (
        <EstimatorIntakeV2
          disabledBanner={disabledBanner}
          projectType={projectType}
          onProjectType={setProjectType}
          location={location}
          onLocation={setLocation}
          description={description}
          onDescription={setDescription}
          analyzing={analyzing}
          generating={generating}
          onGenerate={onGenerate}
        />
      ) : (
        <div className="space-y-4">
          {/* Result console — mirrors the intake console (EstimatorIntakeV2) so
              moving from "describe the job" to "review and refine" reads as one
              continuous shop: accent masthead, generous rail, grounded action
              bar. The refine edits only what's asked; it does not re-run pricing. */}
          <div className="paper-card overflow-hidden !shadow-[var(--shadow-md)]">
            {/* Masthead — the estimate's identity, in the page's display voice. */}
            <div className="bg-[color:var(--accent)] px-6 py-6 text-white sm:px-8">
              <div className="flex items-center gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--r-md)] bg-[color:var(--accent-ink)]">
                  <Wand2 className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75">
                    Smart estimate · AI
                  </div>
                  <h2 className="truncate font-display text-[22px] leading-[1.1] tracking-[-0.015em] sm:text-[26px]">
                    {title || "Estimate"}
                  </h2>
                  {(projectType || location) && (
                    <div className="mt-1 truncate text-[12px] text-white/75">
                      {projectType}
                      {location ? ` · ${location}` : ""}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Edit rail — one place to change the estimate. */}
            <div className="space-y-6 p-6 sm:p-8">
              {pendingRefine ? (
                /* Review gate — the AI's edit rendered as an exact diff.
                   Nothing below is applied until the contractor confirms. */
                <div className="space-y-4">
                  <div>
                    <h3 className="font-display text-[15px] tracking-[-0.01em] text-[color:var(--ink)]">
                      Review changes
                    </h3>
                    <p className="mt-0.5 text-[11px] text-[color:var(--ink-muted)]">
                      Nothing is applied until you confirm.
                    </p>
                  </div>
                  {pendingRefine.instructions && (
                    <p className="border-l-2 border-[color:var(--ink-line)] pl-3 text-[12px] italic text-[color:var(--ink-soft)]">
                      “{pendingRefine.instructions}”
                    </p>
                  )}
                  {pendingRefine.warnings.length > 0 && (
                    <div className="rounded-[var(--r-md)] border border-amber-200 bg-amber-50 px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                        <ul className="space-y-1 text-[12px] leading-snug text-amber-900">
                          {pendingRefine.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                  <div className="divide-y divide-[color:var(--ink-line)]">
                    {pendingRefine.metaChanges.map((m, i) => (
                      <div key={`meta-${i}`} className="flex items-center gap-2 py-2 text-[13px]">
                        <DeltaPill tone="neutral">Details</DeltaPill>
                        <span className="text-[color:var(--ink-soft)]">{m}</span>
                      </div>
                    ))}
                    {pendingRefine.diff.deltas.map((d, i) => (
                      <div
                        key={i}
                        className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-[13px]"
                      >
                        {d.kind === "added" && <DeltaPill tone="accent">Added</DeltaPill>}
                        {d.kind === "removed" && <DeltaPill tone="rose">Removed</DeltaPill>}
                        {d.kind === "changed" && <DeltaPill tone="neutral">Changed</DeltaPill>}
                        <span className="min-w-0 truncate font-medium text-[color:var(--ink)]">
                          {d.name}
                        </span>
                        <span className="text-[11px] text-[color:var(--ink-faint)]">
                          {d.group === "materials" ? "Materials" : "Labor"}
                        </span>
                        {d.kind === "changed" && (
                          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-[color:var(--ink-muted)] tabular">
                            {d.fields.map((f) => (
                              <span key={f.label}>
                                {f.label} {f.from} <span aria-hidden>→</span>{" "}
                                <span className="text-[color:var(--ink)]">{f.to}</span>
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                    ))}
                    {pendingRefine.diff.isEmpty && pendingRefine.metaChanges.length === 0 && (
                      <p className="py-2 text-[12px] text-[color:var(--ink-muted)]">
                        Only caveats — no line changes.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-display text-[15px] tracking-[-0.01em] text-[color:var(--ink)]">
                        Make changes
                      </h3>
                      <p className="mt-0.5 text-[11px] text-[color:var(--ink-muted)]">
                        Plain English. You&apos;ll review an exact diff before anything applies.
                      </p>
                    </div>
                    <Textarea
                      rows={3}
                      maxLength={4000}
                      placeholder="e.g. Use 30-year shingles instead of 25-year, drop the ridge vents, add a 10% discount…"
                      value={refineText}
                      onChange={(e) => setRefineText(e.target.value)}
                      disabled={refineBusy}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="quiet-caps">Scope of work</div>
                    <Textarea
                      rows={3}
                      placeholder="What the job covers — carried onto the proposal."
                      value={scope}
                      onChange={(e) => setScope(e.target.value)}
                      disabled={refineBusy}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="quiet-caps">Assumptions</div>
                    {assumptions.length === 0 ? (
                      <p className="text-[12px] text-[color:var(--ink-muted)]">
                        None yet. Add what your price depends on, then apply.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {assumptions.map((a, i) => (
                          <li key={i} className="flex items-start gap-2 text-[13px]">
                            <span className="h-1 w-1 mt-2 rounded-full bg-[color:var(--ink-faint)] shrink-0" />
                            <input
                              value={a}
                              disabled={refineBusy}
                              onChange={(e) =>
                                setAssumptions((prev) =>
                                  prev.map((x, idx) => (idx === i ? e.target.value : x)),
                                )
                              }
                              className="flex-1 bg-transparent border-b border-transparent focus:border-[color:var(--ink-line)] outline-none text-[color:var(--ink-soft)] py-0.5 disabled:opacity-60"
                            />
                            <button
                              onClick={() =>
                                setAssumptions((prev) => prev.filter((_, idx) => idx !== i))
                              }
                              aria-label="Remove assumption"
                              disabled={refineBusy}
                              className="text-[color:var(--ink-muted)] hover:text-rose-700 text-[14px] disabled:pointer-events-none disabled:opacity-50"
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      onClick={() => setAssumptions((prev) => [...prev, ""])}
                      disabled={refineBusy}
                      className="mt-1.5 text-[11px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] disabled:pointer-events-none disabled:opacity-50"
                    >
                      + Add assumption
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Action bar — grounded, mirrors the intake's. */}
            <div className="flex items-center justify-between gap-4 border-t border-[color:var(--ink-line)] bg-[color:var(--paper-deep)] px-6 py-4 sm:px-8">
              {refineBusy ? (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.p
                    key={refineStage}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={{ duration: 0.18 }}
                    className="hidden text-[11px] leading-relaxed text-[color:var(--accent-ink)] sm:block"
                  >
                    {REFINE_STAGES[refineStage]}
                  </motion.p>
                </AnimatePresence>
              ) : (
                <p className="hidden text-[11px] leading-relaxed text-[color:var(--ink-muted)] sm:block">
                  {pendingRefine
                    ? "Review the changes above, then apply or discard."
                    : canApply
                      ? "Applies only your changes. The rest stays as priced."
                      : "Type a change or edit an assumption to apply."}
                </p>
              )}
              {pendingRefine ? (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={discardPending}>
                    Discard
                  </Button>
                  <Button onClick={applyPending} icon={<Check className="h-3.5 w-3.5" />}>
                    Apply changes
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {undoSnap && !refineBusy && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={undoApply}
                      icon={<Undo2 className="h-3.5 w-3.5" />}
                    >
                      Undo
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onStartOverClick}
                    disabled={refineBusy}
                    icon={<RotateCcw className="h-3.5 w-3.5" />}
                    className={confirmReset ? "text-rose-700 hover:text-rose-700" : undefined}
                  >
                    {confirmReset ? "Really start over?" : "Start over"}
                  </Button>
                  <Button
                    loading={refineBusy}
                    disabled={!canApply}
                    onClick={onRefine}
                    icon={<Sparkles className="h-3.5 w-3.5" />}
                  >
                    Apply changes
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3 space-y-5">
              <EstimatorBreakdown
                title="Materials"
                subtitle="What gets installed on site"
                rows={materials}
                onChange={setMaterials}
                changedIds={changedIds}
                disabled={uiLocked}
              />
              <EstimatorBreakdown
                title="Labor"
                subtitle="Installation, cleanup, and skilled work"
                rows={labor}
                onChange={setLabor}
                changedIds={changedIds}
                disabled={uiLocked}
              />
            </div>

            <div className="lg:col-span-2 space-y-3">
              {clientName && (
                <div className="hairline flex items-center gap-2 rounded-[var(--r-md)] bg-[color:var(--accent-soft)] px-3 py-2 text-[12px] text-[color:var(--accent-ink)]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--accent)]" />
                  <span>
                    Links to <span className="font-medium">{clientName}</span> on convert
                  </span>
                </div>
              )}
              <EstimatorSummary
                materialsTotal={materialsTotal}
                laborTotal={laborTotal}
                assumptions={assumptions}
                onConvert={onConvert}
                onSave={onSave}
                convertLoading={convertBusy}
                saveLoading={saveBusy}
                disabled={(materials.length === 0 && labor.length === 0) || uiLocked}
                discount={discount}
                onRemoveDiscount={() => setDiscount(null)}
                timelineDays={timelineDays}
              />
            </div>
          </div>
        </div>
      )}

      {/* Intake gate — opens only when the brief is too thin. */}
      <ClarifyingQuestions
        open={!!clarify}
        questions={clarify ?? []}
        onSubmit={(clarifications) => {
          setClarify(null);
          runGenerate({ extraDetail: clarifications });
        }}
        onSkip={() => {
          setClarify(null);
          runGenerate();
        }}
      />

      {/* Generation progress — covers the screen while the estimate builds. */}
      {generating && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_srgb,var(--ink)_45%,transparent)] backdrop-blur-[2px] p-4">
          <GenerationProgress steps={ESTIMATE_STEPS} activeIndex={progressIndex} done={progressDone} />
        </div>
      )}
    </>
  );
}
