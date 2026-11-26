-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "audience" TEXT NOT NULL DEFAULT 'user';


-- ═══ وموديولٌ مبنيٌّ لا يصل أحدًا بلا باقةٍ تمنحه ═══
--
-- قِيس ٢٠٢٦-١١-٢٧: نقطةُ البيع والتقسيطُ وموقعُ المعرض مبنيّةٌ ومنشورة،
-- و**لا تظهر في لوحة أيّ معرض** — في أيّ بيئة. وسببُه أربع حلقات:
-- افتراضُ المفتاح `false` كُتب ساعةَ لم يكن مبنيًّا ولم يُقلب، ولا باقةٍ
-- تمنح مفتاحًا من الستّة، ولا معرضٍ له اشتراكٌ أصلًا، ولا شاشةٍ تُسند
-- باقةً إلى معرض.
--
-- وهذا الترحيل يسدّ الثلاثة الأولى. والرابعةُ شاشةٌ في لوحة الأدمن.

-- ١ · الباقةُ تُنسب إلى جمهورها، فلا تُسند باقةُ فردٍ إلى منشأة.
UPDATE "Plan" SET "audience" = 'dealer' WHERE "key" IN ('dealer', 'dealer_pro');

-- ٢ · والمنحُ بالباقة: المبدئيّةُ تدير معرضًا، والاحترافيّةُ تشغّله.
--     وما لا تمنحه باقةٌ يبقى على افتراضِه — ولا سطرَ ينفي.
INSERT INTO "PlanEntitlement" ("planId", "entitlementKey", "value")
SELECT p."id", k."key", k."value"
FROM "Plan" p
JOIN (VALUES
  ('dealer',     'dealer_branches',     'true'),
  ('dealer',     'dealer_customers',    'true'),
  ('dealer',     'dealer_expenses',     'true'),
  ('dealer',     'dealer_pos',          'false'),
  ('dealer',     'dealer_installments', 'false'),
  ('dealer',     'dealer_landing',      'false'),
  ('dealer_pro', 'dealer_branches',     'true'),
  ('dealer_pro', 'dealer_customers',    'true'),
  ('dealer_pro', 'dealer_expenses',     'true'),
  ('dealer_pro', 'dealer_pos',          'true'),
  ('dealer_pro', 'dealer_installments', 'true'),
  ('dealer_pro', 'dealer_landing',      'true')
) AS k("planKey", "key", "value") ON k."planKey" = p."key"
ON CONFLICT ("planId", "entitlementKey") DO UPDATE SET "value" = EXCLUDED."value";

-- ٣ · وكلُّ معرضٍ قائم يُولد بباقة — وبلا اشتراكٍ لا تُقرأ طبقتُه أبدًا.
--
--     والقائمُ اليوم يُسند إلى الاحترافيّة: المعارضُ المسجَّلة أربعةٌ في
--     بيئةٍ لم تبِع بعد، والمشغّلُ ينقل من يشاء إلى المبدئيّة من
--     شاشته. وإسنادُ الأدنى إلى من يجرّب يخفي عنه ما بُني.
--     ═══ والوقتُ يُكتب بتوقيت UTC صراحةً ═══
--
--     أعمدةُ Prisma من نوع `timestamp(3)` بلا منطقة — ومعناها UTC
--     بالاتّفاق، والعميلُ يقرؤها كذلك. و`now()` في SQL تُعيد ساعةَ
--     الجلسة: فعلى قاعدةٍ منطقتُها الرياض يُكتب ٢٢:٣٢ ويُقرأ ٢٢:٣٢
--     UTC — **أي بعد ثلاث ساعاتٍ من الآن**. وقِيس: الاشتراكاتُ كُتبت
--     فعلًا في المستقبل، فشرطُ المحرّك `startsAt <= now` كذب،
--     **فبقيت الموديولز مخفيّةً بعد منحها** ولا شيء يشكو.
INSERT INTO "Subscription" ("id", "dealerId", "planId", "startsAt", "status")
SELECT gen_random_uuid()::text, d."id", p."id", (now() AT TIME ZONE 'UTC'), 'active'
FROM "Dealer" d
CROSS JOIN "Plan" p
WHERE p."key" = 'dealer_pro'
  AND NOT EXISTS (
    SELECT 1 FROM "Subscription" s
    WHERE s."dealerId" = d."id" AND s."status" = 'active'
  );
