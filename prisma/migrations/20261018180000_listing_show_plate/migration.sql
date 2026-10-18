-- إظهارُ لوحة المركبة مع الإعلان — بيد البائع، والافتراضُ الإخفاء.
ALTER TABLE "Listing" ADD COLUMN "showPlate" BOOLEAN NOT NULL DEFAULT false;
