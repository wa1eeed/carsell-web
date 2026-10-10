import { CITY_SLUG_NORMALIZED, normalizeArabic } from '@/lib/labels/cities';

/**
 * ═══ الروابط لاتينيةٌ كاملة — كما يرسمها التصميم ═══
 *
 * التصميم يعرض `carsell.one/ar/cars/riyadh/toyota/camry/ADS2026A0005`،
 * والمبنيّ كان يُخرج `/ar/cars/الخبر/hyundai/ستاريا/ADS2026A0005`:
 * الماركة لاتينية (لها `slug` في المخطّط) والمدينة والطراز عربيّان
 * لأن `toSlug` تُبقي `\p{Letter}` وهي تشمل العربية.
 *
 * ═══ ولماذا يهمّ ═══
 *
 * المسار العربيّ يُرمَّز في الروابط (`%D8%A7%D9%84%D8%AE%D8%A8%D8%B1`)
 * فيصير الرابط المنسوخ غير مقروء، ويُشارَك مشوَّهًا. ومحرّكات البحث
 * تتعامل معه، لكن **الروابط هي أوّل ما يُقرأ** في نتيجة بحثٍ وفي
 * رسالة واتساب — والمشوّه منها لا يُنقر.
 *
 * ═══ والمدن جدولٌ في `labels/cities` ═══
 *
 * لأن البوابة ١٧ تمنع العربية في النطاق — وهي محقّة. فالمفاتيح هناك
 * والاشتقاق هنا.
 */


/** حروفٌ لاتينية وأرقام وشرطات — ولا شيء غيرها. */
export function latinSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * مدينةٌ إلى مقطعٍ لاتينيّ — **ويسقط إلى العربية حين لا جدول**.
 *
 * والسقوط مقصود: مدينةٌ غير مذكورة تعمل بلا تعطيل، ورابطُها يبقى
 * كما كان حتى تُضاف. والصمت هنا أهون من ٤٠٤.
 */
export function citySlug(city: string): string {
  const mapped = CITY_SLUG_NORMALIZED[normalizeArabic(city)];
  if (mapped !== undefined) return mapped;
  const latin = latinSlug(city);
  return latin === '' ? fallbackSlug(city) : latin;
}

/**
 * طرازٌ إلى مقطعٍ لاتينيّ — **من `nameEn` حين وُجد**.
 *
 * و«Land Cruiser» تصير `land-cruiser`. وما لا إنجليزية له يسقط إلى
 * العربية كما كان.
 */
export function modelSlug(model: { nameAr?: string; nameEn?: string | null } | string): string {
  if (typeof model === 'string') {
    const latin = latinSlug(model);
    return latin === '' ? fallbackSlug(model) : latin;
  }
  const latin = latinSlug(model.nameEn ?? '');
  if (latin !== '') return latin;
  const arabic = model.nameAr ?? '';
  return latinSlug(arabic) === '' ? fallbackSlug(arabic) : latinSlug(arabic);
}

/** العربية كما كانت — `toSlug` القديمة، وهي مسار التوافق. */
function fallbackSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, '-')
    .replace(/[^\p{Letter}\p{Number}-]/gu, '');
}
