import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Countdown } from '@/components/ui/Countdown';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { Year } from '@/components/ui/Year';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import type { AuctionRow } from '@/lib/domain/admin-monitors';

/**
 * ═══ كرتُ المزاد ═══
 *
 * كان صفًّا: مركبةٌ نصًّا، وبائعٌ **لا يُفتح**، وأعلى مزايدة، وشارة
 * احتياطيّ، وعدّادٌ ساكن. **ولا صورةَ للمركبة التي يُزايَد عليها** —
 * وهي أوّل ما يُنظر إليه في مزاد.
 *
 * ═══ والعدّاد يَعُدّ ═══
 *
 * `secondsLeft` كان يُحسب في الخادم ويُرسَم رقمًا ساكنًا، فشاشةٌ
 * مفتوحة منذ دقيقتين تقول ما لم يعد صحيحًا. و`Countdown` تعدّ، وتقف
 * في التبويب المخفيّ فلا تُنهك جهازًا على شيءٍ لا يُرى.
 *
 * ═══ والحالة وانقضاء الوقت معًا ═══
 *
 * مزادٌ حالتُه `LIVE` وقد انقضى وقتُه ليس جاريًا — والوظيفة الدورية
 * تمرّ كل خمس دقائق. وما بين الانقضاء والاحتساب **لا نعرف أبلغ
 * الاحتياطيَ أم لا**، فلا يُقال «رسا» ولا «لم يبلغ».
 */

const STATUS: Record<string, { label: string; tone: 'accent' | 'warn' | 'neutral' }> = {
  SCHEDULED: { label: 'قادم', tone: 'neutral' },
  LIVE: { label: 'جارٍ', tone: 'accent' },
  ENDED_MET: { label: 'رسا', tone: 'accent' },
  ENDED_UNMET: { label: 'دون الاحتياطي', tone: 'warn' },
  CANCELLED: { label: 'ملغًى', tone: 'neutral' },
};

const day = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

export function AuctionCard({ row }: { row: AuctionRow }) {
  const lapsed = row.secondsLeft <= 0;
  /** الجاري حقًّا: حالتُه `LIVE` **ولم** ينقضِ وقتُه. */
  const running = row.status === 'LIVE' && !lapsed;
  /** المنقضي الذي لم تمرّ عليه الوظيفة — لا يُقال فيه رسا ولا لم يبلغ. */
  const settling = row.status === 'LIVE' && lapsed;
  const status = STATUS[row.status];

  return (
    <div className="group relative flex flex-col gap-3 rounded-xl border border-line bg-surface p-3.5 transition duration-200 hover:-translate-y-0.5 hover:border-ink/25 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none sm:flex-row sm:items-start sm:gap-4">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-ink/8">
        {row.thumbnail === null ? (
          <span className="flex size-full items-center justify-center text-3xs opacity-45">
            لا صور
          </span>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element -- مفتاحُ R2 لا يمرّ بمحسّن الصور */
          <img
            src={row.thumbnail}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none"
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* مرجعُ الإعلان يُنسخ ويُقارن خانةً بخانة — لاتينيّ معزول */}
          <Link
            href={`/admin/auctions/${encodeURIComponent(row.listingRef)}`}
            dir="ltr"
            className="font-num text-start text-xs font-bold after:absolute after:inset-0 after:content-['']"
          >
            {row.listingRef}
          </Link>
          {settling ? (
            <Badge size="sm" tone="warn">انقضى — يُحتسب</Badge>
          ) : (
            <Badge size="sm" tone={status?.tone ?? 'neutral'}>
              {status?.label ?? row.status}
            </Badge>
          )}
          {/*
            **والاحتياطي بلوغُه لا قيمتُه** — سرُّ البائع لا يمرّ في
            لقطة شاشة ولا تصدير. ولا يُقال شيءٌ عن مزادٍ يُحتسب.
          */}
          {settling || row.status === 'SCHEDULED' ? null : (
            <Badge size="sm" tone={row.reserveMet ? 'accent' : 'warn'}>
              {row.reserveMet ? 'بلغ الاحتياطي' : 'لم يُبلغ'}
            </Badge>
          )}
        </div>

        <span className="truncate text-2xs opacity-70">
          <span className="bidi-isolate">
            {row.brand} {row.model}
          </span>
          <span aria-hidden className="mx-1.5 opacity-40">
            ·
          </span>
          <Year value={row.year} />
          <span aria-hidden className="mx-1.5 opacity-40">
            ·
          </span>
          <span className="bidi-isolate">{row.city}</span>
        </span>

        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-3xs opacity-55">
          <Link
            href={`/admin/users/${encodeURIComponent(row.sellerId)}`}
            className="bidi-isolate relative z-10 underline decoration-dotted underline-offset-4 hover:decoration-solid"
          >
            {row.sellerName}
          </Link>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          {/*
            **مزايدون لا مزايدات**: تسع عشرة مزايدة من ثلاثة سوقٌ ضيّق،
            ومن تسعة عشر سوقٌ حيّ — والعدد الواحد يخلطهما.
          */}
          <Quantity unit="bidders" count={row.bidderCount} />
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <Quantity unit="bids" count={row.bidCount} />
        </span>
      </div>

      <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
        {row.topBid === null ? (
          <span className="text-2xs opacity-45">لا مزايدات</span>
        ) : (
          <Money
            amount={Number(row.topBid)}
            size="sm"
            showCurrency={false}
            className="font-bold"
          />
        )}

        <Timing row={row} running={running} settling={settling} />
      </div>
    </div>
  );
}

/**
 * التوقيت — **ولكلّ حالةٍ سؤالُها**: الجاري «كم بقي؟»، والقادم «متى
 * يبدأ؟»، والمنتهي «متى انتهى؟». والصفّ كان يعرض عدًّا تنازليًّا
 * للثلاث، فيقول للقادم إنه على وشك الانتهاء.
 */
function Timing({
  row,
  running,
  settling,
}: {
  row: AuctionRow;
  running: boolean;
  settling: boolean;
}) {
  if (running) {
    return <Countdown endsAt={row.endsAt} tone="plain" className="text-sm" />;
  }

  if (settling) {
    return <span className="text-3xs font-bold text-warn-900">ينتظر الاحتساب</span>;
  }

  if (row.status === 'SCHEDULED') {
    const starts = new Date(row.startsAt);
    return (
      <span className="font-num text-3xs opacity-55">
        <span className="opacity-70">يبدأ </span>
        {day.format(starts)}
      </span>
    );
  }

  return (
    <span className="font-num text-3xs opacity-45">
      <span className="opacity-70">انتهى </span>
      {day.format(new Date(row.endsAt))}
    </span>
  );
}
