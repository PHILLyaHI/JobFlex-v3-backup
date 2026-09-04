// Copy the LOCAL dev.db into the (empty) production Postgres — platform data plus
// a chosen set of organisations, in foreign-key order, ids preserved.
//
//   TARGET_DATABASE_URL=<prod non-pooling url> \
//     npx tsx scripts/migrate-v2/copy.ts --org <orgId> [--org ...] | --migrated | --all-orgs  [--dry-run] [--allow-nonempty]
//
// Scope rule, applied row by row in dependency order: a row is copied when every
// foreign key it carries points at a row that is itself being copied. Roots are
// the chosen Organizations and the Users who belong to them (plus platform admins
// who belong to no organisation at all); tables with no foreign keys — the plan
// catalogue, the Stripe price ledger, caches — are copied whole. Nothing here
// touches the local database.
import { PrismaClient as LocalClient } from "@prisma/client";
import { Prisma, PrismaClient as PgClient } from "./.generated/pg-client";
import { verify } from "./verify";
import type { Manifest } from "./phases";

type Row = Record<string, unknown>;
interface Delegate {
  findMany(args?: object): Promise<Row[]>;
  createMany(args: { data: Row[]; skipDuplicates: boolean }): Promise<{ count: number }>;
  count(): Promise<number>;
}

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const allOrgs = argv.includes("--all-orgs");
// The organisations the legacy import created (a migrate:v2 manifest names each).
const migratedOrgs = argv.includes("--migrated");
const allowNonEmpty = argv.includes("--allow-nonempty");
const orgArgs = argv.flatMap((a, i) => (a === "--org" && argv[i + 1] ? [argv[i + 1]] : []));
if (!allOrgs && !migratedOrgs && !orgArgs.length) throw new Error("pass --org <id> (repeatable), --migrated, or --all-orgs");

