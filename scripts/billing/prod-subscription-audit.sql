-- ONE SUBSCRIPTION OF RECORD PER ORGANIZATION — production audit (Postgres / Neon).
-- Read-only. Run before and after scripts/billing/reconcile-subscription-rows.ts.
-- (SQLite dev: replace NOW() with datetime('now') and drop the ::date casts.)

-- 0. Structural: more than one non-CANCELED row per organization.
--    Subscription.organizationId is UNIQUE, so this returns nothing by
--    construction; it is here so the owner can see that for themselves.
SELECT "organizationId", COUNT(*) AS rows_
FROM "Subscription"
WHERE status <> 'CANCELED'
GROUP BY "organizationId"
HAVING COUNT(*) > 1;

-- 1. Hand grants (comps) that still carry a Stripe customer — the rows the old
--    sheet produced: the Stripe side may still hold a live subscription for
--    that customer. Check each customer in the Stripe dashboard
--    (Customers → cus_… → Subscriptions), or run the repair script's dry run,
--    which reads Stripe and prints the verdict per organization.
SELECT o.name, o.slug, s."organizationId", s.plan, s.status, s.provider,
       s."externalCustomerId", s."externalSubId", s."currentPeriodEnd", s."updatedAt"
FROM "Subscription" s JOIN "Organization" o ON o.id = s."organizationId"
WHERE s.provider = 'MANUAL' AND s.status IN ('ACTIVE','TRIALING','PAST_DUE')
ORDER BY s."updatedAt" DESC;

-- 2. Shape violations the invariant forbids (lib/planGrant.mirrorInvariantViolations):
--    a) a MANUAL row that still names a Stripe subscription;
--    b) a live STRIPE row that names no subscription (demo/self-serve, or broken);
--    c) a MANUAL row that is live but not ACTIVE.
SELECT o.name, s."organizationId", s.plan, s.status, s.provider, s."externalSubId", s."externalCustomerId",
       CASE
         WHEN s.provider = 'MANUAL' AND s."externalSubId" IS NOT NULL THEN 'a) grant still names a Stripe subscription'
         WHEN s.provider = 'STRIPE' AND s.status IN ('ACTIVE','TRIALING','PAST_DUE') AND s."externalSubId" IS NULL THEN 'b) live STRIPE row without a subscription id'
         WHEN s.provider = 'MANUAL' AND s.status IN ('TRIALING','PAST_DUE') THEN 'c) grant in a non-ACTIVE live status'
       END AS violation
FROM "Subscription" s JOIN "Organization" o ON o.id = s."organizationId"
WHERE (s.provider = 'MANUAL' AND s."externalSubId" IS NOT NULL)
   OR (s.provider = 'STRIPE' AND s.status IN ('ACTIVE','TRIALING','PAST_DUE') AND s."externalSubId" IS NULL)
   OR (s.provider = 'MANUAL' AND s.status IN ('TRIALING','PAST_DUE'));

-- 3. Grant records and their rows (the editor's comps): term, reason, author.
SELECT REPLACE(st.key, 'planGrant:', '') AS "organizationId",
       st.cursor::json->>'plan'      AS plan,
       st.cursor::json->>'endsAt'    AS ends_at,
       st.cursor::json->>'fallback'  AS after_it_ends,
       st.cursor::json->>'reason'    AS reason,
       st.cursor::json->>'actorEmail' AS granted_by,
       st.cursor::json->'replaced'->>'subId'  AS replaced_sub,
       st.cursor::json->'replaced'->>'action' AS replaced_action,
       s.plan AS row_plan, s.status AS row_status, s.provider AS row_provider
FROM "SyncState" st LEFT JOIN "Subscription" s ON s."organizationId" = REPLACE(st.key, 'planGrant:', '')
WHERE st.key LIKE 'planGrant:%';

-- 4. Admin changes Stripe has not confirmed back (the syncing marks).
SELECT REPLACE(key, 'subSyncing:', '') AS "organizationId", cursor::json->>'since' AS since,
       cursor::json->>'subId' AS sub, cursor::json->>'note' AS note, cursor::json->>'by' AS by_
FROM "SyncState" WHERE key LIKE 'subSyncing:%';

-- 5. Mirror vs Stripe (status / plan). The mirror cannot see Stripe from SQL;
--    the comparison is the repair script's dry run (reads Stripe, prints per
--    organization) or /admin/users, where a row whose Stripe answer differs
--    says "Stripe says X · Y; this row says …". This lists what the mirror
--    claims for every Stripe-linked live row, to compare against the
--    Stripe export (Billing → Subscriptions → Export, column "Status", "Price").
SELECT o.name, s."externalSubId", s."stripePriceId", s.plan, s.status, s."currentPeriodEnd", s."trialEndsAt", s."canceledAt"
FROM "Subscription" s JOIN "Organization" o ON o.id = s."organizationId"
WHERE s.provider = 'STRIPE' AND s."externalSubId" IS NOT NULL
ORDER BY o.name;

-- 6. The activity trail the editor writes (what changed, who, why — reason in meta).
SELECT a."createdAt", o.name, a.summary, a.meta
FROM "ActivityEvent" a JOIN "Organization" o ON o.id = a."organizationId"
WHERE a.kind = 'PLAN_CHANGE'
ORDER BY a."createdAt" DESC
LIMIT 100;
