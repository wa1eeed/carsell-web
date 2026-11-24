-- AlterTable
ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "monthlyCost" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "IntegrationCredential" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);


-- ═══ وسجلُّ التكاملات كان ناقصًا ثمانيةً ═══
--
-- ترميز A11 يعدّ أربعة عشر تكاملًا، وفي القاعدة تسعة. والناقصُ ليس
-- زينةً: صفٌّ غائب يعني أنّ التبعية **غير معترَف بها** — لا حالَ لها
-- ولا مسارَ بديلًا مكتوبًا ولا كلفةً معروفة. وإشعاراتُ الدفع مثالُه:
-- بُني لها جدولُ قياسٍ كامل في 40a·1 ولا سطر يقول إنّ FCM وAPNs
-- تبعيّةٌ خارجية أصلًا.
--
-- وكلُّها `INACTIVE`: الصفُّ يقول «هذه تبعيّةٌ نعرفها ولم تُوصَل»،
-- وهو الصدق. وصفٌّ يقول «متصل» بلا مُهايئ كذبةٌ على الشاشة.
--
-- والبياناتُ المرجعية تصل القاعدةَ الحيّة بترحيل لا ببذرة.

INSERT INTO "Integration" ("key","nameAr","provider","category","status","activeEnv","failureBehavior")
VALUES
  ('identity_manual','التحقق من الهوية يدويا','مراجعة داخلية','IDENTITY','ACTIVE','TEST',
   'هو نفسه المسار البديل — طابور المراجعة في لوحة الأدمن'),
  ('bank_escrow','حساب الضمان','بنك شريك','PAYMENT','INACTIVE','TEST',
   'لا شراء يبدأ — ورسالة تقول ان الخدمة متوقفة مؤقتا'),
  ('sarie_payout','التسوية والتحويل للبائعين','SARIE','PAYMENT','INACTIVE','TEST',
   'التحويلات تبقى في الطابور ولا تسقط، وتنفذ عند عودة الخدمة'),
  ('traffic_transfer','نقل الملكية','تكامل المرور','GOVERNMENT','INACTIVE','TEST',
   'يحول الطلب الى موعد حضوري وتبقى المهلة موقوفة'),
  ('email_marketing','البريد التسويقي','Resend — نطاق فرعي','INFRASTRUCTURE','INACTIVE','TEST',
   'الحملات تؤجل ولا ترسل ناقصة، والمعاملاتي لا يتأثر'),
  ('push_mobile','إشعارات الجوال','FCM · APNs','INFRASTRUCTURE','INACTIVE','TEST',
   'الاشعار يبقى في الجرس داخل التطبيق، ولا يضيع'),
  ('error_monitoring','مراقبة الأخطاء والأداء','Sentry','INFRASTRUCTURE','INACTIVE','TEST',
   'الاخطاء تبقى في سجل الخادم — ولا تنبيه فوري'),
  ('product_analytics','التحليلات السلوكية','PostHog','INFRASTRUCTURE','INACTIVE','TEST',
   'لا قياس للسلوك — ولا اثر على اي وظيفة')
ON CONFLICT ("key") DO NOTHING;

-- ═══ والتسعةُ الأصلية لم تصل الإنتاج أصلًا ═══
--
-- `Integration` يُزرع في `seed.ts` وحده، و`plantReference` يزرع عشرين
-- جدولًا ليس هو منها — والبذرةُ ترفض الإنتاج عمدًا. فسجلُّ التكاملات
-- في `carz.sa` **فارغٌ تمامًا**: لا حالَ لمزوّدٍ ولا مسارَ بديلًا
-- مكتوبًا ولا مكانَ لمفتاح. وهو صنفُ §39 نفسُه عاد في جدولٍ لم يُعدّ
-- يومها.
--
-- و`ON CONFLICT DO NOTHING` يمرّ بلا أثر على ما زُرع بالملفّ.

