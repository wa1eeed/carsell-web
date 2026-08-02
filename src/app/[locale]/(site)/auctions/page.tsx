import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { AuctionRail } from '@/components/ui/AuctionRail';
import { EmptyState } from '@/components/ui/EmptyState';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { SectionHead } from '@/components/ui/HomeSections';
import { db } from '@/lib/db';
import { routing } from '@/i18n/routing';
import type { Prisma } from '@/generated/prisma/client';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'auctions' });
  return { title: t('title'), description: t('intro') };
}

const TABS = ['live', 'soon', 'ended'] as const;

/**
 * Wk — فهرس المزادات.
 *
 * **الترتيب يطابق التبويب المفعّل** (معيار القبول): «مباشرة» تُرتَّب
 * بالأقرب إغلاقًا لأن ذلك ما يقرّر أين يزايد القارئ الآن، و«قادمة»
 * بالأقرب بدءًا، و«منتهية» بالأحدث انتهاءً. ترتيبٌ واحد للثلاثة يجعل
 * تبويبين من الثلاثة بلا معنى.
 */
export default async function AuctionsPage({
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
  const raw = typeof search.tab === 'string' ? search.tab : undefined;
  const tab = TABS.find((key) => key === raw) ?? 'live';

  const status: Prisma.AuctionWhereInput =
    tab === 'live'
      ? { status: 'LIVE' }
      : tab === 'soon'
        ? { status: 'SCHEDULED' }
        : { status: { in: ['ENDED_MET', 'ENDED_UNMET'] } };

  const orderBy =
    tab === 'live'
      ? { endsAt: 'asc' as const }
      : tab === 'soon'
        ? { startsAt: 'asc' as const }
        : { endsAt: 'desc' as const };

  const [auctions, counts, t] = await Promise.all([
    db.auction.findMany({
      where: { ...status, listing: { status: { in: ['PUBLISHED', 'RESERVED', 'SOLD'] } } },
      orderBy,
      take: 24,
      include: {
        listing: {
          select: {
            ref: true, city: true, askPrice: true,
            vehicle: {
              select: {
                brandName: true, modelName: true, trimName: true, year: true,
                brand: { select: { slug: true } },
              },
            },
          },
        },
        bids: { orderBy: { amount: 'desc' }, take: 1 },
        _count: { select: { bids: true } },
      },
    }),
    db.auction.groupBy({ by: ['status'], _count: { _all: true } }),
    getTranslations('auctions'),
  ]);

  const countOf = (statuses: readonly string[]): number =>
    counts
      .filter((row) => statuses.includes(row.status))
      .reduce((total, row) => total + row._count._all, 0);

  return (
    <>
      <SiteHeader active="auctions" />
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto w-full max-w-page px-10 py-10">
          <h1 className="mb-2.5 text-4xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mb-7 max-w-2xl text-sm leading-loose opacity-68">{t('intro')}</p>

          <nav className="mb-7 flex flex-wrap gap-2.5">
            {TABS.map((key) => (
              <Link
                key={key}
                href={`/${locale}/auctions?tab=${key}`}
                className={
                  key === tab
                    ? 'rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-bg'
                    : 'rounded-full border border-line px-4 py-2.5 text-sm font-semibold hover:bg-ink/5'
                }
              >
                {t(`tab.${key}`)}
              </Link>
            ))}
          </nav>

          {auctions.length === 0 ? (
            <EmptyState title={t(`empty.${tab}`)} description={t('emptyBody')} />
          ) : (
            <>
              <SectionHead title={t(`tab.${tab}`)} />
              <AuctionRail
                auctions={auctions.map((auction) => ({
                  ref: auction.listing.ref,
                  title: [auction.listing.vehicle.brandName, auction.listing.vehicle.modelName, auction.listing.vehicle.trimName]
                    .filter((part) => part !== null && part !== '')
                    .join(' '),
                  year: auction.listing.vehicle.year,
                  city: auction.listing.city,
                  price: auction.startPrice.toString(),
                  highestBid: auction.bids[0]?.amount.toString() ?? null,
                  bidCount: auction._count.bids,
                  endsAt: auction.endsAt.toISOString(),
                  href: `/${locale}/auctions/${auction.listing.ref}`,
                }))}
              />
            </>
          )}

          {/* كل مقطع معزول — الفاصل بالتخطيط لا بالنصّ (فحص ٦) */}
          <p className="mt-8 flex flex-wrap items-center gap-2 text-2xs opacity-45">
            {(
              [
                ['countLive', countOf(['LIVE'])],
                ['countSoon', countOf(['SCHEDULED'])],
                ['countEnded', countOf(['ENDED_MET', 'ENDED_UNMET'])],
              ] as const
            ).map(([key, value], i) => (
              <span key={key} className="flex items-center gap-2">
                {i > 0 ? (
                  <span aria-hidden className="opacity-40">
                    ·
                  </span>
                ) : null}
                <span className="flex items-center gap-1.5">
                  <ArabicNumber value={value} />
                  {t(key)}
                </span>
              </span>
            ))}
          </p>
        </div>
      </main>
    </>
  );
}
