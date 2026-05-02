"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Plus, Minus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { EstimatorBreakdown, type EstimateLine } from "@/components/estimator/EstimatorBreakdown";
import { EstimatorSummary } from "@/components/estimator/EstimatorSummary";
import { toast } from "@/components/ui/Toast";
import { nanoid } from "nanoid";
import { cn } from "@/lib/cn";
import { estimateFence, convertFenceEstimateToProposal } from "@/actions/fenceEstimator";

const HEIGHTS = ["4 ft", "6 ft", "7 ft", "8 ft"];
const MATERIALS = ["Cedar", "Vinyl", "Chain-link", "Aluminum", "Composite"];

export function FenceEstimatorForm() {
  const router = useRouter();
  const [linearFt, setLinearFt] = React.useState("180");
  const [height, setHeight] = React.useState("6 ft");
  const [material, setMaterial] = React.useState("Cedar");
  const [gates, setGates] = React.useState(1);
  const [slope, setSlope] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [materials, setMaterials] = React.useState<EstimateLine[]>([]);
  const [labor, setLabor] = React.useState<EstimateLine[]>([]);
  const [assumptions, setAssumptions] = React.useState<string[]>([]);
  const [title, setTitle] = React.useState("");
  const [convertBusy, setConvertBusy] = React.useState(false);

  async function generate() {
    setBusy(true);
    try {
      const res = await estimateFence({
        linearFt: Number(linearFt),
        heightFt: Number(height.replace(" ft", "")),
        material,
        gates,
        slope,
        notes,
      });
      if (!res.ok) throw new Error(res.error);
      if (res.disabled) toast.info("AI disabled · sample result loaded");
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
      toast.success("Fence estimate ready");
    } catch (err: any) {
      toast.error("Generation failed", err?.message);
    } finally {
      setBusy(false);
    }
  }

  async function convert() {
    setConvertBusy(true);
    try {
      const res = await convertFenceEstimateToProposal({
        title: title || `${material} fence · ${linearFt} lf`,
        scope: assumptions.join("\n"),
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

  const hasResult = materials.length > 0 || labor.length > 0;
  const materialsTotal = materials.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const laborTotal = labor.reduce((a, l) => a + l.quantity * l.unitPrice, 0);

  return (
    <div className="space-y-5">
      <div className="max-w-xl mx-auto">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Fence specs</CardTitle>
              <CardSubtitle>Linear footage, material, and slope drive everything else.</CardSubtitle>
            </div>
          </CardHeader>
          <div className="space-y-4">
            <Input
              label="Linear feet"
              type="number"
              value={linearFt}
              onChange={(e) => setLinearFt(e.target.value)}
              suffix={<span className="text-[11px] text-[color:var(--ink-faint)]">lf</span>}
            />

            <div>
              <div className="quiet-caps mb-1.5">Height</div>
              <div className="flex gap-1.5 flex-wrap">
                {HEIGHTS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHeight(h)}
                    className={cn(
                      "h-9 px-4 rounded-full text-[12px] font-medium hairline transition-colors",
                      height === h
                        ? "bg-[color:var(--ink)] text-[color:var(--paper)] border-transparent"
                        : "text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
                    )}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="quiet-caps mb-1.5">Material</div>
              <div className="flex gap-1.5 flex-wrap">
                {MATERIALS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMaterial(m)}
                    className={cn(
                      "h-9 px-4 rounded-full text-[12px] font-medium hairline transition-colors",
                      material === m
                        ? "bg-[color:var(--accent)] text-[color:var(--paper)] border-transparent"
                        : "text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="quiet-caps mb-1.5">Gates</div>
              <div className="inline-flex items-center rounded-[var(--r-md)] hairline bg-white/60 dark:bg-white/[0.03]">
                <button
                  type="button"
                  onClick={() => setGates(Math.max(0, gates - 1))}
                  className="h-9 w-9 grid place-items-center text-[color:var(--ink-muted)] hover:bg-black/[0.04]"
                  aria-label="Decrement"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <div className="w-14 text-center font-display tabular text-[20px]">{gates}</div>
                <button
                  type="button"
                  onClick={() => setGates(gates + 1)}
                  className="h-9 w-9 grid place-items-center text-[color:var(--ink-muted)] hover:bg-black/[0.04]"
                  aria-label="Increment"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <label className="flex items-center gap-3 py-2 cursor-pointer">
              <button
                type="button"
                role="switch"
                aria-checked={slope}
                onClick={() => setSlope(!slope)}
                className={cn(
                  "relative inline-flex h-5 w-9 rounded-full transition-colors",
                  slope ? "bg-[color:var(--accent)]" : "bg-[color:var(--ink-line)]",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                    slope ? "left-[18px]" : "left-0.5",
                  )}
                />
              </button>
              <span className="text-[13px] text-[color:var(--ink-soft)]">Sloped yard</span>
            </label>

            <Textarea
              label="Notes (optional)"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Post spacing, stain, grade transitions…"
            />

            <Button
              size="lg"
              className="w-full"
              loading={busy}
              onClick={generate}
              icon={<Sparkles className="h-4 w-4" />}
            >
              Generate fence estimate
            </Button>
          </div>
        </Card>
      </div>

      {hasResult && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 max-w-5xl mx-auto">
          <div className="lg:col-span-3 space-y-5">
            <EstimatorBreakdown
              title="Materials"
              subtitle="Posts, panels, gates, hardware"
              rows={materials}
              onChange={setMaterials}
            />
            <EstimatorBreakdown
              title="Labor"
              subtitle="Layout, post-setting, install"
              rows={labor}
              onChange={setLabor}
            />
          </div>
          <div className="lg:col-span-2">
            <EstimatorSummary
              materialsTotal={materialsTotal}
              laborTotal={laborTotal}
              assumptions={assumptions}
              onConvert={convert}
              onSave={async () => toast.info("Estimate saved locally — coming to dashboard next")}
              convertLoading={convertBusy}
            />
          </div>
        </div>
      )}
    </div>
  );
}
