import { getTranslations, setRequestLocale } from 'next-intl/server';
import {notFound, permanentRedirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { routing } from '@/i18n/routing';
import { landingContent, landingFallback, landingSiblings } from '@/lib/domain/landing';
import { EMPTY_FILTERS, SORTS, type Sort, searchListings } from '@/lib/domain/listings';
import { CarCard } from '@/components/ui/CarCard';
import { toCardData } from '@/components/ui/toCardData';
import { ANONYMOUS_SELLER } from '@/lib/labels/admin';
import { FilterChip } from '@/components/ui/FilterChip';

export const dynamic = 'force-dynamic';

type Params = Promise<{ locale: string; city: string; brand: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, city, brand } = await params;
  if (!hasLocale(routing.locales, locale)) return {};

  const content = await landingContent(city, brand, null);
  if (content === null) return {};

  const t = await getTranslations({ locale, namespace: 'landing' });
  return {
    title: t('title', { brand: content.brand, city: content.city }),
    description: t('meta', { brand: content.brand, city: content.city, count: content.count }),
    // الأصل واحد — والصفحة بوّابةٌ إلى البحث لا نسخةٌ منه
    alternates: { canonical: `/${locale}/browse/${city}/${brand}` },
  };
}

/**
 * ١٠-ب — صفحة هبوط: مدينة × ماركة.
 *
 * والمقطع الثابت **لاتينيّ عمدًا**: مجلّدٌ باسمٍ عربيّ يُخزَّن على macOS
 * بصيغة NFD ويُقدَّم على Linux بـNFC، فيعمل محلّيًّا ويسقط ٤٠٤ بعد
 * النشر. والكلمات العربية باقية في المقاطع المتغيّرة — المدينة والماركة.
 *
 * **ولا تُولَّد إلا لتركيبةٍ لها إعلانات.** صفحةٌ فارغة أسوأ من غيابها:
 * يصلها الباحث فيخرج، ويتعلّم المحرّك أن الموقع يَعِد بما لا يملك.
 *
 * وهي **بوّابةٌ إلى البحث لا بديلٌ عنه**: الأرقام أعلاه والرابط يذهب
 * إلى نتائج البحث نفسها بمرشّحاتها.
 */
