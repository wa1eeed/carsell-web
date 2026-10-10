/**
 * ═══ المدن العربية إلى مقاطع لاتينية ═══
 *
 * هنا لا في `src/lib/domain`: **البوابة ١٧ تمنع العربية في النطاق**،
 * وهي محقّة — لكن هذه مفاتيح بيانات لا جُملَ عرض. فيبقى الجدول حيث
 * تُسمح العربية، ويبقى الاشتقاق في النطاق.
 *
 * ومدن السعودية قائمةٌ مغلقة، فالترجمة جدولٌ لا خوارزمية: خوارزميةُ
 * نقلٍ صوتيّ تُخرج `almdynh almnwrh` وهي أسوأ من العربية.
 * **وما لا جدول له يسقط إلى العربية** — فمدينةٌ جديدة تعمل ولا تُسقط
 * شيئًا، وتُضاف هنا حين تُلاحَظ.
 */
export const CITY_SLUG: Record<string, string> = {
  'الرياض': 'riyadh',
  'جدة': 'jeddah',
  'مكة': 'makkah',
  'مكة المكرمة': 'makkah',
  'المدينة المنورة': 'madinah',
  'المدينة': 'madinah',
  'الدمام': 'dammam',
  'الخبر': 'khobar',
  'الظهران': 'dhahran',
  'تبوك': 'tabuk',
  'أبها': 'abha',
  'خميس مشيط': 'khamis-mushait',
  'الطائف': 'taif',
  'بريدة': 'buraidah',
  'عنيزة': 'unaizah',
  'حائل': 'hail',
  'نجران': 'najran',
  'جازان': 'jazan',
  'ينبع': 'yanbu',
  'الأحساء': 'ahsa',
  'الهفوف': 'hofuf',
  'الجبيل': 'jubail',
  'القطيف': 'qatif',
  'عرعر': 'arar',
  'سكاكا': 'sakaka',
  'الباحة': 'baha',
};

/**
 * تطبيعٌ خفيف قبل البحث: الهمزات تُكتب بصورٍ عدّة (`أبها` · `ابها`)،
 * والتاء المربوطة قد تُكتب هاءً — فلا تُطلب دقّةٌ إملائية من الكاتب.
 */
export function normalizeArabic(value: string): string {
  return value
    .trim()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}


/** الجدول مُطبَّعًا — يُبنى مرّة ويُقرأ كثيرًا. */
export const CITY_SLUG_NORMALIZED: Record<string, string> = Object.fromEntries(
  Object.entries(CITY_SLUG).map(([key, value]) => [normalizeArabic(key), value]),
);
