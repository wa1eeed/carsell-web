-- نقضُ قالب الفحص ومسودّاته.
-- والتقاريرُ الصادرة (`InspectionReport`) لا تُمَسّ: لقطتُها مستقلّة
-- عن هذه الجداول بقرار المالك — وذاك سببُ اللقطة.
DROP TABLE IF EXISTS "InspectionDraftPhoto";
DROP TABLE IF EXISTS "InspectionDraftPanel";
DROP TABLE IF EXISTS "InspectionDraftResult";
DROP TABLE IF EXISTS "InspectionDraft";
DROP TABLE IF EXISTS "InspectionItem";
DROP TABLE IF EXISTS "InspectionCategory";
DROP TABLE IF EXISTS "InspectionTemplate";
DROP TYPE IF EXISTS "InspectionDraftStatus";
DROP TYPE IF EXISTS "InspectionResultState";
DROP TYPE IF EXISTS "InspectionInputType";
