import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { CarCard } from '@/components/ui/CarCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Quantity } from '@/components/ui/Quantity';
import { routing } from '@/i18n/routing';
import { getDealerPage } from '@/lib/domain/dealer-page';

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
export default async function DealerPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const [dealer, t, te] = await Promise.all([
    getDealerPage(slug, locale),
    getTranslations('dealer'),
    getTranslations('enums'),
  ]);
  // غير النشط ٤٠٤ — لا صفحة ثقةٍ لمن لم يُقبل بعد
  if (dealer === null) notFound();

  const joined = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto w-full max-w-page px-10 py-10">
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

            {dealer.address === null && dealer.phone === null ? null : (
              <p className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-line pt-4 text-2xs opacity-60">
                {dealer.address === null ? null : (
                  <span className="bidi-isolate">{dealer.address}</span>
                )}
                {dealer.address === null || dealer.phone === null ? null : (
                  <span aria-hidden className="opacity-40">·</span>
                )}
                {/* الهاتف يُقرأ ويُطلَب خانةً بخانة — لاتينيّ ومعزول */}
                {dealer.phone === null ? null : (
                  <span dir="ltr" className="bidi-isolate font-num">
                    {dealer.phone}
                  </span>
                )}
              </p>
            )}
          </section>

          <h2 className="mb-4 text-sm font-bold">{t('vehicles')}</h2>
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
        </div>
      </main>
    </>
  );
}
