import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { db } from '@/lib/db';
import { listBrandOptions } from '@/lib/domain/catalog-options';
import { isFeatureOn } from '@/lib/env';
import { routing } from '@/i18n/routing';
import { currentUserFromCookies } from '@/lib/domain/account';
import { SellWizard } from './SellWizard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'sell' });
  return { title: `${t('title')} ${t('titleTail')}` };
}

/**
 * Wh — بِع سيارتك.
 *
 * **الجلب يفشل ⇒ إدخال يدوي** (معيار القبول). والمسار اليدوي ليس بديلًا
 * احتياطيًا بل مسارٌ أول من الدرجة نفسها: تكامل بيانات المركبات ليس
 * قائمًا في المرحلة الأولى، وأي بائع قد يحمل مركبة لا يعرفها أي مزوّد.
 */
export default async function SellPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  // النشر يحتاج حسابًا — والتصفّح لا (Wm)
  const user = await currentUserFromCookies();
  if (user === null) redirect(`/${locale}/auth`);

  const [brands, cities, stats, t] = await Promise.all([
    listBrandOptions(),
    db.listing
      .groupBy({ by: ['city'], where: { status: 'PUBLISHED' }, _count: { _all: true } })
      .then((rows) => rows.map((row) => row.city).sort()),
    db.priceStat.aggregate({ _avg: { daysToSellMedian: true } }),
    getTranslations('sell'),
  ]);

  const medianDays = Math.round(stats._avg.daysToSellMedian ?? 0);

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <section className="bg-ink text-bg">
          <div className="mx-auto w-full max-w-page px-10 py-11">
            <h1 className="mb-5 max-w-2xl text-display leading-tight font-extrabold tracking-tight">
              {t('title')}
              <span className="block opacity-70">{t('titleTail')}</span>
            </h1>

            <dl className="flex flex-wrap gap-9">
              {[
                { key: 'commission', value: 0, suffix: '٪' },
                { key: 'days', value: medianDays, suffix: null },
                { key: 'minutes', value: 5, suffix: null },
              ].map((stat) => (
                <div key={stat.key}>
                  <dd className="flex items-baseline text-3xl leading-none font-bold">
                    <ArabicNumber value={stat.value} />
                    {stat.suffix === null ? null : <span>{stat.suffix}</span>}
                  </dd>
                  <dt className="mt-1.5 text-2xs opacity-60">{t(`stat.${stat.key}`)}</dt>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <div className="mx-auto w-full max-w-page px-10 py-10">
          <SellWizard
            brands={brands}
            cities={cities}
            locale={locale}
            vinLookupEnabled={isFeatureOn('VIN_LOOKUP')}
          />
        </div>
      </main>
    </>
  );
}
