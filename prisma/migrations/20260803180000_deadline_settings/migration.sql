-- المهل الزمنية إعدادٌ يديره المشغّل لا ثابتٌ في الشيفرة
CREATE TABLE "DeadlineSetting" (
    "key"       TEXT NOT NULL,
    "value"     INTEGER NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeadlineSetting_pkey" PRIMARY KEY ("key")
);

-- لا صفوف أوّلية: الغائب يأخذ افتراضيّه من الكود، فلا يتجمّد في القاعدة
