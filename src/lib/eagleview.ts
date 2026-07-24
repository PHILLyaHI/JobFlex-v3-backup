// EagleView Measurement Orders API client + measurement-JSON parser.
//
// SERVER-ONLY: this module reads EAGLEVIEW_CLIENT_ID/SECRET and mints bearer
// tokens — it must never be imported into a client component. Import it only
// from "use server" action files (mirrors how src/lib/maps.ts is used).
//
// Auth quirk (the thing that blocks every first integration): the OAuth token
// is minted on the PRODUCTION host (apicenter.eagleview.com) while the API
// calls go to the SANDBOX host (sandbox.apicenter.eagleview.com). Hitting the
// sandbox host for the token returns an Apigee "environment is not defined"
// 500. Both hosts are overridable via env.

const TOKEN_BASE = process.env.EAGLEVIEW_TOKEN_BASE_URL || "https://apicenter.eagleview.com";
const API_BASE = process.env.EAGLEVIEW_API_BASE_URL || "https://sandbox.apicenter.eagleview.com";

export function isEagleViewEnabled(): boolean {
  return Boolean(process.env.EAGLEVIEW_CLIENT_ID && process.env.EAGLEVIEW_CLIENT_SECRET);
}

// EagleView file-type codes (from the Measurement Orders Postman collection).
export const EV_FILE = {
  MEASUREMENT_JSON: 107, // "EV Measurement JSON" — geometry: points/lines/faces
  AUTOCAD_DXF: 26, //       vector wireframe
  EAGLEVIEW_XML: 18, //     same data as JSON, in XML
  REPORT_PDF: 206, //       human-readable report
} as const;

// The roofing-contractor product ("Bid Perfect", PrimaryProductId 110) and the
// default 48-hour delivery (DeliveryProductId 8). Confirm the live catalog with
// getAvailableProducts() before relying on these for real orders.
export const EV_PRODUCT = {
  BID_PERFECT: 110,
  DELIVERY_REGULAR: 8,
  MEASUREMENT_INSTRUCTION_PRIMARY: 3,
} as const;

// ── Auth ─────────────────────────────────────────────────────────────────────
// Client-credentials token, cached in-module until ~2 min before expiry. Server
// processes are long-lived, so this avoids a token round-trip on every call.
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  const id = process.env.EAGLEVIEW_CLIENT_ID;
  const secret = process.env.EAGLEVIEW_CLIENT_SECRET;
  if (!id || !secret) throw new Error("EagleView is not configured");
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(`${TOKEN_BASE}/oauth2/v1/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`EagleView auth failed (${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 120) * 1000,
  };
  return data.access_token;
}

async function evFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getToken();
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

// Build a human error from a failed response. The sandbox is a mock — it 400s
// any address it has no canned scenario for ("...InvalidRequest does not
// exist!"), which would otherwise surface as a cryptic "failed (400)".
async function evError(res: Response, op: string): Promise<Error> {
  let detail = "";
  try {
    detail = await res.text();
  } catch {
    /* no body */
  }
  if (res.status === 400 && /does not exist|InvalidRequest/i.test(detail)) {
    return new Error(
      "The EagleView sandbox only prices/orders its built-in test addresses. Use the sample roofs above, or connect a production EagleView account to measure a real address.",
    );
  }
  return new Error(`${op} failed (${res.status})${detail ? `: ${detail.slice(0, 140)}` : ""}`);
}

// ── API methods ──────────────────────────────────────────────────────────────
export interface EvProduct {
  productID: number;
  name: string;
  description: string | null;
  priceMin: number;
  priceMax: number;
  isTemporarilyUnavailable: boolean;
}

export async function getAvailableProducts(): Promise<EvProduct[]> {
  const res = await evFetch("/v2/Product/GetAvailableProducts");
  if (!res.ok) throw new Error(`GetAvailableProducts failed (${res.status})`);
  return (await res.json()) as EvProduct[];
}

