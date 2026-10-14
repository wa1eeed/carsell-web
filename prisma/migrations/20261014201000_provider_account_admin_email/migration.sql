-- بريدُ مدير الحساب لدى البوّابة — تصله دعوةُ الدخول، وهو غير بريد
-- المنشأة. ويُخزَّن ليُعرَف من دُعي، فإعادةُ التقديم لا تكون من الذاكرة.
ALTER TABLE "ServiceProvider" ADD COLUMN "accountAdminEmail" TEXT;
