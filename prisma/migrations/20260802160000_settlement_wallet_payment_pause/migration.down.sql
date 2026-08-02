-- نقض: المحفظة والتسوية واستئناف المهلة.
--
-- **يمسّ المال في ثلاثة مواضع.**
--
-- `WalletEntry` **دفتر**: حذفه يمحو أرصدةً مستحقّة لمستخدمين، ولا يمكن
-- إعادة بنائها من `Escrow` وحده لأن التسوية الجزئية تنقسم بين ردٍّ
-- وإفراج. صدّر قبل التنفيذ:
--
--   \copy (SELECT w."userId", e.* FROM "WalletEntry" e JOIN "Wallet" w ON w.id = e."walletId") TO 'wallet.csv' CSV HEADER
--
-- و`settlementAmount` هو **السعر الفعليّ للفاتورة**؛ بعد حذفه يبقى
-- `agreedPrice` وحده، فتُقرأ الصفقة بسعرها الأصلي لا المُسوَّى — وهو
-- خطأ محاسبي صامت. صدّره مع الطلبات المُسوّاة:
--
--   \copy (SELECT "ref","agreedPrice","settlementAmount" FROM "Order" WHERE "settlementAmount" IS NOT NULL) TO 'settlements.csv' CSV HEADER
--
-- و`paymentPausedRemainingMs` أثرُ تجميدٍ جارٍ: بعد حذفه يُستأنف أيّ
-- طلب مجمَّد بمهلة كاملة لا بمتبقّيه. تحقّق أوّلًا:
--
--   SELECT count(*) FROM "Order" WHERE "paymentPausedRemainingMs" IS NOT NULL;

ALTER TABLE "Auction" DROP COLUMN IF EXISTS "sellerDecisionDueAt";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "settlementAmount";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "paymentPausedRemainingMs";

DROP TABLE IF EXISTS "WalletEntry";
DROP TABLE IF EXISTS "Wallet";
