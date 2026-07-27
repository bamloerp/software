ALTER TABLE "ScheduleItem"
ADD COLUMN "stage" TEXT,
ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "scheduleId" ORDER BY "createdAt", "id") - 1 AS row_number
  FROM "ScheduleItem"
)
UPDATE "ScheduleItem"
SET "position" = ordered.row_number
FROM ordered
WHERE "ScheduleItem"."id" = ordered."id";
