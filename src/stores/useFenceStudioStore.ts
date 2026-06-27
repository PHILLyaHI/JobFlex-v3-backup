"use client";
// Global state for the 3D Fence Estimator Studio. Same construction as
// useProposalDraftStore (persist + immer + a `computed()` selector). The drawn
// spec is the source of truth; the live price is derived on demand, never stored.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { nanoid } from "nanoid";
import {
  OPENING_PRESETS,
  type FenceMaterial,
  type FenceHeightFt,
  type PathPoint,
  type GateSpec,
  type OpeningKind,
  type OpeningVariant,
} from "@/components/estimator/fence/fenceTypes";
import { computeFenceLayout } from "@/components/estimator/fence/fenceGeometry";
import { priceFence, type FencePriceResult } from "@/components/estimator/fence/fencePricing";

export interface FenceStudioSpec {
  address: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
  points: PathPoint[];
  height: FenceHeightFt;
  material: FenceMaterial;
  gates: GateSpec[];
  demolition: boolean;
  selectedSegment: number | null;
}

interface FenceStudioStore {
  spec: FenceStudioSpec;
  setAddress: (a: { address: string; city: string; state: string; zip: string; lat?: number; lng?: number }) => void;
  setPoints: (pts: PathPoint[]) => void;
  clearPath: () => void;
  setHeight: (h: FenceHeightFt) => void;
  setMaterial: (m: FenceMaterial) => void;
  setDemolition: (b: boolean) => void;
  addOpening: (kind: OpeningKind, variant: OpeningVariant, segmentIndex?: number, t?: number) => void;
  updateGate: (id: string, patch: Partial<GateSpec>) => void;
  removeGate: (id: string) => void;
  selectSegment: (i: number | null) => void;
  reset: () => void;
  computed: () => { lengthFt: number; price: FencePriceResult };
}

// Mock L-shaped run (~120 ft) so Phase 1 renders without the map: 50 + 40 + 30.
const MOCK_PATH: PathPoint[] = [
  { x: 0, y: 0 },
  { x: 50, y: 0 },
  { x: 50, y: 40 },
  { x: 20, y: 40 },
];

const initialSpec = (): FenceStudioSpec => ({
  address: "",
  city: "",
  state: "",
  zip: "",
  points: MOCK_PATH.map((p) => ({ ...p })),
  height: 6,
  material: "cedar",
  gates: [{ id: nanoid(6), segmentIndex: 0, t: 0.5, widthFt: 4, kind: "gate", variant: "single" }],
  demolition: false,
  selectedSegment: null,
});

export const useFenceStudioStore = create<FenceStudioStore>()(
  persist(
    immer((set, get) => ({
      spec: initialSpec(),
      setAddress: (a) =>
        set((s) => {
          const moved = a.lat !== s.spec.lat || a.lng !== s.spec.lng;
          s.spec.address = a.address;
          s.spec.city = a.city;
          s.spec.state = a.state;
          s.spec.zip = a.zip;
          s.spec.lat = a.lat;
          s.spec.lng = a.lng;
          // A genuinely new location invalidates any path drawn for the old one.
          if (moved) {
            s.spec.points = [];
            s.spec.gates = [];
            s.spec.selectedSegment = null;
          }
        }),
      setPoints: (pts) =>
        set((s) => {
          s.spec.points = pts;
          // Drop gates whose segment no longer exists so the spec never dangles.
          const maxSeg = Math.max(0, pts.length - 2);
          s.spec.gates = s.spec.gates.filter((g) => g.segmentIndex <= maxSeg);
          if (s.spec.selectedSegment !== null && s.spec.selectedSegment > maxSeg) {
            s.spec.selectedSegment = null;
          }
        }),
      clearPath: () =>
        set((s) => {
          s.spec.points = [];
          s.spec.gates = [];
          s.spec.selectedSegment = null;
        }),
      setHeight: (h) =>
        set((s) => {
          s.spec.height = h;
        }),
      setMaterial: (m) =>
        set((s) => {
          s.spec.material = m;
        }),
      setDemolition: (b) =>
        set((s) => {
          s.spec.demolition = b;
        }),
      addOpening: (kind, variant, segmentIndex = 0, t = 0.5) =>
        set((s) => {
          const maxSeg = Math.max(0, s.spec.points.length - 2);
          const preset = OPENING_PRESETS.find((p) => p.kind === kind && p.variant === variant);
          s.spec.gates.push({
            id: nanoid(6),
            segmentIndex: Math.min(Math.max(0, segmentIndex), maxSeg),
            t,
            widthFt: preset?.widthFt ?? 4,
            kind,
            variant,
          });
        }),
      updateGate: (id, patch) =>
        set((s) => {
          const g = s.spec.gates.find((x) => x.id === id);
          if (g) Object.assign(g, patch);
        }),
      removeGate: (id) =>
        set((s) => {
          s.spec.gates = s.spec.gates.filter((x) => x.id !== id);
        }),
      selectSegment: (i) =>
        set((s) => {
          s.spec.selectedSegment = i;
        }),
      reset: () =>
        set((s) => {
          s.spec = initialSpec();
        }),
      computed: () => {
        const s = get().spec;
        const layout = computeFenceLayout(s.points);
        const price = priceFence({
          lengthFt: layout.totalLengthFt,
          height: s.height,
          material: s.material,
          openings: s.gates,
          demolition: s.demolition,
        });
        return { lengthFt: layout.totalLengthFt, price };
      },
    })),
    {
      name: "jobflex-fence-studio",
      partialize: (s) => ({ spec: s.spec }),
    },
  ),
);
