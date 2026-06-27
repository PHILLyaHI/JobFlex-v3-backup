// Pricing matrix for the fence studio. Pure, deterministic, no env/network — the
// live sandbox price runs through here on every toolbelt change (must be instant,
// so OpenAI/`estimateFence` is NOT on this path; it is reused only at export).
import { MATERIAL_LABEL, type FenceMaterial, type FenceHeightFt } from "./fenceTypes";

// $/linear-ft installed base price per material, reconciled with the hardcoded
// constants the simple fence estimator already uses. Tunable.
export const MATERIAL_BASE_PRICE: Record<FenceMaterial, number> = {
  cedar: 28,
  vinyl: 40,
  "chain-link": 18,
  aluminum: 55,
  composite: 48,
};

// Height multiplier anchored at 6 ft = 1.0.
export const HEIGHT_MULTIPLIER: Record<FenceHeightFt, number> = {
  4: 0.78,
  6: 1.0,
  7: 1.18,
  8: 1.4,
};

export const GATE_PREMIUM = 350; // per gate
export const DEMOLITION_FEE_PER_FT = 6; // teardown + haul, applied per linear foot

export interface FencePriceInput {
  lengthFt: number;
  height: FenceHeightFt;
  material: FenceMaterial;
  gateCount: number;
  demolition: boolean;
}

export interface FencePriceLine {
  label: string;
  amount: number;
}

export interface FencePriceResult {
  total: number;
  base: number;
  gatesCost: number;
  demoCost: number;
  perFoot: number;
  breakdown: FencePriceLine[];
}

// Total = (Length × MaterialBasePrice × HeightMultiplier)
//       + (GateCount × GatePremium)
//       + DemolitionFee
export function priceFence(i: FencePriceInput): FencePriceResult {
  const len = Math.max(0, i.lengthFt);
  const gateCount = Math.max(0, Math.round(i.gateCount));
  const base = len * MATERIAL_BASE_PRICE[i.material] * HEIGHT_MULTIPLIER[i.height];
  const gatesCost = gateCount * GATE_PREMIUM;
  const demoCost = i.demolition ? len * DEMOLITION_FEE_PER_FT : 0;
  const total = base + gatesCost + demoCost;
  const perFoot = len > 0 ? total / len : 0;

  const breakdown: FencePriceLine[] = [
    { label: `${MATERIAL_LABEL[i.material]} · ${i.height} ft · ${Math.round(len)} lf`, amount: base },
  ];
  if (gatesCost > 0) breakdown.push({ label: `Gates × ${gateCount}`, amount: gatesCost });
  if (demoCost > 0) breakdown.push({ label: "Demolition & haul-away", amount: demoCost });

  return { total, base, gatesCost, demoCost, perFoot, breakdown };
}

export interface FenceExportLine {
  name: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
}

export interface FenceLineItems {
  materials: FenceExportLine[];
  labor: FenceExportLine[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Turn a price input into proposal-ready line items. The shape matches
// convertFenceEstimateToProposal's schema ({name, quantity, unitPrice, unit?}).
// The installed base is split material/labor ~55/45; gates and demolition become
// their own lines so the proposal reads clearly. "ln ft" maps to LINEAR_FT.
export function buildFenceLineItems(i: FencePriceInput): FenceLineItems {
  const len = Math.max(0, Math.round(i.lengthFt * 10) / 10);
  const perFt = MATERIAL_BASE_PRICE[i.material] * HEIGHT_MULTIPLIER[i.height];
  const gateCount = Math.max(0, Math.round(i.gateCount));

  const materials: FenceExportLine[] = [
    {
      name: `${MATERIAL_LABEL[i.material]} fence material · ${i.height} ft`,
      quantity: len,
      unitPrice: round2(perFt * 0.55),
      unit: "ln ft",
    },
  ];
  const labor: FenceExportLine[] = [
    {
      name: "Install labor · layout, post-setting, panels",
      quantity: len,
      unitPrice: round2(perFt * 0.45),
      unit: "ln ft",
    },
  ];
  if (gateCount > 0) {
    materials.push({ name: "Gate + hardware", quantity: gateCount, unitPrice: GATE_PREMIUM, unit: "ea" });
  }
  if (i.demolition) {
    labor.push({
      name: "Remove & haul existing fence",
      quantity: len,
      unitPrice: DEMOLITION_FEE_PER_FT,
      unit: "ln ft",
    });
  }
  return { materials, labor };
}
