import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import { displayDigits } from '@/lib/arabic';
import type { Metadata } from 'next';

import { LiveBar, SiteHeader } from '@/components/site/SiteHeader';
import { popularSearches, type PopularSearch } from '@/lib/domain/popular-searches';
import { contactChannels } from '@/lib/domain/admin-contact';
import { ActionLink } from '@/components/ui/ActionLink';
import { AuctionRail } from '@/components/ui/AuctionRail';
import { SponsoredBanner } from '@/components/site/SponsoredCard';
import { headers } from 'next/headers';
import { adsFor } from '@/lib/domain/ads';
import { AD_ALLOWANCE_HEADER, allowanceFromHeader } from '@/lib/domain/ad-session';
import type { ServedAd } from '@/lib/domain/ad-rules';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { BodyTypeStrip } from '@/components/ui/BodyTypeStrip';
import { CarCard } from '@/components/ui/CarCard';
import { badgeLabel } from '@/lib/catalog/badges';
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
import { currentUserFromCookies } from '@/lib/domain/account';
import { ownListingRefs } from '@/lib/domain/favorites';

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
/**
 * تسمية الشريحة — **والنطاق يعيد مفتاحًا لا جملة**.
 *
 * `priceMax:50000` تصير «أقل من ٥٠ ألف ريال»، و`fuel:ELECTRIC` تصير
 * «كهربائية». والنطاق لا يستطيع صياغتها أصلًا: لا يعرف اللغة ولا يملك
 * `Quantity`، فجملةٌ يبنيها تُخرج رقمًا لاتينيًّا (البوابة ١٧).
 */
