import { Year } from '@/components/ui/Year';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import type { ListingRow } from '@/lib/domain/admin-monitors';
import { AR_DATE_LOCALE } from '@/lib/arabic';

/**
 * ═══ كرتُ الإعلان في اللوحة ═══
 *
 * كان سطرًا في جدول: عنوانٌ وسعرٌ وحالة. **ومن يراجع إعلانًا يحتاج
 * أن يعرف قبل أن يفتحه** — أيُّ مركبةٍ هي، ومن يبيعها، وأفردٌ هو أم
 * معرض، وأمشترِكٌ هو، ومتى نُشر. فمراجعةُ عشرين إعلانًا كانت عشرين
 * فتحًا ورجوعًا.
 *
 * ═══ والصورة أوّلًا ═══
 *
 * نصفُ قرار المراجعة بصريّ: صورةٌ ضبابية أو لوحةٌ ظاهرة تُردّ قبل
 * قراءة سطرٍ واحد. وسطرٌ نصّيّ يُخفي ذلك كلَّه.
 */

const STATUS: Record<string, { label: string; tone: 'accent' | 'warn' | 'danger' | 'neutral' }> = {
  PUBLISHED: { label: 'منشور', tone: 'accent' },
  PENDING_REVIEW: { label: 'قيد المراجعة', tone: 'warn' },
  RESERVED: { label: 'محجوز', tone: 'neutral' },
  SOLD: { label: 'مبيع', tone: 'neutral' },
  SUSPENDED: { label: 'موقوف', tone: 'danger' },
  DRAFT: { label: 'مسودة', tone: 'neutral' },
  EXPIRED: { label: 'منته', tone: 'neutral' },
};

const TYPE: Record<string, string> = {
  DIRECT: 'بيع مباشر',
  NEGOTIATION: 'تفاوض',
  AUCTION: 'مزاد',
};

/** صفةُ البائع — وهي تغيّر المراجعة: معرضٌ موثَّق غيرُ فردٍ أوّلِ إعلان. */
const SELLER_KIND: Record<string, { label: string; tone: 'accent' | 'neutral' }> = {
  DEALER_VERIFIED: { label: 'معرض موثق', tone: 'accent' },
  DEALER: { label: 'معرض', tone: 'neutral' },
  INDIVIDUAL: { label: 'فرد', tone: 'neutral' },
};

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Riyadh',
});

export function ListingCard({ row }: { row: ListingRow }) {
  const status = STATUS[row.status] ?? { label: row.status, tone: 'neutral' as const };
  const kind = SELLER_KIND[row.sellerKind] ?? { label: 'فرد', tone: 'neutral' as const };

  return (
    <Link
      href={`/admin/listings/${encodeURIComponent(row.ref)}`}
      /**
       * **والحركة تقول «هذا يُفتح».** رفعةٌ خفيفة وحدٌّ يغمق عند
       * المرور — ولا تتحرّك على من يُبطئ الحركة في نظامه.
       */
      className="group flex gap-4 rounded-xl border border-line bg-surface p-3.5 transition duration-200 hover:-translate-y-0.5 hover:border-ink/25 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none"
    >
      {/*
        ═══ الغلاف — وخانةٌ حين لا صورة ═══

        إعلانٌ بلا صور حالةٌ تُقال لا فراغٌ يُترك: المراجع يردّه لذلك
        بعينه، فالخانة تقول «لا صور» ولا تُشبه صورةً لم تُحمَّل.
      */}
      <div className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-ink/8">
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
        {row.imageCount <= 1 ? null : (
          <span className="absolute bottom-1 end-1 rounded-md bg-ink/85 px-1.5 text-3xs font-bold text-bg">
            <ArabicNumber value={row.imageCount} />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-xs font-bold">{row.title}</span>
          {/* **والسنة بلا فاصلة** — «2,026» ليست سنة، والفاصلة تجعلها مبلغًا */}
          <Year value={row.year} className="text-2xs opacity-70" />
          <Badge tone={status.tone}>{status.label}</Badge>
          {row.inspected ? <Badge tone="accent">مفحوصة</Badge> : null}
        </div>

        {/* سطرُ المركبة — المدينة والممشى ونوع العرض */}
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-3xs opacity-70">
          <span>{row.city}</span>
          <span aria-hidden className="opacity-40">·</span>
          {/* **والوحدة بـ`Quantity`** — ستُّ صيغ جمعٍ لا يحكمها قالب */}
          <Quantity unit="km" count={row.mileageKm} />
          <span aria-hidden className="opacity-40">·</span>
          <span>{TYPE[row.type] ?? row.type}</span>
        </p>

        {/*
          ═══ والمعلن وصفتُه وباقتُه ═══

          «من يبيعها» ليس اسمًا وحده: معرضٌ موثَّق بباقةٍ مدفوعة غيرُ
          فردٍ ينشر أوّل إعلان — والمراجعة تختلف، والأولوية تختلف.
        */}
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-3xs">
          <span className="bidi-isolate font-bold opacity-75">{row.sellerName}</span>
          <Badge tone={kind.tone}>{kind.label}</Badge>
          {row.planName === null ? null : <Badge tone="neutral">{row.planName}</Badge>}
          {row.publishedAt === null ? (
            <span className="opacity-65">لم ينشر بعد</span>
          ) : (
            <span className="opacity-65">نشر {riyadh.format(new Date(row.publishedAt))}</span>
          )}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        <Money amount={Number(row.askPrice)} />
        <p className="flex items-center gap-2.5 text-3xs opacity-70">
          <Quantity unit="offers" count={row.offerCount} />
          <span aria-hidden className="opacity-40">·</span>
          <Quantity unit="views" count={row.viewCount} />
        </p>
        <span className="font-num text-3xs opacity-65" dir="ltr">
          {row.ref}
        </span>
      </div>
    </Link>
  );
}
