import { getTranslations } from 'next-intl/server';
import { db } from '@/lib/db';
import { displayDigits } from '@/lib/arabic';
import { parseFilters } from '@/lib/domain/listings';

/**
 * ═══ الفلاتر تُقال جملةً ═══
 *
 * بحثٌ محفوظ يُعرض `type=AUCTION&brandId=cmx…&yearFrom=2020` لا يقول
 * شيئًا لصاحبه — **فالمحفوظ يُعرض بما حُفظ لأجله**: «تويوتا · مزاد ·
 * من ٢٠٢٠». والصياغة هنا لأن النطاق لا يصوغ (البوابة ١٧): لا يعرف
 * اللغة، ولا يملك أسماء الكتالوج بلغة الصفحة.
 */
export async function describeFilters(query: string, locale: string): Promise<string[]> {
  const filters = parseFilters(new URLSearchParams(query));
  const te = await getTranslations('enums');
  const t = await getTranslations('search');
  const digits = locale === 'ar' ? displayDigits : (value: string): string => value;
  const arabic = locale === 'ar';

  const parts: string[] = [];

  /** الاسمان باستعلامٍ واحد — ومعرّفٌ بلا اسمٍ يُحذف لا يُعرض خامًا. */
  const [brand, model] = await Promise.all([
    filters.brandId === null
      ? null
      : db.brand.findUnique({ where: { id: filters.brandId }, select: { nameAr: true, nameEn: true } }),
    filters.modelId === null
      ? null
      : db.model.findUnique({ where: { id: filters.modelId }, select: { nameAr: true, nameEn: true } }),
  ]);

  if (brand !== null) parts.push(arabic ? brand.nameAr : brand.nameEn);
  if (model !== null) parts.push(arabic ? model.nameAr : model.nameEn);
  if (filters.city !== null) parts.push(filters.city);
  if (filters.type !== null) parts.push(te(`listingType.${filters.type}`));
  if (filters.condition !== null) parts.push(te(`condition.${filters.condition}`));
  if (filters.bodyType !== null) parts.push(te(`bodyType.${filters.bodyType}`));
  if (filters.fuel !== null) parts.push(te(`fuel.${filters.fuel}`));
  if (filters.transmission !== null) parts.push(te(`transmission.${filters.transmission}`));
  if (filters.spec !== null) parts.push(te(`spec.${filters.spec}`));
  if (filters.drivetrain !== null) parts.push(te(`drivetrain.${filters.drivetrain}`));
  if (filters.yearFrom !== null) parts.push(t('chip.yearFrom', { year: digits(String(filters.yearFrom)) }));
  if (filters.yearTo !== null) parts.push(t('chip.yearTo', { year: digits(String(filters.yearTo)) }));
  if (filters.priceMin !== null) {
    parts.push(t('chip.priceMin', { price: digits(filters.priceMin.toLocaleString('en-US')) }));
  }
  if (filters.priceMax !== null) {
    parts.push(t('chip.priceMax', { price: digits(filters.priceMax.toLocaleString('en-US')) }));
  }
  if (filters.inspected === true) parts.push(t('chip.inspected'));

  return parts;
}
