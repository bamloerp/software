ALTER TABLE "QuoteLine"
ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "quoteId" ORDER BY "createdAt", "id") - 1 AS row_number
  FROM "QuoteLine"
)
UPDATE "QuoteLine"
SET "position" = ordered.row_number
FROM ordered
WHERE "QuoteLine"."id" = ordered."id";
