// The unified Inventory page (2026-09-29): the price book's rows and writes for
// the three trades, the company's documents the estimators read, who may
// write, and the old URLs answering 308.
//
//   npx tsx --tsconfig tsconfig.json scripts/qa/inventory-page.check.ts
//
// Runs in **QA Co** (slug `qa-co`): its FenceCatalog / RoofCatalog /
// HvacSettings / HvacCatalogItem rows are snapshotted first and put back at
// the end, pass or fail. The row builders and document updaters are pure
// (lib/priceBook); the writes here go through the same tables the actions
// write (fenceCatalog.saveFenceCatalog, roofCatalog.saveRoofCatalog,
// hvacEstimator.saveHvacCatalogItem / saveHvacRateCard). The redirects are
// checked against the dev server QA_BASE_URL names, and skipped when it is
// not set (this machine's :3000 may be another project's).

import "./_server-only";
import { PrismaClient } from "@prisma/client";
import {
  canEditBook, fenceBookRows, fenceDocWith, fenceDocWithout, groupRows, hvacBookRows, hvacCardWith, hvacRateRows, nextCustomFenceId,
  roofBookRows, roofDocWith, roofDocWithout, roofLists, slugId, FENCE_TYPE_IDS,
} from "../../src/lib/priceBook";
import { fenceCatalogSchema } from "../../src/lib/fence/catalogSchema";
import { roofCatalogSchema } from "../../src/lib/roofPackage/catalogSchema";
import { effectiveRate, standardRate } from "../../src/lib/fence/rates";
import { ROOF_SYSTEMS, UNDERLAYMENTS } from "../../src/lib/roofPackage/catalog";
import { DEFAULT_RATE_CARD, STARTER_CATALOG, normalizeRateCard } from "../../src/lib/hvac/ledger";
import { parseTab } from "../../src/lib/inventoryPage";
import { isPathAllowed, ROLE_ROUTE_GATES } from "../../src/lib/roleRoutes";

const db = new PrismaClient();
let passes = 0;
let failures = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};
const head = (s: string) => console.log(`\n── ${s}`);

