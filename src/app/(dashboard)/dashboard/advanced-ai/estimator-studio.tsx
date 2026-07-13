"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { Sparkles, Wand2, RotateCcw } from "lucide-react";
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
import type { ClarifyQuestion } from "@/lib/estimatorSchema";
import {
  reportPlanLimit,
  reportPlanLimitResult,
  ensureWithinLimit,
} from "@/stores/usePlanLimitStore";

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
      setAssumptions(res.data.assumptions);
      setBaselineAssumptions(res.data.assumptions);
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
  // existing estimate per the free-text request + edited assumptions, keeping
  // every untouched line and its live pricing. NOT a full re-generation.
  async function onRefine() {
    if (!projectType) return;
    const instructions = refineText.trim();
    const cleaned = assumptions.map((a) => a.trim()).filter(Boolean);
    if (!instructions && !assumptionsDirty) return;
    setRefineBusy(true);
    try {
      const res = await refineAdvancedEstimate({
        projectType,
        description,
        location: location || undefined,
        instructions,
        assumptions: cleaned,
        current: {
          title,
          scope: description,
          assumptions: cleaned,
          materials: materials.map(({ id: _, ...rest }) => rest),
          labor: labor.map(({ id: _, ...rest }) => rest),
        },
      });
      if (!res.ok) {
        if (reportPlanLimitResult(res)) return;
        toast.error("Couldn't apply", res.error);
        return;
      }
      setTitle(res.data.title);
      setAssumptions(res.data.assumptions);
      setBaselineAssumptions(res.data.assumptions);
      setMaterials(
        res.data.materials.map((m) => ({
          id: nanoid(6),
          name: m.name,
          quantity: m.quantity,
          unitPrice: m.unitPrice,
          unit: m.unit,
          store: m.store,
          productUrl: m.productUrl,
          imageUrl: m.imageUrl,
          dimensions: m.dimensions,
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
      setRefineText("");
      toast.success(
        res.disabled ? "Demo mode" : "Estimate updated",
        res.disabled ? "Add OPENAI_API_KEY to apply AI edits." : "Applied your changes.",
      );
    } catch (err: any) {
      toast.error("Couldn't apply", err?.message);
    } finally {
      setRefineBusy(false);
    }
  }

  async function onConvert() {
    if (!projectType) return;
    if (!(await ensureWithinLimit("proposalsCreated"))) return;
    setConvertBusy(true);
    try {
      const res = await convertEstimateToProposal({
        projectType,
        title,
        scope: description,
        materials: materials.map(({ id: _, ...rest }) => rest),
        labor: labor.map(({ id: _, ...rest }) => rest),
        assumptions,
        clientId,
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
          scope: description,
          assumptions,
          materials: materials.map(({ id: _, ...rest }) => rest),
          labor: labor.map(({ id: _, ...rest }) => rest),
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
              <div className="space-y-3">
                <div>
                  <h3 className="font-display text-[15px] tracking-[-0.01em] text-[color:var(--ink)]">
                    Make changes
                  </h3>
                  <p className="mt-0.5 text-[11px] text-[color:var(--ink-muted)]">
                    Plain English. It edits just what you ask and keeps the rest, with the same pricing.
                  </p>
                </div>
                <Textarea
                  rows={3}
                  placeholder="e.g. Use 30-year shingles instead of 25-year, drop the ridge vents, add a 2x3 skylight…"
                  value={refineText}
                  onChange={(e) => setRefineText(e.target.value)}
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
                          onChange={(e) =>
                            setAssumptions((prev) =>
                              prev.map((x, idx) => (idx === i ? e.target.value : x)),
                            )
                          }
                          className="flex-1 bg-transparent border-b border-transparent focus:border-[color:var(--ink-line)] outline-none text-[color:var(--ink-soft)] py-0.5"
                        />
                        <button
                          onClick={() => setAssumptions((prev) => prev.filter((_, idx) => idx !== i))}
                          aria-label="Remove assumption"
                          className="text-[color:var(--ink-muted)] hover:text-rose-700 text-[14px]"
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
                  className="mt-1.5 text-[11px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]"
                >
                  + Add assumption
                </button>
              </div>
            </div>

            {/* Action bar — grounded, mirrors the intake's. */}
            <div className="flex items-center justify-between gap-4 border-t border-[color:var(--ink-line)] bg-[color:var(--paper-deep)] px-6 py-4 sm:px-8">
              <p className="hidden text-[11px] leading-relaxed text-[color:var(--ink-muted)] sm:block">
                {canApply
                  ? "Applies only your changes. The rest stays as priced."
                  : "Type a change or edit an assumption to apply."}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={reset} icon={<RotateCcw className="h-3.5 w-3.5" />}>
                  Start over
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
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3 space-y-5">
              <EstimatorBreakdown
                title="Materials"
                subtitle="What gets installed on site"
                rows={materials}
                onChange={setMaterials}
              />
              <EstimatorBreakdown
                title="Labor"
                subtitle="Installation, cleanup, and skilled work"
                rows={labor}
                onChange={setLabor}
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
                disabled={materials.length === 0 && labor.length === 0}
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
