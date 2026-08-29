// RoofMeasurement row → DTO. Lives outside the "use server" action file because
// a server-action module may only export async functions; a synchronous helper
// exported from there would be turned into an action reference on the client.
//
// SQLite has no JSON column, so the geometry, the Instant summary, the chimney
// candidates and the provenance all travel as strings (prisma/schema.prisma,
// model RoofMeasurement). This is the one place they are parsed, and it is
// defensive: a row written by an older build with a malformed or empty column
// must still open — the drawing degrades, the history list does not crash.
import type { RoofModel, InstantRoofData } from "@/lib/eagleview";
import type {
  CalibrationReport,
  ChimneyCandidate,
  MeasurementPipeline,
  MeasurementProvenance,
  MeasurementSource,
  MeasurementValidation,
  RoofMeasurementDTO,
  RoofMeasurementSummary,
} from "./types";

/** The columns toDTO reads — structurally satisfied by a Prisma RoofMeasurement row. */
export interface RoofMeasurementRow {
  id: string;
  source: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  areaSqft: number | null;
  squares: number | null;
  predominantPitch: string | null;
  facetCount: number | null;
  instantJson: string | null;
  modelJson: string;
  chimneyJson: string | null;
  provenanceJson: string | null;
  pngUrl: string | null;
  pdfUrl: string | null;
  createdAt: Date;
}

/** The columns toSummary reads — the `select` used by the history list. */
export interface RoofMeasurementSummaryRow {
  id: string;
  source: string;
  address: string | null;
  city: string | null;
  state: string | null;
  areaSqft: number | null;
  squares: number | null;
  predominantPitch: string | null;
  facetCount: number | null;
  pngUrl: string | null;
  createdAt: Date;
}

/** What `provenanceJson` holds: the calibration report and the imagery
 *  provenance (which also carries the planarize/synthesize reports), plus —
 *  additively, absent on older rows — which gate candidate shipped. */
export interface StoredProvenance {
  calibration: CalibrationReport | null;
  provenance: MeasurementProvenance;
  /** Which candidate the selection gate shipped (spec §6.5). */
  pipeline?: MeasurementPipeline;
}

const SOURCES: ReadonlySet<string> = new Set<MeasurementSource>([
  "instant+recon",
  "instant-outline",
  "recon",
]);

/** JSON.parse that yields `undefined` instead of throwing. Shape checks live
 *  with the callers: a parsed value is not a value of the column's type until
 *  it has been looked at. */
function parseJson(text: string | null | undefined): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A stored RoofModel must at least have its three geometry arrays and a
 *  totals object; anything else opens as the empty model rather than crashing
 *  the drawing on `model.points.map`. */
function asRoofModel(v: unknown): RoofModel {
  if (!isPlainObject(v)) return emptyRoofModel();
  if (!Array.isArray(v.points) || !Array.isArray(v.lines) || !Array.isArray(v.faces)) return emptyRoofModel();
  if (!isPlainObject(v.totals)) return emptyRoofModel();
  return v as unknown as RoofModel;
}

function asChimneys(v: unknown): ChimneyCandidate[] {
  return Array.isArray(v) ? (v as ChimneyCandidate[]) : [];
}

function asInstant(v: unknown): InstantRoofData | null {
  return isPlainObject(v) ? (v as unknown as InstantRoofData) : null;
}

/** A calibration report is only usable if it carries a numeric scaleK. */
function asCalibration(v: unknown): CalibrationReport | null {
  if (!isPlainObject(v)) return null;
  if (typeof v.scaleK !== "number" || !Number.isFinite(v.scaleK)) return null;
  return v as unknown as CalibrationReport;
}

/** A validation summary is only usable if it carries a finite score; the
 *  counts and the gate flag default rather than reject, so a partial write
 *  still opens. */
