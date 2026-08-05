import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { db } from '@/lib/db';
import {
  listBrandOptions,
  listFeatureOptions,
  listModelOptions,
} from '@/lib/domain/catalog-options';
import { routing } from '@/i18n/routing';
import {
  activeFilterCount,
  parseFilters,
  searchListings,
  serializeFilters,
} from '@/lib/domain/listings';
import { SearchHeading } from './SearchHeading';
import { SearchScreen } from './SearchScreen';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;

/** يحوّل `searchParams` الخاصة بـNext إلى `URLSearchParams` القياسية. */
function toParams(search: Search): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) params.append(key, v);
    else params.set(key, value);
  }
  return params;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Search>;
}): Promise<Metadata> {
  const filters = parseFilters(toParams(await searchParams));
  // صفحات مفلترة لا تُفهرَس — محتوى مكرّر بلا قيمة بحثية.
  // صفحات الهبوط المخصّصة تأتي في المهمة ١٠-ب.
  return activeFilterCount(filters) > 0 ? { robots: { index: false } } : {};
}

/**
 * Wb نتائج البحث.
 *
 * **الحالة كلها في الرابط.** لا حالة بحث في العميل: الصفحة تُبنى على
 * الخادم من `searchParams`، فالرابط المشترَك يعيد الشاشة كما هي في
 * تبويب جديد وفي جهاز آخر، والعودة بالمتصفّح تعمل بلا كود.
 */
export default async function CarsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const filters = parseFilters(toParams(await searchParams));

  const [result, brands, features, cities] = await Promise.all([
    searchListings(filters, locale),
    listBrandOptions(),
    listFeatureOptions('search_filter'),
    db.listing
      .groupBy({ by: ['city'], where: { status: 'PUBLISHED' }, _count: { _all: true } })
      .then((rows) => rows.map((r) => r.city).sort()),
  ]);

  const models = await listModelOptions(filters.brandId);

  return (
    <>
      <SiteHeader active="cars" />
      <main className="min-h-screen bg-bg text-ink">
        <div className="page-frame">
          <SearchHeading
            locale={locale}
            filters={filters}
            result={result}
            brands={brands}
            models={models}
          />

          <SearchScreen
            filters={filters}
            result={result}
            brands={brands}
            models={models}
            features={features}
            cities={cities}
            /** الرابط الحالي — يُبنى من نفس المُسلسِل الذي يفكّه الخادم */
            query={serializeFilters(filters).toString()}
          />
        </div>
      </main>
    </>
  );
}
