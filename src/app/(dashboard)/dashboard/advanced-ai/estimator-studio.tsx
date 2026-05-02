"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { MapPin, Sparkles, AlertCircle, Wand2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { toast } from "@/components/ui/Toast";
import {
  ProjectTypePicker,
  type ProjectType,
} from "@/components/estimator/ProjectTypePicker";
import {
  EstimatorBreakdown,
  type EstimateLine,
} from "@/components/estimator/EstimatorBreakdown";
import { EstimatorSummary } from "@/components/estimator/EstimatorSummary";
import {
  generateAdvancedEstimate,
  saveEstimate,
  convertEstimateToProposal,
} from "@/actions/advancedEstimator";

const SAMPLE_PROMPTS = [
  "Replace 2400 sqft architectural shingle roof — tear-off, ridge vents, ice & water shield. Philadelphia, PA.",
  "Install 180 linear ft cedar privacy fence, 7ft tall, one gate, sloped yard.",
  "Full kitchen remodel — shaker cabs, quartz counters, island, mid-tier appliances.",
  "Replace 14 double-hung windows on a 2-story colonial. Energy Star rated.",
];

export function EstimatorStudio({ aiEnabled }: { aiEnabled: boolean }) {
  const router = useRouter();
  const [step, setStep] = React.useState<1 | 2>(1);
  const [projectType, setProjectType] = React.useState<ProjectType | null>(null);
  const [location, setLocation] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [sqft, setSqft] = React.useState("");
  const [assumptions, setAssumptions] = React.useState<string[]>([]);
  const [title, setTitle] = React.useState("");
  const [materials, setMaterials] = React.useState<EstimateLine[]>([]);
  const [labor, setLabor] = React.useState<EstimateLine[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [disabledBanner, setDisabledBanner] = React.useState(!aiEnabled);
  const [convertBusy, setConvertBusy] = React.useState(false);
  const [saveBusy, setSaveBusy] = React.useState(false);

  async function onGenerate() {
    if (!projectType || !description.trim()) {
      toast.error("Missing info", "Pick a project type and describe the work.");
      return;
    }
    setLoading(true);
    try {
      const res = await generateAdvancedEstimate({
        projectType,
        description,
        location: location || undefined,
        sqft: sqft ? Number(sqft) : undefined,
      });
      setLoading(false);
      if (!res.ok) {
        toast.error("Generation failed", res.error);
        return;
      }
      if (res.disabled) setDisabledBanner(true);
      setTitle(res.data.title);
      setAssumptions(res.data.assumptions);
      setMaterials(
        res.data.materials.map((m) => ({
          id: nanoid(6),
          name: m.name,
          quantity: m.quantity,
          unitPrice: m.unitPrice,
          unit: m.unit,
        })),
      );
      setLabor(
        res.data.labor.map((m) => ({
          id: nanoid(6),
          name: m.name,
          quantity: m.quantity,
          unitPrice: m.unitPrice,
          unit: m.unit,
        })),
      );
      setStep(2);
      toast.success(res.disabled ? "Sample loaded · demo mode" : "Estimate ready", "Edit anything on the left.");
    } catch (err: any) {
      setLoading(false);
      toast.error("Generation failed", err?.message);
    }
  }

  async function onConvert() {
    if (!projectType) return;
    setConvertBusy(true);
    try {
      const res = await convertEstimateToProposal({
        projectType,
        title,
        scope: description,
        materials: materials.map(({ id: _, ...rest }) => rest),
        labor: labor.map(({ id: _, ...rest }) => rest),
        assumptions,
      });
      toast.success("Proposal created");
      router.push(`/dashboard/proposals/${res.id}` as any);
    } catch (err: any) {
      toast.error("Couldn't convert", err?.message);
      setConvertBusy(false);
    }
  }

  async function onSave() {
    if (!projectType) return;
    setSaveBusy(true);
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
    setTitle("");
  }

  const materialsTotal = materials.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const laborTotal = labor.reduce((a, l) => a + l.quantity * l.unitPrice, 0);

  if (step === 1) {
    return (
      <div className="max-w-3xl mx-auto">
        {disabledBanner && (
          <div className="paper-card p-4 mb-5 flex items-start gap-3 border-l-[3px] border-l-amber-400">
            <AlertCircle className="h-4 w-4 mt-0.5 text-amber-700" />
            <div className="text-[12px] leading-relaxed">
              <div className="font-medium text-[color:var(--ink)]">OpenAI isn't configured.</div>
              <div className="text-[color:var(--ink-muted)] mt-0.5">
                Add <code className="font-mono text-[11px]">OPENAI_API_KEY</code> to your{" "}
                <code className="font-mono text-[11px]">.env.local</code>. You'll still get a
                realistic sample estimate to tune.
              </div>
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Project type</CardTitle>
              <CardSubtitle>Pick the closest category — it shapes the pricing model.</CardSubtitle>
            </div>
          </CardHeader>
          <ProjectTypePicker value={projectType} onChange={setProjectType} />
        </Card>

        <Card className="mt-5">
          <CardHeader>
            <div>
              <CardTitle>Location &amp; scope</CardTitle>
              <CardSubtitle>Location informs regional pricing; scope guides the detail.</CardSubtitle>
            </div>
          </CardHeader>
          <div className="space-y-4">
            <Input
              label="Location (city, state)"
              prefix={<MapPin className="h-3.5 w-3.5" />}
              placeholder="Philadelphia, PA"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <Input
              label="Approximate size (optional)"
              placeholder="e.g. 2400"
              suffix={<span className="text-[11px] text-[color:var(--ink-faint)]">sqft</span>}
              type="number"
              value={sqft}
              onChange={(e) => setSqft(e.target.value)}
            />
            <Textarea
              label="Describe the project"
              rows={6}
              placeholder="The more specific you are about materials, finishes, and conditions, the tighter the estimate."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {SAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDescription(p)}
                  className="text-[11px] rounded-full px-3 py-1 hairline text-[color:var(--ink-muted)] hover:bg-[color:var(--accent-soft)] hover:text-[color:var(--accent-ink)] transition-colors"
                >
                  {p.slice(0, 60)}…
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <Button
              size="lg"
              loading={loading}
              disabled={!projectType || !description.trim()}
              icon={<Sparkles className="h-4 w-4" />}
              onClick={onGenerate}
            >
              Generate estimate
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="paper-card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[12px]">
          <div className="h-7 w-7 rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)] grid place-items-center">
            <Wand2 className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="text-[color:var(--ink)] font-medium">{title || "Estimate"}</div>
            <div className="text-[11px] text-[color:var(--ink-muted)]">
              {projectType}
              {location ? ` · ${location}` : ""}
            </div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={reset} icon={<RotateCcw className="h-3.5 w-3.5" />}>
          Start over
        </Button>
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
          {assumptions.length > 0 && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Assumptions</CardTitle>
                  <CardSubtitle>Editable — call out what your price depends on.</CardSubtitle>
                </div>
              </CardHeader>
              <ul className="space-y-2">
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
                      onClick={() =>
                        setAssumptions((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      className="text-[color:var(--ink-muted)] hover:text-rose-700 text-[14px]"
                    >
                      ×
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={() => setAssumptions((prev) => [...prev, ""])}
                    className="text-[11px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]"
                  >
                    + Add assumption
                  </button>
                </li>
              </ul>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2">
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
  );
}
