"use client";
// Global state for the 3D Fence Estimator Studio. Same construction as
// useProposalDraftStore (persist + immer + a `computed()` selector). The drawn
// spec is the source of truth; the live price is derived on demand, never stored.
// The editable rate card (`pricing`) and the custom catalog (`customMaterials` /
// `customOpenings`) are persisted alongside the spec; the transient `armed` opening
// (what the next map click drops) is deliberately NOT persisted.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { nanoid } from "nanoid";
import {
  presetWidthFt,
  type MaterialId,
  type FenceHeightFt,
  type PathPoint,
  type GateSpec,
  type OpeningKind,
  type OpeningVariant,
  type CustomMaterial,
  type CustomOpening,
} from "@/components/estimator/fence/fenceTypes";
import { computeFenceLayout } from "@/components/estimator/fence/fenceGeometry";
import {
  priceFence,
  defaultPricing,
  type FencePriceResult,
  type FencePricingConfig,
} from "@/components/estimator/fence/fencePricing";

export interface FenceStudioSpec {
  address: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
  points: PathPoint[];
  height: FenceHeightFt;
  material: MaterialId;
  gates: GateSpec[];
  demolition: boolean;
  selectedSegment: number | null;
}

// The opening a subsequent map click will drop (the "armed" tool). Transient UI
// state; lives at the store root so both the Add buttons and the map can read it.
export interface ArmedOpening {
  kind: OpeningKind;
  variant: OpeningVariant;
  widthFt: number;
}

interface FenceStudioStore {
  spec: FenceStudioSpec;
  pricing: FencePricingConfig;
  customMaterials: CustomMaterial[];
  customOpenings: CustomOpening[];
  armed: ArmedOpening | null;
  setAddress: (a: { address: string; city: string; state: string; zip: string; lat?: number; lng?: number }) => void;
  setPoints: (pts: PathPoint[]) => void;
  clearPath: () => void;
  setHeight: (h: number) => void;
  setMaterial: (m: MaterialId) => void;
  setDemolition: (b: boolean) => void;
  addOpening: (kind: OpeningKind, variant: OpeningVariant, segmentIndex?: number, t?: number) => void;
  addOpeningAt: (segmentIndex: number, t: number, x?: number, y?: number) => void;
  updateGate: (id: string, patch: Partial<GateSpec>) => void;
  removeGate: (id: string) => void;
  selectSegment: (i: number | null) => void;
  arm: (kind: OpeningKind, variant: OpeningVariant) => void;
  disarm: () => void;
  setMaterialPrice: (m: MaterialId, v: number) => void;
  setOpeningPrice: (kind: OpeningKind, variant: OpeningVariant, v: number) => void;
  setDemolitionPrice: (v: number) => void;
  resetPricing: () => void;
  addMaterial: (name: string, color: string, perFt: number) => void;
  removeMaterial: (id: string) => void;
  addOpeningType: (kind: OpeningKind, name: string, widthFt: number, price: number) => void;
  removeOpeningType: (id: string) => void;
  reset: () => void;
  computed: () => { lengthFt: number; price: FencePriceResult };
}

