-- ═══ قوالبُ السيو — قارئٌ ومحرِّرٌ لما كان بلا كليهما ═══
--
-- `SeoTemplate` كان صفًّا واحدًا مزروعًا لا يقرؤه شيء ولا يعدّله شيء.
-- والقرار ٢٦ يسمّي ستّة قوالب؛ **والأسطح ثلاثة لأنّ الصفحات ثلاث** —
-- وسطحٌ بلا صفحةٍ تَصيّره هو «قيمةٌ في المخطّط بلا بابٍ يصلها».

-- ١ · قالبٌ لكلّ سطح — **يُفرض ولا يُؤمَل**.
--   قارئُ الصفحة يأخذ أوّلَ صفٍّ فعّال لسطحها، فصفّان لسطحٍ واحد
--   يجعلان المعروضَ رهنَ ترتيبٍ لا يضبطه أحد.
CREATE UNIQUE INDEX "SeoTemplate_surface_key" ON "SeoTemplate"("surface");

-- ٢ · و`variables` نسخةٌ من معرفة الشيفرة تتباعد عنها.
--   الصفحةُ هي التي تملأ المتغيّرات، فقائمتُها تُشتقّ من `SEO_VARIABLES`
--   في `src/lib/seo/templates.ts`. وعمودٌ يحمل نسخةً ثانية يكذب أوّلَ
--   صفحةٍ تكسب قيمةً جديدة — «ما يحتاج حراسةً يُبنى محروسًا».
ALTER TABLE "SeoTemplate" DROP COLUMN "variables";

-- ٣ · والصفُّ المزروع كان لشريحةٍ لا يعرفها سطحُه: نصُّه يذكر
--   `{brand}` و`{model}` و`{condition}`، و`/cars` بلا مرشّحٍ لا يعرف
--   ماركةً ولا طرازًا — **والمفلترةُ منها لا تُفهرَس أصلًا**. فيُعاد
--   كتابتُه بما يملؤه سطحُه فعلًا.
--   والشرطُ على النصّ القديم لا على المفتاح وحده: ما بدّله مشغّلٌ
--   لا يُمحى بترحيل. (ولا محرِّر بعد، فالشرط احتياطٌ لا حاجة.)
UPDATE "SeoTemplate" SET
  "surface" = 'search',
  "titleAr" = 'سيارات مستعملة للبيع في السعودية',
  "titleEn" = 'Used cars for sale in Saudi Arabia',
  "introAr" = 'السيارات المعروضة الآن على كارز: {count}. موثقة الملكية ومفحوصة قبل العرض، مع نقل ملكية ودفع محفوظ.',
  "introEn" = 'Cars listed on CARZ right now: {count}. Verified ownership, inspected before listing, with ownership transfer and protected payment.',
  "outroAr" = '',
  "outroEn" = ''
WHERE "key" = 'search_results' AND "titleAr" LIKE '%{brand}%';

-- ٤ · وسطحا الهبوط — **والبياناتُ المرجعية تصل القاعدةَ الحيّة بترحيل
--   لا ببذرة**: البذرة تُطبَّق على قاعدةٍ فارغة مرّةً واحدة، والشاشة
--   تعدّل ولا تُنشئ. فصفٌّ يُضاف إلى ملفّ البذرة يصل بيئةً جديدة ولا
--   يصل بيئةً تعمل.
--
--   ولا متوسّطَ سوقٍ في النصّ: `PriceStat` مفتاحُه موديلٌ × سنةٌ ×
--   فئةٌ × مدينةٌ × شريحةُ ممشى، فرقمٌ يُجمع عبر السنوات يخلط ٢٠١٥
--   بـ٢٠٢٤ ويُقدَّم «متوسّطَ سعر الطراز في المدينة».
INSERT INTO "SeoTemplate" ("key", "surface", "titleAr", "titleEn", "introAr", "introEn", "outroAr", "outroEn") VALUES
  (
    'landing_city_brand', 'landing_brand',
    'سيارات {brand} للبيع في {city}',
    '{brand} cars for sale in {city}',
    'سيارات {brand} المعروضة الآن في {city}: {count}. وأسعارها من {priceMin} إلى {priceMax} ريال، وكلها موثقة الملكية على كارز.',
    '{brand} cars listed in {city} right now: {count}. Priced from {priceMin} to {priceMax} SAR, all with verified ownership on CARZ.',
    'وتقارير الفحص المنشورة في هذه الصفحة: {inspected}. تقرؤها قبل أن تتواصل مع البائع، والدفع محفوظ حتى تنقل الملكية.',
    'Published inspection reports on this page: {inspected}. Read them before contacting the seller, and payment is held until ownership moves.'
  ),
  (
    'landing_city_brand_model', 'landing_model',
    '{brand} {model} للبيع في {city}',
    '{brand} {model} for sale in {city}',
    '{brand} {model} المعروضة الآن في {city}: {count}. وأسعارها من {priceMin} إلى {priceMax} ريال على كارز، مع نقل ملكية ودفع محفوظ.',
    '{brand} {model} listed in {city} right now: {count}. Priced from {priceMin} to {priceMax} SAR on CARZ, with ownership transfer and protected payment.',
    'وتقارير الفحص المنشورة في هذه الصفحة: {inspected}. تذكر حالة الهيكل والمحرك وقطع الغيار المستبدلة.',
    'Published inspection reports on this page: {inspected}. They cover body, engine and replaced parts.'
  )
ON CONFLICT ("key") DO NOTHING;
