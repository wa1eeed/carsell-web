import { getTranslations, setRequestLocale } from 'next-intl/server';
import { toArabicDigits } from '@/lib/arabic';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { CarCard } from '@/components/ui/CarCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Quantity } from '@/components/ui/Quantity';
import { routing } from '@/i18n/routing';
import { type DealerStockFilter, getDealerPage } from '@/lib/domain/dealer-page';
import { FilterChip } from '@/components/ui/FilterChip';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};

  const dealer = await getDealerPage(slug, locale);
  if (dealer === null) return {};

  const t = await getTranslations({ locale, namespace: 'dealer' });
  return {
    title: `${dealer.name} — ${dealer.city}`,
    description: dealer.about ?? t('metaFallback', { city: dealer.city }),
    alternates: { canonical: `/${locale}/dealers/${dealer.slug}` },
  };
}

/**
 * Wg — صفحة المعرض.
 *
 * **صفحة ثقة قبل أن تكون فهرسًا.** المشتري يفتحها ليعرف مع من يتعامل،
 * فالتوثيق والمدينة والمدّة والمباع فوق المركبات لا تحتها.
 *
 * **ورقم السجلّ والرقم الضريبيّ لا يخرجان**: بيانات تسجيلٍ لا شارات
 * ثقة، وعرضُها يدعو إلى انتحال المعرض في موضعٍ آخر.
 */
const STOCK_TABS = [
  { key: null, label: 'الكل' },
  { key: 'DIRECT' as const, label: 'بيع مباشر' },
  { key: 'NEGOTIATION' as const, label: 'تفاوض' },
  { key: 'AUCTION' as const, label: 'مزاد' },
];

