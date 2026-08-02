import { useTranslations } from 'next-intl';
import { ArabicNumber } from './ArabicNumber';
import { Badge, InspectedBadge } from './Badge';
import { Countdown } from './Countdown';
import { Money } from './Money';
import { cn } from '@/lib/cn';

export type ListingCardData = {
  ref: string;
  title: string;
  city: string;
  mileageKm: number;
  transmission: string;
  price: number;
  monthly?: number;
  type: 'DIRECT' | 'NEGOTIATION' | 'AUCTION';
  inspected: boolean;
  imageCount: number;
  sellerName: string;
  sellerVerified: boolean;
  /** للمزاد فقط */
  highestBid?: number;
  bidderCount?: number;
  endsAt?: string;
};

const TYPE_TONE = {
  DIRECT: 'neutral',
  NEGOTIATION: 'accent',
  AUCTION: 'ink',
} as const;

/**
 * سطر البيانات — **كل مقطع معزول**.
 *
 * هذا هو الموضع الذي ينكسر فيه الاتجاه لو بُني السطر كنصّ واحد:
 * الفاصل «·» بين كلمة عربية ورقم عربي-هندي ينزلق فيُقرأ رقمًا زائدًا.
 * لا تُمرَّر هذه المقاطع كسلسلة واحدة أبدًا (فحص CI رقم ٦).
 */
export type MetaPart = string | { value: number; unit?: string };

function MetaLine({ parts }: { parts: readonly MetaPart[] }) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs opacity-55">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 ? (
            <span aria-hidden className="opacity-40">
              ·
            </span>
          ) : null}
          {/* الرقم ووحدته مقطع واحد معزول — لا فاصل بينهما فلا انزلاق */}
          <span className="bidi-isolate flex items-center gap-1">
            {typeof part === 'string' ? (
              part
            ) : (
              <>
                <ArabicNumber value={part.value} />
                {part.unit === undefined ? null : <span>{part.unit}</span>}
              </>
            )}
          </span>
        </span>
      ))}
    </p>
  );
}

function Seller({ name, verified }: { name: string; verified: boolean }) {
  return (
    <span className="flex items-center gap-2 text-2xs opacity-60">
      <span className="size-5 rounded-full bg-ink/12" />
      <span className="bidi-isolate">{name}</span>
      {verified ? (
        <svg viewBox="0 0 24 24" className="size-3 text-accent" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3 5 6v5c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6l-7-3Z" />
        </svg>
      ) : null}
    </span>
  );
}

function Price({ data }: { data: ListingCardData }) {
  const t = useTranslations('ui');

  if (data.type === 'AUCTION' && data.highestBid !== undefined) {
    return (
      <div>
        <p className="mb-0.5 text-3xs opacity-50">{t('highestBid')}</p>
        <Money amount={data.highestBid} size="lg" showCurrency={false} className="text-accent-700" />
      </div>
    );
  }

  return (
    <div>
      <Money amount={data.price} size="lg" showCurrency={false} className="text-accent-700" />
      {data.monthly === undefined ? null : (
        <p className="mt-0.5 flex items-center gap-1 text-3xs opacity-50">
          <span>{t('orMonthly')}</span>
          <ArabicNumber value={data.monthly} />
        </p>
      )}
    </div>
  );
}

/** بطاقة الشبكة — Wa وWb. `sponsored` تضيف وسم «مموّل» الإلزامي. */
export function CarCard({
  data,
  sponsored = false,
  className,
}: {
  data: ListingCardData;
  sponsored?: boolean;
  className?: string;
}) {
  const t = useTranslations('ui');

  return (
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border border-line bg-surface',
        className,
      )}
    >
      <div className="relative aspect-16/10 bg-ink/8">
        <div className="absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
          <span className="flex flex-col items-start gap-1.5">
            {sponsored ? <Badge tone="neutral">{t('sponsored')}</Badge> : null}
            {data.inspected ? <InspectedBadge /> : null}
          </span>
          {data.type === 'AUCTION' && data.endsAt !== undefined ? (
            <Countdown endsAt={data.endsAt} />
          ) : null}
        </div>
        <span className="absolute bottom-2.5 inline-flex items-center gap-1 rounded-sm bg-ink/70 px-2 py-0.5 text-3xs text-bg end-2.5">
          <ArabicNumber value={data.imageCount} />
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3.5">
        <h3 className="text-lg leading-snug font-bold">{data.title}</h3>
        <MetaLine
          parts={[data.city, { value: data.mileageKm, unit: t('km') }, data.transmission]}
        />

        <div className="mt-auto flex items-end justify-between gap-3 border-b border-line-2 pb-3">
          <Price data={data} />
          {data.type === 'AUCTION' ? (
            <span className="flex items-center gap-1 text-3xs opacity-50">
              <ArabicNumber value={data.bidderCount ?? 0} />
              <span>{t('bidders')}</span>
            </span>
          ) : (
            <Badge tone={TYPE_TONE[data.type]}>{t(`listingType.${data.type}`)}</Badge>
          )}
        </div>

        <Seller name={data.sellerName} verified={data.sellerVerified} />
      </div>
    </article>
  );
}

/** صفّ القائمة — نفس البيانات بتخطيط أفقي (Wb، عرض القائمة). */
export function CarRow({
  data,
  className,
}: {
  data: ListingCardData;
  className?: string;
}) {
  const t = useTranslations('ui');

  return (
    <article
      className={cn(
        'flex gap-4 overflow-hidden rounded-xl border border-line bg-surface p-3.5',
        className,
      )}
    >
      <div className="relative aspect-4/3 w-40 shrink-0 overflow-hidden rounded-lg bg-ink/8">
        {data.inspected ? (
          <InspectedBadge className="absolute top-2 start-2" />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h3 className="truncate text-lg font-bold">{data.title}</h3>
          <Badge tone={TYPE_TONE[data.type]}>{t(`listingType.${data.type}`)}</Badge>
        </div>
        <MetaLine
          parts={[data.city, { value: data.mileageKm, unit: t('km') }, data.transmission]}
        />
        <div className="mt-auto flex items-end justify-between gap-3">
          <Price data={data} />
          <Seller name={data.sellerName} verified={data.sellerVerified} />
        </div>
      </div>
    </article>
  );
}
