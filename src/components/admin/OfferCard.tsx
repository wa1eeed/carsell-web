import Link from 'next/link';
import { Duration } from '@/components/ui/Duration';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { displayDigits } from '@/lib/arabic';
import type { OfferRow } from '@/lib/domain/admin-monitors';

/**
 * ═══ كرتُ العرض ═══
 *
 * كان صفًّا: مركبةٌ نصًّا، واسمان **لا يُفتح أيٌّ منهما**، ومبلغٌ
 * ومطلوبٌ وحالةٌ و«منذ ساعتين». والشاشة اسمُها «مراقبة لا تدخّل»،
 * فالقرار الوحيد فيها: **أيُّ مفاوضةٍ تستحقّ النظر؟**
 *
 * وجوابُه ثلاثة لم تكن معروضة:
 *
 *   · **الفجوة** بين المعروض والمطلوب — ٢٪ مفاوضةٌ تكاد تُغلق،
 *     و٣٠٪ جسُّ نبض. والصفّ يعرض الرقمين ويترك الطرح للقارئ.
 *   · **الجولة** — عرضٌ رابعٌ في سلسلةٍ غير عرضٍ أوّل.
 *   · **ما بقي من المهلة** لا ما مضى: عرضٌ بقيت له ساعة يُنظر فيه
 *     اليوم، وعرضٌ بقي له يومان يُؤجَّل.
 */

const STATUS: Record<string, { label: string; tone: 'accent' | 'warn' | 'neutral' | 'danger' }> = {
  PENDING: { label: 'بانتظار البائع', tone: 'warn' },
  COUNTERED: { label: 'عرض مقابل', tone: 'accent' },
  ACCEPTED: { label: 'مقبول', tone: 'accent' },
  REJECTED: { label: 'مرفوض', tone: 'neutral' },
  WITHDRAWN: { label: 'مسحوب', tone: 'neutral' },
  EXPIRED: { label: 'انتهت مهلته', tone: 'neutral' },
};

/** المنتهية — فلا مهلةَ تُعدّ لها ولا فجوةَ تُلاحَق. */
const CLOSED: readonly string[] = ['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'];

export function OfferCard({ row }: { row: OfferRow }) {
  const status = STATUS[row.status];
  const closed = CLOSED.includes(row.status) || row.autoRejected;

  const amount = Number(row.amount);
  const ask = Number(row.askPrice);
  /** الفجوة نسبةً — **والنسبة تُقارَن، والفرق الخام لا يُقارَن**. */
  const gapPct = ask <= 0 ? null : Math.round(((ask - amount) / ask) * 100);

  return (
    <div className="group relative flex flex-col gap-3 rounded-xl border border-line bg-surface p-3.5 transition duration-200 hover:-translate-y-0.5 hover:border-ink/25 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none sm:flex-row sm:items-start sm:gap-4">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-ink/8">
        {row.thumbnail === null ? (
          <span className="flex size-full items-center justify-center text-3xs opacity-65">
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
            href={`/admin/offers/${encodeURIComponent(row.id)}`}
            dir="ltr"
            className="font-num text-start text-xs font-bold after:absolute after:inset-0 after:content-['']"
          >
            {row.listingRef}
          </Link>
          <Badge size="sm" tone={row.autoRejected ? 'neutral' : (status?.tone ?? 'neutral')}>
            {row.autoRejected ? 'رفض تلقائيا' : (status?.label ?? row.status)}
          </Badge>
          {row.round <= 1 ? null : (
            <Badge size="sm" tone="neutral">
              <Quantity unit="rounds" count={row.round} />
            </Badge>
          )}
        </div>

        <span className="truncate text-2xs opacity-75">
          <span className="bidi-isolate">
            {row.vehicleBrand} {row.vehicleModel}
          </span>
          <span aria-hidden className="mx-1.5 opacity-40">
            ·
          </span>
          <span className="font-num">{row.vehicleYear}</span>
          <span aria-hidden className="mx-1.5 opacity-40">
            ·
          </span>
          <span className="bidi-isolate">{row.city}</span>
        </span>

        {/* المشتري يعرض والبائع ينظر — والسهم يقول الاتّجاه */}
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-3xs opacity-70">
          <Party id={row.buyerId} name={row.buyerName} />
          <span aria-hidden className="opacity-40">
            ←
          </span>
          <Party id={row.sellerId} name={row.sellerName} />
        </span>
      </div>

      <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
        <Money amount={amount} size="sm" showCurrency={false} className="font-bold" />

        {/*
          ═══ الفجوة ═══
          المطلوب وحده لا يقول شيئًا، والطرح في رأس القارئ على كل صفّ.
        */}
        <span className="text-3xs opacity-65">
          <span>المطلوب </span>
          <Money amount={ask} size="sm" showCurrency={false} />
          {gapPct === null ? null : (
            <>
              <span aria-hidden className="mx-1 opacity-40">
                ·
              </span>
              <span className={gapPct >= 15 ? 'font-bold text-warn-900' : ''}>
                دونه بـ<span className="font-num">{displayDigits(String(gapPct))}</span>٪
              </span>
            </>
          )}
        </span>

        <Deadline row={row} closed={closed} />
      </div>
    </div>
  );
}

/**
 * المهلة — **والحالة المخزَّنة وحدها لا تكفي متى كان لها وقت**: عرضٌ
 * `PENDING` انقضت مهلتُه ليس بانتظار أحد، والوظيفة تمرّ كل خمس دقائق.
 */
function Deadline({ row, closed }: { row: OfferRow; closed: boolean }) {
  if (closed) {
    return (
      <span className="text-3xs opacity-65">
        <span>منذ </span>
        <Duration hours={row.waitingMinutes / 60} />
      </span>
    );
  }

  if (row.lapsed) {
    return <span className="text-3xs opacity-70">انقضت مهلته — يسقط قريبا</span>;
  }

  const near = row.hoursToExpiry <= 6;
  return (
    <span className={near ? 'text-3xs font-bold text-warn-900' : 'text-3xs opacity-65'}>
      <span className="opacity-80">بقي </span>
      <Duration hours={row.hoursToExpiry} />
    </span>
  );
}

/** طرفٌ على الكرت — رابطٌ يرتفع فوق الرابط الممدود. */
function Party({ id, name }: { id: string; name: string }) {
  return (
    <Link
      href={`/admin/users/${encodeURIComponent(id)}`}
      className="bidi-isolate relative z-10 underline decoration-dotted underline-offset-4 hover:decoration-solid"
    >
      {name}
    </Link>
  );
}
