import Link from 'next/link';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ArabicNumber } from './ArabicNumber';
import { Button } from './Button';
import { Countdown } from './Countdown';
import { Money } from './Money';
import { Quantity } from './Quantity';
import { cn } from '@/lib/cn';

export type BuyColumnData = {
  type: 'DIRECT' | 'NEGOTIATION' | 'AUCTION';
  askPrice: number;
  monthly: number | null;
  cost: {
    price: number;
    commission: number;
    transferFee: number;
    transferAdminFee: number;
    /** `null` تعني «لا ضريبة هنا أصلًا» — وهي غير الصفر. */
    vatIncludedInPrice: number | null;
    total: number;
  };
  seller: {
    name: string;
    badge: 'DEALER_VERIFIED' | 'USER_VERIFIED' | null;
    /** مسجَّلٌ في القيمة المضافة — معرضًا كان أو فردًا مسجَّلًا. */
    vatRegistered: boolean;
    /** مسارٌ جاهز باللغة — المكوّن لا يعرف اللغة فلا يبنيه */
    dealerPath: string | null;
    ratingAvg: number | null;
    ratingCount: number;
    listingCount: number;
  };
  auction: {
    startPrice: number;
    minimumBid: number;
    depositAmount: number;
    bidCount: number;
    highestBid: number | null;
    endsAt: string;
    status: string;
    reserveMet: boolean;
  } | null;
};

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn('rounded-xl border border-line p-5', className)}>{children}</section>;
}

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'accent' }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="opacity-60">{label}</span>
      <span className={cn('font-bold', tone === 'accent' && 'text-accent-700')}>{value}</span>
    </div>
  );
}

/**
 * عمود الشراء — السعر والإجراء والبائع والتكلفة.
 *
 * **الشراء يختلف بطريقة البيع**، فالعمود يتبدّل كاملًا لا يخفي أزرارًا:
 * المزاد لا سعر كاش له ولا تقسيط، والمباشر لا مزايدة فيه.
 *
 * ولا يظهر هنا **مبلغ** الاحتياطي ولا الحدّ الأدنى المقبول (قرار ٢٩) —
 * الرايتان `reserveMet` و«الحدّ الأدنى للمزايدة» آمنتان ولا يُشتقّ منهما
 * الرقم المخفي.
 *
 * وأزرار المقارنة و٣٦٠° والمراسلة **محذوفة** (قرار ١٨) — المراسلة تحتاج
 * إشرافًا وسياسة محتوى، ولا تُفتح بزر.
 */
