-- ═══ وسائلُ الدفع في التذييل — الملفُّ وصل ═══
--
-- طلبُ المالك في الخارطة §١٣ كان معلَّقًا بسببٍ واحد: «الشعارات لم تصل
-- المستودع». ووصلت اليوم (`public/trust/payment-icons.webp`)، فقُطّعت
-- خمسةَ ملفّات — **ملفٌّ لكلّ وسيلة لا شريطٌ واحد**.
--
-- **ولماذا خمسةُ صفوفٍ لا صفٌّ بالشريط كلِّه:** الصفُّ وحدةُ الدعوى.
-- فمن لا يقبل «أبل باي» بعد يُطفئ صفَّها من اللوحة، ويبقى الباقي —
-- والشريطُ الواحد يُظهر الخمسةَ أو يُخفيها جميعًا. وهي القاعدة نفسُها
-- التي بُني عليها جدولُ العلامات: **ما لا تملكه أطفئه**، ووسمُ وسيلةٍ
-- لا تقبلها وعدٌ مُخلَفٌ للمشتري عند الدفع لا قبله.
--
-- والترتيبُ بما يعرفه السوق السعودي: مدى أوّلًا — وهي الشبكة الوطنية
-- وأكثرُ ما يُدفع به — ثمّ العالميّتان، ثمّ المحفظتان.
INSERT INTO "TrustMark" ("key", "kind", "nameAr", "nameEn", "logoPath", "verifyUrl", "sort") VALUES
  ('mada',       'PAYMENT', 'مدى',          'mada',        '/trust/payment/mada.webp',       'https://www.mada.com.sa', 1),
  ('visa',       'PAYMENT', 'فيزا',         'Visa',        '/trust/payment/visa.webp',       NULL, 2),
  ('mastercard', 'PAYMENT', 'ماستركارد',    'Mastercard',  '/trust/payment/mastercard.webp', NULL, 3),
  ('apple_pay',  'PAYMENT', 'أبل باي',      'Apple Pay',   '/trust/payment/apple-pay.webp',  NULL, 4),
  ('stc_pay',    'PAYMENT', 'إس تي سي باي', 'stc pay',     '/trust/payment/stc-pay.webp',    NULL, 5)
ON CONFLICT ("key") DO NOTHING;
