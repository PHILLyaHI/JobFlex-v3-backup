-- Lead Center columns (2026-10-03): service radius, internal organizations,
-- test leads. Run on production (Neon Postgres) BEFORE deploying the commit that
-- adds them to prisma/schema.prisma — the Vercel build does not push the schema,
-- and the app reads these columns on every Organization / PlatformLead query.
-- Idempotent: safe to run twice.

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "serviceRadiusMiles" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "isInternal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlatformLead" ADD COLUMN IF NOT EXISTS "isTest" BOOLEAN NOT NULL DEFAULT false;
