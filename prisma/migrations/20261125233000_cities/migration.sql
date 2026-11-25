-- ١ · جدول المدن

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "City_nameAr_key" ON "City"("nameAr");

-- CreateIndex
CREATE UNIQUE INDEX "City_slug_key" ON "City"("slug");

-- CreateIndex
CREATE INDEX "City_visible_sort_idx" ON "City"("visible", "sort");


-- ٢ · المدن — مولَّدة من prisma/seed-data/cities.json
--
-- **والبياناتُ المرجعية تصل القاعدةَ الحيّة بترحيل لا ببذرة**:
-- مدينةٌ تُضاف إلى الملفّ تصل بيئةً جديدة ولا تصل بيئةً تعمل.

INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_riyadh','الرياض','Riyadh','riyadh','الرياض',1,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_jeddah','جدة','Jeddah','jeddah','مكة المكرمة',2,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_dammam','الدمام','Dammam','dammam','الشرقية',3,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_makkah','مكة المكرمة','Makkah','makkah','مكة المكرمة',4,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_madinah','المدينة المنورة','Madinah','madinah','المدينة المنورة',5,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_khobar','الخبر','Khobar','khobar','الشرقية',6,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_dhahran','الظهران','Dhahran','dhahran','الشرقية',7,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_taif','الطائف','Taif','taif','مكة المكرمة',8,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_buraidah','بريدة','Buraidah','buraidah','القصيم',9,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_tabuk','تبوك','Tabuk','tabuk','تبوك',10,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_abha','أبها','Abha','abha','عسير',11,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_khamis_mushait','خميس مشيط','Khamis Mushait','khamis-mushait','عسير',12,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_hail','حائل','Hail','hail','حائل',13,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_najran','نجران','Najran','najran','نجران',14,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_jazan','جازان','Jazan','jazan','جازان',15,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_yanbu','ينبع','Yanbu','yanbu','المدينة المنورة',16,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_ahsa','الأحساء','Al Ahsa','ahsa','الشرقية',17,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_hofuf','الهفوف','Hofuf','hofuf','الشرقية',18,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_jubail','الجبيل','Jubail','jubail','الشرقية',19,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_qatif','القطيف','Qatif','qatif','الشرقية',20,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_unaizah','عنيزة','Unaizah','unaizah','القصيم',21,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_arar','عرعر','Arar','arar','الحدود الشمالية',22,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_sakaka','سكاكا','Sakaka','sakaka','الجوف',23,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_baha','الباحة','Al Bahah','baha','الباحة',24,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_kharj','الخرج','Al Kharj','kharj','الرياض',25,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_dawadmi','الدوادمي','Dawadmi','dawadmi','الرياض',26,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_majmaah','المجمعة','Majmaah','majmaah','الرياض',27,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_zulfi','الزلفي','Zulfi','zulfi','الرياض',28,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_wadi_aldawasir','وادي الدواسر','Wadi Ad-Dawasir','wadi-aldawasir','الرياض',29,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_rabigh','رابغ','Rabigh','rabigh','مكة المكرمة',30,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_qunfudhah','القنفذة','Al Qunfudhah','qunfudhah','مكة المكرمة',31,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_lith','الليث','Al Lith','lith','مكة المكرمة',32,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_alula','العلا','AlUla','alula','المدينة المنورة',33,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_badr','بدر','Badr','badr','المدينة المنورة',34,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_rass','الرس','Ar Rass','rass','القصيم',35,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_midhnab','المذنب','Al Midhnab','midhnab','القصيم',36,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_bukayriyah','البكيرية','Al Bukayriyah','bukayriyah','القصيم',37,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_hafar_albatin','حفر الباطن','Hafar Al Batin','hafar-albatin','الشرقية',38,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_ras_tanura','رأس تنورة','Ras Tanura','ras-tanura','الشرقية',39,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_abqaiq','بقيق','Abqaiq','abqaiq','الشرقية',40,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_khafji','الخفجي','Khafji','khafji','الشرقية',41,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_nairyah','النعيرية','Nairyah','nairyah','الشرقية',42,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_bisha','بيشة','Bisha','bisha','عسير',43,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_muhayil','محايل عسير','Muhayil Asir','muhayil','عسير',44,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_namas','النماص','An Namas','namas','عسير',45,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_duba','ضباء','Duba','duba','تبوك',46,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_wajh','الوجه','Al Wajh','wajh','تبوك',47,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_haql','حقل','Haql','haql','تبوك',48,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_sabya','صبيا','Sabya','sabya','جازان',49,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_abu_arish','أبو عريش','Abu Arish','abu-arish','جازان',50,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_samtah','صامطة','Samtah','samtah','جازان',51,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_sharurah','شرورة','Sharurah','sharurah','نجران',52,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_baqaa','بقعاء','Baqaa','baqaa','حائل',53,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_qurayyat','القريات','Qurayyat','qurayyat','الجوف',54,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_dumat_aljandal','دومة الجندل','Dumat Al Jandal','dumat-aljandal','الجوف',55,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_rafha','رفحاء','Rafha','rafha','الحدود الشمالية',56,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_turaif','طريف','Turaif','turaif','الحدود الشمالية',57,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_baljurashi','بلجرشي','Baljurashi','baljurashi','الباحة',58,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_mandaq','المندق','Al Mandaq','mandaq','الباحة',59,true) ON CONFLICT ("nameAr") DO NOTHING;
INSERT INTO "City" ("id","nameAr","nameEn","slug","region","sort","visible") VALUES ('city_neom','نيوم','NEOM','neom','تبوك',60,true) ON CONFLICT ("nameAr") DO NOTHING;
