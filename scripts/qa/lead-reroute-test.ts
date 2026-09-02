// Homeowner re-route ("find me another contractor") — data-level harness.
// Exercises the shared un-match core and the client rules against dev.db with
// throwaway rows (cleaned up at the end, pass or fail). No network, no email
// (notify is never imported here). Exit 1 on any failure.
//
//   npx tsx scripts/qa/lead-reroute-test.ts
//
// Covered, mirroring the owner's rules:
//   1. 24h cooldown helper — locked before, open after (rule #1)
//   2. client rejection spends a cascade attempt; at MAX_ATTEMPTS the lead
//      parks in MANUAL_QUEUE, never re-offers (rule #2, #3 empty pool)
//   3. the shop's Lead row is marked LOST, not deleted (rule #5)
//   4. the rejected org is excluded from every later selection
//   5. idempotency — a second unmatch against the same org is a no-op
//   6. race — the "shop converts while the client clicks" shape: once the
//      lead is no longer MATCHED to that org, the client's write refuses
import { readFileSync } from "node:fs";

// dotenv is not a dependency here — a five-line reader covers the harness.
for (const file of [".env", ".env.local"]) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=("?)(.*)\2\s*$/.exec(line.trim());
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[3];
    }
  } catch {
    /* optional file */
  }
}

import { PrismaClient } from "@prisma/client";
import {
  CLIENT_REROUTE_COOLDOWN_MS,
  clientRerouteUnlocksAt,
  unmatchAndAdvance,
} from "../../src/lib/leadCenter/unmatch";
import { MAX_ATTEMPTS } from "../../src/lib/leadCenter/cascade";

const db = new PrismaClient();
// The lib modules import "@/lib/db" — same database file, separate client; fine
// for a sequential harness.

