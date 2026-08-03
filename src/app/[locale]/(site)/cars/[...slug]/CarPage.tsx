'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge, InspectedBadge } from '@/components/ui/Badge';
import { BuyColumn } from '@/components/ui/BuyColumn';
import { BuyActions } from '@/components/site/BuyActions';
import type { TaxProfile } from '@/lib/domain/tax-profile';
import { EmptyState } from '@/components/ui/EmptyState';
import { FaqAccordion } from '@/components/ui/FaqAccordion';
import { Gallery } from '@/components/ui/Gallery';
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
}: {
  detail: PublicListingDetail;
  faq: readonly { id: string; question: string; answer: string }[];
  similar: readonly SimilarItem[];
  canonical: Canonical;
  locale: string;
  heading: { home: string; cars: string };
  viewer: { signedIn: boolean; isOwn: boolean; taxProfile: TaxProfile | null };
}) {
  const t = useTranslations('ui');
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
        <span dir="ltr" className="font-num text-3xs opacity-70">
          carsell.one{canonical.display}
        </span>
      </nav>

      <div className="flex flex-col gap-10 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-7">
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
          </header>

          <Gallery images={detail.images} alt={vehicle.title} />

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

          {tab === 'faq' ? <FaqAccordion rows={faq} /> : null}
        </div>

        <div className="w-full shrink-0 lg:w-[380px]">
          <div className="sticky top-4 flex flex-col gap-3.5">
            <BuyColumn
              actions={
                <BuyActions
                  listingRef={detail.ref}
                  price={Number(detail.askPrice)}
                  type={detail.type}
                  isOwn={viewer.isOwn}
                  signedIn={viewer.signedIn}
                  locale={locale}
                  taxProfile={viewer.taxProfile}
                />
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
      </div>

      <section className="mt-12 border-t border-line pt-9">
        <header className="mb-1.5 flex items-baseline gap-3.5">
          <h2 className="text-2xl font-bold">{t('faqTitle')}</h2>
          <span className="h-px flex-1 bg-line" />
        </header>
        <p className="mb-4.5 text-xs opacity-50">{t('faqByType')}</p>
        <FaqAccordion rows={faq} columns={2} />
      </section>

      <SimilarGrid items={similar} className="mt-12" />
    </>
  );
}