function asValidation(v: unknown): MeasurementValidation | null {
  if (!isPlainObject(v)) return null;
  if (typeof v.score !== "number" || !Number.isFinite(v.score)) return null;
  const count = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  const finite = (x: unknown): number | undefined =>
    typeof x === "number" && Number.isFinite(x) ? x : undefined;
  const fidelity = finite(v.fidelity);
  const gateMetric = finite(v.gateMetric);
  return {
    score: v.score,
    errors: count(v.errors),
    warns: count(v.warns),
    gateFellBack: v.gateFellBack === true,
    // Additive gate figures (fidelity term, spec §4/§6.5) — absent on older rows.
    ...(fidelity != null ? { fidelity } : {}),
    ...(gateMetric != null ? { gateMetric } : {}),
  };
}

function asProvenance(v: unknown): MeasurementProvenance {
  return isPlainObject(v) ? (v as MeasurementProvenance) : {};
}

/** Any non-empty string survives: besides the three plain candidate names,
 *  multi-structure rows store a composition summary like
 *  "s0:synthesized+graft, s1:refined" (MeasurementPipeline is additively
 *  widened to string). Non-strings and empty writes open as "no pipeline
 *  recorded"; an over-long string (a malformed blob, or a composition summary
 *  on a lot with very many structures) is TRUNCATED to a readable 400-char
 *  prefix with an ellipsis — never dropped wholesale. */
function asPipeline(v: unknown): MeasurementPipeline | undefined {
  if (typeof v !== "string" || v.length === 0) return undefined;
  return v.length <= 400 ? v : v.slice(0, 399) + "…";
}

/** An openable model for a row whose modelJson could not be parsed. */
function emptyRoofModel(): RoofModel {
  return {
    source: "synthetic",
    location: {},
    northOrientation: 0,
    points: [],
    lines: [],
    faces: [],
    penetrations: [],
    totals: {
      areaSqft: 0,
      squares: 0,
      facetCount: 0,
      predominantPitch: 0,
      footageByType: {
        EAVE: 0,
        RIDGE: 0,
        VALLEY: 0,
        RAKE: 0,
        HIP: 0,
        FLASHING: 0,
        STEPFLASH: 0,
        OTHER: 0,
      },
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
    },
  };
}

function asSource(s: string): MeasurementSource {
  // Unknown spellings fall to "recon": the most conservative reading — an
  // estimate that is never priced or attached to a proposal.
  return SOURCES.has(s) ? (s as MeasurementSource) : "recon";
}

export function toDTO(row: RoofMeasurementRow): RoofMeasurementDTO {
  const storedRaw = parseJson(row.provenanceJson);
  const stored: Record<string, unknown> = isPlainObject(storedRaw) ? storedRaw : {};
  const pipeline = asPipeline(stored.pipeline);
  return {
    id: row.id,
    source: asSource(row.source),
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    lat: row.lat,
    lng: row.lng,
    areaSqft: row.areaSqft,
    squares: row.squares,
    predominantPitch: row.predominantPitch,
    facetCount: row.facetCount,
    model: asRoofModel(parseJson(row.modelJson)),
    instant: asInstant(parseJson(row.instantJson)),
    chimneys: asChimneys(parseJson(row.chimneyJson)),
    calibration: asCalibration(stored.calibration),
    validation: asValidation(stored.validation),
    ...(pipeline ? { pipeline } : {}),
    provenance: asProvenance(stored.provenance),
    pngUrl: row.pngUrl,
    pdfUrl: row.pdfUrl,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toSummary(row: RoofMeasurementSummaryRow): RoofMeasurementSummary {
  return {
    id: row.id,
    source: asSource(row.source),
    address: row.address,
    city: row.city,
    state: row.state,
    areaSqft: row.areaSqft,
    squares: row.squares,
    predominantPitch: row.predominantPitch,
    facetCount: row.facetCount,
    pngUrl: row.pngUrl,
    createdAt: row.createdAt.toISOString(),
  };
}
