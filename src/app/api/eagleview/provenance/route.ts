import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireEstimatorOrManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { instantAddressKey, type InstantRoofData } from "@/lib/eagleview";
import { readEntitlements } from "@/lib/eagleviewEntitlements";
import { packsFromContent } from "@/lib/eagleviewOrder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/eagleview/provenance?address=12629&rows=3
//
// Why a saved roof measurement says what it says, for ONE address, read
// straight from this deployment's database — the diagnostic the roof page
// cannot show. Written for the production question of 2026-09-09 ("12629 NE
// 100th Pl: why 6/12 · EagleView with a fallback plate, why facets and
// property data are blank") that cannot be answered from a local copy.
//
// Per matching measurement row (newest first): the columns, the main
// structure's fields as stored, and the provenance witnesses — registration,
// coverage, pitchMeasurement (source / reason / families / trustedShare /
// instantPitch12), pitchSource, instantPacks, mainStructure, completeness
// codes, reconUnavailable, googleAreaSqft, imageryDate. Plus the ledger rows
// for the address (request id, packs, status, raw-body size) and the
// account's entitlement table. Nothing is ordered, nothing is written; the
// keys never leave the server. Session-gated like every /api route.
export async function GET(req: NextRequest) {
  let organizationId: string;
  try {
    ({ organizationId } = await requireEstimatorOrManager());
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  const address = (url.searchParams.get("address") ?? "").trim();
  if (address.length < 3) return NextResponse.json({ error: "address (at least 3 characters) is required" }, { status: 400 });
  const take = Math.max(1, Math.min(10, Number(url.searchParams.get("rows") ?? 3) || 3));

  const rows = await db.roofMeasurement.findMany({
    where: { organizationId, address: { contains: address } },
    orderBy: { createdAt: "desc" },
    take,
  });

  const measurements = rows.map((m) => {
    let stored: { calibration?: unknown; provenance?: Record<string, unknown> } = {};
    try { stored = JSON.parse(m.provenanceJson ?? "{}"); } catch { /* unreadable */ }
    const prov = stored.provenance ?? {};
    let instant: InstantRoofData | null = null;
    try { instant = m.instantJson ? (JSON.parse(m.instantJson) as InstantRoofData) : null; } catch { /* unreadable */ }
    const mainIndex = (prov.mainStructure as { index?: number } | undefined)?.index ?? 0;
    const st = instant?.structures?.[mainIndex] ?? null;
    const pm = prov.pitchMeasurement as Record<string, unknown> | undefined;
    return {
      id: m.id,
      createdAt: m.createdAt,
      source: m.source,
      address: [m.address, m.city, m.state, m.zip].filter(Boolean).join(", "),
      columns: { areaSqft: m.areaSqft, squares: m.squares, predominantPitch: m.predominantPitch, facetCount: m.facetCount },
      instantRequestId: m.instantRequestId,
      previousPipeline: !!stored.calibration,
      answer: instant
        ? {
            structures: instant.structures.length,
            imagery: instant.imagery.length,
            packsEvident: packsFromContent(instant).have,
            totals: instant.totals,
            mainStructure: st
              ? {
                  index: mainIndex,
                  areaSqft: st.areaSqft,
                  pitch: st.pitch,
                  facetCount: st.facetCount,
                  footprintSqft: st.footprintSqft,
                  eaveHeightFt: st.eaveHeightFt,
                  material: st.material,
                  conditionRating: st.conditionRating,
                  roofAgeYears: st.roofAgeYears,
                  chimney: st.chimney,
                  solarPanels: st.solarPanels,
                  rooftopAcCount: st.rooftopAcCount,
                  outlinePoints: st.outline?.length ?? 0,
                }
              : null,
          }
        : null,
      provenance: {
        keys: Object.keys(prov),
        registration: prov.registration ?? null,
        coverage: prov.coverage ?? null,
        pitchMeasurement: pm
          ? {
              source: pm.source,
              reason: pm.reason,
              families: pm.families,
              trustedShare: pm.trustedShare,
              trustedSqft: pm.trustedSqft,
              spreadIqr12: pm.spreadIqr12,
              instantPitch12: pm.instantPitch12,
              disagrees: pm.disagrees,
            }
          : null,
        pitchSource: prov.pitchSource ?? null,
        instantPacks: prov.instantPacks ?? null,
        instantReuse: prov.instantReuse ?? null,
        mainStructure: prov.mainStructure ?? null,
        completeness: (prov.completeness as { findings?: Array<{ level: string; code: string }> } | undefined)?.findings?.map((f) => `${f.level}:${f.code}`) ?? null,
        reconUnavailable: prov.reconUnavailable ?? null,
        googleAreaSqft: prov.googleAreaSqft ?? null,
        imageryDate: prov.imageryDate ?? null,
        imageryQuality: prov.imageryQuality ?? null,
        parcelVeto: prov.parcelVeto ?? null,
      },
    };
  });

  const keys = [...new Set(rows.map((m) => instantAddressKey({ address: m.address ?? "", city: m.city ?? "", state: m.state ?? "", zip: m.zip ?? "" })))];
  const ledger = keys.length
    ? await db.instantOrder.findMany({
        where: { organizationId, addressKey: { in: keys } },
        orderBy: { createdAt: "asc" },
        select: { requestId: true, addressKey: true, status: true, packs: true, createdAt: true, instantRawJson: true, instantJson: true, error: true },
      })
    : [];

  let entitlements: unknown = null;
  try {
    entitlements = [...(await readEntitlements()).values()].map((r) => ({ pack: r.pack, status: r.status, checkedAt: r.checkedAt, assumed: r.assumed ?? false, error: r.error }));
  } catch (err) {
    entitlements = { error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json({
    query: { address, rows: take },
    measurements,
    ledger: ledger.map((o) => ({
      requestId: o.requestId,
      addressKey: o.addressKey,
      status: o.status,
      packs: o.packs,
      createdAt: o.createdAt,
      rawBytes: o.instantRawJson?.length ?? 0,
      parsedBytes: o.instantJson?.length ?? 0,
      error: o.error,
    })),
    entitlements,
  });
}
