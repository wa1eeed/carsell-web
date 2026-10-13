import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { vehicleTitle } from '@/lib/domain/vehicle-title';
import { cityLabel } from '@/lib/labels/cities';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { canonicalPath } from '@/lib/domain/listing-detail';
import { AuctionRail } from '@/components/ui/AuctionRail';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterChip } from '@/components/ui/FilterChip';
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
  const city = typeof search.city === 'string' && search.city !== '' ? search.city : null;
  const raw = typeof search.tab === 'string' ? search.tab : undefined;
  const tab = TABS.find((key) => key === raw) ?? 'live';

  /**
   * ═══ الحالة **والوقت** معًا ═══
   *
   * `LIVE` مخزَّنة لمزادٍ انقضى حتى تمرّ الوظيفة الدورية — فكان
   * الفهرس يعرضه تحت «مباشرة الآن» بعدّادٍ على `00:00:00`، ويُطلب
   * من الزائر أن يزايد على ما انتهى.
   *
   * **والمنتهي يضمّ المنقضي وقتُه ولو بقيت حالتُه `LIVE`** — وإلّا
   * اختفى من الفهرس كلّه: لا هو مباشر ولا منتهٍ.
   */
  const now = new Date();
  const status: Prisma.AuctionWhereInput =
    tab === 'live'
      ? { status: 'LIVE', endsAt: { gt: now } }
      : tab === 'soon'
        ? { status: 'SCHEDULED', startsAt: { gt: now } }
        : {
            OR: [
              { status: { in: ['ENDED_MET', 'ENDED_UNMET'] } },
              { status: 'LIVE', endsAt: { lte: now } },
            ],
          };

  const orderBy =
    tab === 'live'
      ? { endsAt: 'asc' as const }
      : tab === 'soon'
        ? { startsAt: 'asc' as const }
        : { endsAt: 'desc' as const };

  const [auctions, counts, t, cityRows] = await Promise.all([
    db.auction.findMany({
      where: {
        ...status,
        listing: {
          status: { in: ['PUBLISHED', 'RESERVED', 'SOLD'] },
          ...(city === null ? {} : { city }),
        },
      },
      orderBy,
      take: 24,
      include: {
        listing: {
          select: {
            ref: true, city: true, askPrice: true,
            vehicle: {
              select: {
                brandName: true, modelName: true, trimName: true, year: true,
                brand: { select: { slug: true, nameEn: true } },
                model: { select: { nameEn: true } },
                trim: { select: { nameEn: true } },
              },
            },
          },
        },
        bids: { orderBy: { amount: 'desc' }, take: 1 },
        _count: { select: { bids: true } },
      },
    }),
    /**
     * **والعدّاد يُحسب بالحالة والوقت كالترشيح.** `groupBy` على
     * الحالة وحدها يقول «مباشرة ٧» وفيها ستّةٌ انقضت — فيضغط الزائر
     * ويجد واحدًا.
     */
    Promise.all([
      db.auction.count({ where: { status: 'LIVE', endsAt: { gt: new Date() } } }),
      db.auction.count({ where: { status: 'SCHEDULED', startsAt: { gt: new Date() } } }),
      db.auction.count({
        where: {
          OR: [
            { status: { in: ['ENDED_MET', 'ENDED_UNMET'] } },
            { status: 'LIVE', endsAt: { lte: new Date() } },
          ],
        },
      }),
    ]),
    getTranslations('auctions'),
    /** مدن المزادات — الشريط يُبنى منها لا من قائمةٍ مكتوبة. */
    db.listing.findMany({
      where: { auction: { isNot: null }, status: { in: ['PUBLISHED', 'RESERVED', 'SOLD'] } },
      select: { city: true },
      distinct: ['city'],
      orderBy: { city: 'asc' },
    }),
  ]);

  const [liveCount, soonCount, endedCount] = counts;

  /**
   * **وعددُ الشريحة بلا مدينة** — فهو ما يقيس «أهناك مزادات في مدنٍ
   * أخرى؟»، وهو السؤال الذي يجيبه الفراغ.
   */
  const inTab = tab === 'live' ? liveCount : tab === 'soon' ? soonCount : endedCount;
  const cities = cityRows.map((row) => row.city);
  const countOf = (key: 'live' | 'soon' | 'ended'): number =>
    key === 'live' ? liveCount : key === 'soon' ? soonCount : endedCount;

  return (
    <>
      <SiteHeader active="auctions" />
      <main className="min-h-screen bg-bg text-ink">
        <div className="page-frame">
          <h1 className="mb-2.5 text-4xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mb-5 max-w-2xl text-sm leading-loose opacity-68">{t('intro')}</p>

          {/*
            ═══ الشروط قبل الدخول لا بعده ═══

            التصميم يضعها أعلى الفهرس: العربون والاحتياطي والتمديد.
            **ومن يقرأها قبل أن يزايد يزايد وهو يعرف** — ومن يكتشفها
            بعد أوّل ضغطة يظنّ المنصّة فاجأته.
          */}
          <p className="mb-7 max-w-2xl rounded-xl border border-line bg-surface p-4.5 text-2xs leading-loose opacity-75">
            يُحجز عربونٌ على بطاقتك قبل أوّل مزايدة ويُرد فورًا إن لم تفز. والسعر
            الاحتياطيّ مخفيّ — تُعرَض بلوغُه لا مقدارُه. وأيّ مزايدة في آخر دقيقة
            تمدّد الوقت، فلا يُحسم المزاد بثانية.
          </p>

          <nav className="mb-7 flex flex-wrap gap-2.5">
            {TABS.map((key) => (
              <FilterChip
                key={key}
                // المدينة تُحمل مع الشريحة — وإلّا أرجعت كل نقرةٍ إلى «كل المدن»
                href={`/${locale}/auctions?tab=${key}${city === null ? '' : `&city=${encodeURIComponent(city)}`}`}
                active={key === tab}
                count={countOf(key)}
              >
                {t(`tab.${key}`)}
              </FilterChip>
            ))}
          </nav>

          {/*
            ═══ شريط المدن ═══

            **ومن يزايد يزايد قريبًا منه**: المعاينة قبل الإغلاق ونقلُ
            الملكية بعده كلاهما يقع في مدينة المركبة. وفهرسٌ بلا مدينة
            يُري الرياضيَّ مزادًا في جازان ويطلب منه أن يقرّر.
          */}
          {cities.length <= 1 ? null : (
            <nav className="mb-7 flex flex-wrap gap-2.5">
              <FilterChip href={`/${locale}/auctions?tab=${tab}`} active={city === null}>
                كل المدن
              </FilterChip>
              {cities.map((name) => (
                <FilterChip
                  key={name}
                  href={`/${locale}/auctions?tab=${tab}&city=${encodeURIComponent(name)}`}
                  active={city === name}
                >
                  {name}
                </FilterChip>
              ))}
            </nav>
          )}

          {auctions.length === 0 ? (
            /*
              ═══ والفراغُ يقول سببَه ═══

              ترشيحٌ بالرياض كان يقول «لا مزادات مباشرة الآن — تابع
              الصفحة، نضيف مزادات أسبوعيًا» **وثلاثةٌ مباشرة** في مدنٍ
              أخرى. فيقرأ الزائر أن لا شيء ويغادر، والثلاثة نقرةٌ واحدة
              منه. والصنف نفسه أُصلح في طابور الخدمات.
            */
            <EmptyState
              title={city !== null && inTab > 0 ? t('emptyInCity') : t(`empty.${tab}`)}
              description={city !== null && inTab > 0 ? t('emptyInCityBody') : t('emptyBody')}
              action={
                city === null || inTab === 0 ? undefined : (
                  <Link
                    href={`/${locale}/auctions?tab=${tab}`}
                    className="rounded-lg border border-line px-4 py-2 text-2xs font-bold hover:border-ink"
                  >
                    {t('clearCity')}
                  </Link>
                )
              }
            />
          ) : (
            <>
              <SectionHead title={t(`tab.${tab}`)} />
              <AuctionRail
                auctions={auctions.map((auction) => ({
                  ref: auction.listing.ref,
                  title: vehicleTitle(auction.listing.vehicle, locale),
                  year: auction.listing.vehicle.year,
                  city: cityLabel(auction.listing.city, locale),
                  price: auction.startPrice.toString(),
                  highestBid: auction.bids[0]?.amount.toString() ?? null,
                  bidCount: auction._count.bids,
                  endsAt: auction.endsAt.toISOString(),
                  href: canonicalPath(locale, auction.listing).path,
                }))}
              />
            </>
          )}

          {/* كل مقطع معزول — الفاصل بالتخطيط لا بالنصّ (فحص ٦) */}
          <p className="mt-8 flex flex-wrap items-center gap-2 text-2xs opacity-45">
            {(
              [
                ['countLive', countOf('live')],
                ['countSoon', countOf('soon')],
                ['countEnded', countOf('ended')],
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