export interface EvOrderInput {
  address: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
  lat?: number;
  lng?: number;
  primaryProductId?: number;
  deliveryProductId?: number;
  measurementInstructionType?: number;
  poNumber?: string;
  referenceId?: string;
}

function orderBody(input: EvOrderInput) {
  return {
    OrderReports: [
      {
        ReportAddresses: [
          {
            Address: input.address,
            City: input.city,
            State: input.state,
            Zip: input.zip,
            Country: input.country ?? "US",
            Latitude: input.lat ?? null,
            Longitude: input.lng ?? null,
          },
        ],
        PrimaryProductId: input.primaryProductId ?? EV_PRODUCT.BID_PERFECT,
        DeliveryProductId: input.deliveryProductId ?? EV_PRODUCT.DELIVERY_REGULAR,
        MeasurementInstructionType:
          input.measurementInstructionType ?? EV_PRODUCT.MEASUREMENT_INSTRUCTION_PRIMARY,
        AddOnProductIds: null,
        PONumber: input.poNumber ?? null,
        ReferenceID: input.referenceId ?? null,
        ChangesInLast4Years: false,
      },
    ],
  };
}

// Price an order WITHOUT placing it — no charge. Returns the raw price payload.
export async function priceOrder(input: EvOrderInput): Promise<unknown> {
  const res = await evFetch("/v2/Order/PriceOrder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderBody(input)),
  });
  if (!res.ok) throw await evError(res, "PriceOrder");
  return res.json();
}

// Place a BILLABLE order. Returns the new report id. Callers must gate this
// behind an explicit, confirmed user action.
export async function placeOrder(input: EvOrderInput): Promise<{ reportId: number; raw: unknown }> {
  const res = await evFetch("/v2/Order/PlaceOrder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderBody(input)),
  });
  if (!res.ok) throw await evError(res, "PlaceOrder");
  const raw = (await res.json()) as Record<string, unknown>;
  const reportId = Number(
    (raw?.ReportId as number) ??
      (Array.isArray((raw as any)?.Reports) ? (raw as any).Reports[0]?.ReportId : undefined),
  );
  if (!Number.isFinite(reportId)) throw new Error("PlaceOrder returned no reportId");
  return { reportId, raw };
}

// Report header: status (for polling) + summary measurements EagleView computes
// server-side (area, line lengths, facet count, cost). Geometry comes from the
// separate measurement-JSON file (getMeasurementJson).
export interface EvReportSummary {
  reportId: number;
  status: string;
  statusId: number;
  displayStatus: string;
  completed: boolean;
  deliveryFilesAvailable: boolean;
  totalCost: number | null;
  areaSqft: number | null;
  predominantPitch: string | null;
  totalRoofFacets: number | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  raw: Record<string, unknown>;
}

export async function getReportSummary(reportId: number): Promise<EvReportSummary> {
  const res = await evFetch(`/v3/Report/GetReport?reportId=${encodeURIComponent(String(reportId))}`);
  if (!res.ok) throw new Error(`GetReport failed (${res.status})`);
  const r = (await res.json()) as Record<string, any>;
  const status = String(r.Status ?? "");
  return {
    reportId: Number(r.ReportId ?? reportId),
    status,
    statusId: Number(r.StatusId ?? 0),
    displayStatus: String(r.DisplayStatus ?? status),
    // A report is usable once its delivery files exist, regardless of the
    // header status text (sandbox sample data can lag at "In Process").
    completed: Boolean(r.DeliveryFilesAvailable) || /complete/i.test(status),
    deliveryFilesAvailable: Boolean(r.DeliveryFilesAvailable),
    totalCost: r.TotalCost != null ? Number(r.TotalCost) : null,
    areaSqft: r.Area != null ? Number(r.Area) : null,
    predominantPitch: r.Pitch != null ? String(r.Pitch) : null,
    totalRoofFacets: r.TotalRoofFacets != null ? Number(r.TotalRoofFacets) : null,
    street: r.Street ?? null,
    city: r.City ?? null,
    state: r.State ?? null,
    zip: r.Zip ?? null,
    raw: r,
  };
}

