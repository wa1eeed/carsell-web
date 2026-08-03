import { useTranslations } from 'next-intl';
import { ArabicNumber } from './ArabicNumber';
import { Badge, InspectedBadge } from './Badge';
import { Countdown } from './Countdown';
import { Money } from './Money';
import { Quantity, type Unit } from './Quantity';
import { cn } from '@/lib/cn';

export type ListingCardData = {
  ref: string;
  /** بلا سنة — السنة رقم يُصاغ لا نصّ يُلصق (فحص ٩). */
  title: string;
  year: number;
  city: string;
  mileageKm: number;
  /**
   * **نصٌّ مترجَم لا تعداد.** والاسم يقول ذلك لأن النوع لا يستطيع:
   * `transmission: string` تقبل `'AUTOMATIC'` صامتةً فتُطبع كما هي —
   * وقد وقعت في صفحة المعرض.
   */
  transmissionLabel: string;
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

/** شارة فوق الصورة — عدّاد المزاد وعدّاد الصور يتشاركانها. */
const IMAGE_BADGE =
  'absolute bottom-2.5 inline-flex items-center rounded-sm bg-ink/70 px-2 py-0.5 text-3xs text-bg';

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
export type MetaPart = string | { count: number; unit: Unit };

function MetaLine({ parts }: { parts: readonly MetaPart[] }) {
  /**
   * المقطع الفارغ يُسقَط هنا لا عند المناداة: مناداةٌ تنسى الشرط
   * تُنتج فاصلًا معلَّقًا بلا نصّ بعده — والفاصل بلا طرفين خطأ مرئي.
   */
  const shown = parts.filter((part) => typeof part !== 'string' || part.trim() !== '');

  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs opacity-55">
      {shown.map((part, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 ? (
            <span aria-hidden className="opacity-40">
              ·
            </span>
          ) : null}
          {/* الرقم ووحدته مقطع واحد معزول — لا فاصل بينهما فلا انزلاق */}
          {typeof part === 'string' ? (
            <span className="bidi-isolate">{part}</span>
          ) : (
            <Quantity unit={part.unit} count={part.count} />
          )}
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
  const te = useTranslations('enums');

  return (
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border border-line bg-surface',
        className,
      )}
    >
      <div className="washed relative aspect-16/10">
        <div className="absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
          <span className="flex flex-col items-start gap-1.5">
            {sponsored ? <Badge tone="neutral">{t('sponsored')}</Badge> : null}
            {data.inspected ? <InspectedBadge /> : null}
          </span>
        </div>
        {/* العدّاد وعدّاد الصور شارتان أسفل الصورة بحجم واحد —
            عدّاد يغطّي ربع الصورة يسرق ما جاء القارئ ليراه. */}
        {data.type === 'AUCTION' && data.endsAt !== undefined ? (
          <Countdown endsAt={data.endsAt} tone="plain" className={cn(IMAGE_BADGE, 'start-2.5')} />
        ) : null}
        <span className={cn(IMAGE_BADGE, 'end-2.5')}>
          <Quantity unit="photos" count={data.imageCount} />
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3.5">
        <h3 className="flex flex-wrap items-baseline gap-1.5 text-lg leading-snug font-bold">
          <span className="bidi-isolate">{data.title}</span>
          <ArabicNumber value={data.year} grouped={false} />
        </h3>
        <MetaLine
          parts={[data.city, { count: data.mileageKm, unit: 'km' }, data.transmissionLabel]}
        />

        <div className="mt-auto flex items-end justify-between gap-3 border-b border-line-2 pb-3">
          <Price data={data} />
          {data.type === 'AUCTION' ? (
            <Quantity unit="bidders" count={data.bidderCount ?? 0} className="text-3xs opacity-50" />
          ) : (
            <Badge tone={TYPE_TONE[data.type]}>{te(`listingType.${data.type}`)}</Badge>
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
  const te = useTranslations('enums');

  return (
    <article
      className={cn(
        'flex gap-4 overflow-hidden rounded-xl border border-line bg-surface p-3.5',
        className,
      )}
    >
      <div className="washed relative aspect-4/3 w-40 shrink-0 overflow-hidden rounded-lg">
        {data.inspected ? (
          <InspectedBadge className="absolute top-2 start-2" />
        ) : null}
      </div>

      {/* العنوان والبيانات يأخذان الفراغ، والسعر والرقاقة مجموعان في
          نهاية الصفّ. لا `justify-between` على ثلاثة عناصر — تُنتج
          فجوة في الوسط وتترك الرقاقة معلّقة وحدها. */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="flex items-baseline gap-1.5 truncate text-lg font-bold">
          <span className="bidi-isolate">{data.title}</span>
          <ArabicNumber value={data.year} grouped={false} />
        </h3>
        <MetaLine
          parts={[data.city, { count: data.mileageKm, unit: 'km' }, data.transmissionLabel]}
        />
        <Seller name={data.sellerName} verified={data.sellerVerified} />
      </div>

      <div className="flex shrink-0 flex-col items-end justify-between gap-2.5">
        <Badge tone={TYPE_TONE[data.type]}>{te(`listingType.${data.type}`)}</Badge>
        <Price data={data} />
      </div>
    </article>
  );
}