export default async function CityBrandLanding({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, city, brand } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const te = await getTranslations({ locale, namespace: 'enums' });
  const query = await searchParams;
  const resolvedSort = (typeof query.sort === 'string' ? query.sort : 'newest') as Sort;

  const [content, t] = await Promise.all([
    landingContent(city, brand, null),
    getTranslations('landing'),
  ]);
  /**
   * ═══ نفدت التركيبة ⇒ تُحوَّل إن بقي فيها شيء ═══
   *
   * العتبة ثلاثةٌ عند التوليد، والفحص على بيانات اللحظة — فما نُشر في
   * `sitemap.xml` اليوم يردّ ٤٠٤ غدًا متى بِيعت مركبة. **ورابطٌ
   * نشرتَه بنفسك ثم أمَتَّه أسوأ من رابطٍ لم يُنشر.**
   *
   * فإن بقي إعلانٌ واحد تُحوَّل ٣٠١ إلى البحث بمرشّحاتها — لا تُفقد
   * فهرسةٌ، ولا يُقابَل الزائر بباب مغلقٍ خلفه مركبتان. و٤٠٤ تبقى
   * لما لا شيء خلفه أصلًا.
   */
  if (content === null) {
    const fallback = await landingFallback(city, brand, null);
    if (fallback !== null) permanentRedirect(`/${locale}${fallback}`);
    notFound();
  }

  /**
   * ═══ والرابط القديم يُحوَّل لا يُكسَر ═══
   *
   * المقاطع صارت لاتينية (`riyadh` بدل `الرياض`)، وما فُهرس بالقديم
   * وما نُسخ في محادثةٍ يبقى عليه. وصفحةُ المركبة تُحوّل نفسها ٣٠١
   * منذ بُنيت — فالهبوط تفعل مثلها، وإلّا أسقطنا ما بُني من فهرسةٍ
   * بتغييرٍ تجميليّ.
   *
   * **وحارس الحلقة**: لا يُحوَّل مسارٌ إلى نفسه مهما اختلّ الحساب.
   */
  if (content.legacySlug) {
    const target = `/${locale}/browse/${content.citySlug}/${content.brandSlug}`;
    const here = `/${locale}/browse/${[city, brand].map(encodeURIComponent).join('/')}`;
    if (target !== here) permanentRedirect(target);
  }

  // الشاشة لا تُقارن مقاطع بنفسها — المقارنة حيث الفكّ مضمون
  const siblings = await landingSiblings(city, brand);

  /**
   * ═══ وشبكةُ الإعلانات هي الصفحة ═══
   *
   * كانت الصفحة عنوانًا وسطرَ إحصاء وزرًّا يقول «تصفّح» — **فالزائر
   * الآتي من محرّك بحثٍ لا يرى سيارةً واحدة**، ويُطلب منه أن ينقر
   * ليبدأ. وصفحةُ هبوطٍ لا تعرض ما وُعد به ترتدّ عنها العين.
   *
   * **والترتيب يُطلب**: الأحدث لمن يتابع، والأرخص لمن يوازن.
   */
  const sort = SORTS.includes(resolvedSort) ? resolvedSort : 'newest';

  const results = await searchListings(
    {
      ...EMPTY_FILTERS,
      city: content.city,
      brandId: content.brandId,
      ...(content.modelId === null ? {} : { modelId: content.modelId }),
      sort,
      limit: 12,
    },
    locale,
  );

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="page-frame">
          <h1 className="mb-2 text-4xl font-bold tracking-tight">
            {t('title', { brand: content.brand, city: content.city })}
          </h1>
          <p className="mb-7 flex flex-wrap items-center gap-2.5 text-sm opacity-65">
            <Quantity unit="cars" count={content.count} />
            {content.inspectedCount === 0 ? null : (
              <>
                <span aria-hidden className="opacity-40">·</span>
                <span className="flex items-center gap-1.5">
                  <ArabicNumber value={content.inspectedCount} />
                  <span>{t('inspected')}</span>
                </span>
              </>
            )}
            {content.priceMin === null || content.priceMax === null ? null : (
              <>
                <span aria-hidden className="opacity-40">·</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <span>{t('from')}</span>
                  <Money amount={content.priceMin} />
                  <span>{t('to')}</span>
                  <Money amount={content.priceMax} />
                </span>
              </>
            )}
          </p>

          {/*
            ═══ شريط الترتيب ═══

            **والترتيب يُطلب لا يُفرَض**: الأحدث لمن يتابع، والأرخص
            لمن يوازن. والعنوان يحمله فيُشارَك ويعمل بلا JS.
          */}
          <nav className="mb-6 flex flex-wrap items-center gap-2.5">
            <FilterChip href={`/${locale}/browse/${city}/${brand}`} active={sort === 'newest'}>
              الأحدث
            </FilterChip>
            <FilterChip
              href={`/${locale}/browse/${city}/${brand}?sort=price_asc`}
              active={sort === 'price_asc'}
            >
              الأقلّ سعرًا
            </FilterChip>
            <FilterChip
              href={`/${locale}/browse/${city}/${brand}?sort=price_desc`}
              active={sort === 'price_desc'}
            >
              الأعلى سعرًا
            </FilterChip>
          </nav>

          {/*
            ═══ والشبكة هي الصفحة ═══

            كانت عنوانًا وسطرَ إحصاء وزرًّا — فالزائر الآتي من محرّك
            بحثٍ لا يرى سيارةً واحدة، ويُطلب منه أن ينقر ليبدأ.
          */}
          {results.items.length === 0 ? null : (
            <ul className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.items.map((item) => (
                <li key={item.ref}>
                  {/* التسمية من `enums` نفسها التي تقرؤها بقيّة الشاشات — لا نسخة ثانية */}
                  {/* التحويل من `toCardData` — مرّةً لا في كل شاشة */}
                  <CarCard
                    data={toCardData(item, {
                      transmission: te(`transmission.${item.transmission}`),
                      anonymousSeller: ANONYMOUS_SELLER,
                    })}
                  />
                </li>
              ))}
            </ul>
          )}

          <Link
            href={`/${locale}/cars?${content.searchQuery}`}
            className="inline-block rounded-full border border-ink px-7 py-3 text-sm font-bold hover:bg-ink hover:text-bg"
          >
            {t('browse', { brand: content.brand, city: content.city })}
          </Link>

          {siblings.length === 0 ? null : (
            <>
              <h2 className="mt-9 mb-3.5 text-sm font-bold">{t('byModel')}</h2>
              <ul className="flex flex-wrap gap-2">
                {siblings.map((entry) => (
                  <li key={entry.modelSlug}>
                    <Link
                      href={`/${locale}/browse/${entry.citySlug}/${entry.brandSlug}/${entry.modelSlug ?? ''}`}
                      className="flex items-center gap-2 rounded-full border border-line px-4 py-2 text-2xs hover:border-ink"
                    >
                      <span className="bidi-isolate">{entry.model}</span>
                      <ArabicNumber value={entry.count} className="opacity-50" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </main>
    </>
  );
}
