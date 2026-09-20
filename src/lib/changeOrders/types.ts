// Change-order TYPES — the forms a change order can be built from. Built-ins
// live here as data (the roofPackage/catalog.ts precedent: no seed step runs
// in production); an org adds more as ChangeOrderType rows that hold the same
// JSON definition. One generic sheet renders any of them. Client-safe.
//
// Every line a type produces uses the proposal's unit vocabulary ("sq ft",
// "linear ft", "each", "hour", "lot") so a converted installment and the
// client's page read the same words.

export type CoUnit = "sq ft" | "linear ft" | "square" | "each" | "hour" | "lot";
export const CO_UNITS: CoUnit[] = ["each", "sq ft", "linear ft", "square", "hour", "lot"];

/** The proposal's stored measurement type → the change order's unit word. */
export function unitFromMeasurementType(t: string | null | undefined): CoUnit {
  switch ((t ?? "").toUpperCase()) {
    case "SQFT":
      return "sq ft";
    case "LINEAR_FT":
      return "linear ft";
    case "SQUARE":
      return "square";
    case "HOUR":
      return "hour";
    case "LUMP_SUM":
      return "lot";
    default:
      return "each";
  }
}

/** The words that mean roofing work. A roof FAMILY word does not: "composite"
 *  is a fence picket as often as a shingle, "cedar" a fence as often as a
 *  shake, "shaker" a cabinet door — and every one of those contracts was
 *  opening the change-order sheet on plywood under the shingles (owner,
 *  2026-09-19: a composite fence offered sheathing replacement). The family
 *  only says WHICH plywood once the job is known to be a roof. */
const ROOFING_WORDS = /\broof(?:ing|s)?\b|shingle|underlayment|drip edge|ridge (?:vent|cap)|ice (?:&|and) water|tear-off|tear off|starter strip|\bsquares? of roof/;

/** A proposal is a roofing job when its lines say so — that is when the plywood type applies. */
export function isRoofingProposal(input: { title?: string | null; lineNames: readonly string[] }): boolean {
  const text = `${input.title ?? ""} ${input.lineNames.join(" ")}`.toLowerCase();
  return ROOFING_WORDS.test(text);
}
export type CoLineKind = "material" | "labor";

export interface CoTypeItem {
  key: string;
  label: string;
  /** Shown beside the label — "1/2 in" — and copied into line.meta. */
  thickness?: string;
  /** Suggested price per unit, INSTALLED (material + labor). A default only. */
  suggestedUnitPrice: number;
  /** Suggested price for this item in `unit`; the type's unit when absent. */
  unit?: CoUnit;
}

export interface CoTypeDef {
  key: string;
  label: string;
  /** One-line intro on the sheet. */
  intro: string;
  /** The quantity's unit — what areas add up to. */
  unit: CoUnit;
  /** Selectable items; empty = free-form lines only. */
  items: CoTypeItem[];
  /** "Custom — contractor enters name, thickness and price." */
  allowCustomItem: boolean;
  /** Several named areas on one order ("north slope 96 sq ft, chimney 32"). */
  areas: boolean;
  helpers: {
    /** Sheets × this = sq ft (4 × 8 = 32). */
    sheetSqft?: number;
    /** Length × width entry. */
    lengthWidth?: boolean;
  };
  photos: boolean;
  reason: boolean;
  reasonPlaceholder?: string;
  /** Pre-select an item by the roof family words found in the proposal's lines. */
  smartDefault?: {
    byRoofFamily: Record<string, string>;
    fallback: string;
  };
  /** Verify-before-launch note shown once in the sheet's fine print. */
  pricingNote?: string;
}

export const PLYWOOD_TYPE: CoTypeDef = {
  key: "plywood_sheathing",
  label: "Plywood / sheathing replacement",
  intro: "Rotted or damaged sheathing found under the shingles, replaced before the new roof goes on.",
  unit: "sq ft",
  items: [
    { key: "cdx_12", label: "1/2\" CDX plywood", thickness: "1/2 in", suggestedUnitPrice: 3.75 },
    { key: "cdx_58", label: "5/8\" CDX plywood", thickness: "5/8 in", suggestedUnitPrice: 4.25 },
    { key: "cdx_34", label: "3/4\" CDX plywood", thickness: "3/4 in", suggestedUnitPrice: 5.0 },
    { key: "osb_716", label: "7/16\" OSB", thickness: "7/16 in", suggestedUnitPrice: 2.75 },
    { key: "osb_12", label: "1/2\" OSB", thickness: "1/2 in", suggestedUnitPrice: 3.0 },
    { key: "osb_58", label: "5/8\" OSB", thickness: "5/8 in", suggestedUnitPrice: 3.5 },
  ],
  allowCustomItem: true,
  areas: true,
  helpers: { sheetSqft: 32, lengthWidth: true },
  photos: true,
  reason: true,
  reasonPlaceholder: "Rot found on the north slope during tear-off — must be replaced before the new roof goes on.",
  smartDefault: {
    // Heavier or screw-down systems want 5/8"; shingles are fine on 1/2".
    byRoofFamily: { tile: "cdx_58", slate: "cdx_58", metal: "cdx_58", shake: "cdx_12", asphalt: "cdx_12", synthetic: "cdx_12" },
    fallback: "cdx_12",
  },
  pricingNote: "Suggested prices are 2026 US ballpark, material + labor per sq ft — set your own and they are remembered.",
};

