// Seeds/unseeds a cached EagleView report so the roof estimator's full UI flow
// can run offline (evRoofModel serves the cache before touching the API).
// Usage: node seed-roof.js up | down   (run from the project root's node_modules context)
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

const ORG = "cmsqki9wh000064ob31rdspel";
const REPORT_ID = 69153261;

// A clean 40x30ft gable: 2 facets @ 6/12, ridge along X. All numbers consistent.
const rake = Math.hypot(15, 7.5); // 16.7705
const faceArea = 40 * rake; //       670.82 sqft per face
const model = {
  reportId: REPORT_ID,
  source: "eagleview",
  location: { address: "419 Prairie Ridge Ln, North Aurora IL", city: "North Aurora", state: "IL", postal: "60542", lat: 41.806, lng: -88.327 },
  northOrientation: 0,
  points: [
    { id: "A", x: 0, y: 0, z: 0 }, { id: "B", x: 40, y: 0, z: 0 },
    { id: "C", x: 40, y: 30, z: 0 }, { id: "D", x: 0, y: 30, z: 0 },
    { id: "R1", x: 0, y: 15, z: 7.5 }, { id: "R2", x: 40, y: 15, z: 7.5 },
  ],
  lines: [
    { id: "L1", type: "EAVE", aId: "A", bId: "B", lengthFt: 40 },
    { id: "L2", type: "EAVE", aId: "C", bId: "D", lengthFt: 40 },
    { id: "L3", type: "RAKE", aId: "A", bId: "R1", lengthFt: rake },
    { id: "L4", type: "RAKE", aId: "B", bId: "R2", lengthFt: rake },
    { id: "L5", type: "RAKE", aId: "C", bId: "R2", lengthFt: rake },
    { id: "L6", type: "RAKE", aId: "D", bId: "R1", lengthFt: rake },
    { id: "L7", type: "RIDGE", aId: "R1", bId: "R2", lengthFt: 40 },
  ],
  faces: [
    { id: "F1", designator: "A", pitch: 6, areaSqft: faceArea, orientation: 180, lineIds: ["L1", "L4", "L7", "L3"] },
    { id: "F2", designator: "B", pitch: 6, areaSqft: faceArea, orientation: 0, lineIds: ["L2", "L5", "L7", "L6"] },
  ],
  penetrations: [],
  totals: {
    areaSqft: faceArea * 2,
    squares: (faceArea * 2) / 100,
    facetCount: 2,
    predominantPitch: 6,
    footageByType: { EAVE: 80, RIDGE: 40, VALLEY: 0, RAKE: rake * 4, HIP: 0, FLASHING: 0, STEPFLASH: 0, OTHER: 0 },
    bounds: { minX: 0, maxX: 40, minY: 0, maxY: 30, minZ: 0, maxZ: 7.5 },
  },
};

(async () => {
  const mode = process.argv[2];
  if (mode === "up") {
    await p.eagleViewReport.upsert({
      where: { organizationId_reportId: { organizationId: ORG, reportId: REPORT_ID } },
      create: {
        organizationId: ORG, reportId: REPORT_ID, status: "Completed",
        address: model.location.address, city: model.location.city, state: model.location.state,
        zip: model.location.postal, lat: model.location.lat, lng: model.location.lng,
        totalCost: null, areaSqft: model.totals.areaSqft, squares: model.totals.squares,
        predominantPitch: "6/12", facetCount: 2, modelJson: JSON.stringify(model),
      },
      update: { modelJson: JSON.stringify(model), status: "Completed" },
    });
    console.log("seeded cache row for report", REPORT_ID);
  } else if (mode === "down") {
    await p.eagleViewReport.deleteMany({ where: { organizationId: ORG, reportId: REPORT_ID } });
    console.log("removed cache row for report", REPORT_ID);
  } else {
    console.log("usage: node seed-roof.js up|down");
  }
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