// Fetch the EV Measurement JSON (the geometry export). Returns the parsed,
// app-friendly RoofModel.
export async function getMeasurementModel(reportId: number): Promise<RoofModel> {
  const res = await evFetch(
    `/v1/File/GetReportFileAnyFormat?fileType=${EV_FILE.MEASUREMENT_JSON}&reportId=${encodeURIComponent(String(reportId))}`,
  );
  if (!res.ok) throw new Error(`GetMeasurementJson failed (${res.status})`);
  const raw = await res.json();
  return parseRoofModel(raw, reportId);
}

// Signed/authed download URL for the DXF or PDF (proxied through evFetch by the
// caller; EagleView itself requires the bearer, so these are fetched server-side).
export function reportFilePath(reportId: number, fileType: number): string {
  return `/v1/File/GetReportFileAnyFormat?fileType=${fileType}&reportId=${reportId}`;
}

export async function getReportFile(reportId: number, fileType: number): Promise<Response> {
  return evFetch(reportFilePath(reportId, fileType));
}

// ── Diagnostics ────────────────────────────────────────────────────────────────
// Connection health for the roof estimator. Returns NON-secret status only —
// hosts, HTTP codes, error text, product counts — NEVER the token or the
// client id/secret. Lets a manager see, in production, whether the key works and
// (critically) whether calls hit the SANDBOX host or the PRODUCTION host.
export interface EvDiagnosticCheck {
  name: string;
  ok: boolean;
  detail: string;
}
export interface EvDiagnostics {
  configured: boolean;
  apiBase: string;
  tokenBase: string;
  isSandboxApi: boolean;
  checks: EvDiagnosticCheck[];
}

export async function runEagleViewDiagnostics(): Promise<EvDiagnostics> {
  const apiBase = API_BASE;
  const tokenBase = TOKEN_BASE;
  const isSandboxApi = /sandbox/i.test(apiBase);
  const checks: EvDiagnosticCheck[] = [];
  const configured = isEagleViewEnabled();

  if (!configured) {
    checks.push({
      name: "Credentials",
      ok: false,
      detail: "EAGLEVIEW_CLIENT_ID / EAGLEVIEW_CLIENT_SECRET are not set.",
    });
    return { configured, apiBase, tokenBase, isSandboxApi, checks };
  }
  checks.push({ name: "Credentials present", ok: true, detail: "CLIENT_ID and CLIENT_SECRET are set." });

  // 1) OAuth token — minted on the token host (always the production apicenter).
  try {
    await getToken();
    checks.push({ name: "OAuth token", ok: true, detail: `Minted OK against ${tokenBase}.` });
  } catch (e: unknown) {
    checks.push({
      name: "OAuth token",
      ok: false,
      detail: `Failed against ${tokenBase}: ${e instanceof Error ? e.message : "unknown error"}`,
    });
    return { configured, apiBase, tokenBase, isSandboxApi, checks };
  }

  // 2) A real, NON-billable API call against the API host. Proves the key is
  //    valid AND that we're pointed at the right host: a production key hitting
  //    the sandbox host (or vice-versa) fails here with a 401/403.
  try {
    const res = await evFetch("/v2/Product/GetAvailableProducts");
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const count = Array.isArray(data) ? data.length : "?";
      checks.push({
        name: "API call · GetAvailableProducts",
        ok: true,
        detail: `HTTP ${res.status} · ${count} products · host ${apiBase}`,
      });
    } else {
      const body = await res.text().catch(() => "");
      checks.push({
        name: "API call · GetAvailableProducts",
        ok: false,
        detail: `HTTP ${res.status} · host ${apiBase}${body ? ` · ${body.slice(0, 160)}` : ""}`,
      });
    }
  } catch (e: unknown) {
    checks.push({
      name: "API call · GetAvailableProducts",
      ok: false,
      detail: `Request threw: ${e instanceof Error ? e.message : "unknown"} · host ${apiBase}`,
    });
  }

  return { configured, apiBase, tokenBase, isSandboxApi, checks };
}

