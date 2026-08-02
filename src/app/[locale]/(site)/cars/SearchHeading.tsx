import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { formatNumber, type NumeralLocale } from '@/lib/arabic';
import type { Filters, SearchResult } from '@/lib/domain/listings';

type Named = { id: string; nameAr: string; nameEn: string };

/**
 * فتات الخبز والعنوان والفقرة الافتتاحية.
 *
 * **عليها يقوم SEO كله**: العنوان `h1` هو ما تقرأه محرّكات البحث
 * عن الصفحة، والفتات يربطها بشجرة الموقع، والفقرة تحمل الكلمات
 * التي يبحث بها الناس («كامري مستعملة في الرياض»).
 *
 * والعنوان يُركَّب من الفلاتر لا من نصّ ثابت — «سيارات تويوتا كامري
 * مستعملة في الرياض» تصف صفحتها، و«تصفّح السيارات» تصف كل صفحة.
 * تركيبه من **كلمات مترجَمة** لا من أرقام، فلا رقم يدخل سلسلة نصّ.
 */
export async function SearchHeading({
  locale,
  filters,
  result,
  brands,
  models,
}: {
  locale: string;
  filters: Filters;
  result: SearchResult;
  brands: readonly Named[];
  models: readonly Named[];
}) {
  const t = await getTranslations('search');
  const te = await getTranslations('enums');
  const tu = await getTranslations('units');
  const numerals = locale as NumeralLocale;
  const name = (list: readonly Named[], id: string | null): string | null => {
    if (id === null) return null;
    const found = list.find((x) => x.id === id);
    if (found === undefined) return null;
    return locale === 'ar' ? found.nameAr : found.nameEn;
  };

  const brand = name(brands, filters.brandId);
  const model = name(models, filters.modelId);
  const condition =
    filters.condition === null ? null : te(`condition.${filters.condition}`);

  const title =
    brand === null && filters.city === null && condition === null
      ? t('h1All')
      : [t('h1Prefix'), brand, model, condition, filters.city === null ? null : `${t('h1In')} ${filters.city}`]
          .filter((p): p is string => p !== null && p !== '')
          .join(' ');

  const crumbs: { label: string; href: string }[] = [
    { label: t('crumbHome'), href: `/${locale}` },
    { label: t('crumbCars'), href: `/${locale}/cars` },
  ];
  if (brand !== null) crumbs.push({ label: brand, href: `/${locale}/cars?brandId=${filters.brandId}` });
  if (model !== null) {
    crumbs.push({
      label: model,
      href: `/${locale}/cars?brandId=${filters.brandId}&modelId=${filters.modelId}`,
    });
  }
  if (filters.city !== null) {
    crumbs.push({
      label: filters.city,
      href: `/${locale}/cars?city=${encodeURIComponent(filters.city)}`,
    });
  }

  const range = result.priceRange;

  return (
    <header className="mb-7">
      <nav aria-label={t('crumbCars')} className="mb-3 flex flex-wrap items-center gap-1.5 text-2xs opacity-50">
        {crumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1.5">
            {i > 0 ? <span aria-hidden>›</span> : null}
            {i === crumbs.length - 1 ? (
              <span aria-current="page" className="bidi-isolate font-bold opacity-100">
                {crumb.label}
              </span>
            ) : (
              <Link href={crumb.href} className="bidi-isolate hover:underline">
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <h1 className="mb-2 text-4xl font-extrabold tracking-tight">{title}</h1>

      <p className="max-w-3xl text-sm leading-loose opacity-65">
        {result.total === 0 || range === null
          ? t('introEmpty')
          : t('introRange', {
              // الأرقام تُصاغ قبل الدخول في السلسلة — `#` في ICU
              // يطبع لاتينيًا، والإدخال المباشر يطبع «2021».
              n: tu('cars', { count: result.total, n: formatNumber(result.total, numerals) }),
              where:
                filters.city === null ? '' : t('introWhere', { city: filters.city }),
              min: formatNumber(range.min, numerals),
              max: formatNumber(range.max, numerals),
            })}
      </p>
    </header>
  );
}
