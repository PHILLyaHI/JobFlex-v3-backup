"use client";
// Client orchestrator for the fence studio. Composes the address bar, a Map⇄3D
// hero, and the control rail (price ticket + toolbelt) in a bold, desktop-class
// split that stacks on narrow viewports. Both hero panels stay mounted (toggled
// by opacity) so the 3D scene is always live and capturable for the proposal.
import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { RotateCcw, Map as MapIcon, Box } from "lucide-react";
import { cn } from "@/lib/cn";
import { toast } from "@/components/ui/Toast";
import { PlacesAutocomplete } from "@/components/estimator/roof/PlacesAutocomplete";
import { useFenceStudioStore } from "@/stores/useFenceStudioStore";
import { MATERIAL_LABEL } from "./fenceTypes";
import { computeFenceLayout } from "./fenceGeometry";
import { buildFenceLineItems } from "./fencePricing";
import { convertFenceEstimateToProposal } from "@/actions/fenceEstimator";
import { FenceModel3D, type FenceModel3DHandle } from "./FenceModel3D";
import { FenceDrawMap } from "./FenceDrawMap";
import { FenceToolbelt } from "./FenceToolbelt";
import { FencePriceBar } from "./FencePriceBar";

type View = "draw" | "3d";

export function FenceStudio() {
  const router = useRouter();
  const points = useFenceStudioStore((s) => s.spec.points);
  const height = useFenceStudioStore((s) => s.spec.height);
  const material = useFenceStudioStore((s) => s.spec.material);
  const gates = useFenceStudioStore((s) => s.spec.gates);
  const demolition = useFenceStudioStore((s) => s.spec.demolition);
  const selectedSegment = useFenceStudioStore((s) => s.spec.selectedSegment);
  const lat = useFenceStudioStore((s) => s.spec.lat);
  const lng = useFenceStudioStore((s) => s.spec.lng);
  const setAddress = useFenceStudioStore((s) => s.setAddress);
  const setPoints = useFenceStudioStore((s) => s.setPoints);
  const reset = useFenceStudioStore((s) => s.reset);

  const [view, setView] = React.useState<View>("3d");
  const [converting, setConverting] = React.useState(false);
  const modelRef = React.useRef<FenceModel3DHandle>(null);

  async function handleConvert() {
    setConverting(true);
    try {
      const layout = computeFenceLayout(points, gates);
      const lengthFt = layout.totalLengthFt;
      const { materials, labor } = buildFenceLineItems({
        lengthFt,
        height,
        material,
        gateCount: gates.length,
        demolition,
      });
      // Both hero panels stay mounted (opacity toggle keeps the 3D sized + live),
      // so the snapshot is available regardless of which view is active.
      const previewDataUrl = modelRef.current?.capture() ?? undefined;
      const assumptions = [
        `${MATERIAL_LABEL[material]} fence, ${height} ft tall`,
        `${Math.round(lengthFt)} linear ft across ${layout.segCount} run${layout.segCount === 1 ? "" : "s"}`,
        `${gates.length} gate${gates.length === 1 ? "" : "s"}`,
        demolition ? "Includes removal & haul-away of the existing fence" : "No demolition included",
      ];
      const res = await convertFenceEstimateToProposal({
        title: `${MATERIAL_LABEL[material]} fence · ${Math.round(lengthFt)} lf`,
        scope: `Supply and install ${Math.round(lengthFt)} linear ft of ${MATERIAL_LABEL[
          material
        ].toLowerCase()} fence at ${height} ft tall.`,
        materials,
        labor,
        assumptions,
        previewDataUrl,
      });
      toast.success("Proposal created");
      router.push(`/dashboard/proposals/${res.id}` as Route);
    } catch (err) {
      toast.error("Couldn't create proposal", err instanceof Error ? err.message : undefined);
      setConverting(false);
    }
  }

  const empty3d = view === "3d" && points.length < 2;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <PlacesAutocomplete
            onPick={(a) => {
              setAddress(a);
              setView("draw");
            }}
          />
        </div>
        <ViewToggle value={view} onChange={setView} />
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[var(--r-md)] hairline text-[12px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] hover:bg-black/[0.03] transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_330px] gap-5 items-start">
        <div className="relative h-[58vh] lg:h-[72vh] rounded-[var(--r-lg)] hairline shadow-[var(--shadow-md)] overflow-hidden bg-[color:var(--paper)]">
          <div
            className={cn(
              "absolute inset-0 transition-opacity duration-200",
              view === "3d" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none",
            )}
          >
            <FenceModel3D
              ref={modelRef}
              points={points}
              height={height}
              material={material}
              gates={gates}
              selectedSegment={selectedSegment}
              className="h-full w-full"
            />
          </div>
          <div
            className={cn(
              "absolute inset-0 transition-opacity duration-200",
              view === "draw" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none",
            )}
          >
            <FenceDrawMap lat={lat} lng={lng} points={points} onChange={setPoints} className="h-full w-full" />
          </div>

          {empty3d && (
            <div className="absolute inset-0 z-20 grid place-items-center pointer-events-none">
              <div className="rounded-[var(--r-md)] bg-white/85 backdrop-blur hairline px-4 py-2 text-[12px] text-[color:var(--ink-muted)]">
                Switch to <span className="font-medium text-[color:var(--ink-soft)]">Draw</span> to trace the fence.
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-5">
          <FencePriceBar onConvert={handleConvert} converting={converting} />
          <div className="rounded-[var(--r-lg)] bg-[color:var(--paper)] hairline shadow-[var(--shadow-sm)] p-4">
            <FenceToolbelt />
          </div>
        </aside>
      </div>
    </div>
  );
}

function ViewToggle({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const opts: { v: View; label: string; icon: React.ReactNode }[] = [
    { v: "draw", label: "Draw", icon: <MapIcon className="h-3.5 w-3.5" /> },
    { v: "3d", label: "3D", icon: <Box className="h-3.5 w-3.5" /> },
  ];
  return (
    <div className="inline-flex rounded-full hairline p-0.5 bg-white/60">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-[12px] font-medium transition-colors",
            value === o.v
              ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
              : "text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