INSERT INTO "Integration" ("key","nameAr","provider","category","status","activeEnv","failureBehavior")
VALUES
  ('otp_sms','رسائل التحقق','Unifonic','INFRASTRUCTURE','ACTIVE','TEST','التحويل للاحتياطي خلال 30 ثانية'),
  ('nafath','النفاذ الوطني','Nafath','IDENTITY','INACTIVE','TEST','المسار اليدوي دائما متاح'),
  ('payments','بوابة الدفع للمنصة','Moyasar','PAYMENT','INACTIVE','TEST','رسالة واضحة وإعادة محاولة'),
  ('moyasar_platform','بوابة الدفع للمزودين','Moyasar Platform','PAYMENT','INACTIVE','TEST','الخدمة تبقى تطلب ويتأخر التحصيل'),
  ('vin_lookup','بيانات المركبة','Tamm','GOVERNMENT','INACTIVE','TEST','فتح الإدخال اليدوي'),
  ('lean','سجل المنشأة','Lean','GOVERNMENT','INACTIVE','TEST','فتح الإدخال اليدوي'),
  ('mojaz','تقارير موجز','Mojaz','GOVERNMENT','INACTIVE','TEST','رد المبلغ تلقائيا'),
  ('r2','الوسائط','Cloudflare R2','INFRASTRUCTURE','ACTIVE','TEST','عرض من الذاكرة المؤقتة'),
  ('email','البريد المعاملاتي','Resend','INFRASTRUCTURE','INACTIVE','TEST','طابور إعادة إرسال')
ON CONFLICT ("key") DO NOTHING;

-- ═══ وجهاتُ التمويل مثلُها — ولا ترحيلَ لها قطّ ═══
--
-- ثمانٍ في البذرة، **وصفرٌ في الإنتاج**: صفحةُ التمويل والحاسبة
-- وبطاقةُ «أقساط من» كلُّها تقرأ هذا الجدول. وهو مسجَّل في
-- `architecture/editability.md` «ثغرةٌ حقيقية» — وكانت الثغرة أوسع
-- ممّا قيل: ليست «تحتاج نشرًا لإضافة جهة» بل «لا جهةَ أصلًا».

-- **والحارسُ «الجدولُ فارغ» لا `ON CONFLICT (id)`**: المزروعُ بالبذرة
-- يحمل `cuid` لا مفاتيحَ ثابتة، فالتعارضُ لا يقع والصفوفُ تتضاعف.
-- وقد وقع: ستَّ عشرة جهةً بدل ثماني. والمجموعةُ تُزرع كاملةً على
-- جدولٍ فارغ، وتُترك كما هي على جدولٍ فيه شيء — وهو نمطُ
-- `plantReference` نفسُه.

INSERT INTO "FinanceProvider" ("id","nameAr","nameEn","downPaymentPct","months","profitRatePct","active","sort")
SELECT * FROM (VALUES
  ('fp_alrajhi','الراجحي','Al Rajhi Bank',20.00,60,4.00,true,1),
  ('fp_albilad','البلاد','Bank Albilad',20.00,60,4.25,true,2),
  ('fp_riyad','الرياض','Riyad Bank',20.00,60,4.50,true,3),
  ('fp_alinma','الإنماء','Alinma Bank',20.00,60,4.75,true,4),
  ('fp_aljazira','الجزيرة','Bank Aljazira',20.00,60,5.00,true,5),
  ('fp_snb','الأهلي','SNB',20.00,60,5.25,true,6),
  ('fp_jameel','عبداللطيف جميل','Abdul Latif Jameel',20.00,60,5.50,true,7),
  ('fp_emkan','إمكان','Emkan Finance',20.00,60,5.75,true,8)
) AS seed(id, "nameAr", "nameEn", "downPaymentPct", months, "profitRatePct", active, sort)
WHERE NOT EXISTS (SELECT 1 FROM "FinanceProvider");
