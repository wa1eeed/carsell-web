import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentDealer } from '@/lib/auth/dealer-session';
import {
  AUCTION_BUCKETS,
  dealerAuctionBuckets,
  dealerAuctions,
  type AuctionBucket,
} from '@/lib/domain/dealer-auctions';
import { DealerShell } from '@/components/dealer/DealerShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Duration } from '@/components/ui/Duration';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { AUCTION_BUCKET_AR } from '@/lib/labels/dealer';
import { cn } from '@/lib/cn';
import { AuctionDecision } from './AuctionDecision';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'المزادات — المعرض', robots: { index: false, follow: false } };

function parseBucket(raw: string | undefined): AuctionBucket {
  return AUCTION_BUCKETS.find((bucket) => bucket === raw) ?? 'LIVE';
}

/**
 * ═══ `D4` — المزادات ═══
 *
 * **والاحتياطيُّ يُعرض هنا ولا يخرج في استجابةٍ عامّة** (قرار ٢٩): بلا
 * رؤيته لا يستطيع المعرض أن يقرّر عند الإغلاق، ومع ذلك لا يبلغ مشتريًا.
 *
 * **ولا زرَّ «أنشئ مزادًا» بعد**: إنشاءُ المزاد مسارٌ كامل بإعداداته
 * السبعة في الترميز، ولا شاشةَ إنشاءٍ في المنتج — لا هنا ولا في
 * اللوحة. وزرٌّ يفتح على لا شيء أسوأ من غيابه.
 */
export default async function DealerAuctions({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string }>;
}) {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');
  if (actor.role === 'ACCOUNTANT') redirect('/dealer');

  const bucket = parseBucket((await searchParams).bucket);
  const now = new Date();

  const [rows, buckets] = await Promise.all([
    dealerAuctions(actor.dealerId, actor.branchId, bucket, now),
    dealerAuctionBuckets(actor.dealerId, actor.branchId, now),
  ]);

  const mayDecide = actor.role === 'OWNER' || actor.role === 'MANAGER';

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/auctions"
      title="المزادات"
      subtitle={<Quantity unit="liveAuctions" count={buckets.LIVE} />}
    >
      <nav className="mb-6 flex flex-wrap gap-2" aria-label="شرائح المزادات">
        {AUCTION_BUCKETS.map((item) => (
          <Link
            key={item}
            href={item === 'LIVE' ? '/dealer/auctions' : `/dealer/auctions?bucket=${item}`}
            aria-current={item === bucket ? 'page' : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-4 py-2 text-2xs transition-colors',
              item === bucket ? 'bg-ink font-bold text-bg' : 'border border-line font-semibold hover:bg-ink/6',
            )}
          >
            <span>{AUCTION_BUCKET_AR[item]}</span>
            {buckets[item] === 0 ? null : (
              <span
                className={cn(
                  'flex min-w-4.5 items-center justify-center rounded-full px-1.5 font-num text-3xs font-bold',
                  item === bucket ? 'bg-bg/20' : 'bg-ink/8',
                )}
              >
                <ArabicNumber value={buckets[item]} />
              </span>
            )}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title="لا مزادات في هذه الشريحة"
          description="المزاد ينشأ اليوم من لوحة المنصة على إعلان قائم."
        />
      ) : (
        <div className="grid gap-4">
          {rows.map((row) => {
            const hours = Math.max(
              0,
              Math.floor((new Date(row.endsAt).getTime() - now.getTime()) / 3_600_000),
            );
            const gap = row.gap === null ? null : Number(row.gap);

            return (
              <article key={row.listingRef} className="rounded-xl border border-line p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold">
                      <Link
                        href={`/ar/cars/${row.listingRef}`}
                        className="hover:underline"
                      >
                        {row.vehicle}
                      </Link>
                    </h2>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-3xs opacity-70">
                      <Quantity unit="bidders" count={row.bidderCount} />
                      <span aria-hidden className="opacity-65">·</span>
                      {/*
                        **والحالةُ وانقضاءُ الوقت معًا** (قاعدةٌ مسجَّلة):
                        «مباشر» على مزادٍ مضى موعدُه يَعِد بمزايدةٍ
                        يردّها الخادم.
                      */}
                      {row.status === 'LIVE' && !row.overdue ? (
                        <span>يغلق بعد <Duration hours={hours} genitive /></span>
                      ) : row.overdue && row.status === 'LIVE' ? (
                        <span className="font-bold text-warn-900">انقضى وقته — ينتظر الاحتساب</span>
                      ) : null}
                    </p>
                  </div>
                  <Badge tone={row.status === 'LIVE' && !row.overdue ? 'accent' : 'neutral'}>
                    {row.status === 'LIVE' && !row.overdue
                      ? 'مباشر'
                      : row.status === 'SCHEDULED'
                        ? 'قادم'
                        : 'انتهى دون الاحتياطي'}
                  </Badge>
                </div>

                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-line p-3.5">
                    <dt className="text-3xs opacity-70">أعلى مزايدة</dt>
                    <dd className="mt-1">
                      {row.topBid === null ? (
                        <span className="text-2xs opacity-70">لا مزايدات بعد</span>
                      ) : (
                        <Money amount={row.topBid} size="md" />
                      )}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-line p-3.5">
                    {/*
                      **ويُقال إنه مخفيّ** — فمن يقرؤه هنا يحتاج أن
                      يعرف أنّ المزايدين لا يرونه، وإلّا ظنّه معلنًا.
                    */}
                    <dt className="text-3xs opacity-70">الاحتياطي — مخفي عن المزايدين</dt>
                    <dd className="mt-1">
                      {row.reserve === null ? (
                        <span className="text-2xs opacity-70">بلا احتياطي</span>
                      ) : (
                        <Money amount={row.reserve} size="md" />
                      )}
                    </dd>
                  </div>
                </dl>

                {gap === null ? null : (
                  <p
                    className={cn(
                      'mt-3 text-2xs font-semibold',
                      gap >= 0 ? 'text-accent-700' : 'text-warn-900',
                    )}
                  >
                    {gap >= 0 ? (
                      <>تجاوز الاحتياطي بـ <Money amount={String(gap)} size="sm" /> — يرسى تلقائيا</>
                    ) : (
                      <>دون الاحتياطي بـ <Money amount={String(-gap)} size="sm" /> — قرارك مطلوب عند الإغلاق</>
                    )}
                  </p>
                )}

                {row.status === 'ENDED_UNMET' && row.topBid !== null && mayDecide ? (
                  <AuctionDecision listingRef={row.listingRef} topBid={row.topBid} />
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </DealerShell>
  );
}