// ── Measurement-JSON parser ───────────────────────────────────────────────────
// Shape (XML-as-JSON, "@"-prefixed attributes):
//   EAGLEVIEW_EXPORT.STRUCTURES.ROOF[].{ POINTS.POINT[], LINES.LINE[], FACES.FACE[] }
//   POINT  @id, @data:"x,y,z" (feet)
//   LINE   @id, @path:"C5,C6", @type: EAVE|RIDGE|VALLEY|RAKE|HIP|FLASHING|STEPFLASH|OTHER
//   FACE   @designator, @type: ROOF|ROOFPENETRATION, POLYGON{ @path, @pitch, @unroundedsize, @orientation }

export type EvLineType =
  | "EAVE"
  | "RIDGE"
  | "VALLEY"
  | "RAKE"
  | "HIP"
  | "FLASHING"
  | "STEPFLASH"
  | "OTHER";

export const EV_LINE_TYPES: EvLineType[] = [
  "EAVE",
  "RIDGE",
  "VALLEY",
  "RAKE",
  "HIP",
  "FLASHING",
  "STEPFLASH",
  "OTHER",
];

export interface RoofPoint {
  id: string;
  x: number;
  y: number;
  z: number;
}
export interface RoofLine {
  id: string;
  type: EvLineType;
  aId: string;
  bId: string;
  lengthFt: number;
}
export interface RoofFace {
  id: string;
  designator: string;
  pitch: number; //       rise per 12 (e.g. 10 = 10/12)
  areaSqft: number;
  orientation: number; // degrees
  lineIds: string[];
}
export interface RoofModel {
  reportId?: number;
  location: {
    address?: string;
    city?: string;
    state?: string;
    postal?: string;
    lat?: number;
    lng?: number;
  };
  northOrientation: number;
  points: RoofPoint[];
  lines: RoofLine[];
  faces: RoofFace[]; //        ROOF facets only
  penetrations: RoofFace[]; // ROOFPENETRATION (chimneys/vents)
  totals: {
    areaSqft: number;
    squares: number;
    facetCount: number;
    predominantPitch: number;
    footageByType: Record<EvLineType, number>;
    bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  };
}

// xml-as-json collapses single-element arrays to a bare object — normalize.
function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}
const num = (v: unknown): number => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};
const normLineType = (t: unknown): EvLineType => {
  const u = String(t ?? "").toUpperCase();
  return (EV_LINE_TYPES as string[]).includes(u) ? (u as EvLineType) : "OTHER";
};

