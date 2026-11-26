-- ═══ وجدولُ الوقائع يبدأ فارغًا — والبيعاتُ السابقة لا تدخله وحدها ═══
--
-- شاشةُ «نتيجة الفروع» تقرأ DealerSale، وهو مكتوبٌ من اليوم فصاعدًا:
-- فمعرضٌ باع عشرًا هذا الشهر يفتح الشاشة على أصفار، ويقرأ غيابَ
-- البيانات عطلًا في الحساب لا في التاريخ.
--
-- والطلبُ المكتمل يحمل كلَّ ما تحتاجه الواقعة: مركبتُه تقول المعرضَ
-- والفرع، و"agreedPrice" يقول الإيراد، و"stageEnteredAt" يقول متى.
--
-- و"soldById" يبقى فارغًا في المنقول: عمودُ "Offer.respondedById"
-- وُلد اليوم، فلا يُعرف من ردّ على عرضٍ قُبل قبله. ونسبةُ بيعةٍ إلى
-- مندوبٍ بالتخمين أسوأ من تركها بلا صاحب.
--
-- وبيعاتُ المنضدة (POS) ليست هنا: أثرُها في AuditLog وحده، وقراءةُ
-- مبلغٍ من JSON لإثبات واقعةٍ ماليّة تحتمل الخطأ بلا من يراجعه —
-- والميزةُ شُحنت اليوم، فما قبلها لا يكاد يوجد.
INSERT INTO "DealerSale" (
  "id", "dealerId", "branchId", "vehicleId", "channel",
  "soldById", "price", "buyerName", "invoiceId", "orderId", "soldAt", "createdAt"
)
SELECT
  gen_random_uuid()::text,
  v."dealerId",
  v."branchId",
  v."id",
  'MARKET'::"DealerSaleChannel",
  NULL,
  o."agreedPrice",
  NULL,
  NULL,
  o."id",
  o."stageEnteredAt",
  -- بتوقيت UTC صراحةً: عمودُ Prisma بلا منطقة، و`now()` ساعةُ الجلسة.
  (now() AT TIME ZONE 'UTC')
FROM "Order" o
JOIN "Listing" l ON l."id" = o."listingId"
JOIN "Vehicle" v ON v."id" = l."vehicleId"
WHERE o."status" = 'COMPLETED'
  AND v."dealerId" IS NOT NULL
ON CONFLICT ("orderId") DO NOTHING;
