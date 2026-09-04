// Phase 0 — read-only reconnaissance of the OLD JobFlex database.
//
// Writes scripts/migrate-v2/reports/probe-<stamp>.json plus a summary on stdout.
// Nothing here writes to either database. Run this before writing any mapper: the
// old app patches its own schema outside Prisma's migration ledger, and
// Quote.lineItems is a JSON blob whose shape drifted over years, so the mapping has
// to be built against what is actually in the database, not against schema.prisma.
//
//   OLD_DATABASE_URL="postgres://..." npx tsx scripts/migrate-v2/probe.ts --email a@b.com
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getReader, disconnectAll, jsonSafe } from "./client";

const IN_SCOPE_TABLES = [
  "User", "Account", "Settings", "Company", "CompanyMember", "CompanySubscription",
  "TeamMembership", "Client", "Quote", "Invoice", "JobEvent", "Appointment",
  "LeadAppointment", "Lead", "Conversation", "Message", "WorkerProfile", "ManagerProfile",
];

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const email = (arg("email") ?? "").trim().toLowerCase();
if (!email) throw new Error("--email <old account email> is required");

const db = getReader();
const report: Record<string, unknown> = { probedAt: new Date().toISOString(), email };

/** Run one labelled read; a missing table must not abort the whole probe. */
async function q<T = Record<string, unknown>>(label: string, sql: string, ...params: unknown[]): Promise<T[]> {
  try {
    const rows = (await db.$queryRawUnsafe(sql, ...params)) as T[];
    report[label] = rows;
    return rows;
  } catch (err) {
    report[label] = { error: err instanceof Error ? err.message : String(err) };
    return [];
  }
}

