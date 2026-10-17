-- والحذفُ بالتسلسل: البنودُ ثمّ الأقسام ثمّ القالب.
DELETE FROM "InspectionItem" WHERE "categoryId" IN (SELECT "id" FROM "InspectionCategory" WHERE "templateId" = 'tpl_default_v1');
DELETE FROM "InspectionCategory" WHERE "templateId" = 'tpl_default_v1';
DELETE FROM "InspectionTemplate" WHERE "id" = 'tpl_default_v1';
