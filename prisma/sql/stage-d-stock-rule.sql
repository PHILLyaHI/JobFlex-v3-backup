-- STAGE D (2026-09-30) — "job or stock", production (Postgres/Neon).
-- Apply AFTER prisma/sql/stage-a-crew-days.sql and BEFORE pushing the code.
-- Only relaxes one NOT NULL and adds columns; existing rows read as they did:
-- every expense stays a receipt for its job (purpose JOB), every movement
-- without a price reads the item's lastCost, as the job page always did.
BEGIN;

-- A purchase FOR STOCK has no job: the company's money and the warehouse's
-- value; a job pays for it only when the stock is issued to it.
ALTER TABLE "JobExpense" ALTER COLUMN "jobId" DROP NOT NULL;
ALTER TABLE "JobExpense"
  ADD COLUMN IF NOT EXISTS "purpose"     TEXT NOT NULL DEFAULT 'JOB',
  ADD COLUMN IF NOT EXISTS "stockItemId" TEXT,
  ADD COLUMN IF NOT EXISTS "stockQty"    DOUBLE PRECISION;

-- The price stock moved at, stamped on issue (PICKED) and return (RETURNED).
ALTER TABLE "InventoryMovement"
  ADD COLUMN IF NOT EXISTS "unitCost" DOUBLE PRECISION;

COMMIT;

-- Check after:
--   SELECT purpose, count(*) FROM "JobExpense" GROUP BY purpose;              -- all JOB
--   SELECT count(*) FROM "JobExpense" WHERE "jobId" IS NULL;                   -- 0
--   SELECT count(*) FROM "JobExpense" WHERE "organizationId" IS NULL;          -- 0 (stage A backfill)
--   SELECT count(*) FROM "InventoryMovement" WHERE "unitCost" IS NOT NULL;     -- 0 until the next issue