export function BuyColumn({
  data,
  actions,
  footer,
  className,
}: {
  data: BuyColumnData;
  /**
   * أزرار الشراء تُحقن من الشاشة.
   *
   * والمكوّن هنا **لا يعرف جلسةً ولا مسارًا ولا لغة** — وبناء السلوك
   * فيه يجرّ إليه `fetch` و`useRouter` ويجعله غير قابل للعرض في معرض
   * المكوّنات. فالشكل هنا والسلوك هناك.
   */
  actions?: ReactNode;
  /** سطرٌ هادئ أسفل العمود — الإبلاغ ونحوه. والشكل هنا والسلوك هناك. */
  footer?: ReactNode;
  className?: string;
}) {
  const t = useTranslations('ui');
  const tx = useTranslations('tax');
  const auction = data.auction;

  return (
    <aside className={cn('flex flex-col gap-3.5', className)}>
      <section className="overflow-hidden rounded-xl border-2 border-ink">
        {auction === null ? (
          <div className="flex border-b border-line">
            <div className="flex-1 border-e border-line p-5">
              <p className="mb-1.5 flex flex-wrap items-center gap-2 text-2xs opacity-50">
                {t('cashPrice')}
                {/*
                  ═══ شكل السعر يتبع وضع البائع ═══

                  «٥٠٬٠٠٠ سعر نهائي» عند غير المسجَّل، و«٥٧٬٥٠٠ شامل
                  الضريبة» عند المسجَّل. والمشتري يعرف أيّهما **قبل** أن
                  يضغط لا في شاشة الدفع.
                */}
                <span className="opacity-80">
                  {data.seller.vatRegistered ? tx('sellerRegistered') : tx('sellerIndividual')}
                </span>
              </p>
              <Money amount={data.askPrice} size="xl" />
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-3xs opacity-55">
                {data.cost.vatIncludedInPrice === null ? (
                  tx('priceFinal')
                ) : (
                  <>
                    <span>{tx('priceWithVat')}</span>
                    <span aria-hidden className="opacity-40">·</span>
                    <span>{tx('vatShare')}</span>
                    <ArabicNumber value={data.cost.vatIncludedInPrice} />
                  </>
                )}
              </p>
            </div>
            {data.monthly === null ? null : (
              <div className="w-36 p-5">
                <p className="mb-1.5 text-2xs opacity-50">{t('financing')}</p>
                <p className="flex items-baseline gap-1">
                  <ArabicNumber value={data.monthly} className="text-2xl font-bold" />
                  <span className="text-3xs opacity-50">{t('perMonth')}</span>
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="border-b border-line p-5">
            {/**
              * بلا مزايدة يُعرض **سعر الافتتاح** لا «أعلى مزايدة ٠» —
              * صفرٌ في موضع السعر يوحي بأن المركبة بلا قيمة، وهو أسوأ
              * ما يمكن أن يقرأه بائع عن سيارته أو مشترٍ عن سوقها.
              */}
            <div className="mb-3 flex items-center gap-2.5">
              <p className="flex-1 text-2xs opacity-50">
                {t(auction.highestBid === null ? 'openingPrice' : 'highestBid')}
              </p>
              <Countdown endsAt={auction.endsAt} format="full" tone="warn" className="text-2xs" />
            </div>
            <Money amount={auction.highestBid ?? auction.startPrice} size="xl" />
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs opacity-60">
              <Quantity unit="bidders" count={auction.bidCount} />
              <span className="flex items-center gap-1">
                {t('minimumBid')} <ArabicNumber value={auction.minimumBid} />
              </span>
            </div>
            {/* الراية وحدها — المبلغ لا يظهر ولا يُشتق */}
            <p className="mt-2.5 text-2xs font-bold text-accent-700">
              {t(auction.reserveMet ? 'reserveMet' : 'reserveNotMet')}
            </p>
          </div>
        )}

        <div className="p-5">
          {auction === null ? (
            actions
          ) : (
            <>
              <Button className="mb-2.5 w-full">{t('placeBid')}</Button>
              <p className="mb-4 flex items-center justify-center gap-1.5 text-2xs opacity-55">
                {t('depositRequired')} <ArabicNumber value={auction.depositAmount} />
              </p>
            </>
          )}

          <p className="flex items-start gap-2.5 rounded-md bg-accent-100 p-3.5 text-2xs leading-relaxed text-accent-900">
            <svg viewBox="0 0 24 24" className="mt-0.5 size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 5 6v5c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6l-7-3Z" />
              <path d="m9 11.5 2 2 4-4" />
            </svg>
            {t('escrowNote')}
          </p>
        </div>
      </section>

      <Card>
        <h3 className="mb-3 text-xs font-bold">{t('totalCost')}</h3>
        <Row label={t('carPrice')} value={<ArabicNumber value={data.cost.price} />} />
        <Row
          label={t('platformCommission')}
          value={<ArabicNumber value={data.cost.commission} />}
          tone={data.cost.commission === 0 ? 'accent' : undefined}
        />
        <Row label={t('transferFee')} value={<ArabicNumber value={data.cost.transferFee} />} />
        {data.cost.transferAdminFee === 0 ? null : (
          <Row
            label={tx('adminFeeRow')}
            value={<ArabicNumber value={data.cost.transferAdminFee} />}
          />
        )}
        <div className="mt-2 flex items-center justify-between gap-4 border-t border-line pt-3 text-base font-bold">
          <span>{t('total')}</span>
          <ArabicNumber value={data.cost.total} />
        </div>
        {/* الضريبة مضمَّنة دائمًا (قرار ١٧) — تُقال ولا تُضاف سطرًا */}
        <p className="mt-2 text-3xs opacity-45">{t('vatIncluded')}</p>
      </Card>

      <Card>
        <div className="mb-4 flex items-center gap-3">
          <span className="washed size-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5">
              <span className="bidi-isolate text-sm font-bold">{data.seller.name}</span>
              {data.seller.badge === null ? null : (
                <svg viewBox="0 0 24 24" className="size-3 text-accent" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3 5 6v5c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6l-7-3Z" />
                </svg>
              )}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-3xs opacity-55">
              {data.seller.badge === null ? null : <span>{t(`sellerBadge.${data.seller.badge}`)}</span>}
              {data.seller.ratingAvg === null ? null : (
                <>
                  <span aria-hidden className="opacity-40">
                    ·
                  </span>
                  <ArabicNumber value={data.seller.ratingAvg} decimals={1} />
                  <span>{t('outOf')}</span>
                  <Quantity unit="reviews" count={data.seller.ratingCount} />
                </>
              )}
            </p>
          </div>
        </div>
        {/* زرّ «راسلـه» محذوف (قرار ١٨) — لا يُفتح بابٌ بلا سياسة تحكمه */}
        {data.seller.dealerPath === null ? null : (
          <Link
            href={data.seller.dealerPath ?? '#'}
            className="flex items-center justify-center rounded-md border border-line py-2.5 text-xs font-bold hover:bg-ink/5"
          >
            <Quantity unit="cars" count={data.seller.listingCount} />
          </Link>
        )}
      </Card>

      {footer === undefined ? null : <div className="text-center">{footer}</div>}
    </aside>
  );
}
