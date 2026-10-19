import { formatNumber } from '@/lib/arabic';
import { type SeoSurface, type SeoValues } from '@/lib/seo/templates';

/**
 * ═══ تسميةُ أسطح السيو ومتغيّراتها ═══
 *
 * **والنطاق لا يصوغ** (البوابة ١٧): `src/lib/seo/templates.ts` يُخرج
 * مفاتيح الأسطح وأسماء المتغيّرات، والعبارةُ هنا.
 *
 * **والخريطةُ تحمل تعهّدًا** (البوابة ٥٩): `Record<SeoSurface, …>`
 * يرفض سطحًا يُضاف بلا تسمية — وقيمةُ تعدادٍ بلا تسمية تُعرض خامًا
 * أو لا تُعرض. (وقع في قوالب الإشعار، ثمّ في حسابات الدفتر، ثمّ في
 * `TRANSFER` في شاشة الصرف.)
 */
export const SEO_SURFACE_LABEL: Record<SeoSurface, string> = {
  search: 'نتائج البحث — بلا مرشحات',
  landing_brand: 'صفحة هبوط: مدينة × ماركة',
  landing_model: 'صفحة هبوط: مدينة × ماركة × طراز',
};

/** **والمتغيّرُ يُسمّى بما يعنيه** — `{priceMin}` وحدها لا تقول شيئًا. */
export const SEO_VARIABLE_LABEL: Record<string, string> = {
  brand: 'الماركة',
  model: 'الطراز',
  city: 'المدينة',
  count: 'عدد السيارات المعروضة في هذه الصفحة',
  priceMin: 'أقل سعر معروض',
  priceMax: 'أعلى سعر معروض',
  inspected: 'كم منها بتقرير فحص منشور',
};

/**
 * ═══ مثالُ المعاينة — بشكل الحقيقيّ لا باسمه ═══
 *
 * **والبياناتُ المزروعة تُحاكي شكل الحقيقيّ**: مثالٌ بـ«مدينة» و«١»
 * لا يُري المحرِّر كيف يقرأ سطرُه، ومثالٌ بأرقامٍ على شكل السوق
 * يُريه طولَ الجملة وموضعَ كل رقم فيها.
 *
 * والأرقامُ تمرّ على `formatNumber` كما تمرّ في الصفحة — فما يراه
 * هنا هو ما يُطبع هناك حرفًا بحرف.
 */
type Sample = { note: string; values: SeoValues };

const n = (value: number): string => formatNumber(value, 'ar');

export const SEO_SAMPLE: Record<SeoSurface, Sample> = {
  search: {
    note: 'كل المعروض على المنصة',
    values: { count: n(5240) },
  },
  landing_brand: {
    note: 'تويوتا في الرياض',
    values: {
      brand: 'تويوتا',
      model: null,
      city: 'الرياض',
      count: n(12),
      priceMin: n(85000),
      priceMax: n(320000),
      inspected: n(7),
    },
  },
  landing_model: {
    note: 'تويوتا كامري في جدة',
    values: {
      brand: 'تويوتا',
      model: 'كامري',
      city: 'جدة',
      count: n(9),
      priceMin: n(72000),
      priceMax: n(148000),
      inspected: n(4),
    },
  },
};
