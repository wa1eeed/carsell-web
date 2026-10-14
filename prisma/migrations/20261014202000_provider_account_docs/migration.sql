-- أاكتملت مستنداتُ الحساب كما تقولها البوّابة؟ شرطُ التقديم للمراجعة،
-- ويُحفَظ لا يُفترض: زرُّ تقديمٍ بلا شرطه يردّ رفضًا بعد النقر.
ALTER TABLE "ServiceProvider" ADD COLUMN "accountDocsComplete" BOOLEAN NOT NULL DEFAULT false;