// Mock L-shaped run (~120 ft) so the 3D preview renders without the map: 50 + 40 + 30.
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

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export const useFenceStudioStore = create<FenceStudioStore>()(
  persist(
    immer((set, get) => ({
      spec: initialSpec(),
      pricing: defaultPricing(),
      customMaterials: [],
      customOpenings: [],
      armed: null,
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
            s.armed = null;
          }
        }),
      setPoints: (pts) =>
        set((s) => {
          s.spec.points = pts;
          // Drop ATTACHED gates whose segment no longer exists; detached ones (seg -1)
          // float and are always kept.
          const maxSeg = Math.max(0, pts.length - 2);
          s.spec.gates = s.spec.gates.filter((g) => g.segmentIndex < 0 || g.segmentIndex <= maxSeg);
          if (s.spec.selectedSegment !== null && s.spec.selectedSegment > maxSeg) {
            s.spec.selectedSegment = null;
          }
        }),
      clearPath: () =>
        set((s) => {
          s.spec.points = [];
          s.spec.gates = [];
          s.spec.selectedSegment = null;
          s.armed = null;
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
          const custom = s.customOpenings.find((o) => o.id === variant);
          s.spec.gates.push({
            id: nanoid(6),
            segmentIndex: clamp(segmentIndex, 0, maxSeg),
            t,
            widthFt: custom ? custom.widthFt : presetWidthFt(kind, variant),
            kind,
            variant,
          });
        }),
      // Drop the currently-armed opening (called by the map on click-to-place).
      // With free coords (x,y) the opening is DETACHED (segmentIndex -1); otherwise
      // it rides segment `segmentIndex` at `t`. No-op unless something is armed.
      addOpeningAt: (segmentIndex, t, x, y) =>
        set((s) => {
          const a = s.armed;
          if (!a) return;
          const detached = typeof x === "number" && typeof y === "number";
          const maxSeg = Math.max(0, s.spec.points.length - 2);
          const seg = detached ? -1 : clamp(segmentIndex, 0, maxSeg);
          const g: GateSpec = {
            id: nanoid(6),
            segmentIndex: seg,
            t: detached ? 0.5 : clamp(t, 0, 1),
            widthFt: a.widthFt,
            kind: a.kind,
            variant: a.variant,
          };
          if (detached) {
            g.x = x;
            g.y = y;
          }
          s.spec.gates.push(g);
          if (!detached) s.spec.selectedSegment = seg;
          s.armed = null;
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
      arm: (kind, variant) =>
        set((s) => {
          const custom = s.customOpenings.find((o) => o.id === variant);
          s.armed = { kind, variant, widthFt: custom ? custom.widthFt : presetWidthFt(kind, variant) };
        }),
      disarm: () =>
        set((s) => {
          s.armed = null;
        }),
      setMaterialPrice: (m, v) =>
        set((s) => {
          s.pricing.materialPerFt[m] = Math.max(0, v);
        }),
      setOpeningPrice: (kind, variant, v) =>
        set((s) => {
          if (!s.pricing.openingPrice[kind]) s.pricing.openingPrice[kind] = {};
          s.pricing.openingPrice[kind][variant] = Math.max(0, v);
        }),
      setDemolitionPrice: (v) =>
        set((s) => {
          s.pricing.demolitionPerFt = Math.max(0, v);
        }),
      resetPricing: () =>
        set((s) => {
          // Reset built-in rates but keep any custom materials/openings priced.
          const base = defaultPricing();
          for (const m of s.customMaterials) base.materialPerFt[m.id] = s.pricing.materialPerFt[m.id] ?? 0;
          for (const o of s.customOpenings) {
            if (!base.openingPrice[o.kind]) base.openingPrice[o.kind] = {};
            base.openingPrice[o.kind][o.id] = s.pricing.openingPrice[o.kind]?.[o.id] ?? 0;
          }
          s.pricing = base;
        }),
      addMaterial: (name, color, perFt) =>
        set((s) => {
          const id = nanoid(6);
          s.customMaterials.push({ id, name: name.trim() || "Custom", color });
          s.pricing.materialPerFt[id] = Math.max(0, perFt);
          s.spec.material = id; // select the freshly created material
        }),
      removeMaterial: (id) =>
        set((s) => {
          s.customMaterials = s.customMaterials.filter((m) => m.id !== id);
          delete s.pricing.materialPerFt[id];
          if (s.spec.material === id) s.spec.material = "cedar";
        }),
      addOpeningType: (kind, name, widthFt, price) =>
        set((s) => {
          const id = nanoid(6);
          s.customOpenings.push({
            id,
            kind,
            name: name.trim() || (kind === "gate" ? "Gate" : "Door"),
            widthFt: Math.max(1, widthFt),
          });
          if (!s.pricing.openingPrice[kind]) s.pricing.openingPrice[kind] = {};
          s.pricing.openingPrice[kind][id] = Math.max(0, price);
        }),
      removeOpeningType: (id) =>
        set((s) => {
          const o = s.customOpenings.find((x) => x.id === id);
          s.customOpenings = s.customOpenings.filter((x) => x.id !== id);
          if (o) delete s.pricing.openingPrice[o.kind][id];
          // Drop any placed openings that used this custom type so nothing dangles.
          s.spec.gates = s.spec.gates.filter((g) => g.variant !== id);
        }),
      reset: () =>
        set((s) => {
          s.spec = initialSpec();
          s.armed = null;
        }),
      computed: () => {
        const { spec, pricing } = get();
        const layout = computeFenceLayout(spec.points, spec.gates);
        const price = priceFence(
          {
            lengthFt: layout.totalLengthFt,
            height: spec.height,
            material: spec.material,
            openings: spec.gates,
            demolition: spec.demolition,
          },
          pricing,
        );
        return { lengthFt: layout.totalLengthFt, price };
      },
    })),
    {
      name: "jobflex-fence-studio",
      // No version bump: the default shallow merge keeps a returning user's persisted
      // spec/pricing and fills any new top-level keys from defaults. Persist the spec,
      // rate card, and custom catalog — never the transient armed tool.
      partialize: (s) => ({
        spec: s.spec,
        pricing: s.pricing,
        customMaterials: s.customMaterials,
        customOpenings: s.customOpenings,
      }),
    },
  ),
);