function popularLabel(
  chip: PopularSearch,
  dict: { t: (key: string) => string; tu: (key: string) => string; te: (key: string) => string },
  locale: string,
): string {
  /**
   * **واللفظُ يصف ما يفتحه**: شريحةٌ مرشَّحةٌ بما يغلق اليوم تُسمّى
   * «مزادات اليوم» (كالترميز)، وشريحةٌ بلا مرشّح تُسمّى «المزادات».
   */
  if (chip.path !== undefined) {
    return chip.label === 'auctionsToday' ? dict.t('auctionsToday') : dict.t('nav.auctions');
  }

  const price = /^priceMax:(\d+)$/.exec(chip.label);
  if (price !== null) {
    const thousands = Number(price[1]) / 1000;
    return `${dict.t('under')} ${displayDigits(String(thousands))} ${dict.t('thousandRiyal')}`;
  }

  const fuel = /^fuel:(\w+)$/.exec(chip.label);
  if (fuel !== null) return dict.te(`fuel.${String(fuel[1])}`);

  /**
   * اسم الطراز كما هو — وهو ما يبحث به الناس. **وبلغة الصفحة**:
   * «باترول» في صفحةٍ إنجليزية لا يقرؤها من جاء إليها.
   */
  return locale === 'en' ? (chip.labelEn ?? chip.label) : chip.label;
}

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

  /**
   * ═══ سقفُ إعلانات الجلسة — يحسبه الوسيط ═══
   *
   * الصفحةُ تقرأ ولا تكتب كوكيًّا، فالوسيطُ يحسب الباقي ويمرّره رأسًا،
   * ومسارُ الظهور يكتب العدّاد. والسقفُ بذلك مفروضٌ في الخادم في
   * موضعين لا في الشاشة — وسقفٌ في العميل يُتجاوَز بإعادة تحميل.
   */
  const allowance = allowanceFromHeader((await headers()).get(AD_ALLOWANCE_HEADER));

  const search = await searchParams;
  const rawBand = typeof search.band === 'string' ? search.band : undefined;
  const band = PAYMENT_BANDS.find((b) => b.key === rawBand)?.key as PaymentBandKey | undefined;

  const [home, cities, popular, banner, brandAd, contact, t, tu, te, tui] = await Promise.all([
    getHomeData(locale, band === undefined ? {} : { band }),
    db.listing
      .groupBy({ by: ['city'], where: { status: 'PUBLISHED' }, _count: { _all: true } })
      .then((rows) => rows.map((row) => row.city).sort()),
    popularSearches(),
    /**
     * ═══ `home_banner` — مساحةٌ تُباع ولم يكن لها موضع ═══
     *
     * مسعَّرةٌ ٣٥٠٠ للأسبوع ومعروضةٌ في `/admin/ads` بموضعها المكتوب
     * «أسفل الملخّصات»، **ولا شيء في المنتج كان ينادي مفتاحها**. وستٌّ
     * من سبعٍ على هذه الحال.
     *
     * والتصميم يرسمها صفًّا بين كتلة المزاد و«أُضيفت حديثًا»: وسمُ
     * «إعلان» ثم مساحةٌ ١٦:٦ بارتفاع ٨٨px.
     */
    adsFor('home_banner', { city: null }, new Date(), Math.min(1, allowance)),
    /** `brand_featured` — «أول خانة» في شبكة الماركات، ١:١، ٦٠٠٠ للشهر. */
    adsFor('brand_featured', { city: null }, new Date(), Math.max(0, allowance - 1)),
    contactChannels(),
    getTranslations('site'),
    getTranslations('units'),
    getTranslations('enums'),
    getTranslations('ui'),
  ]);

  /**
   * ═══ وأيُّ هذه البطاقات لمن يقرأ ═══
   *
   * استعلامٌ واحد لمراجع الشاشة كلّها — لا سؤالٌ لكل بطاقة. ومن لم
   * يدخل تعود له مجموعةٌ فارغة بلا استعلامٍ أصلًا.
   */
  const viewer = await currentUserFromCookies();
  const shownRefs = [
    ...home.finance.cars,
    ...home.recent.cars,
  ].map((item) => item.ref);
  const ownRefs = await ownListingRefs(viewer?.id ?? null, shownRefs);

  const isArabic = locale === 'ar';
  const card = (item: (typeof home.finance.cars)[number]) => ({
    ref: item.ref,
    title: item.title,
    year: item.year,
    city: item.city,
    mileageKm: item.mileageKm,
    transmissionLabel: te(`transmission.${item.transmission}`),
    price: Number(item.price),
    ...(item.monthly === null ? {} : { monthly: item.monthly }),
    type: item.type,
    inspected: item.inspected,
    imageCount: item.imageCount,
    sellerName: item.sellerName,
    sellerVerified: item.sellerVerified,
    /** **إعلانُ من يقرأ** — ويُوسَم في الرئيسية كما في البحث. */
    isOwn: ownRefs.has(item.ref),
    /** **وما يُمنح لبطاقةٍ يُمنح لأخواتها** — البحثُ والهبوطُ والمعرض. */
    badges: item.badges.map((badge) => badgeLabel(badge, locale)),
  });

  return (
    <>
      <LiveBar
        liveAuctions={home.live.auctions}
        {...(home.live.closing === null
          ? {}
          : { closingTitle: home.live.closing.title, closingAt: home.live.closing.endsAt })}
        city={home.recent.cityLabel}
      />
      {/* الأزرار انتقلت إلى `AccountNav` داخل الترويسة — فتصل كل شاشة */}
      <SiteHeader active="home" />

      <main className="bg-bg text-ink">
        {/* الصدر — سطح داكن */}
        <section className="bg-ink text-bg">
          <div className="page-frame pt-13 pb-10">
            <div className="flex flex-col gap-12 lg:flex-row">
              <div className="min-w-0 flex-[1.15]">
                <h1 className="mb-4 text-display leading-tight font-extrabold tracking-tight">
                  {t('heroTitle')}
                </h1>
                <p className="mb-7 max-w-lg text-base leading-loose opacity-72">
                  {t('heroBody')}
                </p>
                {/*
                  ═══ والعددُ يحكم المعدود — ولو في عنصرٍ آخر ═══

                  كان الرقمُ في `<dd>` والاسمُ في `<dt>` نصًّا ثابتًا:
                  «جهة تمويل» و«معرض موثق». **فثمانٍ تُقرأ «8 جهة
                  تمويل»** وصوابُها «8 جهات» — والعربيةُ ستُّ صيغ.
                  وصحّت صدفةً على ١١–٩٩ وحدها، فمرّت ما دام العددُ
                  كبيرًا. ولم يرَها اللينت: قاعدتُه على نصٍّ يجاور
                  `<ArabicNumber>` في الموضع نفسه، وهذان شقيقان.

                  والوحدةُ الآن تحمل العددَ والاسم معًا، والرقمُ في
                  `<ArabicNumber>` داخلها.
                */}
                <dl className="flex flex-wrap gap-9">
                  {(
                    [
                      ['heroListings', home.stats.listings],
                      ['heroDealers', home.stats.dealers],
                      ['heroFinance', home.stats.financeProviders],
                    ] as const
                  ).map(([unit, value]) => (
                    <div key={unit}>
                      <dd className="text-3xl leading-none font-bold">
                        <ArabicNumber value={value} />
                      </dd>
                      <dt className="mt-1.5 text-2xs opacity-70">
                        <Quantity unit={unit} count={value} />
                      </dt>
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
                    {/*
                      **والوعدُ يُرفع حين تُفعَّل العمولة** (قرار المالك
                      ٢٠٢٦-١٠-١٧). و«صفر عمولة» إمّا صادقةٌ فتُقال وإمّا
                      لا فتُرفع — **ونصٌّ يقول النسبة مكانَها دعايةٌ
                      عكسيّة**، وموضعُها صفحةُ المعارض وشاشةُ البيع حيث
                      تُقرأ عند القرار.
                    */}
                    <p className="mb-1.5 text-2xl font-bold">
                      {home.sellingIsFree ? t('promoTitle') : t('promoTitlePaid')}
                    </p>
                    <p className="text-xs opacity-75">
                      {home.sellingIsFree ? t('promoBody') : t('promoBodyPaid')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <HeroSearch cities={cities} className="mt-8" />

            {/*
              ═══ «شائع» — والزائر الأوّل كان يجد استمارةً بلا مدخل ═══

              التصميم يضع صفًّا تحت الباحث. وكلُّ شريحةٍ هنا **مشتقّة من
              مخزونٍ قائم**: شريحةٌ ثابتة تُرسل إلى صفحةٍ فارغة أوّل ما
              ينفد الطراز، ونتيجةٌ فارغة من اقتراح المنصّة نفسها تُقرأ
              «لا شيء هنا».

              والصياغة في الشاشة لا في النطاق (البوابة ١٧): النطاق يعيد
              مفاتيح، والجملة والأرقام هنا.
            */}
            {popular.length === 0 ? null : (
              <p className="mt-4 flex flex-wrap items-center gap-2 text-3xs">
                <span className="opacity-70">{t('popular')}</span>
                {popular.map((chip) => (
                  <Link
                    key={`${chip.label}-${chip.query}`}
                    href={
                      chip.path === undefined
                        ? `/${locale}/cars?${chip.query}`
                        : `/${locale}${chip.path}`
                    }
                    /*
                      **واللون يُثبَّت ولا يُورَث.** الشريحة خلفيتها
                      فاتحة (`bg-surface`) وهي داخل قسم الهيرو الداكن،
                      فكانت ترث أبيضه — أبيض على فاتح، فلا تُقرأ.
                    */
                    className="rounded-full border border-line bg-surface px-3 py-1.5 font-bold text-ink hover:border-ink"
                  >
                    {popularLabel(chip, { t, tu, te }, locale)}
                  </Link>
                ))}
              </p>
            )}

            {/* مدخل الجملة الحرّة غائب كليًا والراية مطفأة (قرار ٢٤) */}
          </div>
        </section>

        <div className="page-frame">
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
                body: home.sellingIsFree ? t('summary.sellBody') : t('summary.sellBodyPaid'),
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
          <div className="page-frame">
            <SectionHead
              title={t('browseByBrand')}
              action={t('allBrands')}
              href={`/${locale}/cars`}
            />
            <BrandGrid
              sponsored={brandAd}
              brands={home.brands.top}
              remaining={Math.max(0, home.brands.total - home.brands.top.length)}
              locale={locale}
            />
          </div>
        </section>

        {/* نوع الهيكل يلي الماركة مباشرةً — الماركة أوّل ما يبحث به
            المشتري السعودي، والهيكل ثانيه، والتمويل بعدهما. */}
        {home.bodyTypes.length === 0 ? null : (
          <section className="border-t border-line">
            <div className="page-frame">
              <SectionHead
                title={t('browseByBodyType')}
                action={t('showAll')}
                href={`/${locale}/cars`}
              />
              <BodyTypeStrip
                items={home.bodyTypes.map((body) => ({
                  key: body.key,
                  name: isArabic ? body.nameAr : body.nameEn,
                  imageUrl: body.imageUrl,
                  count: body.count,
                  href: `/${locale}/cars?bodyType=${body.key}`,
                }))}
              />
            </div>
          </section>
        )}

        {/* التمويل — عرض وحساب فقط، بلا طلب ولا تكامل (قرار ١٤) */}
        <section className="border-t border-line">
          <div className="page-frame">
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="p-7">
                <div className="mb-6 flex flex-wrap items-end gap-5">
                  <div className="min-w-64 flex-1">
                    <h2 className="mb-2 text-2xl font-bold">{t('financeTitle')}</h2>
                    {/*
                      ═══ والصفرُ جملةٌ أخرى لا صيغةَ صفرٍ في جملةٍ واحدة ═══

                      كان النصُّ «… تقدر تمولها مع {n} معتمدة»، فأعطى على
                      قاعدةٍ جديدة (لا جهةَ تمويلٍ بعد) **«مع لا جهات تمويل
                      معتمدة»** — وعلى اثنتين «مع جهتي تمويل معتمدة»، فالصفةُ
                      خارج صيغة الجمع لا تطابق أبدًا. فالصفةُ دخلت الصيغة،
                      والصفرُ له جملتُه التي لا تذكر جهةً أصلًا.
                    */}
                    <p className="text-sm opacity-75">
                      {home.stats.financeProviders === 0
                        ? t('financeBodyNone')
                        : t('financeBody', {
                            // الرقم يُصاغ قبل دخوله السلسلة — `#` في ICU لاتيني
                            n: tu('financeProviders', {
                              count: home.stats.financeProviders,
                              n: formatNumber(
                                home.stats.financeProviders,
                                locale as NumeralLocale,
                              ),
                            }),
                          })}
                    </p>
                  </div>
                </div>

                <PaymentBands bands={home.finance.bands} selected={home.finance.selected} />

                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4.5">
                  <p className="flex items-center gap-2 text-sm opacity-75">
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
                    {t('downPayment')} <ArabicNumber value={home.finance.downPaymentPct} percent />
                  </span>
                  <span className="rounded-sm bg-accent-100 px-2.5 py-1 text-3xs font-bold text-accent-800">
                    <Quantity unit="months" count={home.finance.months} />
                  </span>
                  <span className="flex-1" />
                  <ActionLink href={`/${locale}/cars?financing=true`}>{t('showAll')}</ActionLink>
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
            <div className="page-frame">
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

        {/*
          **والبانر لا يُحجَز له مكان قبل أن يُباع.** `adsFor` تعيد
          فارغًا بلا حملةٍ حيّة، فلا إطارَ ولا وسمَ «إعلان» على صفحةٍ
          لا إعلان فيها — ومساحةٌ رماديّة تقول للزائر إن الصفحة ناقصة.
        */}
        {banner.length === 0 ? null : (
          <section className="border-t border-line">
            <div className="page-frame">
              <SponsoredBanner ad={banner[0] as ServedAd} label={tui('ad')} ratio="16/6" />
            </div>
          </section>
        )}

        {home.recent.cars.length === 0 ? null : (
          <section className="border-t border-line">
            <div className="page-frame">
              <SectionHead
                title={t('recentIn', { city: home.recent.cityLabel })}
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
          <div className="page-frame">
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
          <div className="page-frame">
            <div className="mb-7">
              <h2 className="mb-2 text-2xl font-bold">{t('whyTitle')}</h2>
              <p className="text-sm opacity-75">{t('whyBody')}</p>
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
            <div className="page-frame">
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
            <div className="page-frame">
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
        {/*
          ═══ «عندك استفسار؟» — وكانت الرئيسية بلا قناةِ تواصلٍ واحدة ═══

          ترميزُ `Wa` يُنهي الصفحة بكتلةِ دعمٍ فيها الهاتف وواتساب
          و«راسلنا». والزائرُ الذي لا يجد قناةً في الصفحة التي يصلها
          أوّلًا يغادر، ولا يبحث في التذييل عن صفحةِ تواصل.

          **والقنواتُ من الإعدادات لا من الشيفرة**: `contactChannels`
          يكتبها المشغّل في `/admin/contact`، وما لم يُضبط لا يُرسَم —
          فرابطُ واتساب بلا رقمٍ يفتح على خطأ.

          **ولا تُكتب ساعاتُ العمل**: يكتبها الترميز («السبت إلى الخميس
          ٩ص–١١م»)، ولا حقلَ لها في الإعدادات — وجملةٌ ثابتة عن ساعات
          الدعم وعدٌ بطاقمٍ لا يملك أحدٌ تغييرَ نصّه بلا نشر.
        */}
        {contact.supportPhone === null && contact.supportWhatsapp === null ? null : (
          <section>
            <div className="page-frame">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-line bg-surface px-6 py-5">
                <h2 className="flex-1 text-sm font-bold">{t('supportTitle')}</h2>

                {contact.supportPhone === null ? null : (
                  <a
                    href={`tel:${contact.supportPhone.replace(/\s/g, '')}`}
                    dir="ltr"
                    className="font-num text-sm font-bold underline-offset-4 hover:underline"
                  >
                    {displayDigits(contact.supportPhone)}
                  </a>
                )}

                {contact.supportWhatsapp === null ? null : (
                  <a
                    href={`https://wa.me/${contact.supportWhatsapp.replace(/\D/g, '')}`}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="rounded-md border border-line px-3.5 py-2 text-2xs hover:border-ink"
                  >
                    {t('supportWhatsapp')}
                  </a>
                )}

                <Link
                  href={`/${locale}/help/contact`}
                  className="rounded-md border border-line px-3.5 py-2 text-2xs hover:border-ink"
                >
                  {t('supportWrite')}
                </Link>
              </div>
            </div>
          </section>
        )}
      </main>

    </>
  );
}