let failures = 0;
const check = (label: string, ok: boolean, detail = ""): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ": " + detail : ""}`);
};

const TAG = "qa-reroute";

async function makeOrg(name: string, opts: { eligible: boolean }) {
  return db.organization.create({
    data: {
      name: `${TAG} ${name}`,
      slug: `${TAG}-${name.toLowerCase()}-${Date.now()}`,
      leadOffersEnabled: opts.eligible,
      lat: opts.eligible ? 47.68 : null,
      lng: opts.eligible ? -122.2 : null,
      tradeTypesJson: JSON.stringify(["Roofing"]),
    },
  });
}

async function makeMatchedLead(orgId: string, opts?: { attemptCount?: number; ranking?: unknown[] }) {
  const lead = await db.lead.create({
    data: {
      organizationId: orgId,
      name: `${TAG} homeowner`,
      source: "LEAD_CENTER",
      status: "CLAIMED",
    },
  });
  const pl = await db.platformLead.create({
    data: {
      name: `${TAG} homeowner`,
      email: "qa-reroute@example.test",
      zip: "98011",
      lat: 47.7,
      lng: -122.2,
      detectedTrade: "Roofing",
      status: "MATCHED",
      matchedOrgId: orgId,
      matchedLeadId: lead.id,
      matchedAt: new Date(Date.now() - CLIENT_REROUTE_COOLDOWN_MS - 1000),
      attemptCount: opts?.attemptCount ?? 1,
      rankingJson: JSON.stringify(opts?.ranking ?? []),
      offers: {
        create: {
          organizationId: orgId,
          attempt: 1,
          score: 0.9,
          status: "ACCEPTED",
          respondedAt: new Date(),
          expiresAt: new Date(),
        },
      },
    },
  });
  return { pl, lead };
}

async function cleanup() {
  const orgs = await db.organization.findMany({
    where: { name: { startsWith: TAG } },
    select: { id: true },
  });
  const orgIds = orgs.map((o) => o.id);
  const pls = await db.platformLead.findMany({
    where: { name: { startsWith: TAG } },
    select: { id: true },
  });
  await db.leadOffer.deleteMany({ where: { platformLeadId: { in: pls.map((p) => p.id) } } });
  await db.platformLead.deleteMany({ where: { id: { in: pls.map((p) => p.id) } } });
  await db.lead.deleteMany({ where: { organizationId: { in: orgIds } } });
  await db.organization.deleteMany({ where: { id: { in: orgIds } } });
}

async function main() {
  await cleanup(); // stale rows from an aborted previous run

  // ── 1 · cooldown helper ────────────────────────────────────────────────────
  console.log("\n24h cooldown (rule #1):");
  const justMatched = new Date();
  const dayAgo = new Date(Date.now() - CLIENT_REROUTE_COOLDOWN_MS - 1);
  check(
    "заперто сразу после match",
    clientRerouteUnlocksAt(justMatched)!.getTime() > Date.now(),
  );
  check("открыто спустя 24ч", clientRerouteUnlocksAt(dayAgo)!.getTime() <= Date.now());
  check("нет матча — нет замка", clientRerouteUnlocksAt(null) === null);

  // ── 2 · LOST + exclusion + advance to next candidate ──────────────────────
  console.log("\nклиентский отказ: LOST, исключение, следующий кандидат:");
  const orgA = await makeOrg("alpha", { eligible: true });
  const orgB = await makeOrg("beta", { eligible: true });
  const { pl, lead } = await makeMatchedLead(orgA.id, {
    attemptCount: 1,
    ranking: [
      { orgId: orgA.id, orgName: orgA.name, score: 0.9, distanceMi: 1, distanceScore: 1, ratingScore: 1, respScore: 1, fallback: false },
      { orgId: orgB.id, orgName: orgB.name, score: 0.8, distanceMi: 2, distanceScore: 1, ratingScore: 1, respScore: 1, fallback: false },
    ],
  });

  const r1 = await unmatchAndAdvance(pl.id, {
    offerStatus: "REJECTED_BY_CLIENT",
    respondedById: null,
    declineReason: "Never heard from them",
    leadDisposition: "lost",
    expectedOrgId: orgA.id,
  });
  check("изменение принято", r1.changed);
  const leadAfter = await db.lead.findUnique({ where: { id: lead.id } });
  check("Lead-строка шопа помечена LOST, не удалена (rule #5)", leadAfter?.status === "LOST");
  const rejOffer = await db.leadOffer.findUnique({
    where: { platformLeadId_organizationId: { platformLeadId: pl.id, organizationId: orgA.id } },
  });
  check(
    "история: offer REJECTED_BY_CLIENT с причиной",
    rejOffer?.status === "REJECTED_BY_CLIENT" && rejOffer?.declineReason === "Never heard from them",
  );
  const plAfter1 = await db.platformLead.findUnique({ where: { id: pl.id }, include: { offers: true } });
  check("attemptCount вырос (rule #2)", (plAfter1?.attemptCount ?? 0) === 2);
  const offeredTo = plAfter1?.offers.find((o) => o.status === "OFFERED");
  check(
    "следующий офер ушёл orgB, не orgA (исключение истории)",
    plAfter1?.status === "OFFERED" && offeredTo?.organizationId === orgB.id,
    `status=${plAfter1?.status}`,
  );

  // ── 3 · idempotency: the same client action again is a no-op ───────────────
  console.log("\nидемпотентность:");
  const r2 = await unmatchAndAdvance(pl.id, {
    offerStatus: "REJECTED_BY_CLIENT",
    respondedById: null,
    leadDisposition: "lost",
    expectedOrgId: orgA.id,
  });
  check("повторный клик — no-op", !r2.changed);
  const plAfter2 = await db.platformLead.findUnique({ where: { id: pl.id } });
  check("attemptCount не вырос повторно", plAfter2?.attemptCount === 2);

  // ── 4 · race shape: not MATCHED to that org any more → refuse ─────────────
  console.log("\nгонка клиент-vs-шоп (лид уже ушёл от orgA):");
  // plAfter is OFFERED to orgB now — a client acting on the stale orgA match:
  const r3 = await unmatchAndAdvance(pl.id, {
    offerStatus: "REJECTED_BY_CLIENT",
    respondedById: null,
    leadDisposition: "lost",
    expectedOrgId: orgB.id, // orgB has an OFFER, not a MATCH — must refuse too
  });
  check("не-MATCHED состояние отвергается", !r3.changed);

  // ── 5 · attempts exhausted → MANUAL_QUEUE, never re-offers ────────────────
  console.log("\nлимит попыток → MANUAL_QUEUE (rules #2–3):");
  const orgC = await makeOrg("gamma", { eligible: true });
  const m2 = await makeMatchedLead(orgC.id, {
    attemptCount: MAX_ATTEMPTS, // the cap is already spent
    ranking: [
      { orgId: orgC.id, orgName: orgC.name, score: 0.9, distanceMi: 1, distanceScore: 1, ratingScore: 1, respScore: 1, fallback: false },
    ],
  });
  const r4 = await unmatchAndAdvance(m2.pl.id, {
    offerStatus: "REJECTED_BY_CLIENT",
    respondedById: null,
    leadDisposition: "lost",
    expectedOrgId: orgC.id,
  });
  check("изменение принято", r4.changed);
  check("лид припаркован в MANUAL_QUEUE", r4.status === "MANUAL_QUEUE", r4.status);
  const q = await db.platformLead.findUnique({ where: { id: m2.pl.id } });
  check("queueReason=EXHAUSTED", q?.queueReason === "EXHAUSTED", q?.queueReason ?? "—");

  // ── 6 · empty pool (nobody left in the snapshot) → MANUAL_QUEUE ───────────
  console.log("\nпустой пул после отказа (rule #3):");
  const orgD = await makeOrg("delta", { eligible: true });
  const m3 = await makeMatchedLead(orgD.id, {
    attemptCount: 1,
    ranking: [
      { orgId: orgD.id, orgName: orgD.name, score: 0.9, distanceMi: 1, distanceScore: 1, ratingScore: 1, respScore: 1, fallback: false },
    ], // orgD is the whole pool — after the rejection nobody is left
  });
  const r5 = await unmatchAndAdvance(m3.pl.id, {
    offerStatus: "REJECTED_BY_CLIENT",
    respondedById: null,
    leadDisposition: "lost",
    expectedOrgId: orgD.id,
  });
  check("изменение принято", r5.changed);
  check("пул пуст → MANUAL_QUEUE", r5.status === "MANUAL_QUEUE", r5.status);

  await cleanup();
  console.log(failures ? `\n${failures} FAIL` : "\nALL PASS");
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup().catch(() => {});
  process.exit(1);
});