export default async function DealerPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const query = await searchParams;
  const rawType = typeof query.type === 'string' ? query.type : null;
  const filter = (STOCK_TABS.find((row) => row.key === rawType)?.key ?? null) as DealerStockFilter;

  const [dealer, t, te, nav, ui] = await Promise.all([
    getDealerPage(slug, locale, filter),
    getTranslations('dealer'),
    getTranslations('enums'),
    getTranslations('site.nav'),
    getTranslations('ui'),
  ]);
  // غير النشط ٤٠٤ — لا صفحة ثقةٍ لمن لم يُقبل بعد
  if (dealer === null) notFound();

  const joined = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <SiteHeader active="dealers" />
      <main className="min-h-screen bg-bg text-ink">
        <div className="page-frame">
          <Breadcrumb
            label={ui('breadcrumb')}
            className="mb-5"
            items={[
              { label: nav('home'), href: `/${locale}` },
              { label: nav('dealers'), href: `/${locale}/dealers` },
              { label: dealer.name },
            ]}
          />

          <section className="mb-8 rounded-xl border border-line bg-surface p-6">
            <div className="flex flex-wrap items-start gap-5">
              <div className="min-w-0 flex-1">
                <h1 className="mb-2 flex flex-wrap items-center gap-2.5 text-3xl font-bold tracking-tight">
                  <span className="bidi-isolate">{dealer.name}</span>
                  {!dealer.verified ? null : <Badge tone="accent">{t('verified')}</Badge>}
                </h1>

                <p className="flex flex-wrap items-center gap-2.5 text-2xs opacity-60">
                  <span>{dealer.city}</span>
                  <span aria-hidden className="opacity-40">·</span>
                  <span className="flex items-center gap-1.5">
                    {t('joined')}
                    <span className="bidi-isolate">{joined.format(new Date(dealer.joinedAt))}</span>
                  </span>
                  {dealer.ratingAvg === null ? null : (
                    <>
                      <span aria-hidden className="opacity-40">·</span>
                      <span className="flex items-center gap-1.5">
                        <ArabicNumber value={Number(dealer.ratingAvg)} decimals={1} />
                        <Quantity unit="reviews" count={dealer.ratingCount} />
                      </span>
                    </>
                  )}
                </p>

                {dealer.about === null ? null : (
                  <p className="mt-3.5 max-w-2xl text-sm leading-loose opacity-75">{dealer.about}</p>
                )}
              </div>

              {/*
                عدّادان محسوبان من صفوفهما لا من عمودٍ مخزَّن — وعمودٌ
                كهذا يكذب أوّل مرّة يُلغى فيها طلب.
              */}
              <dl className="flex gap-7">
                <div>
                  <dd className="text-2xl font-bold">
                    <ArabicNumber value={dealer.listingCount} />
                  </dd>
                  <dt className="text-2xs opacity-55">{t('listed')}</dt>
                </div>
                <div>
                  <dd className="text-2xl font-bold">
                    <ArabicNumber value={dealer.soldCount} />
                  </dd>
                  <dt className="text-2xs opacity-55">{t('sold')}</dt>
                </div>
              </dl>
            </div>

            {/*
              ═══ «تواصل مع المعرض» — فعلٌ لا نصّ ═══

              كان الرقم يُطبَع نصًّا تحت الاسم. **ومن يفتح صفحة معرضٍ
              يفتحها ليتواصل** — فيجد رقمًا يحفظه بيده أو ينسخه، وهو
              الإجراء الأوّل في الشاشة كلّها عند التصميم.

              و`tel:` لا زرٌّ يفتح نافذة: على الهاتف يطلب، وعلى الحاسوب
              يفتح ما اختاره صاحبه — ولا يَعِد بمراسلةٍ لا وجود لها
              (قرار المصمّم ١٨: المراسلة مؤجَّلة، ولا تُفتح بزر).
            */}
            {dealer.phone === null ? null : (
              <div className="mt-4 border-t border-line pt-4">
                <a
                  href={`tel:${dealer.phone}`}
                  className="inline-flex items-center gap-2.5 rounded-btn bg-ink px-5 py-2.5 text-2xs font-bold text-bg transition-opacity hover:opacity-85"
                >
                  <PhoneIcon />
                  {t('contact')}
                  <span dir="ltr" className="font-num opacity-70">
                    {dealer.phone}
                  </span>
                </a>
              </div>
            )}
          </section>

          {/*
            ═══ شريط المخزون ═══

            **ومعرضٌ بمئةٍ وأربعين مركبة بلا ترشيحٍ يُقرأ صفحتين ثم
            يُترك.** والترشيح بطريقة البيع هو ما يسأل عنه الزائر فعلًا:
            «أيّها بالمزاد؟» لا «أيّها أحدث؟».

            **والعدّاد من الكلّ لا من المرشَّح** — وإلّا حملت الشريحة
            المختارة وحدها رقمًا والبقيّةُ أصفار.
          */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-sm font-bold">{t('vehicles')}</h2>
            <nav className="flex flex-wrap gap-2.5">
              {STOCK_TABS.map((row) => (
                <FilterChip
                  key={row.key ?? 'all'}
                  href={
                    row.key === null
                      ? `/${locale}/dealers/${slug}`
                      : `/${locale}/dealers/${slug}?type=${row.key}`
                  }
                  active={filter === row.key}
                  count={
                    row.key === null
                      ? dealer.byType.DIRECT + dealer.byType.NEGOTIATION + dealer.byType.AUCTION
                      : dealer.byType[row.key]
                  }
                >
                  {row.label}
                </FilterChip>
              ))}
            </nav>
          </div>
          {dealer.listings.length === 0 ? (
            <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {dealer.listings.map((listing) => (
                <Link key={listing.ref} href={listing.href}>
                  <CarCard
                    data={{
                      ref: listing.ref,
                      title: listing.title,
                      year: listing.year,
                      city: listing.city,
                      mileageKm: listing.mileageKm,
                      // الشاشة تترجم قبل البطاقة — والبطاقة تعرض نصًّا
                      transmissionLabel: te(`transmission.${listing.transmission}`),
                      price: Number(listing.price),
                      type: listing.type,
                      inspected: listing.inspected,
                      imageCount: listing.imageCount,
                      sellerName: listing.sellerName ?? dealer.name,
                      sellerVerified: listing.sellerVerified,
                      ...(listing.bidderCount === null ? {} : { bidderCount: listing.bidderCount }),
                      ...(listing.endsAt === null ? {} : { endsAt: listing.endsAt }),
                    }}
                  />
                </Link>
              ))}
            </div>
          )}

          {/*
            ═══ وبقيّة المخزون تُبلَغ ═══

            الصفحة تعرض **أربعًا وعشرين** (`take: 24`) ولا تقول شيئًا
            عن الباقي. فمعرضٌ بثمانيةٍ وتسعين إعلانًا يُخفي أربعةً
            وسبعين بلا سبيلٍ إليها — وهو أكثرُ مخزونه.

            **والوجهة البحثُ لا صفحةٌ ثانية**: هناك الترشيح والترتيب
            والصفحات مبنيّةً، وصفحةُ معرضٍ ثانية تُعيدها ناقصة.
          */}
          {dealer.listingCount <= dealer.listings.length ? null : (
            <div className="mt-7 flex justify-center">
              <Link
                href={`/${locale}/cars?city=${encodeURIComponent(dealer.city)}`}
                className="rounded-btn border border-line px-6 py-3 text-2xs font-bold transition-colors hover:border-ink"
              >
                {t('showAll')}
              </Link>
            </div>
          )}

          {/*
            ═══ الموقع وساعات العمل ═══

            **وزائرُ المعرض يسأل «أين ومتى أزوره؟»** — والتصميم يضع
            لذلك بطاقةً كاملة، ولم تكن في الشاشة ولا في البذرة:
            `address` و`hours` حقلان قائمان لا يكتبهما أحد ولا يقرؤهما
            أحد.
          */}
          {dealer.address === null && dealer.hours === null ? null : (
            <section className="mt-9 rounded-xl border border-line bg-surface p-5.5">
              <h2 className="mb-3.5 text-sm font-bold">{t('locationHours')}</h2>
              {dealer.address === null ? null : (
                <p className="bidi-isolate mb-3.5 flex items-start gap-2.5 text-2xs leading-loose opacity-75">
                  <PinIcon />
                  <span className="min-w-0 flex-1">{dealer.address}</span>
                </p>
              )}
              {dealer.hours === null || dealer.hours.length === 0 ? null : (
                <dl className="flex flex-col divide-y divide-line border-t border-line">
                  {dealer.hours.map((row) => (
                    <div key={row.day} className="flex items-baseline justify-between gap-4 py-2.5 text-2xs">
                      <dt className="opacity-60">{row.day}</dt>
                      {/* الوقت يُقرأ خانةً بخانة — لاتينيّ معزول بأرقام عربية */}
                      <dd dir="ltr" className="font-num">
                        {toArabicDigits(row.open)} – {toArabicDigits(row.close)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          )}
        </div>
      </main>
    </>
  );
}

/** أيقونة الهاتف — على زرّ التواصل. */
function PhoneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-3.5"
    >
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
    </svg>
  );
}

/** دبّوسُ موقع — والعنوان يُقرأ به قبل أن يُقرأ نصُّه. */
function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="mt-0.5 size-3.5 shrink-0 opacity-50"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