async function main() {
  const org = await db.organization.findUnique({ where: { slug: "qa-co" }, select: { id: true } });
  if (!org) throw new Error("QA Co (qa-co) is not seeded");
  const orgId = org.id;
  const saved = {
    fence: await db.fenceCatalog.findUnique({ where: { organizationId: orgId } }),
    roof: await db.roofCatalog.findUnique({ where: { organizationId: orgId } }),
    hvac: await db.hvacSettings.findUnique({ where: { organizationId: orgId } }),
    items: await db.hvacCatalogItem.findMany({ where: { organizationId: orgId } }),
  };

  try {
    /* ── A. fence ── */
    head("A · fence: 15 catalog types as rows, a rate override, a type of our own, back to the catalog");
    let rows = fenceBookRows(null);
    ok("A 15 catalog types, none a company default", rows.length === 15 && rows.every((r) => !r.companyDefault && r.unit === "lf" && r.price === standardRate(r.id as never).materialPerLf));
    ok("A grouped by category in the studio's order", groupRows(rows, ["Wood", "Vinyl", "Composite", "Chain link", "Aluminum", "Steel", "Rail", "Your own"]).map((g) => g.label).join(",") === "Wood,Vinyl,Composite,Chain link,Aluminum,Steel,Rail");
    let doc = fenceDocWith(null, { id: "cedar-privacy", materialPerLf: 25, laborPerLf: standardRate("cedar-privacy").laborPerLf, gateSingle: standardRate("cedar-privacy").gateSingle });
    ok("A an override keeps only the field that differs", JSON.stringify(doc.rates) === JSON.stringify({ "cedar-privacy": { materialPerLf: 25 } }), JSON.stringify(doc.rates));
    ok("A the studio's own reader prices it at 25", effectiveRate("cedar-privacy", doc.rates as never).materialPerLf === 25);
    ok("A the document passes the studio's schema", fenceCatalogSchema.safeParse(doc).success);
    rows = fenceBookRows(doc);
    ok("A the row is now a company default at $25", rows.find((r) => r.id === "cedar-privacy")?.companyDefault === true && rows.find((r) => r.id === "cedar-privacy")?.price === 25);
    const cid = nextCustomFenceId(doc);
    doc = fenceDocWith(doc, { id: cid, label: "QA cedar premium 8'", like: "cedar-privacy", materialPerLf: 40, laborPerLf: 18, gateSingle: 600, color: "#c4914a" });
    ok("A a custom type is custom-1, built like a catalog type", cid === "custom-1" && doc.custom.length === 1 && doc.custom[0].like === "cedar-privacy" && fenceCatalogSchema.safeParse(doc).success);
    rows = fenceBookRows(doc);
    ok("A the custom type is a row under Your own", rows.some((r) => r.id === "custom-1" && r.custom && r.group === "Your own" && r.price === 40));
    await db.fenceCatalog.upsert({ where: { organizationId: orgId }, update: { catalogJson: JSON.stringify(doc) }, create: { organizationId: orgId, catalogJson: JSON.stringify(doc) } });
    const back = fenceCatalogSchema.parse(JSON.parse((await db.fenceCatalog.findUnique({ where: { organizationId: orgId } }))!.catalogJson));
    ok("A written to the organization and read back", back.custom[0].label === "QA cedar premium 8'" && back.rates["cedar-privacy"]?.materialPerLf === 25);
    doc = fenceDocWithout(doc, "custom-1");
    doc = fenceDocWithout(doc, "cedar-privacy");
    ok("A delete + reset leave the catalog book", doc.custom.length === 0 && Object.keys(doc.rates).length === 0 && !fenceBookRows(doc).some((r) => r.companyDefault));
    ok("A the built-in ids are the studio's", FENCE_TYPE_IDS.length === 15 && FENCE_TYPE_IDS.includes("cedar-privacy"));

    /* ── B. roof ── */
    head("B · roof: systems and underlayments, an edit, a system of our own, reset");
    rows = roofBookRows(null);
    ok("B every built-in system and underlayment is a row", rows.length === ROOF_SYSTEMS.length + UNDERLAYMENTS.length && rows.every((r) => r.unit === "sq" && !r.companyDefault));
    let rdoc = roofDocWith(null, { system: { id: "architectural", label: "Architectural shingle · 30-yr", family: "asphalt", matPerSq: 140, laborPerSq: 200, wastePct: 12, capPerFt: 2.1 } });
    ok("B an edited system keeps the whole list and passes the builder's schema", rdoc.systems.length === ROOF_SYSTEMS.length && rdoc.underlayments.length === UNDERLAYMENTS.length && roofCatalogSchema.safeParse(rdoc).success);
    ok("B the row is a company default at $140", roofBookRows(rdoc).find((r) => r.id === "architectural")?.companyDefault === true && roofBookRows(rdoc).find((r) => r.id === "architectural")?.price === 140);
    const sid = slugId("QA solar tile", roofLists(rdoc).systems.map((s) => s.id));
    rdoc = roofDocWith(rdoc, { system: { id: sid, label: "QA solar tile", family: "tile", matPerSq: 900, laborPerSq: 600, wastePct: 10, capPerFt: 9 } });
    ok("B a system of our own is appended with a fresh id", sid === "qa_solar_tile" && rdoc.systems.some((s) => s.id === sid) && roofBookRows(rdoc).find((r) => r.id === sid)?.custom === true);
    rdoc = roofDocWith(rdoc, { underlayment: { id: "synthetic", label: "Synthetic underlayment", perSq: 35 } });
    ok("B an underlayment price moves", rdoc.underlayments.find((u) => u.id === "synthetic")?.perSq === 35);
    await db.roofCatalog.upsert({ where: { organizationId: orgId }, update: { catalogJson: JSON.stringify(rdoc) }, create: { organizationId: orgId, catalogJson: JSON.stringify(rdoc) } });
    const rback = roofCatalogSchema.parse(JSON.parse((await db.roofCatalog.findUnique({ where: { organizationId: orgId } }))!.catalogJson));
    ok("B written to the organization and read back", rback.systems.find((s) => s.id === "architectural")?.matPerSq === 140 && rback.systems.some((s) => s.id === sid));
    rdoc = roofDocWithout(rdoc, "roof-system", sid);
    rdoc = roofDocWithout(rdoc, "roof-system", "architectural");
    ok("B delete + reset put the built-in figures back", !rdoc.systems.some((s) => s.id === sid) && rdoc.systems.find((s) => s.id === "architectural")?.matPerSq === ROOF_SYSTEMS.find((s) => s.id === "architectural")!.matPerSq);
    const lone = roofDocWithout({ version: 1, systems: [{ id: "only", label: "Only", family: "asphalt", matPerSq: 1, laborPerSq: 1, wastePct: 1, capPerFt: 1 }], underlayments: [UNDERLAYMENTS[0]], prefs: {} }, "roof-system", "only");
    ok("B a list never empties (the schema wants one row)", lone.systems.length === 1 && roofCatalogSchema.safeParse(lone).success);

    /* ── C. hvac ── */
    head("C · hvac: the starter ladder as rows, a shop unit, the rate card");
    rows = hvacBookRows(STARTER_CATALOG, false);
    ok("C every starter unit is a row, none the shop's", rows.length === STARTER_CATALOG.length && rows.every((r) => !r.companyDefault && r.unit === "each"));
    const shop = hvacBookRows([{ id: "qa-hp", kind: "heat-pump", brand: "QA", model: "HP-036", tons: 3, seer2: 16, cost: 3450, source: "shop" }], true);
    ok("C a shop unit with a cost is a company default priced at its cost", shop[0].companyDefault && shop[0].price === 3450 && /3 t · SEER2 16/.test(shop[0].specs));
    const rate = hvacRateRows(DEFAULT_RATE_CARD, DEFAULT_RATE_CARD);
    ok("C the rate card is rows in three sections, none changed", rate.length > 30 && rate.every((r) => !r.companyDefault) && rate.some((r) => r.id === "permitFee" && r.unit === "each") && rate.some((r) => r.id === "labor.linesetPerFt" && r.unit === "ft") && rate.some((r) => r.id === "equipmentMarkupPct" && r.unit === "%"));
    const card = hvacCardWith(DEFAULT_RATE_CARD, "permitFee", 300);
    const card2 = hvacCardWith(card, "labor.setCoil", 400);
    ok("C a top-level and a nested figure move, the rest stays", card2.permitFee === 300 && card2.labor.setCoil === 400 && card2.labor.setFurnace === DEFAULT_RATE_CARD.labor.setFurnace && normalizeRateCard(card2).permitFee === 300);
    ok("C the changed figures read as company defaults", hvacRateRows(card2, DEFAULT_RATE_CARD).filter((r) => r.companyDefault).map((r) => r.id).sort().join(",") === "labor.setCoil,permitFee");
    await db.hvacSettings.upsert({ where: { organizationId: orgId }, update: { rateCardJson: JSON.stringify(card2) }, create: { organizationId: orgId, rateCardJson: JSON.stringify(card2) } });
    ok("C written to the organization and read back", normalizeRateCard(JSON.parse((await db.hvacSettings.findUnique({ where: { organizationId: orgId } }))!.rateCardJson)).labor.setCoil === 400);

    /* ── D. who may write, and the page's own parsing ── */
    head("D · permissions and the URL");
    ok("D OWNER / MANAGER / ESTIMATOR may edit the book", canEditBook("OWNER") && canEditBook("MANAGER") && canEditBook("ESTIMATOR"));
    ok("D INSTALLER and SALES may not (the estimators' own rule)", !canEditBook("INSTALLER") && !canEditBook("SALES"));
    ok("D the route is allowed to the estimator role, not to sales or installers", isPathAllowed(ROLE_ROUTE_GATES.ESTIMATOR, "/dashboard/inventory") && !isPathAllowed(ROLE_ROUTE_GATES.SALES, "/dashboard/inventory") && !isPathAllowed(ROLE_ROUTE_GATES.INSTALLER, "/dashboard/inventory"));
    ok("D tab: services only for hvac, book by default", parseTab("services", "hvac") === "services" && parseTab("services", "fence") === "book" && parseTab(undefined, "roof") === "book" && parseTab("stock", "roof") === "stock");
    ok("D an unknown tab and a services tab off hvac fall back to the book", parseTab("cards", "hvac") === "book" && parseTab("services", "roof") === "book");

    /* ── E. the old URLs answer 308 (when a dev server is up) ── */
    head("E · the old URLs");
    // Only against a server named explicitly: :3000 on this machine may be
    // another project's, which answers 404, not 308.
    const base = process.env.QA_BASE_URL || "";
    const moved: Array<[string, string]> = [
      ["/dashboard/roof-estimator/board", "/dashboard/inventory?trade=roof&tab=stock"],
      ["/dashboard/fence-estimator/board", "/dashboard/inventory?trade=fence&tab=stock"],
      ["/dashboard/hvac-estimator/board", "/dashboard/inventory?trade=hvac&tab=stock"],
      ["/dashboard/hvac-estimator/services", "/dashboard/inventory?trade=hvac&tab=services"],
      ["/mobile-hvac-inventory-v1", "/dashboard/inventory?trade=hvac&tab=stock"],
    ];
    let up = Boolean(base);
    if (up) { try { await fetch(base + "/auth/login", { redirect: "manual" }); } catch { up = false; } }
    if (!up) console.log(`skip  ${base ? `no dev server on ${base}` : "QA_BASE_URL not set"} — the 308s are not checked here`);
    else for (const [from, to] of moved) {
      const r = await fetch(base + from, { redirect: "manual" });
      ok(`E 308 ${from}`, r.status === 308 && (r.headers.get("location") ?? "").endsWith(to), `${r.status} → ${r.headers.get("location")}`);
    }
  } finally {
    await db.fenceCatalog.deleteMany({ where: { organizationId: orgId } });
    if (saved.fence) await db.fenceCatalog.create({ data: { organizationId: orgId, catalogJson: saved.fence.catalogJson } });
    await db.roofCatalog.deleteMany({ where: { organizationId: orgId } });
    if (saved.roof) await db.roofCatalog.create({ data: { organizationId: orgId, catalogJson: saved.roof.catalogJson } });
    await db.hvacSettings.deleteMany({ where: { organizationId: orgId } });
    if (saved.hvac) await db.hvacSettings.create({ data: { organizationId: orgId, rateCardJson: saved.hvac.rateCardJson } });
    await db.hvacCatalogItem.deleteMany({ where: { organizationId: orgId } });
    for (const it of saved.items) await db.hvacCatalogItem.create({ data: { organizationId: orgId, itemId: it.itemId, kind: it.kind, brand: it.brand, model: it.model, itemJson: it.itemJson } });
    await db.$disconnect();
  }
  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