const targetUrl = process.env.TARGET_DATABASE_URL ?? "";
const host = targetUrl.match(/@([^/]+)\//)?.[1] ?? "";
if (!host.startsWith("ep-blue-hall-aiq8rl7c")) throw new Error(`refusing: ${host || "no url"} is not the v3 production database`);
if (/-pooler\./.test(host)) throw new Error("use the NON-POOLING url");

const local = new LocalClient({ datasourceUrl: "file:C:/joblfex-v3/prisma/dev.db", log: ["error"] });
const prod = new PgClient({ datasourceUrl: targetUrl, log: ["error"] });
const delegate = (db: unknown, model: string): Delegate =>
  (db as Record<string, Delegate>)[model[0].toLowerCase() + model.slice(1)];

const models = Prisma.dmmf.datamodel.models;
const byName = new Map(models.map((m) => [m.name, m]));

/** Models in an order where every FK target is written before the rows that point at it. */
function dependencyOrder(): string[] {
  const order: string[] = [];
  const state = new Map<string, "in" | "done">();
  const visit = (name: string) => {
    if (state.get(name) === "done") return;
    if (state.get(name) === "in") return; // cycle: the back-edge is a nullable FK in this schema
    state.set(name, "in");
    for (const f of byName.get(name)!.fields) {
      if (f.kind === "object" && f.relationFromFields?.length && f.type !== name) visit(f.type);
    }
    state.set(name, "done");
    order.push(name);
  };
  for (const m of models) visit(m.name);
  return order;
}

(async () => {
  const stamp = new Date().toISOString().slice(0, 19);
  console.log(`\nCOPY local dev.db -> ${host}${dryRun ? "  (DRY RUN — nothing written)" : ""}  ${stamp}`);

  const existingOrgs = await prod.organization.count();
  const existingUsers = await prod.user.count();
  if ((existingOrgs || existingUsers) && !allowNonEmpty) {
    throw new Error(`target already holds ${existingOrgs} organisations / ${existingUsers} users — pass --allow-nonempty to add to it (existing ids are skipped)`);
  }

  // ── roots ──
  const orgRows = await local.organization.findMany({ select: { id: true, name: true } });
  const manifests = migratedOrgs
    ? await local.syncState.findMany({ where: { key: { startsWith: "migrate:v2:" }, NOT: { key: "migrate:v2:ledger" } } })
    : [];
  const fromManifests = manifests.flatMap((m) => {
    try { const o = (JSON.parse(m.cursor) as { organizationId?: string }).organizationId; return o ? [o] : []; } catch { return []; }
  });
  const wanted = new Set([...orgArgs, ...fromManifests]);
  const orgs = new Set((allOrgs ? orgRows : orgRows.filter((o) => wanted.has(o.id))).map((o) => o.id));
  for (const id of orgArgs) if (!orgs.has(id)) throw new Error(`no local organisation ${id}`);
  const memberIds = new Set((await local.membership.findMany({ where: { organizationId: { in: [...orgs] } }, select: { userId: true } })).map((m) => m.userId));
  const admins = await local.user.findMany({ where: { isPlatformAdmin: true, memberships: { none: {} } }, select: { id: true, email: true } });
  const users = new Set([...memberIds, ...admins.map((a) => a.id)]);
  console.log(`organisations: ${orgs.size} of ${orgRows.length} — ${orgRows.filter((o) => orgs.has(o.id)).map((o) => `"${o.name}"`).join(", ")}`);
  console.log(`users: ${users.size} (${memberIds.size} member(s) + ${admins.length} platform admin(s) with no organisation: ${admins.map((a) => a.email).join(", ") || "none"})`);

  const included = new Map<string, Set<unknown>>([["Organization", orgs], ["User", users]]);
  const idOf = (model: Prisma.DMMF.Model, row: Row): unknown => {
    const pk = model.primaryKey?.fields ?? model.fields.filter((f) => f.isId).map((f) => f.name);
    return pk.length === 1 ? row[pk[0]] : pk.map((f) => String(row[f])).join("|");
  };

  const keep = (model: Prisma.DMMF.Model, row: Row): boolean => {
    if (model.name === "Organization") return orgs.has(String(row.id));
    if (model.name === "User") return users.has(String(row.id));
    if (model.name === "SyncState") {
      const key = String(row.key);
      if (key === "migrate:v2:ledger") return true;
      if (key.startsWith("orgPages:")) return orgs.has(key.slice("orgPages:".length));
      if (key.startsWith("migrate:v2:")) {
        try { return orgs.has((JSON.parse(String(row.cursor)) as { organizationId?: string }).organizationId ?? ""); } catch { return false; }
      }
      return false; // signup:<token> and the like are transient
    }
    for (const f of model.fields) {
      if (f.kind !== "object" || !f.relationFromFields?.length) continue;
      const fk = row[f.relationFromFields[0]];
      if (fk == null) continue;
      if (!included.get(f.type)?.has(fk)) return false;
    }
    // Scalar scopes with no relation behind them (NavSeen, User.activeOrgId is
    // harmless, but an org/user key that points outside the set is not ours).
    const hasRel = (col: string) => model.fields.some((f) => f.kind === "object" && f.relationFromFields?.includes(col));
    if ("organizationId" in row && !hasRel("organizationId") && !orgs.has(String(row.organizationId))) return false;
    if ("userId" in row && !hasRel("userId") && !users.has(String(row.userId))) return false;
    return true;
  };

  // ── copy, in dependency order ──
  const order = dependencyOrder();
  const summary: [string, number, number][] = [];
  let total = 0;
  for (const name of order) {
    const model = byName.get(name)!;
    const rows = await delegate(local, name).findMany();
    const kept = rows.filter((r) => keep(model, r));
    included.set(name, new Set([...(included.get(name) ?? []), ...kept.map((r) => idOf(model, r))]));
    if (!kept.length) continue;
    summary.push([name, rows.length, kept.length]);
    total += kept.length;
    if (dryRun) continue;
    for (let i = 0; i < kept.length; i += 200) {
      await delegate(prod, name).createMany({ data: kept.slice(i, i + 200), skipDuplicates: true });
    }
  }

  console.log(`\n  MODEL                        LOCAL  COPIED`);
  for (const [m, all, kept] of summary) console.log(`  ${m.padEnd(28)} ${String(all).padStart(5)}  ${String(kept).padStart(6)}`);
  console.log(`\n${dryRun ? "would copy" : "copied"} ${total} rows across ${summary.length} tables`);

  if (!dryRun) {
    // What actually landed, and whether each chosen owner can sign in and use it.
    console.log("\nverify on production:");
    for (const orgId of orgs) {
      const owner = await prod.membership.findFirst({ where: { organizationId: orgId, role: "OWNER" }, orderBy: { createdAt: "asc" } });
      if (!owner) { console.log(`  ${orgId}: no OWNER membership`); continue; }
      const localUser = await local.user.findUnique({ where: { id: owner.userId }, select: { email: true, hashedPassword: true } });
      const manifest = { organizationId: orgId, userId: owner.userId, created: {} } as unknown as Manifest;
      console.log(`  ${localUser?.email}`);
      for (const c of await verify(prod, manifest, localUser?.hashedPassword ?? null)) {
        console.log(`     ${c.ok ? "ok  " : "FAIL"}  ${c.label} — ${c.detail}`);
      }
    }
  }
  await local.$disconnect();
  await prod.$disconnect();
})().catch((err) => {
  console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
