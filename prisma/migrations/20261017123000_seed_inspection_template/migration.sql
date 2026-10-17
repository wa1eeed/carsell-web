-- ═══ قالبُ الفحص الافتراضيّ — ٢١٠ نقطة ═══
--
-- **والبياناتُ المرجعية تصل القاعدةَ الحيّة بترحيل لا ببذرة.** البذرة
-- تعمل على قاعدةٍ فارغة مرّةً واحدة، فصفٌّ يُضاف إلى الملفّ يصل بيئةً
-- جديدة ولا يصل بيئةً تعمل. وهذا يمرّ بلا أثرٍ على ما زُرع بالملفّ.

INSERT INTO "InspectionTemplate" ("id","name","version","isActive","createdAt")
VALUES ('tpl_default_v1', 'الفحص الشامل — ٢١٠ نقطة', 1, true, now())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "InspectionCategory" ("id","templateId","key","nameAr","nameEn","icon","weight","sort")
VALUES ('cat_engine_v1', 'tpl_default_v1', 'engine', 'المحرك', 'Engine', 'engine', 1, 0)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_000_v1', 'cat_engine_v1', 'engine_000', 'ضغط الأسطوانات', 'ضغط الأسطوانات', 'STATUS'::"InspectionInputType", NULL, false, 0)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_001_v1', 'cat_engine_v1', 'engine_001', 'تسريب زيت المحرك', 'تسريب زيت المحرك', 'STATUS'::"InspectionInputType", NULL, false, 1)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_002_v1', 'cat_engine_v1', 'engine_002', 'حالة سير التوقيت', 'حالة سير التوقيت', 'STATUS'::"InspectionInputType", NULL, false, 2)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_003_v1', 'cat_engine_v1', 'engine_003', 'صوت المحرك في السكون', 'صوت المحرك في السكون', 'STATUS'::"InspectionInputType", NULL, false, 3)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_004_v1', 'cat_engine_v1', 'engine_004', 'اهتزاز المحرك', 'اهتزاز المحرك', 'STATUS'::"InspectionInputType", NULL, false, 4)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_005_v1', 'cat_engine_v1', 'engine_005', 'مستوى زيت المحرك', 'مستوى زيت المحرك', 'STATUS'::"InspectionInputType", NULL, false, 5)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_006_v1', 'cat_engine_v1', 'engine_006', 'لون زيت المحرك', 'لون زيت المحرك', 'STATUS'::"InspectionInputType", NULL, false, 6)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_007_v1', 'cat_engine_v1', 'engine_007', 'فلتر الهواء', 'فلتر الهواء', 'STATUS'::"InspectionInputType", NULL, false, 7)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_008_v1', 'cat_engine_v1', 'engine_008', 'شمعات الإشعال', 'شمعات الإشعال', 'STATUS'::"InspectionInputType", NULL, false, 8)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_009_v1', 'cat_engine_v1', 'engine_009', 'كويلات الإشعال', 'كويلات الإشعال', 'STATUS'::"InspectionInputType", NULL, false, 9)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_010_v1', 'cat_engine_v1', 'engine_010', 'مضخة الوقود', 'مضخة الوقود', 'STATUS'::"InspectionInputType", NULL, false, 10)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_011_v1', 'cat_engine_v1', 'engine_011', 'حاقنات الوقود', 'حاقنات الوقود', 'STATUS'::"InspectionInputType", NULL, false, 11)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_012_v1', 'cat_engine_v1', 'engine_012', 'نظام التبريد', 'نظام التبريد', 'STATUS'::"InspectionInputType", NULL, false, 12)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_013_v1', 'cat_engine_v1', 'engine_013', 'مروحة الرديتر', 'مروحة الرديتر', 'STATUS'::"InspectionInputType", NULL, false, 13)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_014_v1', 'cat_engine_v1', 'engine_014', 'خرطوم الرديتر', 'خرطوم الرديتر', 'STATUS'::"InspectionInputType", NULL, false, 14)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_015_v1', 'cat_engine_v1', 'engine_015', 'غطاء الرديتر', 'غطاء الرديتر', 'STATUS'::"InspectionInputType", NULL, false, 15)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_016_v1', 'cat_engine_v1', 'engine_016', 'مستوى سائل التبريد', 'مستوى سائل التبريد', 'STATUS'::"InspectionInputType", NULL, false, 16)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_017_v1', 'cat_engine_v1', 'engine_017', 'حساس الأكسجين', 'حساس الأكسجين', 'STATUS'::"InspectionInputType", NULL, false, 17)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_018_v1', 'cat_engine_v1', 'engine_018', 'المشعّب الداخلي', 'المشعّب الداخلي', 'STATUS'::"InspectionInputType", NULL, false, 18)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_019_v1', 'cat_engine_v1', 'engine_019', 'المشعّب الخارجي', 'المشعّب الخارجي', 'STATUS'::"InspectionInputType", NULL, false, 19)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_020_v1', 'cat_engine_v1', 'engine_020', 'طرمبة الزيت', 'طرمبة الزيت', 'STATUS'::"InspectionInputType", NULL, false, 20)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_021_v1', 'cat_engine_v1', 'engine_021', 'صمام PCV', 'صمام PCV', 'STATUS'::"InspectionInputType", NULL, false, 21)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_022_v1', 'cat_engine_v1', 'engine_022', 'حزام المولّد', 'حزام المولّد', 'STATUS'::"InspectionInputType", NULL, false, 22)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_023_v1', 'cat_engine_v1', 'engine_023', 'المولّد', 'المولّد', 'STATUS'::"InspectionInputType", NULL, false, 23)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_024_v1', 'cat_engine_v1', 'engine_024', 'البادئ', 'البادئ', 'STATUS'::"InspectionInputType", NULL, false, 24)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_025_v1', 'cat_engine_v1', 'engine_025', 'دعامات المحرك', 'دعامات المحرك', 'STATUS'::"InspectionInputType", NULL, false, 25)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_026_v1', 'cat_engine_v1', 'engine_026', 'تسريب سائل التبريد', 'تسريب سائل التبريد', 'STATUS'::"InspectionInputType", NULL, false, 26)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_027_v1', 'cat_engine_v1', 'engine_027', 'مبادل حراري', 'مبادل حراري', 'STATUS'::"InspectionInputType", NULL, false, 27)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_028_v1', 'cat_engine_v1', 'engine_028', 'تايمنق تشين', 'تايمنق تشين', 'STATUS'::"InspectionInputType", NULL, false, 28)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_029_v1', 'cat_engine_v1', 'engine_029', 'صمامات المحرك', 'صمامات المحرك', 'STATUS'::"InspectionInputType", NULL, false, 29)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_030_v1', 'cat_engine_v1', 'engine_030', 'غطاء الصمامات', 'غطاء الصمامات', 'STATUS'::"InspectionInputType", NULL, false, 30)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_031_v1', 'cat_engine_v1', 'engine_031', 'كرتير الزيت', 'كرتير الزيت', 'STATUS'::"InspectionInputType", NULL, false, 31)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_032_v1', 'cat_engine_v1', 'engine_032', 'رأس المحرك', 'رأس المحرك', 'STATUS'::"InspectionInputType", NULL, false, 32)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_033_v1', 'cat_engine_v1', 'engine_033', 'بلوك المحرك', 'بلوك المحرك', 'STATUS'::"InspectionInputType", NULL, false, 33)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_engine_034_v1', 'cat_engine_v1', 'engine_034', 'توربو (إن وجد)', 'توربو (إن وجد)', 'STATUS'::"InspectionInputType", NULL, false, 34)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "InspectionCategory" ("id","templateId","key","nameAr","nameEn","icon","weight","sort")
VALUES ('cat_transmission_v1', 'tpl_default_v1', 'transmission', 'ناقل الحركة', 'Transmission', 'gearbox', 1, 1)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_000_v1', 'cat_transmission_v1', 'transmission_000', 'نعومة التعشيق', 'نعومة التعشيق', 'STATUS'::"InspectionInputType", NULL, false, 0)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_001_v1', 'cat_transmission_v1', 'transmission_001', 'اهتزاز عند التسارع', 'اهتزاز عند التسارع', 'STATUS'::"InspectionInputType", NULL, false, 1)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_002_v1', 'cat_transmission_v1', 'transmission_002', 'مستوى زيت الناقل', 'مستوى زيت الناقل', 'STATUS'::"InspectionInputType", NULL, false, 2)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_003_v1', 'cat_transmission_v1', 'transmission_003', 'لون زيت الناقل', 'لون زيت الناقل', 'STATUS'::"InspectionInputType", NULL, false, 3)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_004_v1', 'cat_transmission_v1', 'transmission_004', 'تسريب من الناقل', 'تسريب من الناقل', 'STATUS'::"InspectionInputType", NULL, false, 4)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_005_v1', 'cat_transmission_v1', 'transmission_005', 'دعامات الناقل', 'دعامات الناقل', 'STATUS'::"InspectionInputType", NULL, false, 5)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_006_v1', 'cat_transmission_v1', 'transmission_006', 'محوّل العزم', 'محوّل العزم', 'STATUS'::"InspectionInputType", NULL, false, 6)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_007_v1', 'cat_transmission_v1', 'transmission_007', 'عمود الإدارة', 'عمود الإدارة', 'STATUS'::"InspectionInputType", NULL, false, 7)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_008_v1', 'cat_transmission_v1', 'transmission_008', 'المفاصل الكروية', 'المفاصل الكروية', 'STATUS'::"InspectionInputType", NULL, false, 8)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_009_v1', 'cat_transmission_v1', 'transmission_009', 'جلود المفاصل', 'جلود المفاصل', 'STATUS'::"InspectionInputType", NULL, false, 9)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_010_v1', 'cat_transmission_v1', 'transmission_010', 'الديفرنشال الأمامي', 'الديفرنشال الأمامي', 'STATUS'::"InspectionInputType", NULL, false, 10)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_011_v1', 'cat_transmission_v1', 'transmission_011', 'الديفرنشال الخلفي', 'الديفرنشال الخلفي', 'STATUS'::"InspectionInputType", NULL, false, 11)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_012_v1', 'cat_transmission_v1', 'transmission_012', 'القير في وضع D', 'القير في وضع D', 'STATUS'::"InspectionInputType", NULL, false, 12)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_013_v1', 'cat_transmission_v1', 'transmission_013', 'القير في وضع R', 'القير في وضع R', 'STATUS'::"InspectionInputType", NULL, false, 13)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_014_v1', 'cat_transmission_v1', 'transmission_014', 'التعشيق التلقائي', 'التعشيق التلقائي', 'STATUS'::"InspectionInputType", NULL, false, 14)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_015_v1', 'cat_transmission_v1', 'transmission_015', 'صوت غير طبيعي', 'صوت غير طبيعي', 'STATUS'::"InspectionInputType", NULL, false, 15)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_016_v1', 'cat_transmission_v1', 'transmission_016', 'حساس السرعة', 'حساس السرعة', 'STATUS'::"InspectionInputType", NULL, false, 16)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_017_v1', 'cat_transmission_v1', 'transmission_017', 'كلتش (إن وجد)', 'كلتش (إن وجد)', 'STATUS'::"InspectionInputType", NULL, false, 17)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_018_v1', 'cat_transmission_v1', 'transmission_018', 'نظام الدفع الرباعي', 'نظام الدفع الرباعي', 'STATUS'::"InspectionInputType", NULL, false, 18)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_019_v1', 'cat_transmission_v1', 'transmission_019', 'علبة التوزيع', 'علبة التوزيع', 'STATUS'::"InspectionInputType", NULL, false, 19)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_020_v1', 'cat_transmission_v1', 'transmission_020', 'زيت الديفرنشال', 'زيت الديفرنشال', 'STATUS'::"InspectionInputType", NULL, false, 20)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_021_v1', 'cat_transmission_v1', 'transmission_021', 'تسريب من الديفرنشال', 'تسريب من الديفرنشال', 'STATUS'::"InspectionInputType", NULL, false, 21)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_022_v1', 'cat_transmission_v1', 'transmission_022', 'اهتزاز عند السرعة العالية', 'اهتزاز عند السرعة العالية', 'STATUS'::"InspectionInputType", NULL, false, 22)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_023_v1', 'cat_transmission_v1', 'transmission_023', 'تفاعل الناقل مع الفرملة', 'تفاعل الناقل مع الفرملة', 'STATUS'::"InspectionInputType", NULL, false, 23)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_transmission_024_v1', 'cat_transmission_v1', 'transmission_024', 'برمجة وحدة الناقل', 'برمجة وحدة الناقل', 'STATUS'::"InspectionInputType", NULL, false, 24)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "InspectionCategory" ("id","templateId","key","nameAr","nameEn","icon","weight","sort")
VALUES ('cat_brakes_v1', 'tpl_default_v1', 'brakes', 'نظام الفرامل والتعليق', 'Brakes and suspension', 'brakes', 1, 2)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_000_v1', 'cat_brakes_v1', 'brakes_000', 'سماكة الأقراص الأمامية', 'سماكة الأقراص الأمامية', 'STATUS'::"InspectionInputType", NULL, false, 0)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_001_v1', 'cat_brakes_v1', 'brakes_001', 'سماكة الأقراص الخلفية', 'سماكة الأقراص الخلفية', 'STATUS'::"InspectionInputType", NULL, false, 1)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_002_v1', 'cat_brakes_v1', 'brakes_002', 'الفحمات الأمامية', 'الفحمات الأمامية', 'STATUS'::"InspectionInputType", NULL, false, 2)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_003_v1', 'cat_brakes_v1', 'brakes_003', 'الفحمات الخلفية', 'الفحمات الخلفية', 'STATUS'::"InspectionInputType", NULL, false, 3)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_004_v1', 'cat_brakes_v1', 'brakes_004', 'تشقّق الأقراص', 'تشقّق الأقراص', 'STATUS'::"InspectionInputType", NULL, false, 4)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_005_v1', 'cat_brakes_v1', 'brakes_005', 'مستوى زيت الفرامل', 'مستوى زيت الفرامل', 'STATUS'::"InspectionInputType", NULL, false, 5)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_006_v1', 'cat_brakes_v1', 'brakes_006', 'لون زيت الفرامل', 'لون زيت الفرامل', 'STATUS'::"InspectionInputType", NULL, false, 6)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_007_v1', 'cat_brakes_v1', 'brakes_007', 'خراطيم الفرامل', 'خراطيم الفرامل', 'STATUS'::"InspectionInputType", NULL, false, 7)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_008_v1', 'cat_brakes_v1', 'brakes_008', 'مضخة الفرامل الرئيسية', 'مضخة الفرامل الرئيسية', 'STATUS'::"InspectionInputType", NULL, false, 8)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_009_v1', 'cat_brakes_v1', 'brakes_009', 'بوستر الفرامل', 'بوستر الفرامل', 'STATUS'::"InspectionInputType", NULL, false, 9)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_010_v1', 'cat_brakes_v1', 'brakes_010', 'فرملة اليد', 'فرملة اليد', 'STATUS'::"InspectionInputType", NULL, false, 10)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_011_v1', 'cat_brakes_v1', 'brakes_011', 'نظام ABS', 'نظام ABS', 'STATUS'::"InspectionInputType", NULL, false, 11)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_012_v1', 'cat_brakes_v1', 'brakes_012', 'نظام الثبات ESP', 'نظام الثبات ESP', 'STATUS'::"InspectionInputType", NULL, false, 12)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_013_v1', 'cat_brakes_v1', 'brakes_013', 'مساعد أمامي أيمن', 'مساعد أمامي أيمن', 'STATUS'::"InspectionInputType", NULL, false, 13)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_014_v1', 'cat_brakes_v1', 'brakes_014', 'مساعد أمامي أيسر', 'مساعد أمامي أيسر', 'STATUS'::"InspectionInputType", NULL, false, 14)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_015_v1', 'cat_brakes_v1', 'brakes_015', 'مساعد خلفي أيمن', 'مساعد خلفي أيمن', 'STATUS'::"InspectionInputType", NULL, false, 15)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_016_v1', 'cat_brakes_v1', 'brakes_016', 'مساعد خلفي أيسر', 'مساعد خلفي أيسر', 'STATUS'::"InspectionInputType", NULL, false, 16)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_017_v1', 'cat_brakes_v1', 'brakes_017', 'سوست التعليق', 'سوست التعليق', 'STATUS'::"InspectionInputType", NULL, false, 17)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_018_v1', 'cat_brakes_v1', 'brakes_018', 'مقصّات التعليق', 'مقصّات التعليق', 'STATUS'::"InspectionInputType", NULL, false, 18)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_019_v1', 'cat_brakes_v1', 'brakes_019', 'بيادات المقصّات', 'بيادات المقصّات', 'STATUS'::"InspectionInputType", NULL, false, 19)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_020_v1', 'cat_brakes_v1', 'brakes_020', 'عمود المقود', 'عمود المقود', 'STATUS'::"InspectionInputType", NULL, false, 20)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_021_v1', 'cat_brakes_v1', 'brakes_021', 'مضخة الدركسون', 'مضخة الدركسون', 'STATUS'::"InspectionInputType", NULL, false, 21)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_022_v1', 'cat_brakes_v1', 'brakes_022', 'تسريب من الدركسون', 'تسريب من الدركسون', 'STATUS'::"InspectionInputType", NULL, false, 22)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_023_v1', 'cat_brakes_v1', 'brakes_023', 'زوايا الاتجاه', 'زوايا الاتجاه', 'STATUS'::"InspectionInputType", NULL, false, 23)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_024_v1', 'cat_brakes_v1', 'brakes_024', 'اهتزاز المقود', 'اهتزاز المقود', 'STATUS'::"InspectionInputType", NULL, false, 24)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_025_v1', 'cat_brakes_v1', 'brakes_025', 'ركبة العجل', 'ركبة العجل', 'STATUS'::"InspectionInputType", NULL, false, 25)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_026_v1', 'cat_brakes_v1', 'brakes_026', 'رمانات العجلات', 'رمانات العجلات', 'STATUS'::"InspectionInputType", NULL, false, 26)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_027_v1', 'cat_brakes_v1', 'brakes_027', 'المثبّتات الأمامية', 'المثبّتات الأمامية', 'STATUS'::"InspectionInputType", NULL, false, 27)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_028_v1', 'cat_brakes_v1', 'brakes_028', 'المثبّتات الخلفية', 'المثبّتات الخلفية', 'STATUS'::"InspectionInputType", NULL, false, 28)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_brakes_029_v1', 'cat_brakes_v1', 'brakes_029', 'حساسات ABS', 'حساسات ABS', 'STATUS'::"InspectionInputType", NULL, false, 29)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "InspectionCategory" ("id","templateId","key","nameAr","nameEn","icon","weight","sort")
VALUES ('cat_tyres_v1', 'tpl_default_v1', 'tyres', 'الإطارات والعجلات', 'Tyres and wheels', 'tyre', 1, 3)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_tyres_000_v1', 'cat_tyres_v1', 'tyres_000', 'عمق نقشة الإطار الأمامي الأيمن', 'عمق نقشة الإطار الأمامي الأيمن', 'STATUS'::"InspectionInputType", NULL, false, 0)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_tyres_001_v1', 'cat_tyres_v1', 'tyres_001', 'عمق نقشة الإطار الأمامي الأيسر', 'عمق نقشة الإطار الأمامي الأيسر', 'STATUS'::"InspectionInputType", NULL, false, 1)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_tyres_002_v1', 'cat_tyres_v1', 'tyres_002', 'عمق نقشة الإطار الخلفي الأيمن', 'عمق نقشة الإطار الخلفي الأيمن', 'STATUS'::"InspectionInputType", NULL, false, 2)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_tyres_003_v1', 'cat_tyres_v1', 'tyres_003', 'عمق نقشة الإطار الخلفي الأيسر', 'عمق نقشة الإطار الخلفي الأيسر', 'STATUS'::"InspectionInputType", NULL, false, 3)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_tyres_004_v1', 'cat_tyres_v1', 'tyres_004', 'تاريخ صناعة الإطارات', 'تاريخ صناعة الإطارات', 'STATUS'::"InspectionInputType", NULL, false, 4)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_tyres_005_v1', 'cat_tyres_v1', 'tyres_005', 'تشقّق جوانب الإطارات', 'تشقّق جوانب الإطارات', 'STATUS'::"InspectionInputType", NULL, false, 5)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_tyres_006_v1', 'cat_tyres_v1', 'tyres_006', 'انتظام تآكل الإطارات', 'انتظام تآكل الإطارات', 'STATUS'::"InspectionInputType", NULL, false, 6)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_tyres_007_v1', 'cat_tyres_v1', 'tyres_007', 'ضغط الإطارات', 'ضغط الإطارات', 'STATUS'::"InspectionInputType", NULL, false, 7)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_tyres_008_v1', 'cat_tyres_v1', 'tyres_008', 'الإطار الاحتياطي', 'الإطار الاحتياطي', 'STATUS'::"InspectionInputType", NULL, false, 8)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_tyres_009_v1', 'cat_tyres_v1', 'tyres_009', 'عدّة تغيير الإطار', 'عدّة تغيير الإطار', 'STATUS'::"InspectionInputType", NULL, false, 9)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_tyres_010_v1', 'cat_tyres_v1', 'tyres_010', 'حالة الجنوط', 'حالة الجنوط', 'STATUS'::"InspectionInputType", NULL, false, 10)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_tyres_011_v1', 'cat_tyres_v1', 'tyres_011', 'اعوجاج الجنوط', 'اعوجاج الجنوط', 'STATUS'::"InspectionInputType", NULL, false, 11)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_tyres_012_v1', 'cat_tyres_v1', 'tyres_012', 'صواميل العجلات', 'صواميل العجلات', 'STATUS'::"InspectionInputType", NULL, false, 12)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_tyres_013_v1', 'cat_tyres_v1', 'tyres_013', 'حساسات ضغط الإطارات', 'حساسات ضغط الإطارات', 'STATUS'::"InspectionInputType", NULL, false, 13)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_tyres_014_v1', 'cat_tyres_v1', 'tyres_014', 'توازن العجلات', 'توازن العجلات', 'STATUS'::"InspectionInputType", NULL, false, 14)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "InspectionCategory" ("id","templateId","key","nameAr","nameEn","icon","weight","sort")
VALUES ('cat_body_v1', 'tpl_default_v1', 'body', 'الهيكل والصبغ', 'Body and paint', 'chassis', 1, 4)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_000_v1', 'cat_body_v1', 'body_000', 'سماكة طلاء غطاء المحرك', 'سماكة طلاء غطاء المحرك', 'NUMBER'::"InspectionInputType", 'ميكرون', false, 0)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_001_v1', 'cat_body_v1', 'body_001', 'سماكة طلاء السقف', 'سماكة طلاء السقف', 'NUMBER'::"InspectionInputType", 'ميكرون', false, 1)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_002_v1', 'cat_body_v1', 'body_002', 'سماكة طلاء غطاء الصندوق', 'سماكة طلاء غطاء الصندوق', 'NUMBER'::"InspectionInputType", 'ميكرون', false, 2)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_003_v1', 'cat_body_v1', 'body_003', 'سماكة طلاء المصد الأمامي', 'سماكة طلاء المصد الأمامي', 'NUMBER'::"InspectionInputType", 'ميكرون', false, 3)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_004_v1', 'cat_body_v1', 'body_004', 'سماكة طلاء المصد الخلفي', 'سماكة طلاء المصد الخلفي', 'NUMBER'::"InspectionInputType", 'ميكرون', false, 4)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_005_v1', 'cat_body_v1', 'body_005', 'سماكة طلاء الرفرف الأمامي الأيمن', 'سماكة طلاء الرفرف الأمامي الأيمن', 'NUMBER'::"InspectionInputType", 'ميكرون', false, 5)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_006_v1', 'cat_body_v1', 'body_006', 'سماكة طلاء الرفرف الأمامي الأيسر', 'سماكة طلاء الرفرف الأمامي الأيسر', 'NUMBER'::"InspectionInputType", 'ميكرون', false, 6)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_007_v1', 'cat_body_v1', 'body_007', 'سماكة طلاء الباب الأمامي الأيمن', 'سماكة طلاء الباب الأمامي الأيمن', 'NUMBER'::"InspectionInputType", 'ميكرون', false, 7)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_008_v1', 'cat_body_v1', 'body_008', 'سماكة طلاء الباب الأمامي الأيسر', 'سماكة طلاء الباب الأمامي الأيسر', 'NUMBER'::"InspectionInputType", 'ميكرون', false, 8)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_009_v1', 'cat_body_v1', 'body_009', 'سماكة طلاء الباب الخلفي الأيمن', 'سماكة طلاء الباب الخلفي الأيمن', 'NUMBER'::"InspectionInputType", 'ميكرون', false, 9)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_010_v1', 'cat_body_v1', 'body_010', 'سماكة طلاء الباب الخلفي الأيسر', 'سماكة طلاء الباب الخلفي الأيسر', 'NUMBER'::"InspectionInputType", 'ميكرون', false, 10)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_011_v1', 'cat_body_v1', 'body_011', 'آثار لحام في الشاسيه', 'آثار لحام في الشاسيه', 'STATUS'::"InspectionInputType", NULL, true, 11)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_012_v1', 'cat_body_v1', 'body_012', 'استقامة الهيكل الأمامي', 'استقامة الهيكل الأمامي', 'STATUS'::"InspectionInputType", NULL, true, 12)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_013_v1', 'cat_body_v1', 'body_013', 'استقامة الهيكل الخلفي', 'استقامة الهيكل الخلفي', 'STATUS'::"InspectionInputType", NULL, true, 13)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_014_v1', 'cat_body_v1', 'body_014', 'أعمدة الهيكل A', 'أعمدة الهيكل A', 'STATUS'::"InspectionInputType", NULL, true, 14)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_015_v1', 'cat_body_v1', 'body_015', 'أعمدة الهيكل B', 'أعمدة الهيكل B', 'STATUS'::"InspectionInputType", NULL, true, 15)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_016_v1', 'cat_body_v1', 'body_016', 'أعمدة الهيكل C', 'أعمدة الهيكل C', 'STATUS'::"InspectionInputType", NULL, true, 16)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_017_v1', 'cat_body_v1', 'body_017', 'أرضية المقصورة', 'أرضية المقصورة', 'STATUS'::"InspectionInputType", NULL, false, 17)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_018_v1', 'cat_body_v1', 'body_018', 'حوض الإطار الاحتياطي', 'حوض الإطار الاحتياطي', 'STATUS'::"InspectionInputType", NULL, false, 18)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_019_v1', 'cat_body_v1', 'body_019', 'براغي المفصلات', 'براغي المفصلات', 'STATUS'::"InspectionInputType", NULL, false, 19)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_020_v1', 'cat_body_v1', 'body_020', 'محاذاة الأبواب', 'محاذاة الأبواب', 'STATUS'::"InspectionInputType", NULL, false, 20)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_021_v1', 'cat_body_v1', 'body_021', 'محاذاة غطاء المحرك', 'محاذاة غطاء المحرك', 'STATUS'::"InspectionInputType", NULL, false, 21)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_022_v1', 'cat_body_v1', 'body_022', 'محاذاة غطاء الصندوق', 'محاذاة غطاء الصندوق', 'STATUS'::"InspectionInputType", NULL, false, 22)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_023_v1', 'cat_body_v1', 'body_023', 'تشقّق الزجاج الأمامي', 'تشقّق الزجاج الأمامي', 'STATUS'::"InspectionInputType", NULL, false, 23)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_024_v1', 'cat_body_v1', 'body_024', 'الزجاج الجانبي', 'الزجاج الجانبي', 'STATUS'::"InspectionInputType", NULL, false, 24)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_025_v1', 'cat_body_v1', 'body_025', 'الزجاج الخلفي', 'الزجاج الخلفي', 'STATUS'::"InspectionInputType", NULL, false, 25)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_026_v1', 'cat_body_v1', 'body_026', 'المرايا الجانبية', 'المرايا الجانبية', 'STATUS'::"InspectionInputType", NULL, false, 26)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_027_v1', 'cat_body_v1', 'body_027', 'الأنوار الأمامية', 'الأنوار الأمامية', 'STATUS'::"InspectionInputType", NULL, false, 27)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_028_v1', 'cat_body_v1', 'body_028', 'الأنوار الخلفية', 'الأنوار الخلفية', 'STATUS'::"InspectionInputType", NULL, false, 28)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_029_v1', 'cat_body_v1', 'body_029', 'أنوار الضباب', 'أنوار الضباب', 'STATUS'::"InspectionInputType", NULL, false, 29)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_030_v1', 'cat_body_v1', 'body_030', 'حالة الصدأ', 'حالة الصدأ', 'STATUS'::"InspectionInputType", NULL, false, 30)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_031_v1', 'cat_body_v1', 'body_031', 'بيت المحرك', 'بيت المحرك', 'STATUS'::"InspectionInputType", NULL, false, 31)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_032_v1', 'cat_body_v1', 'body_032', 'الشنطة الداخلية', 'الشنطة الداخلية', 'STATUS'::"InspectionInputType", NULL, false, 32)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_033_v1', 'cat_body_v1', 'body_033', 'الجلدة السفلية', 'الجلدة السفلية', 'STATUS'::"InspectionInputType", NULL, false, 33)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_034_v1', 'cat_body_v1', 'body_034', 'مانع تسريب الأبواب', 'مانع تسريب الأبواب', 'STATUS'::"InspectionInputType", NULL, false, 34)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_035_v1', 'cat_body_v1', 'body_035', 'حالة الشمعات المطاطية', 'حالة الشمعات المطاطية', 'STATUS'::"InspectionInputType", NULL, false, 35)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_036_v1', 'cat_body_v1', 'body_036', 'نظافة العلبة', 'نظافة العلبة', 'STATUS'::"InspectionInputType", NULL, false, 36)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_037_v1', 'cat_body_v1', 'body_037', 'لون الطلاء الأصلي', 'لون الطلاء الأصلي', 'STATUS'::"InspectionInputType", NULL, false, 37)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_038_v1', 'cat_body_v1', 'body_038', 'حواف الأبواب', 'حواف الأبواب', 'STATUS'::"InspectionInputType", NULL, false, 38)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_body_039_v1', 'cat_body_v1', 'body_039', 'المكينة الخارجية', 'المكينة الخارجية', 'STATUS'::"InspectionInputType", NULL, false, 39)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "InspectionCategory" ("id","templateId","key","nameAr","nameEn","icon","weight","sort")
VALUES ('cat_electric_v1', 'tpl_default_v1', 'electric', 'الكهرباء والمقصورة', 'Electrical and interior', 'electric', 1, 5)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_000_v1', 'cat_electric_v1', 'electric_000', 'البطارية — الجهد', 'البطارية — الجهد', 'STATUS'::"InspectionInputType", NULL, false, 0)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_001_v1', 'cat_electric_v1', 'electric_001', 'البطارية — تاريخ الإنتاج', 'البطارية — تاريخ الإنتاج', 'STATUS'::"InspectionInputType", NULL, false, 1)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_002_v1', 'cat_electric_v1', 'electric_002', 'أطراف البطارية', 'أطراف البطارية', 'STATUS'::"InspectionInputType", NULL, false, 2)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_003_v1', 'cat_electric_v1', 'electric_003', 'شاشة العدادات', 'شاشة العدادات', 'STATUS'::"InspectionInputType", NULL, false, 3)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_004_v1', 'cat_electric_v1', 'electric_004', 'لمبات التحذير', 'لمبات التحذير', 'STATUS'::"InspectionInputType", NULL, false, 4)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_005_v1', 'cat_electric_v1', 'electric_005', 'المكيّف — التبريد', 'المكيّف — التبريد', 'STATUS'::"InspectionInputType", NULL, false, 5)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_006_v1', 'cat_electric_v1', 'electric_006', 'المكيّف — المروحة', 'المكيّف — المروحة', 'STATUS'::"InspectionInputType", NULL, false, 6)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_007_v1', 'cat_electric_v1', 'electric_007', 'غاز المكيّف', 'غاز المكيّف', 'STATUS'::"InspectionInputType", NULL, false, 7)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_008_v1', 'cat_electric_v1', 'electric_008', 'التدفئة', 'التدفئة', 'STATUS'::"InspectionInputType", NULL, false, 8)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_009_v1', 'cat_electric_v1', 'electric_009', 'نظام الصوت', 'نظام الصوت', 'STATUS'::"InspectionInputType", NULL, false, 9)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_010_v1', 'cat_electric_v1', 'electric_010', 'مكبّرات الصوت', 'مكبّرات الصوت', 'STATUS'::"InspectionInputType", NULL, false, 10)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_011_v1', 'cat_electric_v1', 'electric_011', 'الشاشة المركزية', 'الشاشة المركزية', 'STATUS'::"InspectionInputType", NULL, false, 11)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_012_v1', 'cat_electric_v1', 'electric_012', 'CarPlay/Android Auto', 'CarPlay/Android Auto', 'STATUS'::"InspectionInputType", NULL, false, 12)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_013_v1', 'cat_electric_v1', 'electric_013', 'كاميرا خلفية', 'كاميرا خلفية', 'STATUS'::"InspectionInputType", NULL, false, 13)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_014_v1', 'cat_electric_v1', 'electric_014', 'كاميرا ٣٦٠', 'كاميرا ٣٦٠', 'STATUS'::"InspectionInputType", NULL, false, 14)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_015_v1', 'cat_electric_v1', 'electric_015', 'حساسات الركن الأمامية', 'حساسات الركن الأمامية', 'STATUS'::"InspectionInputType", NULL, false, 15)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_016_v1', 'cat_electric_v1', 'electric_016', 'حساسات الركن الخلفية', 'حساسات الركن الخلفية', 'STATUS'::"InspectionInputType", NULL, false, 16)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_017_v1', 'cat_electric_v1', 'electric_017', 'مثبت السرعة', 'مثبت السرعة', 'STATUS'::"InspectionInputType", NULL, false, 17)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_018_v1', 'cat_electric_v1', 'electric_018', 'مثبت السرعة التكيّفي', 'مثبت السرعة التكيّفي', 'STATUS'::"InspectionInputType", NULL, false, 18)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_019_v1', 'cat_electric_v1', 'electric_019', 'تنبيه المسار', 'تنبيه المسار', 'STATUS'::"InspectionInputType", NULL, false, 19)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_020_v1', 'cat_electric_v1', 'electric_020', 'حساس النقطة العمياء', 'حساس النقطة العمياء', 'STATUS'::"InspectionInputType", NULL, false, 20)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_021_v1', 'cat_electric_v1', 'electric_021', 'نظام الوسائد الهوائية', 'نظام الوسائد الهوائية', 'STATUS'::"InspectionInputType", NULL, true, 21)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_022_v1', 'cat_electric_v1', 'electric_022', 'أحزمة الأمان الأمامية', 'أحزمة الأمان الأمامية', 'STATUS'::"InspectionInputType", NULL, false, 22)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_023_v1', 'cat_electric_v1', 'electric_023', 'أحزمة الأمان الخلفية', 'أحزمة الأمان الخلفية', 'STATUS'::"InspectionInputType", NULL, false, 23)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_024_v1', 'cat_electric_v1', 'electric_024', 'أقفال الأبواب', 'أقفال الأبواب', 'STATUS'::"InspectionInputType", NULL, false, 24)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_025_v1', 'cat_electric_v1', 'electric_025', 'زجاج كهربائي أمامي أيمن', 'زجاج كهربائي أمامي أيمن', 'STATUS'::"InspectionInputType", NULL, false, 25)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_026_v1', 'cat_electric_v1', 'electric_026', 'زجاج كهربائي أمامي أيسر', 'زجاج كهربائي أمامي أيسر', 'STATUS'::"InspectionInputType", NULL, false, 26)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_027_v1', 'cat_electric_v1', 'electric_027', 'زجاج كهربائي خلفي أيمن', 'زجاج كهربائي خلفي أيمن', 'STATUS'::"InspectionInputType", NULL, false, 27)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_028_v1', 'cat_electric_v1', 'electric_028', 'زجاج كهربائي خلفي أيسر', 'زجاج كهربائي خلفي أيسر', 'STATUS'::"InspectionInputType", NULL, false, 28)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_029_v1', 'cat_electric_v1', 'electric_029', 'فتحة السقف', 'فتحة السقف', 'STATUS'::"InspectionInputType", NULL, false, 29)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_030_v1', 'cat_electric_v1', 'electric_030', 'المقاعد الكهربائية', 'المقاعد الكهربائية', 'STATUS'::"InspectionInputType", NULL, false, 30)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_031_v1', 'cat_electric_v1', 'electric_031', 'تدفئة المقاعد', 'تدفئة المقاعد', 'STATUS'::"InspectionInputType", NULL, false, 31)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_032_v1', 'cat_electric_v1', 'electric_032', 'تبريد المقاعد', 'تبريد المقاعد', 'STATUS'::"InspectionInputType", NULL, false, 32)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_033_v1', 'cat_electric_v1', 'electric_033', 'حالة الفرش', 'حالة الفرش', 'STATUS'::"InspectionInputType", NULL, false, 33)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_034_v1', 'cat_electric_v1', 'electric_034', 'حالة الطبلون', 'حالة الطبلون', 'STATUS'::"InspectionInputType", NULL, false, 34)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_035_v1', 'cat_electric_v1', 'electric_035', 'حالة السقف الداخلي', 'حالة السقف الداخلي', 'STATUS'::"InspectionInputType", NULL, false, 35)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_036_v1', 'cat_electric_v1', 'electric_036', 'إضاءة المقصورة', 'إضاءة المقصورة', 'STATUS'::"InspectionInputType", NULL, false, 36)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_037_v1', 'cat_electric_v1', 'electric_037', 'المساحات', 'المساحات', 'STATUS'::"InspectionInputType", NULL, false, 37)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_038_v1', 'cat_electric_v1', 'electric_038', 'بخّاخ الماء', 'بخّاخ الماء', 'STATUS'::"InspectionInputType", NULL, false, 38)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_039_v1', 'cat_electric_v1', 'electric_039', 'القفل المركزي', 'القفل المركزي', 'STATUS'::"InspectionInputType", NULL, false, 39)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_040_v1', 'cat_electric_v1', 'electric_040', 'الريموت', 'الريموت', 'STATUS'::"InspectionInputType", NULL, false, 40)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_041_v1', 'cat_electric_v1', 'electric_041', 'المفتاح الاحتياطي', 'المفتاح الاحتياطي', 'STATUS'::"InspectionInputType", NULL, false, 41)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_042_v1', 'cat_electric_v1', 'electric_042', 'منافذ الشحن', 'منافذ الشحن', 'STATUS'::"InspectionInputType", NULL, false, 42)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_043_v1', 'cat_electric_v1', 'electric_043', 'الشحن اللاسلكي', 'الشحن اللاسلكي', 'STATUS'::"InspectionInputType", NULL, false, 43)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_044_v1', 'cat_electric_v1', 'electric_044', 'نظام التتبّع', 'نظام التتبّع', 'STATUS'::"InspectionInputType", NULL, false, 44)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_045_v1', 'cat_electric_v1', 'electric_045', 'مقبس OBD', 'مقبس OBD', 'STATUS'::"InspectionInputType", NULL, false, 45)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_046_v1', 'cat_electric_v1', 'electric_046', 'أسلاك التمديدات', 'أسلاك التمديدات', 'STATUS'::"InspectionInputType", NULL, false, 46)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_047_v1', 'cat_electric_v1', 'electric_047', 'الفيوزات', 'الفيوزات', 'STATUS'::"InspectionInputType", NULL, false, 47)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_048_v1', 'cat_electric_v1', 'electric_048', 'صافرة التنبيه', 'صافرة التنبيه', 'STATUS'::"InspectionInputType", NULL, false, 48)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_049_v1', 'cat_electric_v1', 'electric_049', 'إنذار السيارة', 'إنذار السيارة', 'STATUS'::"InspectionInputType", NULL, false, 49)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_050_v1', 'cat_electric_v1', 'electric_050', 'أضواء الإشارة', 'أضواء الإشارة', 'STATUS'::"InspectionInputType", NULL, false, 50)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_051_v1', 'cat_electric_v1', 'electric_051', 'أضواء الفرامل', 'أضواء الفرامل', 'STATUS'::"InspectionInputType", NULL, false, 51)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_052_v1', 'cat_electric_v1', 'electric_052', 'ضوء الرجوع', 'ضوء الرجوع', 'STATUS'::"InspectionInputType", NULL, false, 52)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_053_v1', 'cat_electric_v1', 'electric_053', 'الشاحن الكهربائي (إن وجد)', 'الشاحن الكهربائي (إن وجد)', 'STATUS'::"InspectionInputType", NULL, false, 53)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_054_v1', 'cat_electric_v1', 'electric_054', 'تحديث برمجيات النظام', 'تحديث برمجيات النظام', 'STATUS'::"InspectionInputType", NULL, false, 54)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_055_v1', 'cat_electric_v1', 'electric_055', 'أزرار المقود', 'أزرار المقود', 'STATUS'::"InspectionInputType", NULL, false, 55)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_056_v1', 'cat_electric_v1', 'electric_056', 'مرآة التعتيم التلقائي', 'مرآة التعتيم التلقائي', 'STATUS'::"InspectionInputType", NULL, false, 56)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_057_v1', 'cat_electric_v1', 'electric_057', 'حساس المطر', 'حساس المطر', 'STATUS'::"InspectionInputType", NULL, false, 57)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_058_v1', 'cat_electric_v1', 'electric_058', 'حساس الإضاءة', 'حساس الإضاءة', 'STATUS'::"InspectionInputType", NULL, false, 58)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_059_v1', 'cat_electric_v1', 'electric_059', 'بلوتوث', 'بلوتوث', 'STATUS'::"InspectionInputType", NULL, false, 59)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_060_v1', 'cat_electric_v1', 'electric_060', 'مأخذ ١٢ فولت', 'مأخذ ١٢ فولت', 'STATUS'::"InspectionInputType", NULL, false, 60)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_061_v1', 'cat_electric_v1', 'electric_061', 'الساعة والتقويم', 'الساعة والتقويم', 'STATUS'::"InspectionInputType", NULL, false, 61)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_062_v1', 'cat_electric_v1', 'electric_062', 'إعدادات القيادة', 'إعدادات القيادة', 'STATUS'::"InspectionInputType", NULL, false, 62)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_063_v1', 'cat_electric_v1', 'electric_063', 'تنبيه الاصطدام الأمامي', 'تنبيه الاصطدام الأمامي', 'STATUS'::"InspectionInputType", NULL, false, 63)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "InspectionItem" ("id","categoryId","key","nameAr","nameEn","inputType","unit","isCritical","sort")
VALUES ('itm_electric_064_v1', 'cat_electric_v1', 'electric_064', 'الفرملة الطارئة التلقائية', 'الفرملة الطارئة التلقائية', 'STATUS'::"InspectionInputType", NULL, false, 64)
ON CONFLICT ("id") DO NOTHING;
