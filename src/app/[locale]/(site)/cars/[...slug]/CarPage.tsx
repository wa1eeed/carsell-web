'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge, InspectedBadge } from '@/components/ui/Badge';
import { BuyColumn } from '@/components/ui/BuyColumn';
import { BuyActions } from '@/components/site/BuyActions';
import { ReportListing } from '@/components/site/ReportListing';
import { FavoriteButton } from '@/components/site/FavoriteButton';
import type { TaxProfile } from '@/lib/domain/tax-profile';
import { EmptyState } from '@/components/ui/EmptyState';
import { FaqAccordion } from '@/components/ui/FaqAccordion';
import { Gallery } from '@/components/ui/Gallery';
import { APP_URL } from '@/lib/env';
import { cn } from '@/lib/cn';
import { AuctionPulse } from '@/components/site/AuctionPulse';
import { AuctionTerms, BidLogStats, BidStatus, BidStep } from '@/components/site/AuctionSections';
import { BidPanel } from '@/components/site/BidPanel';
import { SellerDecisionPanel } from '@/components/site/SellerDecisionPanel';
import type { SellerDecision } from '@/lib/domain/auctions';
import type { PublicAuction, ViewerStanding } from '@/lib/domain/auctions';
import { HistoryList } from '@/components/ui/HistoryList';
import { PaintMap } from '@/components/ui/PaintMap';
import { Quantity } from '@/components/ui/Quantity';
import { RangeBar } from '@/components/ui/RangeBar';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { SimilarGrid, type SimilarItem } from '@/components/ui/SimilarGrid';
import { SpecTable } from '@/components/ui/SpecTable';
import { Tabs } from '@/components/ui/Tabs';
import type { Canonical, PublicListingDetail } from '@/lib/domain/listing-detail';

const TYPE_TONE = { DIRECT: 'neutral', NEGOTIATION: 'accent', AUCTION: 'ink' } as const;

/**
 * Wc — صفحة السيارة.
 *
 * ترتيب الصفحة يتبع ترتيب سؤال المشتري: ما هي؟ ثم كيف حالها؟ ثم بكم
 * وكيف أشتريها؟ فالمواصفات قبل الفحص، والفحص قبل التاريخ، وعمود الشراء
 * ملازم على اليسار لا في نهاية الصفحة.
 */
