// DTO строк RoofMeasurement — data-only (roofcore): движок построения
// удалён; modelJson старых строк читается как непрозрачные данные и
// новым кодом не пишется (схема БД не тронута).
import type {
  ChimneyCandidate,
  MeasurementPipeline,
  MeasurementProvenance,
  MeasurementSource,
  RoofMeasurementDTO,
  RoofMeasurementSummary,
} from "@/lib/roofDiagram/types";
import type { InstantRoofData } from "@/lib/eagleview";
import type { CalibrationReport, MeasurementValidation } from "@/lib/roofDiagram/types";

export interface StoredProvenance {
  calibration: CalibrationReport | null;
  provenance: MeasurementProvenance;
  pipeline?: MeasurementPipeline;
}

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
  modelJson: string | null;
  chimneyJson: string | null;
  provenanceJson: string | null;
  pngUrl: string | null;
  pdfUrl: string | null;
  createdAt: Date;
}

export type RoofMeasurementSummaryRow = Pick<
  RoofMeasurementRow,
  "id" | "source" | "address" | "city" | "state" | "areaSqft" | "squares" | "predominantPitch" | "facetCount" | "pngUrl" | "createdAt"
>;

const SOURCES: ReadonlySet<string> = new Set<MeasurementSource>(["instant+recon", "instant-outline", "recon"]);

const parseJson = (s: string | null): unknown => {
  if (!s) return null;
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return null;
  }
};

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const asSource = (s: string): MeasurementSource => (SOURCES.has(s) ? (s as MeasurementSource) : "recon");

const asChimneys = (v: unknown): ChimneyCandidate[] => (Array.isArray(v) ? (v as ChimneyCandidate[]) : []);

export function toDTO(row: RoofMeasurementRow): RoofMeasurementDTO {
  const storedRaw = parseJson(row.provenanceJson);
  const stored: Record<string, unknown> = isPlainObject(storedRaw) ? storedRaw : {};
  const pipeline = typeof stored.pipeline === "string" ? (stored.pipeline as MeasurementPipeline) : undefined;
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
    model: parseJson(row.modelJson),
    instant: (parseJson(row.instantJson) as InstantRoofData | null) ?? null,
    chimneys: asChimneys(parseJson(row.chimneyJson)),
    calibration: (stored.calibration as CalibrationReport | null) ?? null,
    validation: (stored.validation as MeasurementValidation | null) ?? null,
    ...(pipeline ? { pipeline } : {}),
    provenance: isPlainObject(stored.provenance) ? (stored.provenance as MeasurementProvenance) : {},
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
