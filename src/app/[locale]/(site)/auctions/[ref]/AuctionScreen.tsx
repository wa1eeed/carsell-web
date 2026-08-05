'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { BidPanel } from '@/components/site/BidPanel';
import { SellerDecisionPanel } from '@/components/site/SellerDecisionPanel';
import {
  AuctionTerms,
  BidLogStats,
  BidStatus,
  BidStep,
  ClosingSoonRail,
  SellerCard,
  SpecStrip,
} from '@/components/site/AuctionSections';
import { Countdown } from '@/components/ui/Countdown';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import type { PublicAuction, SellerDecision } from '@/lib/domain/auctions';

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
  specs,
  listingPath,
  viewer,
  decision,
  soon,
  seller,
  locale,
}: {
  auction: PublicAuction;
  vehicle: { title: string; year: number; city: string };
  /** شريط المواصفات — يُبنى في الخادم من الإعلان لا من المزاد. */
  specs: readonly { label: string; value: React.ReactNode }[];
  listingPath: string;
  viewer: { signedIn: boolean; isOwn: boolean };
  /** `null` لغير البائع ولمزادٍ لا قرار عليه — والحارس في النطاق. */
  decision: SellerDecision | null;
  /** مزادات تُغلق قريبًا — تُقرأ في الخادم، ولقطةُ التحديث لا تحملها. */
  soon: readonly {
    listingRef: string;
    title: string;
    year: number;
    endsAt: string;
    price: string;
    path: string;
  }[];
  seller: {
    name: string;
    isDealer: boolean;
    dealerPath: string | null;
    listingCount: number;
  };
  locale: string;
}) {
  /**
   * توقيتُ المزايدة **بتوقيت الرياض دائمًا** — والمزاد يُغلق بساعته لا
   * بساعة القارئ. ومزايدٌ في جدّة يقرأ «21:04» ويقارنها بعدّاد الإغلاق،
   * فاختلاف المنطقة يجعل السجلّ يناقض العدّاد فوقه.
   */
  const stamp = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
    timeZone: 'Asia/Riyadh',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

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

  /**
   * **الحالة المخزَّنة وانقضاء الوقت معًا** — كما في صندوق العروض.
   *
   * `closeEndedAuctions` وظيفةٌ دورية، وبين مرورها ومرورها التالي يبقى
   * `status` على `LIVE` بعد `endsAt`: فتعرض الشاشة «مباشر» وعدّادًا
   * وزرًّا مفعَّلًا، ويردّ الخادم «انتهى المزاد» عند الضغط. (وقع: زايدتُ
   * على مزادٍ يقول إنه حيّ فردّ ٤٠٩.)
   *
   * والصفحة `force-dynamic` فالمقارنة عند التصيير — والعدّاد يتولّى
   * اللحظة التالية في المتصفّح.
   */
  const live = auction.status === 'LIVE' && new Date(auction.endsAt).getTime() > Date.now();

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
            {/*
              الشارة تتبع `live` لا `status`. وبين انقضاء الوقت ومرور
              الوظيفة **لا نعرف بعدُ** أبلغ الاحتياطي أم لا — فلا نقول
              `ENDED_MET` ولا `ENDED_UNMET`، بل «يُحتسب الآن».
            */}
            <Badge tone={live ? 'ink' : 'neutral'}>
              {live || auction.status !== 'LIVE'
                ? te(`auctionStatus.${auction.status}`)
                : t('settling')}
            </Badge>
          </p>
        </header>

        <div className="washed mb-6 aspect-16/9 rounded-xl" />

        {/*
          **شريط المواصفات — وكان الزائر يرى مبالغ ولا يرى المركبة.**
          التصميم يضعه تحت العنوان مباشرةً: أربع حقائق تسبق كل شيء.
        */}
        <SpecStrip items={specs} />

        <Link href={listingPath} className="text-xs font-bold text-accent-700 hover:underline">
          {t('viewListing')}
        </Link>

        <section className="mt-8">
          <h2 className="mb-1.5 text-base font-bold">{t('bidLog')}</h2>
          {/*
            **والسجلّ يقول عن نفسه إنه لا يُعدَّل.** من يُطلب منه حجز
            عربونٍ يحتاج أن يعرف أن ما يقرؤه أثرٌ لا عرضٌ يُنقّح.
          */}
          <p className="mb-4 text-3xs leading-loose opacity-55">
            سجلٌّ غير قابل للتعديل — كل مزايدة موثّقة برقم المزايد وتوقيتٍ دقيق.
            وهويات المزايدين مخفية، وأرقامهم ثابتة داخل المزاد تتيح متابعة سلوكه.
          </p>

          {auction.bids.length === 0 ? (
            <p className="text-sm opacity-55">{t('noBids')}</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[34rem] text-start text-2xs">
                  <thead className="border-b border-line bg-surface text-3xs opacity-50">
                    <tr>
                      <th className="p-3 text-start font-bold">المزايد</th>
                      <th className="p-3 text-start font-bold">التاريخ والوقت</th>
                      <th className="p-3 text-start font-bold">الفرق</th>
                      <th className="p-3 text-start font-bold">الحالة</th>
                      <th className="p-3 text-end font-bold">المبلغ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-2">
                    {auction.bids.map((bid, i) => (
                      <tr key={`${bid.alias}-${bid.at}-${String(i)}`}>
                        {/* المزايد باسم مستعار — الهوية لا تخرج */}
                        <td className="p-3">
                          <span className="flex items-center gap-1.5">
                            {t('bidder')}{' '}
                            <ArabicNumber value={Number(bid.alias)} grouped={false} />
                          </span>
                        </td>
                        <td className="bidi-isolate p-3 font-num text-3xs opacity-60">
                          {stamp.format(new Date(bid.at))}
                        </td>
                        <td className="p-3">
                          <BidStep step={bid.step} />
                        </td>
                        <td className="p-3">
                          <BidStatus top={bid.top} isAuto={bid.isAuto} />
                        </td>
                        <td className="p-3 text-end">
                          <Money amount={Number(bid.amount)} size="sm" showCurrency={false} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <BidLogStats auction={auction} />
            </>
          )}
        </section>

        {/*
          **شروط المزاد — وكان يُطلب حجز خمسة آلاف بلا شرطٍ معروض.**
          وكلّها أرقامٌ فعلية من الإعداد: شرطٌ مكتوب بيدٍ يتباعد عن
          الإعداد أوّل تغيير، فيقرأ المزايد «٥ دقائق» ويمدّد النظام ثلاثًا.
        */}
        <AuctionTerms terms={auction.terms} />

        {/* من يزايد بمئتي ألف يسأل عمّن يبيع */}
        <SellerCard {...seller} />

        <ClosingSoonRail items={soon} />
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-[380px]">
        {/*
          **قرار البائع أوّلًا.** مهلةٌ تجري وحقٌّ يسقط بانقضائها — فلا
          يُدفن تحت بطاقة السعر التي لم تعد تعني شيئًا بعد الإغلاق.
        */}
        {decision === null ? null : (
          <SellerDecisionPanel listingRef={auction.listingRef} decision={decision} />
        )}

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
            {/*
              المزايدة والعربون — **وكان الزرّان بلا `onClick`**، فالمزاد
              يُعرَض حيًّا بعدّاده ولا يُزايَد فيه.
            */}
            <BidPanel
              listingRef={auction.listingRef}
              live={live}
              minimumNext={auction.minimumBid}
              increment={auction.bidIncrement}
              depositAmount={auction.depositAmount}
              buyNowPrice={auction.buyNowPrice}
              signedIn={viewer.signedIn}
              isOwn={viewer.isOwn}
              locale={locale}
              onPlaced={() => void snapshot()}
            />
          </div>
        </section>
      </aside>
    </div>
  );
}
