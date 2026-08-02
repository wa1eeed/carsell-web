'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Countdown } from '@/components/ui/Countdown';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import type { PublicAuction } from '@/lib/domain/auctions';

/** المزامنة كل ٣٠ ثانية — لا كل ثانية (معيار القبول). */
const SYNC_SECONDS = 30;

/**
 * We — المزاد.
 *
 * **اللقطة من REST والدفع من WebSocket.** الرسالة تقول «تغيّر شيء»،
 * واللقطة تقول «هذا هو الحال». بناء الحال من الرسائل يعني أن رسالةً
 * ضائعة تُفسد كل ما بعدها بلا أن يظهر ذلك — ولهذا تُطلب لقطة عند كل
 * فجوة في `seq` لا مجرّد إعادة اتصال.
 *
 * **والاستطلاع كل ٣٠ ثانية يبقى قائمًا** حتى مع اتصال سليم: هو ما
 * يجعل تعطُّل Redis تأخّرًا لا انقطاعًا.
 */
export function AuctionScreen({
  auction: initial,
  vehicle,
  listingPath,
}: {
  auction: PublicAuction;
  vehicle: { title: string; year: number; city: string };
  listingPath: string;
}) {
  const t = useTranslations('auctions');
  const te = useTranslations('enums');
  const [auction, setAuction] = useState(initial);
  const seq = useRef(0);

  /** لقطة كاملة — عند البدء وعند كل فجوة. */
  const snapshot = async (): Promise<void> => {
    const response = await fetch(`/api/v1/auctions/${auction.listingRef}`);
    if (!response.ok) return;
    const body = (await response.json()) as { data?: PublicAuction };
    if (body.data !== undefined) setAuction(body.data);
  };

  useEffect(() => {
    const timer = setInterval(() => void snapshot(), SYNC_SECONDS * 1000);

    const url = process.env.NEXT_PUBLIC_WS_URL;
    if (url === undefined || url === '') return () => clearInterval(timer);

    // اتصال واحد لكل عميل
    const socket = new WebSocket(url);

    socket.onopen = () => {
      socket.send(JSON.stringify({ action: 'subscribe', channel: `auction:${auction.id}` }));
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as { seq?: number };
      const next = message.seq ?? 0;
      // فجوة ⇒ لقطة جديدة، لا محاولة ترقيع
      if (seq.current !== 0 && next > seq.current + 1) void snapshot();
      seq.current = next;
      void snapshot();
    };

    // الإخفاء يوقف الاشتراك — تبويب مخفيّ لا يحتاج بثًّا
    const onVisibility = (): void => {
      if (document.hidden) {
        socket.send(JSON.stringify({ action: 'unsubscribe', channel: `auction:${auction.id}` }));
      } else {
        socket.send(JSON.stringify({ action: 'subscribe', channel: `auction:${auction.id}` }));
        void snapshot();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      socket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auction.id, auction.listingRef]);

  const live = auction.status === 'LIVE';

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      <div className="min-w-0 flex-1">
        <header className="mb-6">
          <h1 className="mb-2 flex flex-wrap items-baseline gap-2 text-4xl font-bold tracking-tight">
            <span className="bidi-isolate">{vehicle.title}</span>
            <ArabicNumber value={vehicle.year} grouped={false} />
          </h1>
          <p className="flex flex-wrap items-center gap-2.5 text-sm opacity-65">
            <span className="bidi-isolate">{vehicle.city}</span>
            <span aria-hidden className="opacity-35">·</span>
            <Badge tone={live ? 'ink' : 'neutral'}>{te(`auctionStatus.${auction.status}`)}</Badge>
          </p>
        </header>

        <div className="washed mb-6 aspect-16/9 rounded-xl" />

        <Link href={listingPath} className="text-xs font-bold text-accent-700 hover:underline">
          {t('viewListing')}
        </Link>

        <section className="mt-8">
          <h2 className="mb-3.5 text-base font-bold">{t('bidLog')}</h2>
          {auction.bids.length === 0 ? (
            <p className="text-sm opacity-55">{t('noBids')}</p>
          ) : (
            <ul className="flex flex-col">
              {auction.bids.map((bid, i) => (
                <li
                  key={`${bid.alias}-${bid.at}-${String(i)}`}
                  className="flex items-center gap-4 border-b border-line-2 py-3 last:border-0"
                >
                  {/* المزايد باسم مستعار — الهوية لا تخرج */}
                  <span className="flex items-center gap-1.5 text-sm">
                    {t('bidder')} <ArabicNumber value={Number(bid.alias)} grouped={false} />
                  </span>
                  {bid.isAuto ? <Badge tone="neutral">{t('auto')}</Badge> : null}
                  <span className="flex-1" />
                  <Money amount={Number(bid.amount)} size="md" showCurrency={false} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="w-full shrink-0 lg:w-[380px]">
        <section className="sticky top-4 overflow-hidden rounded-xl border-2 border-ink">
          <div className="border-b border-line p-5">
            <div className="mb-3 flex items-center gap-2.5">
              <p className="flex-1 text-2xs opacity-50">
                {t(auction.highestBid === null ? 'openingPrice' : 'highestBid')}
              </p>
              {live ? <Countdown endsAt={auction.endsAt} format="full" tone="warn" className="text-2xs" /> : null}
            </div>

            <Money amount={Number(auction.highestBid ?? auction.startPrice)} size="xl" />

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs opacity-60">
              <Quantity unit="bidders" count={auction.bidderCount} />
              <span className="flex items-center gap-1">
                {t('minimumBid')} <ArabicNumber value={Number(auction.minimumBid)} />
              </span>
            </div>

            {/* راية وحدها — لا المبلغ ولا ما يُشتقّ منه (القاعدة ٨) */}
            <p className="mt-2.5 text-2xs font-bold text-accent-700">
              {t(auction.reserveMet ? 'reserveMet' : 'reserveNotMet')}
            </p>

            {auction.extendedCount === 0 ? null : (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-3xs opacity-50">
                {t('extendedTimes')}
                <ArabicNumber value={auction.extendedCount} grouped={false} />
                {t('outOf')}
                <ArabicNumber value={auction.maxExtensions} grouped={false} />
              </p>
            )}
          </div>

          <div className="p-5">
            {/* المزايدة الفعلية تحتاج عربونًا محجوزًا — القاعدة ٩ */}
            <Button className="mb-2.5 w-full" disabled={!live}>
              {t('placeBid')}
            </Button>
            <p className="mb-4 flex items-center justify-center gap-1.5 text-2xs opacity-55">
              {t('depositRequired')} <ArabicNumber value={Number(auction.depositAmount)} />
            </p>

            {/* ═══ القاعدة ١٠ ═══ يختفي متى بلغت المزايدات الاحتياطي */}
            {auction.buyNowPrice === null ? null : (
              <Button variant="outline" className="w-full">
                {t('buyNow')} <ArabicNumber value={Number(auction.buyNowPrice)} />
              </Button>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
