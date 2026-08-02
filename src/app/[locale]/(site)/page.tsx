import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import type { Metadata } from 'next';

import { LiveBar, SiteFooter, SiteHeader } from '@/components/site/SiteHeader';
import { AuctionRail } from '@/components/ui/AuctionRail';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Button } from '@/components/ui/Button';
import { CarCard } from '@/components/ui/CarCard';
import { FaqAccordion } from '@/components/ui/FaqAccordion';
import { HeroSearch } from '@/components/ui/HeroSearch';
import {
  BrandGrid,
  SectionHead,
  ServiceBanners,
  StepList,
  SummaryCards,
  ValueProps,
} from '@/components/ui/HomeSections';
import { Quantity } from '@/components/ui/Quantity';
import { formatNumber, type NumeralLocale } from '@/lib/arabic';
import { db } from '@/lib/db';
import { getHomeData, PAYMENT_BANDS, type PaymentBandKey } from '@/lib/domain/home';
import { routing } from '@/i18n/routing';
import { PaymentBands } from './PaymentBands';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'site' });
  return { title: t('metaTitle'), description: t('metaDescription') };
}

const ICONS = {
  used: <path d="M4 17V9l4-4h8l4 4v8M4 17h16M7 17v2M17 17v2" />,
  new: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  auctions: <path d="M4 20h16M6 15l6-9 6 9M9 15h6" />,
  sell: <path d="M3 8h18v10H3zM3 12h18M7 16h3" />,
};

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

/**
 * Wa — الرئيسية.
 *
 * **كل رقم على الصفحة محسوب من قاعدة البيانات.** صفحةٌ تعِد بموثّقية
 * الملكية وتقارير الفحص، ثم تفتتح بعدد مؤلَّف، تنقض وعدها في أول سطر.
 *
 * والاستقرار البصري (CLS) شرط قبولٍ لا تحسينًا: كل صورة تحجز نسبتها
 * قبل تحميلها، وعدّاد المزاد يُصاغ على الخادم فلا يقفز الرقم مكانه بعد
 * أول ثانية، والشريط الحيّ يختفي كليًا بلا مزاد بدل أن ينكمش.
 */
