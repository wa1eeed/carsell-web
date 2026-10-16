'use client';

import { ANONYMOUS_SELLER } from '@/lib/labels/admin';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useCallback, useMemo, useState, type ReactNode } from 'react';

import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Button } from '@/components/ui/Button';
import { CarCard, CarRow, type ListingCardData } from '@/components/ui/CarCard';
import { Chip } from '@/components/ui/Chip';
import { SaveSearchButton } from '@/components/site/SaveSearchButton';
import { SponsoredCard, SponsoredRow } from '@/components/site/SponsoredCard';
import { SearchAbout, type SearchSibling } from '@/components/site/SearchAbout';
import { SPONSORED_AFTER } from '@/lib/domain/ad-rules';
import type { ServedAd } from '@/lib/domain/ad-rules';
import { EmptyState } from '@/components/ui/EmptyState';
import { Quantity } from '@/components/ui/Quantity';
import { RANGE_MIN_SAMPLE } from '@/components/ui/RangeBar';
import { RangeSlider } from '@/components/ui/RangeSlider';
import { Sheet } from '@/components/ui/Sheet';
import type { Filters, ListingCard, SearchResult, Sort } from '@/lib/domain/listings';
import { cn } from '@/lib/cn';

type Option = { id: string; nameAr: string; nameEn: string };
type FeatureOption = { key: string; nameAr: string; nameEn: string };

const TYPES = ['DIRECT', 'NEGOTIATION', 'AUCTION'] as const;
const SORT_OPTIONS: readonly Sort[] = ['newest', 'price_asc', 'price_desc', 'closing_soon'];

/**
 * Wb — الفلاتر والنتائج.
 *
 * **الرابط هو الحالة.** كل تغيير يكتب في `searchParams` ويعيد التوجيه؛
 * لا نسخة ثانية من الفلاتر في العميل تنحرف عن الرابط. وأثر ذلك أن
 * النسخ واللصق والعودة بالمتصفّح والمشاركة تعمل كلها بلا كود إضافي.
 */
