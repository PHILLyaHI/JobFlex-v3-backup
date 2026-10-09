// THE CATALOG AS THE SHOP SEES IT (2026-10-09) — pure, client-safe.
//
// Owner: "make a better catalog that can already be used in the USA, per state
// code; editable, their own brands and models; by category lists; make smart."
// The rows themselves are lib/hvac/types CatalogItem (the US list in data/usCatalog,
// the shop's own in the HvacCatalogItem table). This module reads them for the
// catalog page: the eight categories in the order a contractor thinks in, rows
// grouped by brand and product line with their size ladder, one-line ratings,
// and — the smart part — whether a row can be installed in a given state, from
// the same rules the estimator's checks apply (data/rules): the DOE regional
// SEER2 / EER2 floor, the refrigerant rules (New York's R-410A ban, the
// 750-GWP caps in California and Washington, R-22), California's ultra-low-NOx
// districts, and a row's own sold-in / not-sold-in states.
import type { CatalogItem, EquipmentKind } from "./types";
import { doeRegion, efficiencyFloor, refrigerantRule } from "./data/rules";

export const US_STATES: ReadonlyArray<readonly [string, string]> = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"],
  ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"],
  ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];
export const stateName = (code: string): string => US_STATES.find(([c]) => c === code.toUpperCase())?.[1] ?? code.toUpperCase();

export interface CategoryMeta {
  kind: EquipmentKind;
  /** Plural, for the tab. */
  label: string;
  /** Singular, for a row. */
  one: string;
  /** What the size column means. */
  size: "ton" | "kBTU" | "gal" | "";
  blurb: string;
}
export const CATEGORIES: readonly CategoryMeta[] = [
  { kind: "air-conditioner", label: "Air conditioners", one: "air conditioner", size: "ton", blurb: "Split condensers that pair with a furnace or air handler." },
  { kind: "heat-pump", label: "Heat pumps", one: "heat pump", size: "ton", blurb: "Split heat pumps — cooling and heating from one outdoor unit, 47 / 17 / 5 °F capacities on the row." },
  { kind: "furnace", label: "Furnaces", one: "furnace", size: "kBTU", blurb: "Gas furnaces by input; the NOx class is what California's districts read." },
  { kind: "air-handler", label: "Air handlers", one: "air handler", size: "ton", blurb: "The indoor half of an all-electric split — strip heat goes in the cabinet." },
  { kind: "coil", label: "Coils", one: "coil", size: "ton", blurb: "Cased evaporator coils that sit on a furnace." },
  { kind: "ductless", label: "Ductless", one: "ductless head", size: "ton", blurb: "Mini-split systems for a zone, an addition or a house without ducts." },
  { kind: "package", label: "Package units", one: "package unit", size: "ton", blurb: "Rooftop and ground-set single-package units — gas / electric, electric, or heat-pump heat." },
  { kind: "water-heater", label: "Water heaters", one: "water heater", size: "gal", blurb: "Tanks, heat-pump tanks and tankless — by gallons or the exact tankless model." },
];
export const categoryOf = (kind: EquipmentKind): CategoryMeta => CATEGORIES.find((c) => c.kind === kind) ?? CATEGORIES[0];
export const TIER_LABEL: Record<NonNullable<CatalogItem["tier"]>, string> = { value: "Good", mid: "Better", premium: "Best" };

/** The product line a row belongs to: the US list says it; a shop row is read off its model with the size code
 *  (the last run of digits) stripped — "GLXS4BA4810" → "GLXS4BA", "59SU5-080" → "59SU5", "GR9S80-060-U" → "GR9S80-U". */
export function familyKey(item: CatalogItem): string {
  if (item.family?.trim()) return item.family.trim();
  const m = item.model.trim();
  const guess = m.replace(/\d+(?=\D*$)/, "").replace(/[-_\s]{2,}/g, "-").replace(/^[-_\s]+|[-_\s]+$/g, "");
  return guess || m;
}

/** The size a contractor says: "3 ton", "80 kBTU", "50 gal", "tankless". */
export function sizeOf(item: CatalogItem): { n: number; label: string } {
  if (item.kind === "furnace") { const k = Math.round((item.btuInput ?? 0) / 1000); return { n: k, label: k ? `${k} kBTU` : "—" }; }
  if (item.kind === "water-heater") return item.whType === "tankless" ? { n: 0, label: "tankless" } : { n: item.gallons ?? 0, label: item.gallons ? `${item.gallons} gal` : "—" };
  const t = item.tons ?? (item.coolingBtuh ? item.coolingBtuh / 12000 : 0);
  return { n: t, label: t ? `${t % 1 ? t.toFixed(1) : t} ton` : "—" };
}

