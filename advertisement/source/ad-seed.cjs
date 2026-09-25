// Stand only: one measured roof for the ad — a Bothell house with an outline
// ring, area, squares, pitch and facets, so the estimator's "Recent
// measurements" opens straight onto the live satellite report.
//   node ad-seed.cjs [lat] [lng] [rotationDeg]
const { PrismaClient } = require("@prisma/client");
const fs = require("node:fs");
const db = new PrismaClient();
const lat0 = Number(process.argv[2] ?? 47.7568);
const lng0 = Number(process.argv[3] ?? -122.2079);
const rot = Number(process.argv[4] ?? 0);
const W = Number(process.argv[5] ?? 52); // ft, east-west
const D = Number(process.argv[6] ?? 34); // ft, north-south

// feet → degrees at this latitude
const ftLat = 1 / 364000;
const ftLng = 1 / (364000 * Math.cos((lat0 * Math.PI) / 180));
function pt(x, y) {
  // x east, y north in feet, rotated by rot degrees
  const r = (rot * Math.PI) / 180;
  const xr = x * Math.cos(r) - y * Math.sin(r);
  const yr = x * Math.sin(r) + y * Math.cos(r);
  return { lat: lat0 + yr * ftLat, lng: lng0 + xr * ftLng };
}
// an L-shaped footprint: main block W×D plus a garage wing
const half = (v) => v / 2;
const ring = [
  pt(-half(W), -half(D)), pt(half(W), -half(D)), pt(half(W), half(D) - 12), pt(half(W) - 22, half(D) - 12),
  pt(half(W) - 22, half(D)), pt(-half(W), half(D)),
];
const footprint = W * D - 22 * 12;
const areaSqft = Math.round(footprint * 1.118); // 6/12 pitch factor
const squares = Math.round((areaSqft / 100) * 10) / 10;

(async () => {
  const u = await db.user.findUnique({ where: { email: "alex@ridgeline.test" }, select: { activeOrgId: true, id: true } });
  const organizationId = u.activeOrgId;
  await db.proposalSitePhoto.deleteMany({ where: { roofMeasurementId: "seed_ad_roof" } }).catch(() => null);
  await db.roofMeasurement.deleteMany({ where: { id: "seed_ad_roof" } });
  const instant = {
    requestId: "seed-ad-roof",
    address: "18412 92nd Ave NE, Bothell, WA 98011",
    lat: lat0,
    lng: lng0,
    structures: [
      {
        id: "s1",
        outline: ring,
        areaSqft,
        squares,
        pitch: "6/12",
        eaveHeightFt: { N: 9, S: 9, E: 18, W: 9 },
        footprintSqft: footprint,
        facetCount: 8,
        shape: "gable",
        material: "asphalt",
        conditionRating: "fair",
        roofAgeYears: 18,
        chimney: true,
        solarPanels: false,
        rooftopAcCount: 0,
        occlusion: "roof_occlusion_none",
        treeOverhang: "tree_overhang_minor",
        confidence: {},
      },
    ],
    imagery: [],
    totals: { areaSqft, squares, predominantPitch: 6, pitchLabel: "6/12", maxEaveFt: 18, facetCount: 8, footprintSqft: footprint },
  };
  const row = await db.roofMeasurement.create({
    data: {
      id: "seed_ad_roof",
      organizationId,
      createdById: u.id,
      source: "instant-outline",
      address: "18412 92nd Ave NE",
      city: "Bothell",
      state: "WA",
      zip: "98011",
      lat: lat0,
      lng: lng0,
      areaSqft,
      squares,
      predominantPitch: "6/12",
      facetCount: 8,
      instantRequestId: "seed-ad-roof",
      instantJson: JSON.stringify(instant),
      modelJson: "null",
      provenanceJson: JSON.stringify({ pipeline: "instant", provenance: { instantReuse: { requestId: "seed-ad-roof", how: "stored" } } }),
    },
    select: { id: true, areaSqft: true, squares: true },
  });
  fs.writeFileSync(__dirname + "/roof-seed.json", JSON.stringify({ ...row, lat: lat0, lng: lng0, ring }, null, 1));
  console.log(JSON.stringify(row));
  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
