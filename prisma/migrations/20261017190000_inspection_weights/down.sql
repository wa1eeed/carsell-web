UPDATE "InspectionCategory" SET "weight" = 1 WHERE "key" IN ('body','engine','transmission','brakes');
UPDATE "InspectionTemplate" SET "version" = "version" - 1 WHERE "isActive" = true;