/** One line of ratings, the way a submittal reads them. */
export function ratingLine(item: CatalogItem): string {
  const p: string[] = [];
  if (item.seer2) p.push(`${item.seer2} SEER2`);
  if (item.eer2) p.push(`${item.eer2} EER2`);
  if (item.hspf2) p.push(`${item.hspf2} HSPF2`);
  if (item.afue) p.push(`${Math.round(item.afue * 1000) / 10}% AFUE`);
  if (item.uef) p.push(`${item.uef} UEF`);
  if (item.refrigerant && item.refrigerant !== "other") p.push(item.refrigerant);
  if (item.staging) p.push(item.staging);
  if (item.coldClimate) p.push("cold climate");
  if (item.kind === "package" && item.heatKind) p.push(`${item.heatKind} heat`);
  if ((item.kind === "furnace" || (item.kind === "package" && item.heatKind === "gas")) && item.noxNgJ !== undefined) p.push(item.noxNgJ <= 14 ? "ultra-low NOx" : `${item.noxNgJ} ng/J`);
  if (item.kind === "water-heater") { if (item.fuel) p.push(item.fuel); if (item.whType) p.push(item.whType === "heat-pump" ? "heat-pump tank" : item.whType); if (item.vent && item.vent !== "none") p.push(`${item.vent} vent`); }
  if (item.kind === "air-handler" && item.maxTons) p.push(`carries ${item.maxTons} t`);
  return p.join(" · ");
}

export type FitLevel = "ok" | "confirm" | "no";
export interface StateFit { level: FitLevel; text: string }
const COOLING = new Set<EquipmentKind>(["air-conditioner", "heat-pump", "ductless", "package"]);
const REGION_NAME: Record<ReturnType<typeof doeRegion>, string> = { north: "North", southeast: "Southeast", southwest: "Southwest" };

/** Can this row be installed in `state`? "no" is a rule the estimator would fail it on; "confirm" is a
 *  question the contractor settles on the job (the county's air district, the unit's manufacture date). */
export function stateFit(item: CatalogItem, state: string): StateFit {
  const st = (state || "").trim().toUpperCase();
  if (!st) return { level: "ok", text: "" };
  const name = stateName(st);
  if (item.states?.length && !item.states.map((x) => x.toUpperCase()).includes(st)) return { level: "no", text: item.availabilityNote || `Sold only in ${item.states.join(", ")}` };
  if (item.notStates?.map((x) => x.toUpperCase()).includes(st)) return { level: "no", text: item.availabilityNote || `Not sold in ${name}` };
  const notes: string[] = [];
  let level: FitLevel = "ok";
  const worse = (l: FitLevel) => { if (l === "no" || (l === "confirm" && level === "ok")) level = l; };
  if (COOLING.has(item.kind) || item.kind === "coil") {
    const r = item.refrigerant;
    if (r === "R-22") { worse("no"); notes.push("R-22: no longer made or imported"); }
    else if (r === "R-410A") {
      if (st === "NY") { worse("no"); notes.push("New York bars new R-410A split systems since 2026-01-01"); }
      else if (st === "CA" || st === "WA") { worse("no"); notes.push(`${name} caps new equipment at 750 GWP — R-410A is over it; use R-454B or R-32`); }
      else { const rule = refrigerantRule(st, r); if (!rule.allowed) { worse("no"); notes.push(rule.text); } else { worse("confirm"); notes.push("R-410A: confirm the manufacture date and the distributor's stock"); } }
    }
  }
  if (COOLING.has(item.kind)) {
    const floor = efficiencyFloor(st, item.kind === "air-conditioner" || (item.kind === "package" && item.heatKind !== "heat-pump") ? "air-conditioner" : "heat-pump", item.coolingBtuh ?? (item.tons ?? 0) * 12000, item.kind === "package");
    const region = REGION_NAME[doeRegion(st)];
    if (item.seer2 === undefined) { worse("confirm"); notes.push(`SEER2 not on the row — the ${region} floor is ${floor.seer2}`); }
    else if (item.seer2 < floor.seer2) { worse("no"); notes.push(`Below the ${region} floor: ${item.seer2} SEER2, ${floor.seer2} needed`); }
    else if (floor.eer2 && item.eer2 !== undefined) {
      const need = floor.eer2IfHighSeer && item.seer2 >= 15.2 ? floor.eer2IfHighSeer : floor.eer2;
      if (item.eer2 < need) { worse("no"); notes.push(`Below the ${region} EER2 floor: ${item.eer2} EER2, ${need} needed`); }
    } else if (floor.eer2 && item.eer2 === undefined) { worse("confirm"); notes.push(`EER2 not on the row — the ${region} floor is ${floor.eer2}`); }
    if (floor.hspf2 && item.hspf2 !== undefined && item.hspf2 < floor.hspf2) { worse("no"); notes.push(`Below the heat-pump floor: ${item.hspf2} HSPF2, ${floor.hspf2} needed`); }
  }
  const gas = item.kind === "furnace" || (item.kind === "package" && (item.heatKind ?? "gas") === "gas");
  if (gas && st === "CA") {
    if ((item.noxNgJ ?? 40) <= 14) notes.push("Ultra-low NOx — legal in every California air district");
    else { worse("confirm"); notes.push("40 ng/J: barred in the South Coast, San Joaquin Valley and Bay Area districts, fine elsewhere in California"); }
  }
  if (level === "ok" && !notes.length) notes.push(COOLING.has(item.kind) ? `Meets the ${REGION_NAME[doeRegion(st)]} region's floor` : `No state rule stands in the way in ${name}`);
  return { level, text: notes.join(" · ") };
}

