// THE PICTURES A PROPOSAL CARRIES TO THE CLIENT (2026-09-23) — server only.
//
// Owner: the client should receive the fence's 3D and layout, and a picture
// of the roof, on the phone and on the desk. One read for both portal
// builds: what pictures this proposal has and where each one is served.
//   fence-scene the fence stood up in 3D on the page itself (2026-09-27):
//               the stored plan and its scene block, served by
//               /api/public-quote/[publicId]/fence-scene and mounted by
//               components/v3/fence-scene — no picture upload, no Blob;
//   fence-3d    the estimator's 3D snapshot (Proposal.beforePhotos, a Blob
//               URL under fence-preview/) — the scene's poster when there is
//               a plan, the only 3D there is when a proposal predates plans;
//   fence-plan  the traced layout (an ActivityEvent FENCE_PLAN), drawn on
//               request by /api/public-quote/[publicId]/fence-plan;
//   roof-photo  the aerial (EagleView ortho, else Google satellite) with the
//               measured outline overlaid, when a key is on the server;
//   roof-plan   the measured outline as a plan, when there is no aerial;
//   deck-scene  the Deck Studio's deck in 3D (2026-10-04): the scene frozen
//               with the proposal (an ActivityEvent DECK_PLAN), served by
//               /api/public-quote/[publicId]/deck-scene, mounted by
//               components/v3/deck-scene.

import { db } from "@/lib/db";
import { isEagleViewEnabled, type InstantRoofData } from "@/lib/eagleview";
import { FENCE_PLAN_EVENT, parseFencePlan } from "@/lib/fence/planSvg";
import { DECK_PLAN_EVENT, parseDeckPlan } from "@/lib/deck/convertSchema";
import { roofFactsLine, roofFrameFor, roofOverlayPoints, roofRings, type RoofFacts } from "@/lib/roofPictures";
import type { PortalPicture } from "@/components/v3/mobile-proposal-client/portal-view";

const measuredOn = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** The fence 3D snapshot's URL, when the first stored photo is one. */
function fencePreviewUrl(beforePhotos: string | null | undefined): string | null {
  try {
    const arr = JSON.parse(beforePhotos ?? "[]");
    const first = Array.isArray(arr) ? arr[0] : null;
    const url = typeof first === "string" ? first : first && typeof first === "object" && typeof first.url === "string" ? first.url : null;
    return url && /^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\/fence-preview\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}

export async function proposalPictures(p: { id: string; publicId: string; trade?: string | null; beforePhotos?: string | null }): Promise<PortalPicture[]> {
  const out: PortalPicture[] = [];
  const base = `/api/public-quote/${p.publicId}`;

  // ── the fence
  const preview = fencePreviewUrl(p.beforePhotos);
  let plan = null;
  try {
    const ev = await db.activityEvent.findFirst({ where: { proposalId: p.id, kind: FENCE_PLAN_EVENT }, orderBy: { createdAt: "desc" }, select: { meta: true } });
    plan = ev?.meta ? parseFencePlan(JSON.parse(ev.meta)) : null;
  } catch {
    plan = null; /* no plan, or the table is not there */
  }
  if (plan) {
    const gates = plan.gates.length;
    const facts = `${plan.typeLabel} · ${plan.heightFt} ft · ${Math.round(plan.totalLf)} ft${gates ? ` · ${gates} ${gates === 1 ? "gate" : "gates"}` : ""}`;
    // The scene first: the page stands the fence up where the picture was.
    out.push({ kind: "fence-scene", src: `${base}/fence-scene`, alt: "Your fence, in 3D", caption: "Your fence, as it will stand", facts, overlay: null, poster: preview });
    out.push({ kind: "fence-plan", src: `${base}/fence-plan`, alt: "Your fence on the lot", caption: "Your fence on the lot", facts, overlay: null });
  } else if (preview) {
    out.push({ kind: "fence-3d", src: preview, alt: "Your fence, in 3D", caption: "Your fence, as it will stand", facts: null, overlay: null });
  }

  // ── the deck
  try {
    const ev = await db.activityEvent.findFirst({ where: { proposalId: p.id, kind: DECK_PLAN_EVENT }, orderBy: { createdAt: "desc" }, select: { meta: true } });
    const deck = ev?.meta ? parseDeckPlan(JSON.parse(ev.meta)) : null;
    if (deck) out.push({ kind: "deck-scene", src: `${base}/deck-scene`, alt: "Your deck, in 3D", caption: "Your deck, as it will stand", facts: deck.scene.facts || null, overlay: null });
  } catch {
    /* no deck, or the row does not read */
  }

  // ── the roof
  try {
    const link = await db.proposalSitePhoto.findUnique({ where: { proposalId: p.id }, select: { roofMeasurementId: true } });
    const row = link
      ? await db.roofMeasurement.findUnique({ where: { id: link.roofMeasurementId }, select: { lat: true, lng: true, instantJson: true, areaSqft: true, squares: true, predominantPitch: true, facetCount: true, createdAt: true } })
      : null;
    if (row) {
      let instant: InstantRoofData | null = null;
      try { instant = row.instantJson ? (JSON.parse(row.instantJson) as InstantRoofData) : null; } catch { instant = null; }
      const rings = roofRings(instant);
      const facts: RoofFacts = { areaSqft: row.areaSqft, squares: row.squares, pitch: row.predominantPitch, facetCount: row.facetCount, measuredOn: measuredOn(row.createdAt) };
      const factsLine = roofFactsLine(facts);
      const frame = roofFrameFor(instant, row.lat != null && row.lng != null ? { lat: row.lat, lng: row.lng } : null, { ortho: isEagleViewEnabled(), satellite: Boolean(process.env.GOOGLE_MAPS_API_KEY) });
      if (frame) {
        out.push({ kind: "roof-photo", src: `${base}/roof-photo`, alt: "Your roof from the air, with the measured outline", caption: frame.kind === "ortho" ? "Your roof, as measured from the air" : "Your roof, from the air", facts: factsLine || null, overlay: rings.length ? roofOverlayPoints(rings, frame) : null });
      } else if (rings.length) {
        out.push({ kind: "roof-plan", src: `${base}/roof-plan`, alt: "Your roof, as measured", caption: "Your roof, as measured", facts: factsLine || null, overlay: null });
      }
    }
  } catch {
    /* the link table is not there, or the measurement is gone */
  }
  return out;
}
