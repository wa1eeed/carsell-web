-- ═══ وسطى الصفحة، والمقدّمةُ وصفٌ لا فقرة ═══
--
-- قرارُ المالك ٢٠٢٦-١٠-١٩ («طبق الاثنين»):
--   ١. {priceMid} — سعرُ المركبة الوسطى **في هذه الصفحة**، لا وسيطَ
--      سوق: PriceStat مفتاحُه موديلٌ × سنةٌ × فئةٌ × مدينةٌ × ممشى،
--      فرقمٌ يُجمع عبر صفوفه يخلط ٢٠١٥ بـ٢٠٢٤ ويُقدَّم وسيطًا للطراز.
--   ٢. المقدّمةُ خرجت من الشاشة وبقيت <meta description> — كانت
--      تكرّر سطرَ الإحصاء فوقها حرفًا بحرف.
--
-- **والشرطُ على النصّ القديم**: ما بدّله مشغّلٌ لا يُمحى بترحيل.

UPDATE "SeoTemplate" SET
       "titleAr" = 'سيارات مستعملة للبيع في السعودية',
       "titleEn" = 'Used cars for sale in Saudi Arabia',
       "introAr" = 'السيارات المعروضة الآن على كارز: {count}. موثقة الملكية ومفحوصة قبل العرض، مع نقل ملكية ودفع محفوظ.',
       "introEn" = 'Cars listed on CARZ right now: {count}. Verified ownership, inspected before listing, with ownership transfer and protected payment.',
       "outroAr" = '',
       "outroEn" = ''
 WHERE "key" = 'search_results'
   AND "introAr" LIKE '%المعروضة الآن على كارز%';

UPDATE "SeoTemplate" SET
       "titleAr" = 'سيارات {brand} للبيع في {city}',
       "titleEn" = '{brand} cars for sale in {city}',
       "introAr" = 'سيارات {brand} المعروضة الآن في {city}: {count}. وأسعارها من {priceMin} إلى {priceMax} ريال وأوسطها {priceMid}، وكلها موثقة الملكية على كارز.',
       "introEn" = '{brand} cars listed in {city} right now: {count}. Priced from {priceMin} to {priceMax} SAR with the middle one at {priceMid}, all with verified ownership on CARZ.',
       "outroAr" = 'تقارير الفحص المنشورة في هذه الصفحة: {inspected}. تقرؤها قبل أن تتواصل مع البائع، والدفع محفوظ حتى تنقل الملكية باسمك.',
       "outroEn" = 'Published inspection reports on this page: {inspected}. Read them before contacting the seller, and payment is held until ownership moves to your name.'
 WHERE "key" = 'landing_city_brand'
   AND "introAr" LIKE '%المعروضة الآن في {city}%';

UPDATE "SeoTemplate" SET
       "titleAr" = '{brand} {model} للبيع في {city}',
       "titleEn" = '{brand} {model} for sale in {city}',
       "introAr" = '{brand} {model} المعروضة الآن في {city}: {count}. وأسعارها من {priceMin} إلى {priceMax} ريال وأوسطها {priceMid}، مع نقل ملكية ودفع محفوظ على كارز.',
       "introEn" = '{brand} {model} listed in {city} right now: {count}. Priced from {priceMin} to {priceMax} SAR with the middle one at {priceMid}, with ownership transfer and protected payment on CARZ.',
       "outroAr" = 'تقارير الفحص المنشورة في هذه الصفحة: {inspected}. تذكر حالة الهيكل والمحرك وقطع الغيار المستبدلة، وتقرأ قبل أن تتواصل مع البائع.',
       "outroEn" = 'Published inspection reports on this page: {inspected}. They cover body, engine and replaced parts, and are read before you contact the seller.'
 WHERE "key" = 'landing_city_brand_model'
   AND "introAr" LIKE '%المعروضة الآن في {city}%';
