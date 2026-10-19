/**
 * ═══ نطاقاتُ المفتاح العامّ — قائمةٌ واحدة ═══
 *
 * الحقلُ `scopes` مخزَّنٌ منذ بُني الجدول **ولا يُفحص في موضع**،
 * و`docs/api/public.md` يسجّلها صراحةً: «حقلٌ يبدو صلاحيةً ولا يُفحص
 * أسوأ من غياب الحقل». فبناءُ شاشةٍ تعرضه بلا فحصٍ يجعل اللوحة تَعِد
 * بما لا يقع — والنصُّ المعروض وعدٌ لا وصف.
 *
 * **وهذا الملفّ بلا `db`**: تقرؤه الحراسةُ على الخادم وشاشةُ اللوحة
 * في المتصفّح، ووحدةٌ تستورد `db` تجرّ Prisma إلى حزمة المتصفّح.
 */

export const API_SCOPES = ['read:listings', 'read:dealers'] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export function isApiScope(value: string): value is ApiScope {
  return (API_SCOPES as readonly string[]).includes(value);
}

/**
 * ═══ والفارغُ يبقى على معناه ═══
 *
 * المخطّط يقول «الفارغ يعني القراءة العامة وحدها»، وكلُّ مفتاحٍ قائم
 * اليوم فارغُ النطاقات. **ففرضُ النطاقات لا يُبطل مفتاحًا قُطع قبلها**:
 * الفارغُ يُقرأ «كلّ سطح القراءة العام» كما كان، والمملوءُ يُقيّد.
 *
 * ومن أراد مفتاحًا مقيَّدًا ملأ القائمة — فالتقييد اختيارٌ صريح لا
 * أثرٌ جانبيّ لترقية.
 */
export function allows(scopes: readonly string[], needed: ApiScope): boolean {
  return scopes.length === 0 || scopes.includes(needed);
}