export function SearchScreen({
  filters,
  result,
  brands,
  models,
  features,
  cities,
  query,
  fromQuery,
  signedIn,
  savedAlready,
  locale,
  ads,
  about,
}: {
  filters: Filters;
  result: SearchResult;
  brands: readonly Option[];
  models: readonly Option[];
  features: readonly FeatureOption[];
  cities: readonly string[];
  query: string;
  /** حقولٌ فسّرها شريط الجملة — فلا تُعرض شارتها ثانيةً */
  fromQuery: readonly string[];
  /** حملاتٌ صالحة لهذا البحث — فارغةٌ حين لا حملة، وهي الحال اليوم */
  ads: readonly ServedAd[];
  /** ما تحت النتائج: وصفُ البحث وأشقّاؤه — وكلاهما من الوجوه بلا استعلام */
  about: { scope: string | null; siblings: readonly SearchSibling[] };
  signedIn: boolean;
  savedAlready: boolean;
  locale: string;
}) {
  const t = useTranslations('search');
  const te = useTranslations('enums');
  const tu = useTranslations('ui');
  const router = useRouter();
  const params = useSearchParams();
  /**
   * ═══ والقائمة هي الافتراض ═══
   *
   * الشبكة تعرض صورةً كبيرة وسطرين، والقائمة تعرض الممشى والناقل
   * والمدينة والسعر في صفٍّ واحد — **وهذه هي التي يُقارَن بها**. ومن
   * يتصفّح سوق سيارات يوازن لا يتفرّج، فالافتراض ما يُوازن به.
   */
  const [view, setView] = useState<'grid' | 'list'>('list');
  const [sheet, setSheet] = useState(false);
  const [featureSheet, setFeatureSheet] = useState(false);

  /** أي تعديل فلتر يعيد الصفحة إلى ١ — نتيجة الصفحة ٣ لفلتر آخر بلا معنى. */
  const apply = useCallback(
    (changes: Record<string, string | string[] | null>) => {
      const next = new URLSearchParams(params.toString());

      /**
       * ═══ وما تُلغيه الجملةُ تُعيده ═══
       *
       * فلترٌ جاء من جملة البحث ليس مكتوبًا في الرابط، فحذفُه منه لا
       * يحذف شيئًا — ويُعاد تطبيقه في التصيير التالي، **فيبدو الزرّ
       * عالقًا**: يضغطه صاحبه فلا يتغيّر شيء، ولا رسالة.
       *
       * و`-` تحمل ما ألغاه الزائر صراحةً، فيصمد الإلغاء. (وهي نفسها
       * التي تستعملها شارات شريط الفهم.)
       */
      const dropped = new Set((next.get('-') ?? '').split(',').filter((part) => part !== ''));

      for (const [key, value] of Object.entries(changes)) {
        next.delete(key);
        if (value === null) {
          dropped.add(key);
          continue;
        }
        dropped.delete(key);
        if (Array.isArray(value)) for (const v of value) next.append(key, v);
        else next.set(key, value);
      }

      next.delete('-');
      if (dropped.size > 0 && next.has('q')) next.set('-', [...dropped].join(','));
      if (!('page' in changes)) next.delete('page');
      router.push(next.toString() === '' ? '?' : `?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const toggle = useCallback(
    (key: string, value: string) => {
      apply({ [key]: params.get(key) === value ? null : value });
    },
    [apply, params],
  );


  /**
   * الرقائق المفعّلة — **مرآة الفلاتر لا قائمة ثانية**.
   * كل رقاقة تُبنى من نفس الفلتر الذي تلغيه، فلا يمكن أن تظهر رقاقة
   * لفلتر غير مفعّل ولا العكس.
   */
  const chips = useMemo(() => {
    const out: { key: string; label: ReactNode; clear: Record<string, string | null> }[] = [];
    /** وما فُسِّر في شريط الجملة لا يُعاد هنا — تكرارٌ لا تأكيد. */
    const explained = new Set(fromQuery);
    const add = (key: string, label: ReactNode, clear: Record<string, string | null>) => {
      if (explained.has(key)) return;
      out.push({ key, label, clear });
    };
    /** كلمة ثم رقم — الرقم عبر `ArabicNumber` لا داخل سلسلة. */
    const withNumber = (word: string, value: number): ReactNode => (
      <>
        {word} <ArabicNumber value={value} grouped={value > 9999} />
      </>
    );

    const brandName = (id: string): string => brands.find((b) => b.id === id)?.nameAr ?? id;
    const modelName = (id: string): string => models.find((m) => m.id === id)?.nameAr ?? id;
    const featureName = (key: string): string =>
      features.find((f) => f.key === key)?.nameAr ?? key;

    if (filters.type !== null) add('type', t(`type.${filters.type}`), { type: null });
    if (filters.brandId !== null) {
      // إلغاء الماركة يُلغي الطراز والفئة — لا معنى لطراز بلا ماركته
      add('brandId', brandName(filters.brandId), { brandId: null, modelId: null, trimId: null });
    }
    if (filters.modelId !== null) add('modelId', modelName(filters.modelId), { modelId: null, trimId: null });
    if (filters.city !== null) add('city', filters.city, { city: null });
    if (filters.condition !== null) add('condition', te(`condition.${filters.condition}`), { condition: null });
    if (filters.transmission !== null) add('transmission', te(`transmission.${filters.transmission}`), { transmission: null });
    if (filters.fuel !== null) add('fuel', te(`fuel.${filters.fuel}`), { fuel: null });
    if (filters.bodyType !== null) add('bodyType', te(`bodyType.${filters.bodyType}`), { bodyType: null });
    if (filters.spec !== null) add('spec', te(`spec.${filters.spec}`), { spec: null });
    if (filters.yearFrom !== null) add('yearFrom', withNumber(t('from'), filters.yearFrom), { yearFrom: null });
    if (filters.yearTo !== null) add('yearTo', withNumber(t('to'), filters.yearTo), { yearTo: null });
    if (filters.priceMin !== null) add('priceMin', withNumber(t('priceFrom'), filters.priceMin), { priceMin: null });
    if (filters.priceMax !== null) add('priceMax', withNumber(t('priceTo'), filters.priceMax), { priceMax: null });
    if (filters.mileageMax !== null) add('mileageMax', withNumber(t('mileageUnder'), filters.mileageMax), { mileageMax: null });
    if (filters.mileageMin !== null) add('mileageMin', withNumber(t('from'), filters.mileageMin), { mileageMin: null });
    if (filters.inspected === true) add('inspected', t('inspectedOnly'), { inspected: null });
    if (filters.scoreMin !== null) add('scoreMin', withNumber(t('scoreFrom'), filters.scoreMin), { scoreMin: null });
    if (filters.paintStatus === 'ORIGINAL') add('paintStatus', t('noPaint'), { paintStatus: null });
    if (filters.verifiedSeller === true) add('verifiedSeller', t('verifiedOnly'), { verifiedSeller: null });
    if (filters.financing === true) add('financing', t('financingOnly'), { financing: null });
    for (const key of filters.features) {
      add(`f:${key}`, featureName(key), {});
    }
    return out;
  }, [filters, t, te, brands, models, features, fromQuery]);

  const toCard = (item: ListingCard): ListingCardData => ({
    ref: item.ref,
    title: item.title,
    year: item.year,
    city: item.city,
    mileageKm: item.mileageKm,
    transmissionLabel: te(`transmission.${item.transmission}`),
    price: Number(item.price),
    monthly: item.monthly ?? undefined,
    type: item.type,
    inspected: item.inspected,
    imageCount: item.imageCount,
    // `null` من النطاق — والتسمية هنا
    sellerName: item.sellerName ?? ANONYMOUS_SELLER,
    sellerVerified: item.sellerVerified,
    isOwn: item.isOwn,
    ...(item.publishedAt === null ? {} : { publishedAt: item.publishedAt }),
    ...(item.highestBid === null ? {} : { highestBid: Number(item.highestBid) }),
    ...(item.bidderCount === null ? {} : { bidderCount: item.bidderCount }),
    ...(item.endsAt === null ? {} : { endsAt: item.endsAt }),
  });

  const facetLabel = (n: number | undefined): number => n ?? 0;

  const isNew = filters.condition === 'NEW';
  const bounds = result.facets;

  /**
   * سؤال الحالة أولًا — **وهو الذي يحدّد بقية الخيارات**.
   * سيارة جديدة بلا ممشى، وعرض حقلٍ لا معنى له يجعل القارئ
   * يظنّ أنه نسي شيئًا. الاختيار يمسح ما بطل معه.
   */
  const conditionCard = (value: 'NEW' | 'USED') => {
    const on = filters.condition === value;
    return (
      <button
        key={value}
        type="button"
        onClick={() =>
          apply(
            on
              ? { condition: null }
              : value === 'NEW'
                ? { condition: 'NEW', mileageMin: null, mileageMax: null }
                : { condition: 'USED' },
          )
        }
        className={cn(
          'flex-1 rounded-lg p-3.5 text-start',
          on ? 'bg-accent text-bg' : 'border border-line hover:bg-ink/5',
        )}
      >
        <span className="mb-1 block text-sm font-bold">{te(`condition.${value}`)}</span>
        <span className={cn('block text-3xs', on ? 'opacity-75' : 'opacity-70')}>
          {t(value === 'NEW' ? 'conditionNewHint' : 'conditionUsedHint')}
        </span>
      </button>
    );
  };

  const section = (title: string, hint: string | null, body: ReactNode) => (
    <section>
      <h3 className="mb-3 flex items-baseline gap-2 text-2xs font-bold tracking-[0.12em] opacity-65">
        {title}
        {hint === null ? null : <span className="font-medium tracking-normal">— {hint}</span>}
      </h3>
      {body}
    </section>
  );

  const panel = (
    <div className="flex flex-col gap-6">
      {section(
        t('conditionTitle'),
        t('conditionHint'),
        <div className="flex gap-2">{conditionCard('NEW')}{conditionCard('USED')}</div>,
      )}

      {bounds.price === null
        ? null
        : section(
            t('price'),
            null,
            <>
              <RangeSlider
                min={bounds.price.min}
                max={bounds.price.max}
                value={[filters.priceMin, filters.priceMax]}
                step={1000}
                label={t('currency')}
                /**
                 * المدرَّج يظهر فوق عتبة الثقة نفسها التي في
                 * `RangeBar` — «توزّع الأسعار» على أربع سيارات
                 * ليس توزّعًا، وأعمدة متساوية تدّعي معنى لا تحمله.
                 */
                bars={result.total >= RANGE_MIN_SAMPLE ? result.facets.priceBars : undefined}
                onCommit={([lo, hi]) =>
                  apply({
                    priceMin: lo === null ? null : String(lo),
                    priceMax: hi === null ? null : String(hi),
                  })
                }
              />
              {result.total < RANGE_MIN_SAMPLE ? null : (
                <p className="mt-1.5 text-3xs opacity-65">{t('priceSpread')}</p>
              )}
            </>,
          )}

      <section>
        <h3 className="mb-3 text-2xs font-bold tracking-[0.12em] opacity-65">
          {t('brandAndModel')}
        </h3>
        <div className="flex flex-wrap gap-2">
          {brands
            .filter((b) => (result.facets.brandId[b.id] ?? 0) > 0 || filters.brandId === b.id)
            .slice(0, 8)
            .map((brand) => (
              <Chip
                key={brand.id}
                active={filters.brandId === brand.id}
                count={facetLabel(result.facets.brandId[brand.id])}
                onClick={() => apply({ brandId: filters.brandId === brand.id ? null : brand.id, modelId: null, trimId: null })}
              >
                {brand.nameAr}
              </Chip>
            ))}
        </div>
        {models.length === 0 ? null : (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {models.map((model) => (
              <Chip
                key={model.id}
                active={filters.modelId === model.id}
                onClick={() => toggle('modelId', model.id)}
              >
                {model.nameAr}
              </Chip>
            ))}
          </div>
        )}
      </section>

      {bounds.year === null
        ? null
        : section(
            t('year'),
            null,
            <RangeSlider
              min={bounds.year.min}
              max={bounds.year.max}
              value={[filters.yearFrom, filters.yearTo]}
              label={t('modelYear')}
              grouped={false}
              onCommit={([lo, hi]) =>
                apply({
                  yearFrom: lo === null ? null : String(lo),
                  yearTo: hi === null ? null : String(hi),
                })
              }
            />,
          )}

      {/* الجديد بلا ممشى — الحقل يختفي ولا يُعرض معطّلًا */}
      {isNew || bounds.mileage === null
        ? null
        : section(
            t('mileage'),
            null,
            <RangeSlider
              min={0}
              max={Math.max(bounds.mileage.max, 1)}
              value={[filters.mileageMin, filters.mileageMax]}
              step={5000}
              label={t('kilometre')}
              onCommit={([lo, hi]) =>
                apply({
                  mileageMin: lo === null ? null : String(lo),
                  mileageMax: hi === null ? null : String(hi),
                })
              }
            />,
          )}

      <section>
        <h3 className="mb-3 text-2xs font-bold tracking-[0.12em] opacity-65">
          {t('offerType')}
        </h3>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((type) => (
            <Chip
              key={type}
              active={filters.type === type}
              count={facetLabel(result.facets.type[type])}
              onClick={() => toggle('type', type)}
            >
              {t(`type.${type}`)}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-2xs font-bold tracking-[0.12em] opacity-65">
          {t('city')}
        </h3>
        <div className="flex flex-wrap gap-2">
          {cities.map((city) => (
            <Chip
              key={city}
              active={filters.city === city}
              count={facetLabel(result.facets.city[city])}
              onClick={() => toggle('city', city)}
            >
              {city}
            </Chip>
          ))}
        </div>
      </section>

      {/**
        * المميّزات صفّ يفتح ورقة — تسع وثلاثون رقاقة مفتوحة تُغرق
        * العمود وتدفن ما تحتها، والقارئ لا يبحث فيها إلا قاصدًا.
        */}
      <button
        type="button"
        onClick={() => setFeatureSheet(true)}
        className="flex items-center gap-3 rounded-lg border border-line px-4 py-3 text-start hover:bg-ink/5"
      >
        <span className="flex-1 text-sm font-semibold">{t('features')}</span>
        <span className="max-w-[130px] truncate text-2xs opacity-70">
          {filters.features.length === 0 ? (
            t('none')
          ) : (
            <Quantity unit="features" count={filters.features.length} />
          )}
        </span>
        <svg viewBox="0 0 24 24" className="size-3 opacity-35 rtl:rotate-180" fill="none" stroke="currentColor" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>

      <section>
        <h3 className="mb-3 text-2xs font-bold tracking-[0.12em] opacity-65">
          {t('inspectionAndSeller')}
        </h3>
        <div className="flex flex-wrap gap-2">
          <Chip active={filters.inspected === true} onClick={() => toggle('inspected', 'true')}>
            {t('inspectedOnly')}
          </Chip>
          <Chip active={filters.scoreMin === 80} onClick={() => toggle('scoreMin', '80')}>
            {t('score80')}
          </Chip>
          <Chip active={filters.paintStatus === 'ORIGINAL'} onClick={() => toggle('paintStatus', 'ORIGINAL')}>
            {t('noPaint')}
          </Chip>
          <Chip active={filters.verifiedSeller === true} onClick={() => toggle('verifiedSeller', 'true')}>
            {t('verifiedOnly')}
          </Chip>
          <Chip active={filters.financing === true} onClick={() => toggle('financing', 'true')}>
            {t('financingOnly')}
          </Chip>
        </div>
      </section>
    </div>
  );

  return (
    <div className="flex gap-10">
      <aside className="hidden w-[280px] shrink-0 flex-col gap-5 lg:flex">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg font-bold">{t('filters')}</h2>
          {chips.length > 0 ? (
            <>
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-ink text-3xs text-bg">
                <ArabicNumber value={chips.length} />
              </span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => router.push('?', { scroll: false })}
                className="text-xs font-semibold text-accent-700 hover:underline"
              >
                {t('clear')}
              </button>
            </>
          ) : null}
        </div>
        {panel}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* الرقائق المفعّلة — مرآة الفلاتر */}
        {chips.length === 0 ? null : (
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <Chip
                key={chip.key}
                active
                onRemove={() =>
                  chip.key.startsWith('f:')
                    ? apply({
                        features: filters.features.filter(
                          (f) => f !== chip.key.slice(2),
                        ),
                      })
                    : apply(chip.clear)
                }
              >
                {chip.label}
              </Chip>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-b border-line pb-3.5">
          <Quantity unit="cars" count={result.total} className="text-base font-bold" />
          <span className="flex-1" />

          <Button size="sm" variant="outline" className="lg:hidden" onClick={() => setSheet(true)}>
            {t('filters')}
          </Button>

          {/*
            «احفظ البحث» في شريط النتائج كما في التصميم — **وبعد عدد
            النتائج لا قبله**: من يحفظ يحفظ بعد أن يرى أن الفلتر أصاب.
          */}
          <SaveSearchButton
            query={query}
            signedIn={signedIn}
            saved={savedAlready}
            locale={locale}
          />

          {/*
            قائمة الترتيب بلا عنوان مرئيّ — فالتسمية بـ`aria-label`.
            وقارئُ الشاشة يقرأ «الأحدث» ولا يعرف أنها ترتيب.
          */}
          <select
            aria-label={t('sortLabel')}
            value={filters.sort}
            onChange={(e) => apply({ sort: e.target.value })}
            className="rounded-md border border-line bg-surface px-3.5 py-2 text-sm outline-none"
          >
            {SORT_OPTIONS.map((sort) => (
              <option key={sort} value={sort}>
                {t(`sort.${sort}`)}
              </option>
            ))}
          </select>

          <div className="flex overflow-hidden rounded-md border border-line">
            {/* والقائمة أوّلًا — ترتيبُ الخيارين يقول أيّهما الأصل. */}
            {(['list', 'grid'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={cn(
                  'px-3.5 py-2 text-xs font-semibold',
                  view === mode ? 'bg-ink text-bg' : 'opacity-60',
                )}
              >
                {t(`view.${mode}`)}
              </button>
            ))}
          </div>
        </div>

        {result.items.length === 0 ? (
          <EmptyState
            title={t('emptyTitle')}
            description={t('emptyBody')}
            action={
              <Button variant="outline" onClick={() => router.push('?', { scroll: false })}>
                {t('clear')}
              </Button>
            }
          />
        ) : view === 'grid' ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {/*
              **البطاقة بلا رابط ليست بطاقة.** كانت نتائج البحث تُعرض بلا
              روابط، فيرى الزائر عشرات السيارات ولا يفتح واحدة — والرئيسية
              كانت تلفّ بطاقاتها منذ البداية، فبقي العطل في الشاشة التي
              يصلها أكثر الناس.
            */}
            {result.items.map((item, index) => (
              <Fragment key={item.ref}>
                <Link href={item.href}>
                  <CarCard data={toCard(item)} />
                </Link>
                {/*
                  **والمموّل بين البطاقات لا فوقها.** المساحة
                  `search_inline` موضعُها المكتوب «بعد كل ٦ نتائج»،
                  وعرضُه في الصدر يجعل أوّل ما يراه الباحث إعلانًا.

                  ولا يُعرض في صفحةٍ أقصر من موضعه: بطاقتان ثمّ إعلان
                  نسبةٌ أخرى غير التي بِيعت.
                */}
                {index + 1 !== SPONSORED_AFTER || ads.length === 0 ? null : (
                  <SponsoredCard ad={ads[0] as ServedAd} label={tu('sponsored')} />
                )}
              </Fragment>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/*
              **والمموّل في القائمة كما في الشبكة.** كان يُعرض في نمط
              الشبكة وحده، ثمّ صار الافتراضيّ القائمة — فالمساحة الوحيدة
              الموصولة في المنتج لم يعد يراها أكثرُ الزوّار، وهي مبيعةٌ
              بالنقرة ومعروضةٌ في لوحة الأدمن بموضعها «بعد كل ٦ نتائج».

              والموضع واحدٌ في الشكلين: نسبةٌ أخرى غير التي بِيعت.
            */}
            {result.items.map((item, index) => (
              <Fragment key={item.ref}>
                <Link href={item.href}>
                  <CarRow data={toCard(item)} />
                </Link>
                {index + 1 !== SPONSORED_AFTER || ads.length === 0 ? null : (
                  <SponsoredRow ad={ads[0] as ServedAd} label={tu('sponsored')} />
                )}
              </Fragment>
            ))}
          </div>
        )}

        {result.totalPages <= 1 ? null : (
          <nav className="flex items-center justify-center gap-2 pt-4">
            {Array.from({ length: result.totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => apply({ page: page === 1 ? null : String(page) })}
                className={cn(
                  'size-9 rounded-md text-sm font-semibold',
                  page === result.page ? 'bg-ink text-bg' : 'border border-line',
                )}
              >
                <ArabicNumber value={page} grouped={false} />
              </button>
            ))}
          </nav>
        )}

        {/*
          ═══ وما تحت النتائج — Wb ═══

          التصميم يُنهي الصفحة بعنوانٍ عن أسعار ما بحثتَ عنه، وفقرةٍ
          تصفُه، وبحوثٍ ذات صلة. **ولم يكن تحتها شيء** — ومن وصل آخر
          الصفحة ولم يجد مركبته إمّا أن يخرج أو يجد أين يذهب.
        */}
        <SearchAbout
          total={result.total}
          priceRange={result.priceRange}
          scope={about.scope}
          siblings={about.siblings}
        />

        {/*
          **سطرُ تطويرٍ كان يُعرض للزائر**: الرابط الخام أسفل النتائج
          بمعرّفاتٍ داخلية (`brandId=cmsfq1khy…`). لا يقول للزائر شيئًا
          ويُقرأ عطلًا، ويكشف شكل مفاتيحنا بلا مقابل. و`query` باقية —
          يقرؤها زرّ «احفظ البحث».
        */}
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title={t('filters')}>
        {panel}
      </Sheet>

      <Sheet
        open={featureSheet}
        onClose={() => setFeatureSheet(false)}
        title={t('featuresPick')}
      >
        <div className="flex flex-wrap gap-2">
          {features.map((feature) => {
            const on = filters.features.includes(feature.key);
            return (
              <Chip
                key={feature.key}
                active={on}
                onClick={() =>
                  apply({
                    features: on
                      ? filters.features.filter((f) => f !== feature.key)
                      : [...filters.features, feature.key],
                  })
                }
              >
                {feature.nameAr}
              </Chip>
            );
          })}
        </div>
      </Sheet>
    </div>
  );
}
