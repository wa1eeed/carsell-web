import { formatNumber, type NumeralLocale } from '@/lib/arabic';
import { seoTemplate } from '@/lib/domain/seo';
import type { LandingContent } from '@/lib/domain/landing';
import { type SeoSurface, type SeoValues, renderSeo } from '@/lib/seo/templates';

/**
 * ═══ نصُّ صفحة الهبوط — طبقةُ عرضٍ يقرأها مسارانِ ═══
 *
 * **وهي موضعٌ واحد لأنّ الصفحتين توأم**: مدينة × ماركة، ومدينة ×
 * ماركة × طراز. ونسخةٌ في كلٍّ منهما تتباعد أوّلَ تغيير — فتقول
 * إحداهما ما لا تقوله الأخرى عن البيانات نفسها.
 *
 * **والتصفيفُ هنا لا في النطاق** (البوابة ١٧): `formatNumber` من طبقة
 * العرض، والنطاق يُخرج صفَّ القالب وأرقامَه خامًا.
 */

export type SeoCopy = {
  /** `null` ⇒ لا قالب فعّال أو نصُّه فارغ، فالشاشة تعود إلى ملفّ الرسائل. */
  title: string | null;
  /** المقدّمةُ تؤدّي دورين: فقرةٌ يقرؤها الزائر و`<meta description>`. */
  intro: string | null;
  outro: string | null;
};

const EMPTY: SeoCopy = { title: null, intro: null, outro: null };

/**
 * ═══ والقيَمُ هي ما تحسبه هذه الصفحةُ لشريحتها هي ═══
 *
 * **ولا يُمرَّر رقمٌ لشريحةٍ أعمّ.** إحصاءُ السوق يتدرّج إلى الأعمّ
 * ثمّ تصفه الشاشةُ بمدينة المركبة، فيقول «مبنيّ على ١٧ صفقة · جدة»
 * وصفُّ الإحصاء مدينتُه `*` — وهي كذبةٌ مسجَّلة في CLAUDE.md.
 * فكلُّ قيمةٍ هنا من `landingContent` لهذه التركيبة وحدها.
 *
 * **والصفرُ يُمرَّر `null` لا «٠»**: «منها ٠ سيارة بتقرير فحص» جملةٌ
 * تُقرأ عطلًا، و`renderSeo` تُسقط فقرتَها كاملةً.
 */
export function landingSeoValues(content: LandingContent, locale: NumeralLocale): SeoValues {
  const money = (value: string | null): string | null =>
    value === null ? null : formatNumber(value, locale);

  return {
    brand: content.brand,
    model: content.model,
    city: content.city,
    count: formatNumber(content.count, locale),
    priceMin: money(content.priceMin),
    priceMax: money(content.priceMax),
    priceMid: money(content.priceMid),
    inspected: content.inspectedCount === 0 ? null : formatNumber(content.inspectedCount, locale),
  };
}

/** نصُّ سطحٍ بقيَمه — وكلُّ فقرةٍ تُطبع كاملةً أو تُحذف كاملة. */
export async function seoCopy(
  surface: SeoSurface,
  locale: string,
  values: SeoValues,
): Promise<SeoCopy> {
  const template = await seoTemplate(surface);
  if (template === null) return EMPTY;

  const en = locale === 'en';
  const pick = (text: string): string | null => {
    const rendered = renderSeo(text, values);
    return rendered === '' ? null : rendered;
  };

  return {
    title: pick(en ? template.titleEn : template.titleAr),
    intro: pick(en ? template.introEn : template.introAr),
    outro: pick(en ? template.outroEn : template.outroAr),
  };
}
