// THE DUCT CALCULATOR (2026-10-08): what the ducts that are in the house can
// carry, from the sizes a tech measures at the plenum in five minutes. A load
// calc says how much air the house needs; this says how much the ducts will
// pass — the half of sizing a Manual J alone skips, and the reason a unit
// sized to the load on ducts built for a smaller one runs loud, short-cycles
// and starves the far rooms. Owner, 2026-10-08, on a contractor's comment:
// "Manual J doesn't measure the ductwork that's physically in the home."
//
// Equal-friction method, as a ductulator does it: a duct's airflow at the
// design friction rate, read backwards from the galvanized-duct fit
//   ΔP (in. w.c. per 100 ft) = 0.109136 · Q^1.9 / D^5.02    (Q in CFM, D in inches)
// A rectangular duct is sized as its equivalent round (Huebscher:
// De = 1.30 · (ab)^0.625 / (a + b)^0.25). Flex branch runs carry less than
// rigid at the same size; the common 6 in. flex run comes to about 90 CFM,
// the tech's own rule of thumb. Pure: the engine, the checks and the QA
// script read the same numbers.
import type { Ducts } from "./types";

/** Design friction rate, in. w.c. per 100 ft — where a Manual D design lands
 *  once the coil, filter and grilles have taken their share of a 0.5 in. w.c.
 *  blower. A ductulator's 0.1 is the optimistic end; 0.08 is the honest one. */
export const FRICTION_RATE = 0.08;
/** A flex run against a rigid duct of the same size. */
export const FLEX_FACTOR = 0.9;
/** The branch size most houses have when nobody measured it. */
export const DEFAULT_BRANCH_IN = 6;
/** Below this share of the airflow the ducts are short; from here to 100% they are tight. */
export const SHORT_BELOW = 0.9;
/** How static pressure moves with airflow through the same ducts (ΔP ∝ Q^1.9). */
export const STATIC_EXPONENT = 1.9;

export type DuctSize = { kind: "round"; diameterIn: number } | { kind: "rect"; widthIn: number; heightIn: number };

/** "16", "16 in", "16\"" → a 16 in. round; "20x8", "20 × 8", "20 by 8" → 20 × 8
 *  rectangular. Null when it is not a duct size (3–60 in.). */
export function parseDuctSize(text: string | number | null | undefined): DuctSize | null {
  if (typeof text === "number") return Number.isFinite(text) && text >= 3 && text <= 60 ? { kind: "round", diameterIn: text } : null;
  if (!text) return null;
  const s = String(text).trim();
  const rect = s.match(/(\d+(?:\.\d+)?)\s*(?:x|×|by|\*)\s*(\d+(?:\.\d+)?)/i);
  if (rect) {
    const a = Number(rect[1]);
    const b = Number(rect[2]);
    if (a >= 3 && a <= 60 && b >= 3 && b <= 60) return { kind: "rect", widthIn: Math.max(a, b), heightIn: Math.min(a, b) };
    return null;
  }
  const one = s.match(/(\d+(?:\.\d+)?)/);
  if (!one) return null;
  const d = Number(one[1]);
  return d >= 3 && d <= 60 ? { kind: "round", diameterIn: d } : null;
}

/** The round duct that carries what this one does (Huebscher). */
export function equivalentRoundIn(size: DuctSize): number {
  if (size.kind === "round") return size.diameterIn;
  const a = size.widthIn;
  const b = size.heightIn;
  return (1.3 * Math.pow(a * b, 0.625)) / Math.pow(a + b, 0.25);
}

/** CFM a rigid round duct carries at the friction rate. */
export function roundDuctCfm(diameterIn: number, frictionRate = FRICTION_RATE): number {
  if (!(diameterIn > 0)) return 0;
  return Math.pow((frictionRate * Math.pow(diameterIn, 5.02)) / 0.109136, 1 / 1.9);
}

export function ductSizeCfm(size: DuctSize, frictionRate = FRICTION_RATE): number {
  return roundDuctCfm(equivalentRoundIn(size), frictionRate);
}

const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const round10 = (v: number) => Math.round(v / 10) * 10;

/** "16 in. round" / "20×8 in." */
export function sizeWords(size: DuctSize): string {
  return size.kind === "round" ? `${trim(size.diameterIn)} in. round` : `${trim(size.widthIn)}×${trim(size.heightIn)} in.`;
}

export interface DuctCapacity {
  /** The least of the parts measured — what the system can actually get. */
  capacityCfm: number;
  /** The same in nominal tons at the climate's CFM per ton, to one decimal. */
  capacityTons: number;
  limitedBy: "supply trunk" | "return duct" | "branch runs";
  supplyTrunkCfm?: number;
  returnDuctCfm?: number;
  branchesCfm?: number;
  /** Each part in words: "16 in. round supply trunk ≈ 1,290 CFM". */
  parts: string[];
}

/** What the measured ducts carry; null until a trunk, a return duct, or the
 *  branch size with the register count has been entered — a register count
 *  alone is a guess, not a measurement. */
export function ductCapacity(d: Ducts, cfmPerTon: number): DuctCapacity | null {
  const trunk = parseDuctSize(d.supplyTrunk);
  const ret = parseDuctSize(d.returnDuct);
  const branch = typeof d.branchIn === "number" && d.branchIn >= 3 && d.branchIn <= 14 ? d.branchIn : undefined;
  const regs = typeof d.supplyRegisters === "number" && d.supplyRegisters >= 1 ? Math.round(d.supplyRegisters) : undefined;
  if (!trunk && !ret && !(branch && regs)) return null;
  const parts: string[] = [];
  const found: Array<{ what: DuctCapacity["limitedBy"]; cfm: number }> = [];
  const out: Partial<DuctCapacity> = {};
  if (trunk) {
    const cfm = round10(ductSizeCfm(trunk));
    out.supplyTrunkCfm = cfm;
    found.push({ what: "supply trunk", cfm });
    parts.push(`${sizeWords(trunk)} supply trunk ≈ ${cfm.toLocaleString("en-US")} CFM`);
  }
  if (ret) {
    const cfm = round10(ductSizeCfm(ret));
    out.returnDuctCfm = cfm;
    found.push({ what: "return duct", cfm });
    parts.push(`${sizeWords(ret)} return duct ≈ ${cfm.toLocaleString("en-US")} CFM`);
  }
  if (branch && regs) {
    const each = roundDuctCfm(branch) * FLEX_FACTOR;
    const cfm = round10(each * regs);
    out.branchesCfm = cfm;
    found.push({ what: "branch runs", cfm });
    parts.push(`${regs} × ${trim(branch)} in. flex runs ≈ ${cfm.toLocaleString("en-US")} CFM (${Math.round(each)} each)`);
  }
  const least = found.sort((a, b) => a.cfm - b.cfm)[0];
  return { ...out, capacityCfm: least.cfm, capacityTons: Math.round((least.cfm / (cfmPerTon || 400)) * 10) / 10, limitedBy: least.what, parts } as DuctCapacity;
}

/** The static the same ducts show at another airflow: a reading taken on the
 *  old 3-ton is a reading at the 3-ton's air; the new 4-ton pushes a third
 *  more through the same ducts and reads 1.33^1.9 ≈ 1.7 times the static. */
export function staticAtAirflow(measuredInWc: number, measuredCfm: number, newCfm: number): number {
  if (!(measuredCfm > 0) || !(newCfm > 0)) return measuredInWc;
  return measuredInWc * Math.pow(newCfm / measuredCfm, STATIC_EXPONENT);
}
