import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { routing } from '@/i18n/routing';
import { listPublicDealers } from '@/lib/domain/dealer-page';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'dealer' });
  return {
    title: t('indexTitle'),
    description: t('indexSubtitle'),
    alternates: { canonical: `/${locale}/dealers` },
  };
}

/** فهرس المعارض — الموثّق أوّلًا، فالثقة ترتيبٌ لا شارةٌ وحدها. */
export default async function DealersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const [dealers, t] = await Promise.all([
    listPublicDealers(locale),
    getTranslations('dealer'),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto w-full max-w-page px-10 py-10">
          <h1 className="mb-1.5 text-4xl font-bold tracking-tight">{t('indexTitle')}</h1>
          <p className="mb-8 text-sm opacity-60">{t('indexSubtitle')}</p>

          {dealers.length === 0 ? (
            <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dealers.map((dealer) => (
                <li key={dealer.slug}>
                  <Link
                    href={`/${locale}/dealers/${dealer.slug}`}
                    className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-5 hover:border-ink"
                  >
                    <span className="flex flex-wrap items-center gap-2 font-bold">
                      <span className="bidi-isolate">{dealer.name}</span>
                      {!dealer.verified ? null : <Badge tone="accent">{t('verified')}</Badge>}
                    </span>
                    <span className="flex flex-wrap items-center gap-2.5 text-2xs opacity-55">
                      <span>{dealer.city}</span>
                      <span aria-hidden className="opacity-40">·</span>
                      <span className="flex items-center gap-1.5">
                        <ArabicNumber value={dealer.listingCount} />
                        <span>{t('listed')}</span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}
