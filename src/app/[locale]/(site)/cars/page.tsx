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
import { currentUserFromCookies } from '@/lib/domain/account';
import { isSaved } from '@/lib/domain/saved-search';
import { understand } from '@/lib/domain/query-vocabulary';
import type { Chip } from '@/lib/domain/query-parse';
import { QueryUnderstanding } from '@/components/site/QueryUnderstanding';
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

/**
 * ═══ الجملة تصير فلاتر ═══
 *
 * **و`q` كان يُرسَل ولا يُقرأ**: شريط الصدر يضعه في الرابط، وصفحة
 * النتائج تتجاهله — فمن كتب «كامري ٢٠٢٠ مستعملة» رأى الستّ والأربعين
 * كلّها، وهو ما يراه من لم يكتب شيئًا.
 *
 * **والمكتوب صراحةً يتقدّم على المفهوم.** من حذف شارةً أو حرّك
 * منزلقًا كتب نيّته بيده، فلا تعيدها الجملة في التصيير التالي — ولولا
 * ذلك لصارت الشارة لا تُحذف أبدًا.
 */
function applyUnderstanding(params: URLSearchParams, chips: readonly Chip[]): URLSearchParams {
  const merged = new URLSearchParams(params);
  for (const chip of chips) {
    if (merged.has(chip.field)) continue;
    /** `dropped` تحمل ما حذفه الزائر — فالحذف يصمد عبر التصييرات. */
    if (dropped(params).has(chip.field)) continue;
    merged.set(chip.field, String(chip.value));
  }
  return merged;
}

const dropped = (params: URLSearchParams): Set<string> =>
  new Set((params.get('-') ?? '').split(',').filter((part) => part !== ''));

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

  const query = toParams(await searchParams);
  const text = query.get('q') ?? '';
  const understood = await understand(text);
  const filters = parseFilters(applyUnderstanding(query, understood.chips));

  const [result, brands, features, cities] = await Promise.all([
    searchListings(filters, locale),
    listBrandOptions(),
    listFeatureOptions('search_filter'),
    db.listing
      .groupBy({ by: ['city'], where: { status: 'PUBLISHED' }, _count: { _all: true } })
      .then((rows) => rows.map((r) => r.city).sort()),
  ]);

  const models = await listModelOptions(filters.brandId);

  /**
   * **والزرّ يقول حالَه قبل الضغط.** «احفظ» على بحثٍ محفوظٍ أصلًا
   * يَعِد بما وقع، فيضغطه صاحبه فيُقال له «مكرّر» — وهو لم يخطئ.
   */
  const viewer = await currentUserFromCookies();
  const current = serializeFilters(filters).toString();
  const alreadySaved = await isSaved(viewer?.id ?? null, current);

  /**
   * الشارة تقول «تويوتا» لا `cmx…` — والأسماء من نفس القائمتين
   * اللتين يعرضهما الفلتر، فلا استعلام ثالث.
   */
  const names: Record<string, string> = {};
  for (const row of [...brands, ...models]) {
    names[row.id] = locale === 'ar' ? row.nameAr : row.nameEn;
  }

  /**
   * ═══ ما جاء من الجملة لا يُكرَّر أسفلها ═══
   *
   * شريط الفهم يعرض «كامري · مستعملة · حتى ١٢٠٬٠٠٠»، وصفُّ الفلاتر
   * المفعّلة كان يعرضها ثانيةً تحته — **الشيء نفسه مرّتين في شاشة
   * واحدة**. والمفهوم يُعرض حيث يُفسَّر، والمفعَّل باليد حيث يُفعَّل.
   */
  const fromQuery = understood.chips
    .filter((chip) => !query.has(chip.field))
    .map((chip) => String(chip.field));

  /**
   * حذفُ الشارة **رابطٌ لا حالةُ عميل**: ينزع الفلتر ويسجّل الحقل في
   * `-` كي لا تعيده الجملة. فيعمل قبل وصول الحزمة، ورابطُه يُشارَك.
   */
  const hrefWithout = (chip: Chip): string => {
    /**
     * **ويُبنى من الرابط الوارد لا من الفلاتر المحسوبة.** أوّل صياغةٍ
     * سلسلت الفلاتر كلّها، فصار ما استنتجته الجملة مكتوبًا صراحةً —
     * وحذفُ شارةٍ واحدة يُثبّت أخواتها في الرابط، فتظهر كلٌّ منها
     * **مرّتين**: في شريط الفهم وفي صفّ الفلاتر المفعّلة.
     */
    const next = new URLSearchParams(query);
    next.delete(chip.field);
    const skip = new Set([...dropped(query), chip.field]);
    // والموديل يُحذف بماركته — وإلّا بقيت ماركةٌ لم يكتبها أحد
    if (chip.field === 'modelId') {
      next.delete('brandId');
      skip.add('brandId');
    }
    next.set('-', [...skip].join(','));
    return `/${locale}/cars?${next.toString()}`;
  };

  return (
    <>
      <SiteHeader active="cars" />
      <main className="min-h-screen bg-bg text-ink">
        <div className="page-frame">
          <QueryUnderstanding
            text={text}
            chips={understood.chips}
            rest={understood.rest}
            locale={locale}
            names={names}
            hrefWithout={hrefWithout}
            dropped={[...dropped(query)]}
          />

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
            fromQuery={fromQuery}
            signedIn={viewer !== null}
            savedAlready={alreadySaved}
            locale={locale}
          />
        </div>
      </main>
    </>
  );
}