export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const search = await searchParams;
  const rawBand = typeof search.band === 'string' ? search.band : undefined;
  const band = PAYMENT_BANDS.find((b) => b.key === rawBand)?.key as PaymentBandKey | undefined;

  const [home, cities, t, tu, te] = await Promise.all([
    getHomeData(locale, band === undefined ? {} : { band }),
    db.listing
      .groupBy({ by: ['city'], where: { status: 'PUBLISHED' }, _count: { _all: true } })
      .then((rows) => rows.map((row) => row.city).sort()),
    getTranslations('site'),
    getTranslations('units'),
    getTranslations('enums'),
  ]);

  const isArabic = locale === 'ar';
  const card = (item: (typeof home.finance.cars)[number]) => ({
    ref: item.ref,
    title: item.title,
    year: item.year,
    city: item.city,
    mileageKm: item.mileageKm,
    transmission: te(`transmission.${item.transmission}`),
    price: Number(item.price),
    ...(item.monthly === null ? {} : { monthly: item.monthly }),
    type: item.type,
    inspected: item.inspected,
    imageCount: item.imageCount,
    sellerName: item.sellerName,
    sellerVerified: item.sellerVerified,
  });

  return (
    <>
      <LiveBar
        liveAuctions={home.live.auctions}
        {...(home.live.closing === null
          ? {}
          : { closingTitle: home.live.closing.title, closingAt: home.live.closing.endsAt })}
        city={home.recent.city}
      />
      <SiteHeader
        active="home"
        actions={
          <span className="flex items-center gap-2.5">
            {/* الزرّ عنصر تفاعل والرابط تنقّل — لا يُخلطان */}
            <Link href={`/${locale}/sell`}>
              <Button variant="outline" size="sm">
                {t('sellYourCar')}
              </Button>
            </Link>
            <Link href={`/${locale}/login`}>
              <Button size="sm">{t('signIn')}</Button>
            </Link>
          </span>
        }
      />

      <main className="bg-bg text-ink">
        {/* الصدر — سطح داكن */}
        <section className="bg-ink text-bg">
          <div className="mx-auto w-full max-w-page px-10 pt-13 pb-10">
            <div className="flex flex-col gap-12 lg:flex-row">
              <div className="min-w-0 flex-[1.15]">
                <h1 className="mb-4 text-display leading-tight font-extrabold tracking-tight">
                  {t('heroTitle')}
                </h1>
                <p className="mb-7 max-w-lg text-base leading-loose opacity-72">
                  {t('heroBody')}
                </p>
                <dl className="flex flex-wrap gap-9">
                  {[
                    { key: 'listings', value: home.stats.listings },
                    { key: 'dealers', value: home.stats.dealers },
                    { key: 'finance', value: home.stats.financeProviders },
                  ].map((stat) => (
                    <div key={stat.key}>
                      <dd className="text-3xl leading-none font-bold">
                        <ArabicNumber value={stat.value} />
                      </dd>
                      <dt className="mt-1.5 text-2xs opacity-60">{t(`heroStat.${stat.key}`)}</dt>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="min-w-0 flex-1">
                <div className="washed-light flex aspect-16/10 items-end rounded-xl p-6">
                  <div>
                    <span className="mb-3 inline-flex rounded-sm bg-warn-400 px-3 py-1.5 text-3xs font-bold text-ink">
                      {t('promoTag')}
                    </span>
                    <p className="mb-1.5 text-2xl font-bold">{t('promoTitle')}</p>
                    <p className="text-xs opacity-75">{t('promoBody')}</p>
                  </div>
                </div>
              </div>
            </div>

            <HeroSearch cities={cities} className="mt-8" />

            {/* مدخل الجملة الحرّة غائب كليًا والراية مطفأة (قرار ٢٤) */}
          </div>
        </section>

        <div className="mx-auto w-full max-w-page px-10 py-10">
          <SummaryCards
            cards={[
              {
                key: 'used',
                title: t('summary.usedTitle'),
                body: t('summary.usedBody'),
                count: home.summary.used,
                unit: 'cars',
                action: '',
                href: `/${locale}/cars?condition=USED`,
                icon: <Icon>{ICONS.used}</Icon>,
              },
              {
                key: 'new',
                title: t('summary.newTitle'),
                body: t('summary.newBody'),
                count: home.summary.newCars,
                unit: 'cars',
                action: '',
                href: `/${locale}/cars?condition=NEW`,
                icon: <Icon>{ICONS.new}</Icon>,
              },
              {
                key: 'auctions',
                title: t('summary.auctionsTitle'),
                body: t('summary.auctionsBody'),
                count: home.summary.auctions,
                unit: 'auctions',
                action: '',
                href: `/${locale}/cars?type=AUCTION`,
                icon: <Icon>{ICONS.auctions}</Icon>,
              },
              {
                key: 'sell',
                title: t('summary.sellTitle'),
                body: t('summary.sellBody'),
                count: null,
                unit: 'cars',
                action: t('summary.sellAction'),
                href: `/${locale}/sell`,
                icon: <Icon>{ICONS.sell}</Icon>,
              },
            ]}
          />
        </div>

        <section className="border-t border-line">
          <div className="mx-auto w-full max-w-page px-10 py-10">
            <SectionHead
              title={t('browseByBrand')}
              action={t('allBrands')}
              href={`/${locale}/cars`}
            />
            <BrandGrid
              brands={home.brands.top}
              remaining={Math.max(0, home.brands.total - home.brands.top.length)}
              locale={locale}
            />
          </div>
        </section>

        {/* التمويل — عرض وحساب فقط، بلا طلب ولا تكامل (قرار ١٤) */}
        <section className="border-t border-line">
          <div className="mx-auto w-full max-w-page px-10 py-10">
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="p-7">
                <div className="mb-6 flex flex-wrap items-end gap-5">
                  <div className="min-w-64 flex-1">
                    <h2 className="mb-2 text-2xl font-bold">{t('financeTitle')}</h2>
                    <p className="text-sm opacity-65">
                      {t('financeBody', {
                        // الرقم يُصاغ قبل دخوله السلسلة — `#` في ICU لاتيني
                        n: tu('financeProviders', {
                          count: home.stats.financeProviders,
                          n: formatNumber(home.stats.financeProviders, locale as NumeralLocale),
                        }),
                      })}
                    </p>
                  </div>
                </div>

                <PaymentBands bands={home.finance.bands} selected={home.finance.selected} />

                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4.5">
                  <p className="flex items-center gap-2 text-sm opacity-70">
                    <Quantity
                      unit="cars"
                      count={
                        home.finance.bands.find((b) => b.key === home.finance.selected)?.count ?? 0
                      }
                      className="text-base font-bold opacity-100"
                    />
                    <span>{t('withinBand')}</span>
                  </p>
                  <span className="rounded-sm bg-accent-100 px-2.5 py-1 text-3xs font-bold text-accent-800">
                    {t('downPayment')} <ArabicNumber value={home.finance.downPaymentPct} />٪
                  </span>
                  <span className="rounded-sm bg-accent-100 px-2.5 py-1 text-3xs font-bold text-accent-800">
                    <Quantity unit="months" count={home.finance.months} />
                  </span>
                  <span className="flex-1" />
                  <Link
                    href={`/${locale}/cars?financing=true`}
                    className="text-xs font-bold text-accent-700 hover:underline"
                  >
                    {t('showAll')}
                  </Link>
                </div>
              </div>

              {home.finance.cars.length === 0 ? null : (
                <div className="grid gap-4 px-7 pb-7 sm:grid-cols-2 lg:grid-cols-4">
                  {home.finance.cars.map((item) => (
                    <Link key={item.ref} href={item.href}>
                      <CarCard data={card(item)} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {home.auctions.length === 0 ? null : (
          <section className="border-t border-line">
            <div className="mx-auto w-full max-w-page px-10 py-10">
              <SectionHead
                title={t('liveAuctionsTitle')}
                action={t('showAll')}
                href={`/${locale}/cars?type=AUCTION`}
              />
              <AuctionRail
                auctions={home.auctions.map((auction) => ({
                  ref: auction.ref,
                  title: auction.title,
                  year: auction.year,
                  city: auction.city,
                  price: auction.price,
                  highestBid: auction.highestBid,
                  bidCount: auction.bidCount,
                  endsAt: auction.endsAt,
                  href: auction.href,
                }))}
              />
            </div>
          </section>
        )}

        {home.recent.cars.length === 0 ? null : (
          <section className="border-t border-line">
            <div className="mx-auto w-full max-w-page px-10 py-10">
              <SectionHead
                title={t('recentIn', { city: home.recent.city })}
                action={t('showAll')}
                href={`/${locale}/cars?city=${encodeURIComponent(home.recent.city)}`}
              />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {home.recent.cars.map((item) => (
                  <Link key={item.ref} href={item.href}>
                    <CarCard data={card(item)} />
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="border-y border-line bg-surface">
          <div className="mx-auto w-full max-w-page px-10 py-10">
            <h2 className="mb-7 text-2xl font-bold">{t('howToBuy')}</h2>
            <StepList
              steps={[1, 2, 3, 4].map((i) => ({
                title: t(`step.${i}.title`),
                body: t(`step.${i}.body`),
              }))}
            />
          </div>
        </section>

        <section className="bg-ink text-bg">
          <div className="mx-auto w-full max-w-page px-10 py-10">
            <div className="mb-7">
              <h2 className="mb-2 text-2xl font-bold">{t('whyTitle')}</h2>
              <p className="text-sm opacity-70">{t('whyBody')}</p>
            </div>
            <ValueProps
              items={[1, 2, 3, 4].map((i) => ({
                title: t(`why.${i}.title`),
                body: t(`why.${i}.body`),
              }))}
            />
          </div>
        </section>

        {home.services.length === 0 ? null : (
          <section className="border-b border-line">
            <div className="mx-auto w-full max-w-page px-10 py-10">
              <SectionHead
                title={t('servicesTitle')}
                action={t('showAll')}
                href={`/${locale}/services`}
              />
              <ServiceBanners services={home.services} locale={locale} />
            </div>
          </section>
        )}

        {home.faq.length === 0 ? null : (
          <section>
            <div className="mx-auto w-full max-w-page px-10 py-10">
              <SectionHead title={t('faqTitle')} action={t('helpCentre')} href={`/${locale}/help`} />
              <FaqAccordion
                columns={2}
                rows={home.faq.map((entry) => ({
                  id: entry.id,
                  question: isArabic ? entry.questionAr : entry.questionEn,
                  answer: isArabic ? entry.answerAr : entry.answerEn,
                }))}
              />
            </div>
          </section>
        )}
      </main>

      <SiteFooter
        columns={[1, 2, 3].map((i) => ({
          title: t(`footer.${i}.title`),
          links: t.raw(`footer.${i}.links`) as string[],
        }))}
      />
    </>
  );
}
