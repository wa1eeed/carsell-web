import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArabicNumber } from './ArabicNumber';
import { Countdown } from './Countdown';
import { Money } from './Money';
import { Quantity } from './Quantity';
import { cn } from '@/lib/cn';

export type RailAuction = {
  ref: string;
  title: string;
  year: number;
  city: string;
  price: string;
  highestBid: string | null;
  bidCount: number;
  endsAt: string;
  href: string;
};

/**
 * شريط المزادات الحيّة.
 *
 * العدّاد يتحرّك في المتصفّح، **والقيمة الأولى تُصاغ على الخادم** —
 * فلا يظهر فراغ ثم يقفز الرقم مكانه. هذا هو الفرق بين شريط ساكن
 * وشريط يُزحزح ما تحته عند أول ثانية (CLS).
 *
 * وبلا مزاد لا يُعرض القسم إطلاقًا: «مزادات مباشرة» فوق فراغ أسوأ من
 * غيابه.
 */
export function AuctionRail({
  auctions,
  className,
}: {
  auctions: readonly RailAuction[];
  className?: string;
}) {
  const t = useTranslations('ui');
  if (auctions.length === 0) return null;

  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-4', className)}>
      {auctions.map((auction) => (
        <Link
          key={auction.ref}
          href={auction.href}
          className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface hover:border-ink/25"
        >
          {/* نسبة ثابتة — الصورة تحجز مكانها قبل تحميلها */}
          <span className="washed relative block aspect-16/10">
            <Countdown
              endsAt={auction.endsAt}
              tone="plain"
              className="absolute bottom-2.5 start-2.5 inline-flex items-center rounded-sm bg-ink/70 px-2 py-0.5 text-3xs text-bg"
            />
          </span>

          <span className="flex flex-1 flex-col gap-2 p-4">
            <span className="flex flex-wrap items-baseline gap-1.5 text-sm font-bold">
              <span className="bidi-isolate">{auction.title}</span>
              <ArabicNumber value={auction.year} grouped={false} />
            </span>
            <span className="bidi-isolate text-3xs opacity-50">{auction.city}</span>

            <span className="mt-auto flex items-end justify-between gap-3 pt-2">
              <span>
                <span className="mb-0.5 block text-3xs opacity-50">
                  {t(auction.highestBid === null ? 'openingPrice' : 'highestBid')}
                </span>
                <Money
                  amount={Number(auction.highestBid ?? auction.price)}
                  size="md"
                  showCurrency={false}
                  className="text-accent-700"
                />
              </span>
              <Quantity unit="bidders" count={auction.bidCount} className="text-3xs opacity-50" />
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