/** The rows a state rules out (level "no") that are still on the pick list. */
export const offForState = (items: CatalogItem[], state: string): CatalogItem[] => items.filter((i) => !i.offList && stateFit(i, state).level === "no");

export interface CatalogSummary {
  total: number; on: number; off: number; costed: number; brands: number; own: number;
  byKind: Record<EquipmentKind, { total: number; on: number; costed: number }>;
}
export function catalogSummary(items: CatalogItem[]): CatalogSummary {
  const byKind = Object.fromEntries(CATEGORIES.map((c) => [c.kind, { total: 0, on: 0, costed: 0 }])) as CatalogSummary["byKind"];
  let on = 0, costed = 0, own = 0;
  const brands = new Set<string>();
  for (const i of items) {
    const k = byKind[i.kind] ?? (byKind[i.kind] = { total: 0, on: 0, costed: 0 });
    k.total++; brands.add(i.brand.trim().toLowerCase());
    if (!i.offList) { on++; k.on++; }
    if (i.cost) { costed++; k.costed++; }
    if (i.source === "shop") own++;
  }
  return { total: items.length, on, off: items.length - on, costed, brands: brands.size, own, byKind };
}

export interface FamilyGroup { key: string; name: string; brand: string; kind: EquipmentKind; tier?: CatalogItem["tier"]; rows: CatalogItem[]; on: number; costed: number }
export interface BrandGroup { brand: string; families: FamilyGroup[]; total: number; on: number; costed: number }

/** One category's rows by brand, then product line, sizes in order. */
export function groupCatalog(items: CatalogItem[], kind: EquipmentKind): BrandGroup[] {
  const brands = new Map<string, Map<string, FamilyGroup>>();
  for (const i of items) {
    if (i.kind !== kind) continue;
    const b = i.brand.trim();
    const fams = brands.get(b) ?? new Map<string, FamilyGroup>();
    brands.set(b, fams);
    const key = familyKey(i);
    const g = fams.get(key) ?? { key, name: key, brand: b, kind, tier: i.tier, rows: [], on: 0, costed: 0 };
    g.rows.push(i);
    if (!i.offList) g.on++;
    if (i.cost) g.costed++;
    fams.set(key, g);
  }
  const TIER_ORDER = { value: 0, mid: 1, premium: 2 } as const;
  return Array.from(brands.entries())
    .map(([brand, fams]) => {
      const families = Array.from(fams.values()).map((g) => ({ ...g, rows: g.rows.slice().sort((a, b) => sizeOf(a).n - sizeOf(b).n || a.model.localeCompare(b.model)) }))
        .sort((a, b) => (TIER_ORDER[a.tier ?? "mid"] - TIER_ORDER[b.tier ?? "mid"]) || a.name.localeCompare(b.name));
      const total = families.reduce((n, f) => n + f.rows.length, 0);
      return { brand, families, total, on: families.reduce((n, f) => n + f.on, 0), costed: families.reduce((n, f) => n + f.costed, 0) };
    })
    .sort((a, b) => b.total - a.total || a.brand.localeCompare(b.brand));
}

/** A stable id for a row the shop adds by hand. */
export const shopItemId = (kind: EquipmentKind, brand: string, model: string): string =>
  `shop-${kind}-${brand}-${model}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
