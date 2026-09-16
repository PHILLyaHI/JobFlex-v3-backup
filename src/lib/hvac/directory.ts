// Equipment directory exports → catalog rows.
//
// AHRI's subscriber export and NEEP's cold-climate list export (Excel saved
// as CSV) name their columns differently from the shop template and from each
// other, and both change wording between years. This reader matches headers
// by meaning — a short alias list per field, matched case- and
// punctuation-insensitively — and reports which columns it recognised, so an
// import that silently ignores a column cannot happen. Rows become CatalogItem
// with source "ahri" or "neep" and are priced by the rate-card defaults until
// the shop adds a cost.

import type { CatalogItem, EquipmentKind } from "./types";

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Field → header patterns, tested against the normalised header (parenthetical
 *  text kept: "Heating Capacity (H1) - Single or High Stage (47F)" becomes
 *  "heating capacity h1 single or high stage 47f"). The first header that
 *  matches a field's pattern and is not already taken wins. Temperature
 *  capacities take the rated/max/high-stage column and never a COP, kW, min
 *  or low-stage one. */
const not = (re: RegExp, bad: RegExp) => (h: string) => re.test(h) && !bad.test(h);
const LOW = /\b(cop|kw|watts?|min|minimum|low stage|low|amps?|eer|seer|hspf)\b/;
const ALIASES: Record<string, Array<(h: string) => boolean>> = {
  ahriRef: [(h) => /ahri (certified )?(reference|ref|certificate|number)|^ahri$|ahri no/.test(h)],
  brand: [(h) => /outdoor unit brand|^brand( name)?$|manufacturer|^oem$/.test(h)],
  model: [(h) => /outdoor unit model|outdoor model|^model( number| no)?$|^ou model/.test(h)],
  indoorModel: [(h) => /indoor unit model|indoor model|^iu model|air handler model|coil model/.test(h)],
  furnaceModel: [(h) => /furnace model/.test(h)],
  coolingBtuh: [not(/cooling capacity|capacity.*\b95 ?f\b|rated cooling/, LOW)],
  heat47Btuh: [not(/(heat|capacity).*\b47 ?f?\b|\b47 ?f\b.*capacity/, LOW)],
  heat17Btuh: [not(/(heat|capacity).*\b17 ?f?\b|\b17 ?f\b.*capacity/, LOW)],
  heat5Btuh: [not(/(heat|capacity).*\b5 ?f?\b|\b5 ?f\b.*capacity/, LOW)],
  seer2: [(h) => /^seer ?2\b/.test(h)],
  eer2: [(h) => /^eer ?2\b/.test(h)],
  hspf2: [(h) => /^hspf ?2\b/.test(h)],
  seer: [(h) => /^seer\b(?! ?2)/.test(h)],
  eer: [(h) => /^eer\b(?! ?2)/.test(h)],
  hspf: [(h) => /^hspf\b(?! ?2)/.test(h)],
  btuInput: [(h) => /\binput\b/.test(h) && !/output/.test(h)],
  afue: [(h) => /^afue\b/.test(h)],
  refrigerant: [(h) => /refrigerant/.test(h)],
  staging: [(h) => /compressor (type|staging)|^staging$|variable speed|^speed$/.test(h)],
  ductConfig: [(h) => /duct configuration|^ducted$|^configuration$|product type|system type|^type$/.test(h)],
  status: [(h) => /^status$/.test(h)],
  tons: [(h) => /^(nominal )?tons$|nominal size/.test(h)],
};

/** Which file this is, from its header. */
export function detectDirectory(headers: string[]): "ahri" | "neep" | "shop" | null {
  const h = headers.map(norm);
  if (h.includes("kind")) return "shop";
  if (h.some((x) => /ahri (certified )?(reference|ref|number)/.test(x))) return h.some((x) => /\b5 ?f\b/.test(x)) ? "neep" : "ahri";
  if (h.some((x) => /\b5 ?f\b.*capacity|capacity.*\b5 ?f\b/.test(x))) return "neep";
  return null;
}

function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(String(v).replace(/[$,%\s]/g, "").replace(/btuh?$/i, ""));
  return Number.isFinite(n) && String(v).trim() !== "" ? n : undefined;
}

export interface DirectoryImport {
  items: CatalogItem[];
  errors: string[];
  /** Field → the header it was read from. */
  recognised: Record<string, string>;
  source: "ahri" | "neep";
}

/** Parse an AHRI or NEEP export. Rows without a brand and model are counted
 *  and reported, not silently dropped; discontinued rows are skipped. */