export const CUSTOM_TYPE: CoTypeDef = {
  key: "custom",
  label: "Change order",
  intro: "Add or credit anything — pick a line from the proposal to add more of it, or write your own, material or labor, in any measure.",
  unit: "each",
  items: [],
  allowCustomItem: true,
  areas: false,
  helpers: {},
  photos: true,
  reason: true,
  reasonPlaceholder: "What changed, and why the client is paying for it.",
};

export const BUILTIN_CHANGE_ORDER_TYPES: CoTypeDef[] = [PLYWOOD_TYPE, CUSTOM_TYPE];

/** Words in a proposal's line names that say which roof family it is. */
export function inferRoofFamily(lineNames: readonly string[]): string | null {
  const text = lineNames.join(" · ").toLowerCase();
  if (/\btile\b|clay|concrete tile/.test(text)) return "tile";
  if (/\bslate\b/.test(text)) return "slate";
  if (/standing[- ]seam|metal panel|metal roof|metal shingle|stone-coated|corrugated|\bcopper\b/.test(text)) return "metal";
  if (/cedar|shake/.test(text)) return "shake";
  if (/synthetic|composite/.test(text)) return "synthetic";
  if (/shingle|asphalt|architectural|3-tab/.test(text)) return "asphalt";
  return null;
}

// ── The sheet's form → lines ────────────────────────────────────────────────
export interface CoArea {
  id: string;
  label: string;
  /** Quantity in the type's unit (sq ft for plywood). */
  quantity: number;
}

export interface CoLine {
  key: string;
  name: string;
  quantity: number;
  unit: CoUnit;
  unitPrice: number;
  kind: CoLineKind;
  meta?: Record<string, string | number>;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One line per area, "material · area label", so the client reads
 * material · area (sq ft) · price/sq ft · line total — the display the owner
 * asked for. Areas with no quantity are skipped.
 */
export function linesForAreas(input: {
  itemLabel: string;
  itemKey: string;
  thickness?: string;
  unit: CoUnit;
  unitPrice: number;
  areas: CoArea[];
}): CoLine[] {
  return input.areas
    .filter((a) => a.quantity > 0)
    .map((a) => ({
      key: input.itemKey,
      name: `${input.itemLabel}${a.label.trim() ? ` · ${a.label.trim()}` : ""}`,
      quantity: r2(a.quantity),
      unit: input.unit,
      unitPrice: r2(input.unitPrice),
      kind: "material" as const,
      meta: { ...(input.thickness ? { thickness: input.thickness } : {}), area: a.label.trim() || "" },
    }));
}

export interface CoTotals {
  subtotal: number;
  taxRate: number;
  taxTotal: number;
  total: number;
}

/** Rounded to cents at every step so Σ lines == subtotal exactly. */
export function totalsForLines(lines: readonly CoLine[], taxRate: number, taxable: boolean): CoTotals {
  const subtotal = r2(lines.reduce((a, l) => a + r2(l.quantity * l.unitPrice), 0));
  const rate = taxable && Number.isFinite(taxRate) && taxRate > 0 ? taxRate : 0;
  const taxTotal = r2(subtotal * rate);
  return { subtotal, taxRate: rate, taxTotal, total: r2(subtotal + taxTotal) };
}

/** A proposal's tax rate is stored as a fraction (0.095); a stray percent (9.5) is normalized. */
export function normalizeTaxRate(rate: number | null | undefined): number {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return 0;
  return rate > 1 ? rate / 100 : rate;
}

export const CO_STATUS = {
  DRAFT: "DRAFT",
  SENT: "SENT",
  APPROVED: "APPROVED",
  DECLINED: "DECLINED",
  VOID: "VOID",
} as const;
export type CoStatus = (typeof CO_STATUS)[keyof typeof CO_STATUS];