export function CarPage({
  detail,
  faq,
  similar,
  canonical,
  locale,
  heading,
  viewer,
  auction,
  standing,
}: {
  detail: PublicListingDetail;
  faq: readonly { id: string; question: string; answer: string }[];
  similar: readonly SimilarItem[];
  canonical: Canonical;
  locale: string;
  heading: { home: string; cars: string };
  viewer: {
    signedIn: boolean;
    isOwn: boolean;
    /** قرارُ البائع على مزادٍ لم يبلغ احتياطيَه — `null` لغيره */
    sellerDecision: SellerDecision | null;
    taxProfile: TaxProfile | null;
    /** طلبٌ حيّ على الإعلان — فلا يُعرض «اشترِ» ثم يُرفض */
    reserved: boolean;
    listingId: string;
    /** أمفضَّلٌ عند هذا الزائر؟ — و`false` لمن لم يدخل. */
    favorited: boolean;
  };
  /**
   * المزاد بتفصيله — **و`null` لغير المزادات**.
   *
   * و`detail.auction` لقطةٌ خفيفة تكفي عمود الشراء (أعلى مزايدة،
   * الحدّ التالي، العربون). وهذه تحمل السجلّ والشروط والإحصاءات —
   * ولا تُجلب إلّا لمزاد.
   */
  auction: PublicAuction | null;
  standing: ViewerStanding | null;
}) {
  const t = useTranslations('ui');
  /** `null` للمعروض — وما عداه مغلقٌ للشراء وإن بقي معروضًا للقراءة. */
  const closed: 'RESERVED' | 'SOLD' | null =
    detail.status === 'RESERVED' || detail.status === 'SOLD' ? detail.status : null;
  const te = useTranslations('enums');
  const [tab, setTab] = useState('specs');
  const vehicle = detail.vehicle;
  const inspection = detail.inspection;

  const crumbs = [
    { label: heading.home, href: `/${locale}` },
    { label: heading.cars, href: `/${locale}/cars` },
    { label: detail.city, href: `/${locale}/cars?city=${encodeURIComponent(detail.city)}` },
  ];

  const specs = [
    { label: t('brandAndModel'), value: `${vehicle.brandName} · ${vehicle.modelName}` },
    ...(vehicle.trimName === null ? [] : [{ label: t('trim'), value: vehicle.trimName }]),
    { label: t('modelYear'), value: <ArabicNumber value={vehicle.year} grouped={false} /> },
    { label: t('mileage'), value: <Quantity unit="km" count={vehicle.mileageKm} /> },
    { label: t('transmission'), value: te(`transmission.${vehicle.transmission}`) },
    { label: t('fuel'), value: te(`fuel.${vehicle.fuel}`) },
    { label: t('bodyType'), value: te(`bodyType.${vehicle.bodyType}`) },
    { label: t('drivetrain'), value: te(`drivetrain.${vehicle.drivetrain}`) },
    { label: t('spec'), value: te(`spec.${vehicle.spec}`) },
    { label: t('colorExterior'), value: vehicle.colorExterior },
    { label: t('seats'), value: <ArabicNumber value={vehicle.seats} grouped={false} /> },
    {
      label: t('paintStatus'),
      /* المصدر يُعرض مع الحالة — الفحص يتجاوز إقرار البائع (قرار ١٦) */
      value: (
        <span className="flex items-center gap-2">
          {te(`paintState.${vehicle.paint.status}`)}
          <span className="text-3xs font-medium opacity-50">
            {t(vehicle.paint.source === 'INSPECTION' ? 'verifiedByInspection' : 'sellerDeclared')}
          </span>
        </span>
      ),
    },
  ];

  const tabs = [
    { id: 'specs', label: t('specs') },
    { id: 'inspection', label: t('inspectionReport') },
    { id: 'features', label: t('featuresTab') },
    { id: 'history', label: t('vehicleHistory') },
    /**
     * **وصف البائع — والتاب يختفي حين لا وصف.**
     *
     * تابٌ يُفتح على فراغٍ أسوأ من غيابه: القارئ يظنّ الصفحة معطوبة،
     * ولا يعرف أن البائع هو الذي لم يكتب. والمواصفات تصف المصنع،
     * والوصف يصف **هذه النسخة** — لماذا يبيعها وما أصلحه.
     */
    ...(detail.description === null || detail.description === ''
      ? []
      : [{ id: 'description', label: 'وصف البائع' }]),
    // العدد الفعلي للأسئلة المعروضة لا رقم ثابت (قرار ٣١)
    { id: 'faq', label: t('questions'), count: faq.length },
  ];

  const featureGroups = ['SAFETY', 'COMFORT', 'TECH'] as const;

  return (
    <>
      <nav className="mb-5 flex flex-wrap items-center gap-1.5 text-2xs opacity-50">
        {crumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1.5">
            {i > 0 ? <span aria-hidden>›</span> : null}
            <Link href={crumb.href} className="bidi-isolate hover:underline">
              {crumb.label}
            </Link>
          </span>
        ))}
        <span aria-hidden>›</span>
        <span aria-current="page" className="bidi-isolate font-bold opacity-100">
          {vehicle.title}
        </span>
        <span className="flex-1" />
        {/*
          **والنطاق من الإعداد لا مكتوبًا بيد.** هذا عنوان الصفحة لا
          اسم المنصة، فنقلُ المنصة إلى نطاق آخر كان يترك هنا نطاقًا
          قديمًا يقرؤه الزائر على أنه عنوانها.
        */}
        <span dir="ltr" className="font-num text-3xs opacity-70">
          {APP_URL.replace(/^https?:\/\//, '')}
          {canonical.display}
        </span>
      </nav>

      {/*
        ═══ الترتيب على الهاتف: الصور ثمّ السعر ثمّ التفاصيل ═══

        كان الصندوق آخرَ الصفحة على الهاتف — بعد المواصفات والتابز
        والأسئلة كلّها. فمن فتح سيارةً على جوّاله يمرّر شاشاتٍ قبل أن
        يرى ثمنها، **وهو أوّل ما يُسأل عنه**.

        وشبكةٌ بثلاثة أبناء تحلّها بلا تكرار: عمودٌ واحد على الهاتف
        بترتيبها الطبيعيّ (ترويسة وصور · السعر · الباقي)، وعمودان من
        `lg` — الصندوق في الثاني ممتدًّا، كالتصميم.
      */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-7 lg:col-start-1 lg:row-start-1">
          <header className="flex flex-wrap items-start gap-6">
            <div className="min-w-0 flex-1">
              <div className="mb-2.5 flex flex-wrap items-center gap-2">
                <Badge tone="neutral" className="font-num">
                  {detail.ref}
                </Badge>
                <Badge tone={TYPE_TONE[detail.type]}>{te(`listingType.${detail.type}`)}</Badge>
                <Badge tone="neutral">{te(`condition.${vehicle.condition}`)}</Badge>
                {inspection === null ? null : <InspectedBadge />}
              </div>
              <h1 className="mb-2.5 flex flex-wrap items-baseline gap-2 text-4xl font-bold tracking-tight">
                <span className="bidi-isolate">{vehicle.title}</span>
                <ArabicNumber value={vehicle.year} grouped={false} />
              </h1>
              <p className="flex flex-wrap items-center gap-2 text-sm opacity-65">
                {[
                  <Quantity key="km" unit="km" count={vehicle.mileageKm} />,
                  <span key="tr" className="bidi-isolate">{te(`transmission.${vehicle.transmission}`)}</span>,
                  <span key="fu" className="bidi-isolate">{te(`fuel.${vehicle.fuel}`)}</span>,
                  <span key="sp" className="bidi-isolate">{te(`spec.${vehicle.spec}`)}</span>,
                  <span key="ci" className="bidi-isolate">{detail.city}</span>,
                ].map((part, i) => (
                  <span key={i} className="flex items-center gap-2">
                    {i > 0 ? <span aria-hidden className="opacity-35">·</span> : null}
                    {part}
                  </span>
                ))}
              </p>
            </div>

            {inspection === null ? null : (
              <Link
                href={`${canonical.path}/inspection`}
                className="flex shrink-0 items-center gap-3 rounded-lg border border-accent-200 bg-accent-100 p-3.5"
              >
                <ScoreRing score={inspection.score} size="sm" />
                <span>
                  <span className="block text-xs font-bold text-accent-900">
                    {t('inspectionPoints')}
                  </span>
                  <span className="mt-0.5 block text-3xs text-accent-900 opacity-75">
                    {t('readFullReport')}
                  </span>
                </span>
              </Link>
            )}

            {/*
              **والقلب في الترويسة لا على الصورة.** على الصورة يُخفي
              جزءًا منها ويُضغط سهوًا عند التمرير، وفي الترويسة بجوار
              الاسم حيث يقع القرار.
            */}
            <FavoriteButton
              listingRef={detail.ref}
              initial={viewer.favorited}
              signedIn={viewer.signedIn}
              signInHref={`/${locale}/auth`}
              className="shrink-0"
            />
          </header>

          <Gallery images={detail.images} alt={vehicle.title} />

          {/*
            ═══ ولا صفحةَ مزادٍ فرعية ═══

            كان للمركبة صفحتان: هذه، و`/auctions/{ref}` بسجلّها
            وشروطها. **وصفحةُ المركبة هي الصفحة** — والثانية تقسم
            الانتباه وتُنتج رابطين لشيءٍ واحد، فتُشتّت ما يصل من بحثٍ
            خارجيّ وتجعل المزايد يتنقّل بين وجهين للعرض نفسه.
            (قرار المالك.)

            والعدّاد والسعر **تحت الصور** لا في العمود وحده: العمود
            يسقط على الهاتف تحت كل شيء، وهذان أعجلُ ما في الصفحة.
          */}
          {auction === null ? null : (
            <AuctionPulse
              auction={auction}
              live={detail.auction?.live === true}
              standing={standing}
              className="mt-6"
            />
          )}
        </div>

        <div className="w-full lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <div className="flex flex-col gap-3.5 lg:sticky lg:top-4">
            {/*
              ═══ المحجوز والمباع يُقالان قبل كل شيء ═══

              **وصفحةٌ تعرض مركبةً مباعة بزرّ «اشترِ الآن» تَعِد بما لا
              يقع**: المشتري يضغط فيردّ الخادم، فيظنّ أن العطل فيه.
              فتُقال الحال أوّلًا ويُسحب الزرّ — ولا يُترك معطَّلًا:
              زرٌّ رماديّ يُغري بالمحاولة ويصمت عن السبب.
            */}
            {closed === null ? null : (
              <section
                className={cn(
                  'rounded-xl border-2 p-5',
                  closed === 'SOLD' ? 'border-line' : 'border-ink',
                )}
              >
                <h2 className="mb-1.5 text-sm font-bold">
                  {closed === 'SOLD' ? t('soldTitle') : t('reservedTitle')}
                </h2>
                <p className="text-2xs leading-loose opacity-65">
                  {closed === 'SOLD' ? t('soldBody') : t('reservedBody')}
                </p>
              </section>
            )}

            {/*
              ═══ قرارُ البائع — ويُعرض فوق كل شيء ═══

              مهلتُه ساعاتٌ تجري، وبانقضائها يُرَدّ العربون ويسقط
              الحقّ. **وكان لا يُعرض في المنتج أصلًا**: اللوحة مبنيّة
              بلا مستورد، وقارئُها بلا منادٍ، فينتهي كل مزادٍ لم يبلغ
              احتياطيَه بالردّ حتمًا مهما أراد البائع.
            */}
            {viewer.sellerDecision === null ? null : (
              <SellerDecisionPanel listingRef={detail.ref} decision={viewer.sellerDecision} />
            )}

            <BuyColumn
              {...(detail.auction === null
                ? {}
                : {
                    /**
                     * ═══ لوحةُ المزايدة — وكانت بلا مستوردٍ واحد ═══
                     *
                     * لمّا صارت صفحةُ المزاد صفحةَ المركبة بقي
                     * `BidPanel` يتيمًا — وفيه المزايدةُ والعربونُ
                     * والشراء الفوري — وورث عمودُ الشراء زرًّا مرسومًا
                     * بلا `onClick`. **فلا مزايدة تُقدَّم من أيّ شاشة**،
                     * وخيارُ البيع بالمزاد كلُّه معروضٌ لا يُستعمل.
                     */
                    bidActions: (
                      <BidPanel
                        listingRef={detail.ref}
                        live={detail.auction.live}
                        minimumNext={detail.auction.minimumBid}
                        increment={detail.auction.bidIncrement}
                        depositAmount={detail.auction.depositAmount}
                        buyNowPrice={detail.auction.buyNowPrice}
                        signedIn={viewer.signedIn}
                        isOwn={viewer.isOwn}
                        locale={locale}
                      />
                    ),
                  })}
              actions={
                closed !== null ? null : (
                <BuyActions
                  listingRef={detail.ref}
                  price={Number(detail.askPrice)}
                  type={detail.type}
                  isOwn={viewer.isOwn}
                  reserved={viewer.reserved}
                  signedIn={viewer.signedIn}
                  locale={locale}
                  taxProfile={viewer.taxProfile}
                />
                )
              }
              footer={
                /*
                  الإبلاغ **هادئ تحت البطاقة**: مسارٌ مبنيّ لا تناديه
                  شاشة، وصفحة «تواصل معنا» تحيل إليه وهو غير موجود.
                */
                viewer.isOwn ? null : (
                  <ReportListing
                    listingId={viewer.listingId}
                    signedIn={viewer.signedIn}
                    locale={locale}
                  />
                )
              }
              data={{
                type: detail.type,
                askPrice: Number(detail.askPrice),
                monthly: detail.monthly,
                cost: {
                  price: Number(detail.cost.price),
                  commission: Number(detail.cost.commission),
                  transferFee: Number(detail.cost.transferFee),
                  transferAdminFee: Number(detail.cost.transferAdminFee),
                  vatIncludedInPrice:
                    detail.cost.vatIncludedInPrice === null
                      ? null
                      : Number(detail.cost.vatIncludedInPrice),
                  provisional: detail.cost.provisional,
                  total: Number(detail.cost.total),
                },
                seller: {
                  ...detail.seller,
                  /**
                   * المسار يُركَّب هنا لا في النطاق: **الشاشة هي التي
                   * تعرف اللغة**، والمكوّن لا يعرفها — وبناؤه هناك يُنتج
                   * `/dealers/x` بلا بادئة فيسقط ٤٠٤.
                   */
                  dealerPath:
                    detail.seller.dealerSlug === null
                      ? null
                      : `/${locale}/dealers/${detail.seller.dealerSlug}`,
                  ratingAvg: detail.seller.ratingAvg === null ? null : Number(detail.seller.ratingAvg),
                },
                auction:
                  detail.auction === null
                    ? null
                    : {
                        startPrice: Number(detail.auction.startPrice),
                        minimumBid: Number(detail.auction.minimumBid),
                        depositAmount: Number(detail.auction.depositAmount),
                        bidCount: detail.auction.bidCount,
                        highestBid:
                          detail.auction.highestBid === null ? null : Number(detail.auction.highestBid),
                        endsAt: detail.auction.endsAt,
                        status: detail.auction.status,
                        reserveMet: detail.auction.reserveMet,
                        live: detail.auction.live,
                      },
              }}
            />

            {/* يعيد `null` دون عتبة العيّنة — لا شرط خارجي (قرار ٣٠) */}
            {detail.priceStat === null ? null : (
              <section className="rounded-xl border border-line p-5">
                <h3 className="mb-3.5 text-xs font-bold">{t('marketPosition')}</h3>
                <RangeBar price={Number(detail.askPrice)} stats={detail.priceStat} />
              </section>
            )}
          </div>
        </div>

        {/* الابن الثالث: التفاصيل وما بعدها — تحت السعر على الهاتف */}
        <div className="flex min-w-0 flex-col gap-7 lg:col-start-1 lg:row-start-2">
          <Tabs items={tabs} active={tab} onChange={setTab} />

          {tab === 'specs' ? <SpecTable entries={specs} /> : null}

          {tab === 'inspection' ? (
            <section id="inspection" className="flex flex-col gap-6">
              {inspection === null ? (
                <EmptyState title={t('notInspected')} description={t('notInspectedBody')} />
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-8">
                    <ScoreRing score={inspection.score} size="lg" />
                    <dl className="grid min-w-64 flex-1 gap-x-8 gap-y-3.5 sm:grid-cols-2">
                      {inspection.sections.map((section) => (
                        <div key={section.name}>
                          <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                            <dt>{section.name}</dt>
                            <dd>
                              <ArabicNumber value={section.score} grouped={false} />
                            </dd>
                          </div>
                          <div className="h-1 rounded-full bg-ink/10">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{ width: `${section.score}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </dl>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    {inspection.findings.length === 0 ? null : (
                      <div className="min-w-64 flex-1 rounded-xl border border-warn-200 bg-warn-100 p-4.5">
                        <p className="text-xs font-bold text-warn-900">{t('worthAttention')}</p>
                        <ul className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-2xs text-warn-900 opacity-85">
                          {inspection.findings.map((finding) => (
                            <li key={finding} className="bidi-isolate">
                              {finding}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <PaintMap panels={inspection.paintMap} className="w-64 shrink-0" />
                  </div>
                </>
              )}
            </section>
          ) : null}

          {tab === 'features' ? (
            <div className="grid gap-7 sm:grid-cols-3">
              {featureGroups.map((group) => {
                const rows = detail.features.filter((feature) => feature.group === group);
                if (rows.length === 0) return null;
                return (
                  <section key={group}>
                    <h3 className="mb-3.5 text-2xs font-bold tracking-[0.14em] opacity-45">
                      {te(`featureGroup.${group}`)}
                    </h3>
                    <ul className="flex flex-col gap-2.5 text-sm font-medium">
                      {rows.map((feature) => (
                        <li key={feature.key} className="flex items-center gap-2.5">
                          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-accent-200">
                            <svg viewBox="0 0 24 24" className="size-2 text-accent-800" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          </span>
                          {locale === 'ar' ? feature.nameAr : feature.nameEn}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          ) : null}

          {tab === 'history' ? (
            <HistoryList
              entries={detail.history.map((item) => ({
                title: (locale === 'ar' ? item.titleAr : item.titleEn) ?? item.titleAr,
                detail: (locale === 'ar' ? item.detailAr : item.detailEn) ?? item.detailAr,
                source: item.source,
              }))}
            />
          ) : null}

          {tab === 'description' && detail.description !== null ? (
            <p className="max-w-2xl text-sm leading-loose whitespace-pre-line opacity-80">
              {detail.description}
            </p>
          ) : null}

          {tab === 'faq' ? <FaqAccordion rows={faq} /> : null}
        </div>
      </div>

      <section className="mt-12 border-t border-line pt-9">
        <header className="mb-1.5 flex items-baseline gap-3.5">
          <h2 className="text-2xl font-bold">{t('faqTitle')}</h2>
          <span className="h-px flex-1 bg-line" />
        </header>
        <p className="mb-4.5 text-xs opacity-50">{t('faqByType')}</p>
        <FaqAccordion rows={faq} columns={2} />
      </section>

      {/*
        ═══ سجلّ المزايدات وشروطه — هنا لا في صفحةٍ ثانية ═══

        **والسجلّ يقول عن نفسه إنه لا يُعدَّل**: من يُطلب منه حجزُ
        عربونٍ يحتاج أن يعرف أن ما يقرؤه أثرٌ لا عرضٌ يُنقّح.
      */}
      {auction === null ? null : (
        <section className="mt-12 border-t border-line pt-9">
          <h2 className="mb-1.5 text-2xl font-bold">سجلّ المزايدات</h2>
          <p className="mb-5 text-3xs leading-loose opacity-55">
            سجلٌّ غير قابل للتعديل — كل مزايدة موثّقة برقم المزايد وتوقيتٍ دقيق.
            وهويات المزايدين مخفية، وأرقامهم ثابتة داخل المزاد تتيح متابعة سلوكه.
          </p>

          {auction.bids.length === 0 ? (
            <p className="rounded-lg border border-line bg-surface p-5 text-2xs opacity-60">
              لا مزايدات بعد — وأوّل مزايدة تبدأ من سعر الافتتاح.
            </p>
          ) : (
            <ul className="flex flex-col gap-px overflow-hidden rounded-xl border border-line bg-line">
              {auction.bids.map((bid) => (
                <li
                  key={`${bid.alias}-${bid.at}`}
                  className="flex flex-wrap items-center justify-between gap-3 bg-surface px-4 py-3"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="bidi-isolate text-2xs font-bold">{bid.alias}</span>
                    <BidStatus top={bid.top} isAuto={bid.isAuto} />
                  </span>
                  <span className="flex items-center gap-3.5">
                    <BidStep step={bid.step} />
                    <span className="font-num text-2xs font-bold">
                      <ArabicNumber value={Number(bid.amount)} />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <BidLogStats auction={auction} />
          <AuctionTerms terms={auction.terms} />
        </section>
      )}

      <SimilarGrid items={similar} className="mt-12" />
    </>
  );
}