export function parseDirectoryCsv(text: string): DirectoryImport | { items: []; errors: string[]; recognised: Record<string, string>; source: null } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { items: [], errors: ["The file is empty."], recognised: {}, source: null };
  const header = splitCsv(lines[0]);
  const source = detectDirectory(header);
  if (source === "shop" || source === null) return { items: [], errors: [source === "shop" ? "This is the shop template — import it as the catalog." : "Couldn't recognise an AHRI or NEEP export: no AHRI reference or capacity-at-5°F column in the header."], recognised: {}, source: null };
  const normHeader = header.map(norm);
  const col: Record<string, number> = {};
  const recognised: Record<string, string> = {};
  for (const [field, tests] of Object.entries(ALIASES)) {
    for (const test of tests) {
      const i = normHeader.findIndex((h, idx) => test(h) && !Object.values(col).includes(idx));
      if (i >= 0) { col[field] = i; recognised[field] = header[i]; break; }
    }
  }
  if (col.brand === undefined || col.model === undefined) return { items: [], errors: ["Couldn't find the brand and outdoor model columns."], recognised, source: null };
  const get = (cells: string[], f: string) => (col[f] === undefined ? undefined : cells[col[f]]?.trim());
  const items: CatalogItem[] = [];
  const errors: string[] = [];
  let skippedStatus = 0;
  lines.slice(1).forEach((line, n) => {
    const cells = splitCsv(line);
    const brand = get(cells, "brand") ?? "";
    const model = get(cells, "model") ?? "";
    if (!brand || !model) { errors.push(`Row ${n + 2}: no brand/model.`); return; }
    const status = (get(cells, "status") ?? "").toLowerCase();
    if (status && /discontinued|inactive|obsolete/.test(status)) { skippedStatus++; return; }
    const afueRaw = num(get(cells, "afue"));
    const btuInput = num(get(cells, "btuInput"));
    const heat47 = num(get(cells, "heat47Btuh"));
    const cooling = num(get(cells, "coolingBtuh"));
    const hspf2 = num(get(cells, "hspf2")) ?? num(get(cells, "hspf"));
    const kind: EquipmentKind = afueRaw !== undefined || (btuInput !== undefined && cooling === undefined) ? "furnace" : heat47 !== undefined || hspf2 !== undefined ? "heat-pump" : "air-conditioner";
    const duct = (get(cells, "ductConfig") ?? "").toLowerCase();
    const finalKind: EquipmentKind = kind !== "furnace" && /ductless|mini.?split|multi.?split/.test(duct) ? "ductless" : kind !== "furnace" && /package|rooftop/.test(duct) ? "package" : kind;
    const stagingRaw = (get(cells, "staging") ?? "").toLowerCase();
    const refr = (get(cells, "refrigerant") ?? "").toUpperCase().replace(/\s/g, "");
    const tons = num(get(cells, "tons")) ?? (cooling ? Math.round((cooling / 12000) * 2) / 2 : undefined);
    const indoor = [get(cells, "indoorModel"), get(cells, "furnaceModel")].filter(Boolean).join(" + ") || undefined;
    const item: CatalogItem = {
      id: `${source}-${(get(cells, "ahriRef") || `${brand}-${model}-${indoor ?? ""}`)}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, ""),
      kind: finalKind,
      brand,
      model: indoor ? `${model} + ${indoor}` : model,
      ahriRef: get(cells, "ahriRef") || undefined,
      tons,
      coolingBtuh: cooling,
      heat47Btuh: heat47,
      heat17Btuh: num(get(cells, "heat17Btuh")),
      heat5Btuh: num(get(cells, "heat5Btuh")),
      btuInput,
      afue: afueRaw === undefined ? undefined : afueRaw > 1 ? afueRaw / 100 : afueRaw,
      seer2: num(get(cells, "seer2")),
      eer2: num(get(cells, "eer2")),
      hspf2,
      refrigerant: /410/.test(refr) ? "R-410A" : /454/.test(refr) ? "R-454B" : /32/.test(refr) ? "R-32" : /22/.test(refr) ? "R-22" : refr ? "other" : undefined,
      staging: /variable|inverter|modulat/.test(stagingRaw) ? "variable" : /two|2 ?stage|dual/.test(stagingRaw) ? "two-stage" : stagingRaw ? "single" : undefined,
      coldClimate: source === "neep" ? true : undefined,
      source,
      verifiedOn: new Date().toISOString().slice(0, 10),
    };
    if (item.seer2 === undefined && num(get(cells, "seer")) !== undefined) item.seer2 = Math.round(num(get(cells, "seer"))! * 0.95 * 10) / 10;
    items.push(item);
  });
  if (skippedStatus) errors.push(`${skippedStatus} discontinued rows skipped.`);
  return { items, errors, recognised, source };
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