async function main() {
  // ── which database is this, and what is actually in it ──
  await q("connection", `SELECT current_database() AS db, current_setting('server_version') AS pg`);
  const tables = await q<{ table_name: string }>(
    "tables",
    `SELECT c.relname AS table_name, c.reltuples::bigint AS n_live
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname`,
  );
  await q(
    "columns",
    `SELECT table_name, column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])
      ORDER BY table_name, ordinal_position`,
    IN_SCOPE_TABLES,
  );
  await q(
    "prisma_migrations_tail",
    `SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"
      ORDER BY finished_at DESC NULLS FIRST LIMIT 8`,
  );

  // ── the subscriber population ──
  await q(
    "subscribers",
    `SELECT u.id, lower(u.email) AS email, u.name, u."businessName", u.role::text AS role,
            u."subscriptionPlan"::text AS plan, u."subscriptionStatus"::text AS status,
            u."stripeCustomerId", u."stripeSubscriptionId", u."subscriptionCurrentPeriodEnd",
            u."onboardingCompletedAt", (u.password IS NOT NULL) AS has_password, u."createdAt"
       FROM "User" u
      WHERE u."subscriptionStatus"::text <> 'INACTIVE'
         OR u."stripeSubscriptionId" IS NOT NULL
         OR u."stripeCustomerId" IS NOT NULL
      ORDER BY u."createdAt"`,
  );
  await q(
    "company_subscriptions",
    `SELECT cs.id, cs."userId", cs."companyId", cs."planKey", cs.status::text AS status,
            cs."currentPeriodEnd", cs."isComped", cs."providerSubId", lower(u.email) AS email
       FROM "CompanySubscription" cs LEFT JOIN "User" u ON u.id = cs."userId"
      ORDER BY cs."currentPeriodEnd" DESC NULLS LAST`,
  );
  await q(
    "password_hash_shapes",
    `SELECT substring(password from 1 for 7) AS prefix, length(password) AS len, count(*)::int AS n
       FROM "User" WHERE password IS NOT NULL GROUP BY 1, 2 ORDER BY n DESC`,
  );
  await q("users_without_password", `SELECT count(*)::int AS n FROM "User" WHERE password IS NULL`);

  // ── the pilot account ──
  const users = await q<{ id: string }>(
    "pilot_user",
    `SELECT u.*, (u.password IS NOT NULL) AS has_password FROM "User" u
      WHERE lower(u.email) = $1 LIMIT 1`,
    email,
  );
  const uid = users[0]?.id ?? null;
  report.pilotUserId = uid;
  report.tableCount = tables.length;
  if (!uid) {
    console.log(`\n!! No user with email ${email} in this database.\n`);
    return;
  }

  await q("pilot_account_rows", `SELECT * FROM "Account" WHERE "userId" = $1`, uid);
  await q("pilot_settings", `SELECT * FROM "Settings" WHERE "userId" = $1`, uid);
  await q(
    "pilot_company_member",
    `SELECT cm.*, c.name AS company_name, c.specialties, c.location, c.phone,
            c.email AS company_email, c.website, c."logoUrl"
       FROM "CompanyMember" cm JOIN "Company" c ON c.id = cm."companyId" WHERE cm."userId" = $1`,
    uid,
  );
  await q("pilot_team", `SELECT * FROM "TeamMembership" WHERE "employerUserId" = $1 OR "workerUserId" = $1`, uid);

  // ── how much data, and under which of the three scoping rules ──
  await q(
    "pilot_quote_scoping",
    `SELECT count(*) FILTER (WHERE "ownerId" = $1)                        AS by_owner,
            count(*) FILTER (WHERE "companyOwnerId" = $1)                 AS by_company_owner,
            count(*) FILTER (WHERE "ownerId" = $1 AND "deletedAt" IS NULL AND "isTemplate" = false) AS live_by_owner,
            count(*) FILTER (WHERE "deletedAt" IS NOT NULL AND ("ownerId" = $1 OR "companyOwnerId" = $1)) AS soft_deleted,
            count(*) FILTER (WHERE "isTemplate" = true AND ("ownerId" = $1 OR "companyOwnerId" = $1))     AS templates
       FROM "Quote"`,
    uid,
  );
  await q(
    "pilot_counts",
    `SELECT (SELECT count(*) FROM "Client"       WHERE "ownerId" = $1)                          AS clients,
            (SELECT count(*) FROM "Client"       WHERE "ownerId" = $1 AND "deletedAt" IS NULL)  AS clients_live,
            (SELECT count(*) FROM "JobEvent"     WHERE "ownerId" = $1 OR "companyOwnerId" = $1) AS job_events,
            (SELECT count(*) FROM "JobEvent"     WHERE ("ownerId" = $1 OR "companyOwnerId" = $1) AND "deletedAt" IS NULL) AS job_events_live,
            (SELECT count(*) FROM "Appointment"  WHERE "companyOwnerId" = $1 OR "schedulerId" = $1) AS appointments,
            (SELECT count(*) FROM "Lead"         WHERE "ownerId" = $1 OR "companyOwnerId" = $1) AS leads,
            (SELECT count(*) FROM "Conversation" WHERE "ownerId" = $1)                          AS conversations,
            (SELECT count(*) FROM "Message" m JOIN "Conversation" c ON c.id = m."conversationId" WHERE c."ownerId" = $1) AS messages,
            (SELECT count(*) FROM "Invoice" i JOIN "Quote" qq ON qq.id = i."quoteId" WHERE qq."ownerId" = $1) AS invoices`,
    uid,
  );
  await q(
    "pilot_quote_status_histogram",
    `SELECT status::text AS status, count(*)::int AS n FROM "Quote"
      WHERE ("ownerId" = $1 OR "companyOwnerId" = $1) AND "deletedAt" IS NULL AND "isTemplate" = false
      GROUP BY 1 ORDER BY n DESC`,
    uid,
  );
  await q(
    "pilot_jobevent_status_histogram",
    `SELECT coalesce(status, '(null)') AS status, count(*)::int AS n FROM "JobEvent"
      WHERE ("ownerId" = $1 OR "companyOwnerId" = $1) AND "deletedAt" IS NULL GROUP BY 1 ORDER BY n DESC`,
    uid,
  );
  await q(
    "pilot_lead_status_histogram",
    `SELECT status::text AS status, count(*)::int AS n FROM "Lead"
      WHERE "ownerId" = $1 OR "companyOwnerId" = $1 GROUP BY 1 ORDER BY n DESC`,
    uid,
  );

  // ── the JSON blobs: the single biggest unknown in the mapping ──
  const scope = `("ownerId" = $1 OR "companyOwnerId" = $1) AND "deletedAt" IS NULL AND "isTemplate" = false`;
  await q(
    "lineitem_key_histogram",
    `SELECT k AS key, count(*)::int AS n FROM "Quote" q,
       LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(q."lineItems") = 'array' THEN q."lineItems" ELSE '[]'::jsonb END) e,
       LATERAL jsonb_object_keys(e) k
      WHERE ${scope} GROUP BY 1 ORDER BY n DESC`,
    uid,
  );
  await q(
    "addon_key_histogram",
    `SELECT k AS key, count(*)::int AS n FROM "Quote" q,
       LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(q."addOns") = 'array' THEN q."addOns" ELSE '[]'::jsonb END) e,
       LATERAL jsonb_object_keys(e) k
      WHERE ${scope} GROUP BY 1 ORDER BY n DESC`,
    uid,
  );
  await q(
    "calc_key_histogram",
    `SELECT k AS key, count(*)::int AS n FROM "Quote" q,
       LATERAL jsonb_object_keys(CASE WHEN jsonb_typeof(q."calc") = 'object' THEN q."calc" ELSE '{}'::jsonb END) k
      WHERE ${scope} GROUP BY 1 ORDER BY n DESC`,
    uid,
  );
  await q(
    "blob_container_types",
    `SELECT jsonb_typeof(q."lineItems") AS line_items, jsonb_typeof(q."addOns") AS add_ons,
            jsonb_typeof(q."calc") AS calc, count(*)::int AS n
       FROM "Quote" q WHERE ${scope} GROUP BY 1, 2, 3 ORDER BY n DESC`,
    uid,
  );
  await q(
    "blob_samples",
    `SELECT q.id, q.status::text AS status, q.title, q."taxRate", q."lineItems", q."addOns", q.calc
       FROM "Quote" q WHERE ${scope} ORDER BY q."createdAt" DESC LIMIT 4`,
    uid,
  );

  // ── numbers whose SCALE must not be guessed ──
  await q(
    "taxrate_distribution",
    `SELECT "taxRate", count(*)::int AS n FROM "Quote" WHERE ${scope} GROUP BY 1 ORDER BY n DESC LIMIT 15`,
    uid,
  );
  await q(
    "money_scale_check",
    `SELECT q.id, (q.calc->>'total') AS calc_total, i.amount::text AS invoice_amount, i.status::text AS invoice_status
       FROM "Quote" q JOIN "Invoice" i ON i."quoteId" = q.id WHERE ${scope} LIMIT 8`,
    uid,
  );

  // ── attachments: what survives the move, what points at the old Vercel blob store ──
  await q(
    "photo_inventory",
    `SELECT count(*) FILTER (WHERE q."beforeAfterPhotos"::text LIKE '%data:%')                    AS with_base64,
            count(*) FILTER (WHERE q."beforeAfterPhotos"::text LIKE '%blob.vercel-storage.com%') AS with_blob_url,
            count(*) FILTER (WHERE q."beforeAfterPhotos" IS NOT NULL)                            AS with_any,
            coalesce(max(length(q."beforeAfterPhotos"::text)), 0)                                AS max_bytes,
            coalesce(sum(length(q."beforeAfterPhotos"::text)), 0)                                AS total_bytes
       FROM "Quote" q WHERE ${scope}`,
    uid,
  );
}

main()
  .catch((err) => {
    report.fatal = err instanceof Error ? err.message : String(err);
  })
  .finally(async () => {
    await disconnectAll();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const out = join(__dirname, "reports", `probe-${stamp}.json`);
    writeFileSync(out, JSON.stringify(report, jsonSafe, 2));
    console.log(`Report: ${out}`);
  });
