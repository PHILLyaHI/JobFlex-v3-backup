// The US starter catalog — the equipment families American residential
// contractors sell the most, as the shop's first pick list. Rows are model
// FAMILIES expanded to their size ladder (a "GSXN4036" is the 3-ton of the
// GSXN4 family); ratings are the families' published figures at the date
// below; shop cost is left empty on purpose (the rate card prices by tier
// until the shop types its costs). Not an AHRI listing: matched-system
// ratings vary by coil, and the shop's own catalog replaces this the moment
// it is imported.
//
// Filled from manufacturer / distributor spec pages on the date in
// US_CATALOG_VERIFIED_ON; each family names its source URL.

import type { CatalogItem } from "../types";

export const US_CATALOG_VERIFIED_ON = "2026-09-16";

export interface UsFamily {
  brand: string;
  /** The marketing name a contractor says out loud ("XR14", "Infinity 21"). */
  family: string;
  /** Model text with a size placeholder: `{size}` is the three-digit code
   *  (tons × 12 → 036; furnace kBTU → 080; tank gallons → 50), `{size2}` the
   *  two-digit form some makers print (36, 09). A pattern read in full on the
   *  source page is used as is; "PREFIX-{size}" (hyphen) means the family plus
   *  the nominal size — the distributor's exact suffix goes in when the shop
   *  edits the row. Tankless: the exact model, sizes [0]. */
  pattern: string;
  /** Exact model per size where the source listed them (overrides `pattern`). */
  modelBySize?: Record<number, string>;
  kind: CatalogItem["kind"];
  tier: NonNullable<CatalogItem["tier"]>;
  /** Tons for cooling gear, kBTU input for furnaces, gallons for tanks. */
  sizes: number[];
  seer2?: number;
  eer2?: number;
  hspf2?: number;
  /** Percent as makers print it (96) or a fraction (0.96). */
  afue?: number;
  refrigerant?: CatalogItem["refrigerant"];
  staging?: CatalogItem["staging"];
  coldClimate?: boolean;
  /** Heat-pump capacity retained at 17 °F and 5 °F, as a share of rated. Left
   *  out → the rule-of-thumb share (cold-climate 0.85 / 0.70, else 0.62 / 0.48). */
  ratio17?: number;
  ratio5?: number;
  /** Furnaces / air handlers: the largest coil the blower carries, by size.
   *  Left out → 3 t up to 45k, 4 t up to 70k, 5 t above. */
  maxTonsBySize?: Record<number, number>;
  whType?: CatalogItem["whType"];
  fuel?: CatalogItem["fuel"];
  uef?: number;
  uefBySize?: Record<number, number>;
  firstHourBySize?: Record<number, number>;
  btuInputBySize?: Record<number, number>;
  vent?: CatalogItem["vent"];
  /** Package units: what makes the heat ("gas" | "electric" | "heat-pump"). */
  heatKind?: "gas" | "electric" | "heat-pump";
  /** Sold or permitted only in these states; left out = everywhere. */
  states?: string[];
  /** Not sold or not permitted in these states. */
  notStates?: string[];
  /** Why the row is limited, in the contractor's words. */
  availabilityNote?: string;
  sourceUrl: string;
  /** True only when the figures were read on the source page. */
  verified: boolean;
  note?: string;
}

/** Size codes: tons × 12 (036 / 36), furnace kBTU (080), tank gallons (50). */
const code3 = (n: number) => String(Math.round(n * 12)).padStart(3, "0");
const code2 = (n: number) => String(Math.round(n * 12)).padStart(2, "0");
const kcode = (k: number) => String(k).padStart(3, "0");

function modelFor(f: UsFamily, size: number): string {
  if (f.modelBySize?.[size]) return f.modelBySize[size];
  const [three, two] = f.kind === "furnace" ? [kcode(size), String(size)] : f.kind === "water-heater" ? [String(size), String(size)] : [code3(size), code2(size)];
  return f.pattern.replaceAll("{size}", three).replaceAll("{size2}", two);
}

const COOLING_KINDS = new Set<CatalogItem["kind"]>(["air-conditioner", "heat-pump", "ductless", "package"]);
const INDOOR_KINDS = new Set<CatalogItem["kind"]>(["air-handler", "coil"]);

/** Expand a family into catalog rows. */
export function expandFamily(f: UsFamily): CatalogItem[] {
  return f.sizes.map((size) => {
    const model = modelFor(f, size);
    const item: CatalogItem = {
      id: `us-${f.brand}-${model}-${f.kind === "furnace" ? kcode(size) : f.kind === "water-heater" ? size : code3(size)}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, ""),
      kind: f.kind,
      brand: f.brand,
      model,
      tier: f.tier,
      refrigerant: f.refrigerant,
      staging: f.staging,
      coldClimate: f.coldClimate,
      seer2: f.seer2,
      eer2: f.eer2,
      hspf2: f.hspf2,
      // Families quote AFUE as a percent (96); the engine keeps a fraction.
      afue: f.afue === undefined ? undefined : f.afue > 1 ? f.afue / 100 : f.afue,
      source: "manufacturer",
      verifiedOn: f.verified ? US_CATALOG_VERIFIED_ON : undefined,
      states: f.states,
      notStates: f.notStates,
      availabilityNote: f.availabilityNote,
    };
    if (COOLING_KINDS.has(f.kind)) {
      item.tons = size;
      item.coolingBtuh = Math.round(size * 12000);
      if (f.kind === "heat-pump" || f.kind === "ductless") {
        // Nominal heating at 47 °F ≈ the cooling nominal; the colder points
        // are the family's read share or the rule of thumb (see UsFamily).
        const r17 = f.ratio17 ?? (f.coldClimate ? 0.85 : 0.62);
        const r5 = f.ratio5 ?? (f.coldClimate ? 0.7 : 0.48);
        item.heat47Btuh = Math.round(size * 12000);
        item.heat17Btuh = Math.round(size * 12000 * r17);
        item.heat5Btuh = Math.round(size * 12000 * r5);
      }
    }
    if (INDOOR_KINDS.has(f.kind)) {
      item.tons = size;
      item.ratedStaticInWc = 0.5;
      if (f.kind === "air-handler") item.maxTons = f.maxTonsBySize?.[size] ?? size;
    }
    if (f.kind === "package" && f.btuInputBySize?.[size]) item.btuInput = f.btuInputBySize[size];
    if (f.kind === "furnace") {
      item.btuInput = size * 1000;
      item.ratedStaticInWc = 0.5;
      item.maxTons = f.maxTonsBySize?.[size] ?? (size <= 45 ? 3 : size <= 70 ? 4 : 5);
    }
    if (f.kind === "water-heater") {
      item.gallons = f.whType === "tankless" ? undefined : size;
      item.whType = f.whType;
      item.fuel = f.fuel;
      item.uef = f.uefBySize?.[size] ?? f.uef;
      item.firstHourGal = f.firstHourBySize?.[size];
      item.btuInput = f.btuInputBySize?.[size];
      item.vent = f.vent;
    }
    return item;
  });
}

export { US_FAMILIES } from "./usFamilies";
import { US_FAMILIES as FAMILIES } from "./usFamilies";

export const US_CATALOG: CatalogItem[] = FAMILIES.flatMap(expandFamily);