export function parseRoofModel(raw: any, reportId?: number): RoofModel {
  const root = raw?.EAGLEVIEW_EXPORT ?? raw;
  const loc = root?.LOCATION ?? {};
  const structuresNode = root?.STRUCTURES ?? {};

  // Normalize structures. Single-structure reports put ROOF directly on
  // STRUCTURES ({ @northorientation, ROOF }); multi-structure reports make
  // STRUCTURES an array (xml→json) of such entries (sometimes a numeric-keyed
  // object). Flatten every structure's ROOF(s) into one list.
  const structureList: any[] = Array.isArray(structuresNode)
    ? structuresNode
    : (structuresNode as any).ROOF
      ? [structuresNode]
      : Object.keys(structuresNode)
          .filter((k) => /^\d+$/.test(k))
          .map((k) => (structuresNode as any)[k]);
  const roofs: any[] = [];
  for (const st of structureList) for (const roof of toArray<any>(st?.ROOF)) roofs.push(roof);

  let northOrientation = num((structuresNode as any)["@northorientation"]);
  if (!northOrientation) {
    for (const st of structureList) {
      const n = num(st?.["@northorientation"]);
      if (n) {
        northOrientation = n;
        break;
      }
    }
  }

  const points: RoofPoint[] = [];
  const lines: RoofLine[] = [];
  const faces: RoofFace[] = [];
  const penetrations: RoofFace[] = [];

  // Multiple structures keep their own C/L/F id namespaces; prefix per structure
  // so ids stay unique once merged into one model.
  roofs.forEach((roof, si) => {
    const pfx = roofs.length > 1 ? `s${si}:` : "";
    const ptMap = new Map<string, RoofPoint>();

    for (const pt of toArray<any>(roof?.POINTS?.POINT)) {
      const [x, y, z] = String(pt["@data"] ?? "")
        .split(",")
        .map((s) => num(s));
      const p: RoofPoint = { id: pfx + pt["@id"], x, y, z };
      ptMap.set(p.id, p);
      points.push(p);
    }

    for (const ln of toArray<any>(roof?.LINES?.LINE)) {
      const [a, b] = String(ln["@path"] ?? "")
        .split(",")
        .map((s) => pfx + s.trim());
      const pa = ptMap.get(a);
      const pb = ptMap.get(b);
      const lengthFt =
        pa && pb
          ? Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z)
          : 0;
      lines.push({ id: pfx + ln["@id"], type: normLineType(ln["@type"]), aId: a, bId: b, lengthFt });
    }

    for (const fc of toArray<any>(roof?.FACES?.FACE)) {
      const poly = Array.isArray(fc.POLYGON) ? fc.POLYGON[0] : fc.POLYGON;
      const face: RoofFace = {
        id: pfx + fc["@id"],
        designator: String(fc["@designator"] ?? ""),
        pitch: num(poly?.["@pitch"]),
        areaSqft: num(poly?.["@unroundedsize"] ?? poly?.["@size"]),
        orientation: num(poly?.["@orientation"]),
        lineIds: String(poly?.["@path"] ?? "")
          .split(",")
          .filter(Boolean)
          .map((s) => pfx + s.trim()),
      };
      if (String(fc["@type"]).toUpperCase() === "ROOFPENETRATION") penetrations.push(face);
      else faces.push(face);
    }
  });

  // Totals.
  const footageByType = Object.fromEntries(EV_LINE_TYPES.map((t) => [t, 0])) as Record<
    EvLineType,
    number
  >;
  for (const l of lines) footageByType[l.type] += l.lengthFt;

  const areaSqft = faces.reduce((a, f) => a + f.areaSqft, 0);

  // Predominant pitch = the pitch value covering the most roof area.
  const pitchArea = new Map<number, number>();
  for (const f of faces) pitchArea.set(f.pitch, (pitchArea.get(f.pitch) ?? 0) + f.areaSqft);
  let predominantPitch = 0;
  let maxA = -1;
  for (const [pitch, a] of pitchArea) {
    if (a > maxA) {
      maxA = a;
      predominantPitch = pitch;
    }
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const zs = points.map((p) => p.z);
  const bounds = {
    minX: Math.min(...xs, 0),
    maxX: Math.max(...xs, 0),
    minY: Math.min(...ys, 0),
    maxY: Math.max(...ys, 0),
    minZ: Math.min(...zs, 0),
    maxZ: Math.max(...zs, 0),
  };

  return {
    reportId,
    location: {
      address: loc["@address"],
      city: loc["@city"],
      state: loc["@state"],
      postal: loc["@postal"],
      lat: loc["@lat"] != null ? num(loc["@lat"]) : undefined,
      lng: loc["@long"] != null ? num(loc["@long"]) : undefined,
    },
    northOrientation,
    points,
    lines,
    faces,
    penetrations,
    totals: {
      areaSqft,
      squares: areaSqft / 100,
      facetCount: faces.length,
      predominantPitch,
      footageByType,
      bounds,
    },
  };
}
