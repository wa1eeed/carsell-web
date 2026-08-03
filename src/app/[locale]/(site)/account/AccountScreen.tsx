'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { TaxStatusDialog } from '@/components/site/TaxStatusDialog';
import type { TaxProfile } from '@/lib/domain/tax-profile';
import { StatCard } from '@/components/ui/StatCard';
import { Tabs } from '@/components/ui/Tabs';
import type { AccountData } from '@/lib/domain/account';

/**
 * **الحقول الناقصة بارزة** — معيار قبول Wf.
 *
 * ليست شارةً في زاوية: بطاقة في صدر الصفحة تسمّي ما ينقص وتقول ما
 * يمنعه. البريد والتوثيق والآيبان مطلوبة قبل أول معاملة لا عند
 * التسجيل، فالتذكير يسبق لحظة الحاجة بدل أن يظهر خطأً عند الضغط على
 * «اشترِ» — وهي أسوأ لحظة يكتشف فيها القارئ أن عليه عملًا.
 */
function MissingFields({ data, locale }: { data: AccountData; locale: string }) {
  const t = useTranslations('account');
  const { missing, canBuy, canSell } = data.completion;
  if (missing.length === 0) return null;

  return (
    <section className="mb-8 rounded-xl border border-warn-200 bg-warn-100 p-6 text-warn-900">
      <h2 className="mb-1.5 text-base font-bold">{t('completeTitle')}</h2>
      <p className="mb-4 text-xs leading-loose opacity-85">
        {/* ما يمنعه النقص يُقال صراحةً — «أكمل ملفك» وحدها لا تدفع أحدًا */}
        {!canBuy ? t('blocksBuying') : !canSell ? t('blocksSelling') : t('completeBody')}
      </p>

      <ul className="flex flex-wrap gap-2.5">
        {missing.map((field) => (
          <li key={field}>
            <Link
              href={`/${locale}/account/profile#${field}`}
              className="flex items-center gap-2 rounded-md border border-warn-200 bg-bg px-3.5 py-2 text-xs font-semibold hover:border-warn-700"
            >
              <span className="size-1.5 rounded-full bg-warn-700" aria-hidden />
              {t(`missing.${field}`)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AccountScreen({
  data,
  locale,
  taxProfile,
}: {
  data: AccountData;
  locale: string;
  taxProfile: TaxProfile;
}) {
  const t = useTranslations('account');
  const te = useTranslations('enums');
  const tx = useTranslations('tax');
  const [tab, setTab] = useState('listings');
  const [tax, setTax] = useState<TaxProfile>(taxProfile);
  const [editingTax, setEditingTax] = useState(false);

  const date = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const Title = ({ title, year }: { title: string; year: number }) => (
    <span className="flex flex-wrap items-baseline gap-1.5 font-bold">
      <span className="bidi-isolate">{title}</span>
      <ArabicNumber value={year} grouped={false} />
    </span>
  );

  const tabs = [
    { id: 'listings', label: t('tab.listings'), count: data.listings.length },
    { id: 'offers', label: t('tab.offers'), count: data.offers.length },
    { id: 'orders', label: t('tab.orders'), count: data.orders.length },
    { id: 'reports', label: t('tab.reports'), count: data.reports.length },
  ];

  return (
    <>
      <MissingFields data={data} locale={locale} />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.stats.map((stat) => (
          <StatCard key={stat.key} label={t(`stat.${stat.key}`)} value={stat.value} />
        ))}
      </div>

      <Tabs items={tabs} active={tab} onChange={setTab} className="mb-6" />

      {tab === 'listings' ? (
        data.listings.length === 0 ? (
          <EmptyState
            title={t('noListings')}
            description={t('noListingsBody')}
            action={
              <Link href={`/${locale}/sell`}>
                <Button>{t('sellNow')}</Button>
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {data.listings.map((listing) => (
              <li
                key={listing.ref}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface p-4.5"
              >
                <span className="washed size-16 shrink-0 rounded-lg" />
                <span className="min-w-40 flex-1">
                  <Title title={listing.title} year={listing.year} />
                  <span className="mt-1 flex flex-wrap items-center gap-2.5 text-2xs opacity-55">
                    <span className="font-num">{listing.ref}</span>
                    <span aria-hidden className="opacity-40">·</span>
                    <Quantity unit="views" count={listing.viewCount} />
                    <span aria-hidden className="opacity-40">·</span>
                    <Quantity unit="offers" count={listing.offerCount} />
                  </span>
                </span>
                <Badge tone={listing.status === 'PUBLISHED' ? 'accent' : 'neutral'}>
                  {te(`listingStatus.${listing.status}`)}
                </Badge>
                <Money amount={Number(listing.price)} size="md" showCurrency={false} />
                <Link href={listing.path} className="text-xs font-bold text-accent-700 hover:underline">
                  {t('view')}
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === 'offers' ? (
        data.offers.length === 0 ? (
          <EmptyState title={t('noOffers')} description={t('noOffersBody')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {data.offers.map((offer) => (
              <li
                key={offer.id}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface p-4.5"
              >
                <span className="min-w-40 flex-1">
                  <Title title={offer.title} year={offer.year} />
                  <span className="mt-1 block text-2xs opacity-55">
                    {t('expiresOn')} <span className="bidi-isolate">{date.format(new Date(offer.expiresAt))}</span>
                  </span>
                </span>
                <Badge tone="warn">{te(`offerStatus.${offer.status}`)}</Badge>
                <Money amount={Number(offer.amount)} size="md" showCurrency={false} className="text-accent-700" />
                <Link href={offer.path} className="text-xs font-bold text-accent-700 hover:underline">
                  {t('view')}
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === 'orders' ? (
        data.orders.length === 0 ? (
          <EmptyState title={t('noOrders')} description={t('noOrdersBody')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {data.orders.map((order) => (
              <li
                key={order.ref}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface p-4.5"
              >
                <span className="min-w-40 flex-1">
                  <Title title={order.title} year={order.year} />
                  <span className="mt-1 flex flex-wrap items-center gap-2.5 text-2xs opacity-55">
                    <span className="font-num">{order.ref}</span>
                    <span aria-hidden className="opacity-40">·</span>
                    <span className="bidi-isolate">{date.format(new Date(order.createdAt))}</span>
                  </span>
                </span>
                <Badge tone="accent">{te(`orderStage.${order.stage}`)}</Badge>
                <Money amount={Number(order.amount)} size="md" showCurrency={false} />
                <Link href={order.path} className="text-xs font-bold text-accent-700 hover:underline">
                  {t('view')}
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === 'reports' ? (
        data.reports.length === 0 ? (
          <EmptyState title={t('noReports')} description={t('noReportsBody')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {data.reports.map((report) => (
              <li
                key={report.ref}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface p-4.5"
              >
                <ScoreRing score={report.score} size="sm" />
                <span className="min-w-40 flex-1">
                  <Title title={report.title} year={0} />
                  <span className="mt-1 flex flex-wrap items-center gap-2.5 text-2xs opacity-55">
                    <span className="font-num bidi-ltr">{report.ref}</span>
                    <span aria-hidden className="opacity-40">·</span>
                    <span className="bidi-isolate">{date.format(new Date(report.inspectedAt))}</span>
                  </span>
                </span>
                {/* التقرير يبقى وإن سُحب الإعلان — ورابطه يذهب معه */}
                {report.path === null ? (
                  <span className="text-xs opacity-45">{t('listingWithdrawn')}</span>
                ) : (
                  <Link href={report.path} className="text-xs font-bold text-accent-700 hover:underline">
                    {t('view')}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )
      ) : null}

      {/*
        ═══ الإعدادات المالية والضريبية ═══

        الحالة تُعرض شارةً لا نصًّا مدفونًا: المستخدم يريد أن يعرف بنظرة
        أيّ وضعٍ يُطبَّق عليه، والرقم `dir="ltr"` لأنه يُقارَن خانةً بخانة.
      */}
      <section className="mt-9 rounded-xl border border-line p-5">
        <h2 className="mb-3 text-sm font-bold">{tx('settingsTitle')}</h2>
        <div className="flex flex-wrap items-center gap-3">
          {tax.status === null ? (
            <p className="min-w-0 flex-1 text-2xs leading-loose opacity-60">{tx('currentUnset')}</p>
          ) : (
            <p className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-xs">
              <Badge tone={tax.status === 'VAT_REGISTERED' ? 'accent' : 'neutral'}>
                {tax.status === 'VAT_REGISTERED'
                  ? tx('currentRegistered')
                  : tx('currentIndividual')}
              </Badge>
              {tax.vatNumber === null ? null : (
                <span dir="ltr" className="bidi-isolate font-num opacity-70">
                  {tax.vatNumber}
                </span>
              )}
            </p>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditingTax(true)}>
            {tx('edit')}
          </Button>
        </div>
      </section>

      <TaxStatusDialog
        open={editingTax}
        onClose={() => setEditingTax(false)}
        initial={tax}
        onSaved={(profile) => {
          setTax(profile);
          setEditingTax(false);
        }}
      />
    </>
  );
}
