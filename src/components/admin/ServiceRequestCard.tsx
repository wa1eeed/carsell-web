import Link from 'next/link';
import { Duration } from '@/components/ui/Duration';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import type { ServiceRequestRow } from '@/lib/domain/admin-services';

/**
 * ═══ كرتُ طلب الخدمة ═══
 *
 * كان صفًّا في جدولٍ بسبعة أعمدة، وعرضُه يفيض على الهاتف فيُمرَّر
 * أفقيًّا. **ومن يُسنِد طلبًا يسأل ثلاثة**: ما الخدمة ولمن، ومتى موعد
 * العميل، وكم بقي من مهلة المزوّد.
 *
 * ═══ وموعدان لا موعد ═══
 *
 * `scheduledAt` موعدُ **العميل** — متى يأتي ليُفحَص. و`dueAt` مهلةُ
 * **المزوّد** — متى ينفد صبرُنا عليه. والجدول كان يعرضهما عمودين
 * متجاورين بلا ما يفرّق بينهما، فيُقرآن واحدًا.
 */

const STATUS: Record<string, { label: string; tone: 'accent' | 'warn' | 'neutral' | 'danger' }> = {
  NEW: { label: 'جديد', tone: 'warn' },
  ASSIGNED: { label: 'مُسنَد', tone: 'accent' },
  IN_PROGRESS: { label: 'قيد التنفيذ', tone: 'accent' },
  DONE: { label: 'منجز', tone: 'neutral' },
  FAILED: { label: 'فشل', tone: 'danger' },
  REFUNDED: { label: 'مسترجع', tone: 'neutral' },
};

const when = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

export function ServiceRequestCard({ row }: { row: ServiceRequestRow }) {
  const status = STATUS[row.status];

  return (
    <div className="group relative flex flex-col gap-3 rounded-xl border border-line bg-surface p-3.5 transition duration-200 hover:-translate-y-0.5 hover:border-ink/25 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* المرجع يُنسخ ويُقارن خانةً بخانة — لاتينيّ معزول */}
          <Link
            href={`/admin/service-requests/${encodeURIComponent(row.ref)}`}
            dir="ltr"
            className="font-num text-start text-xs font-bold after:absolute after:inset-0 after:content-['']"
          >
            {row.ref}
          </Link>
          <Badge size="sm" tone={status?.tone ?? 'neutral'}>
            {status?.label ?? row.status}
          </Badge>
          {row.overdue ? <Badge size="sm" tone="danger">تجاوز المهلة</Badge> : null}
        </div>

        <span className="truncate text-2xs font-semibold opacity-85">{row.serviceName}</span>

        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-3xs opacity-55">
          <Link
            href={`/admin/users/${encodeURIComponent(row.customerId)}`}
            className="bidi-isolate relative z-10 underline decoration-dotted underline-offset-4 hover:decoration-solid"
          >
            {row.customer}
          </Link>
          {row.city === null ? null : (
            <>
              <span aria-hidden className="opacity-40">
                ·
              </span>
              <span className="bidi-isolate">{row.city}</span>
            </>
          )}
          {row.listingRef === null ? null : (
            <>
              <span aria-hidden className="opacity-40">
                ·
              </span>
              <Link
                href={`/admin/listings/${encodeURIComponent(row.listingRef)}`}
                dir="ltr"
                className="font-num relative z-10 text-start underline decoration-dotted underline-offset-4 hover:decoration-solid"
              >
                {row.listingRef}
              </Link>
            </>
          )}
        </span>

        {/*
          **والمزوّد يُسمّى أو يُقال إنه لم يُسنَد** — والفراغ يُقرأ
          «لا مزوّد لهذه الخدمة» لا «لم يُسنَد بعد».
        */}
        <span className="text-3xs opacity-45">
          {row.providerName === null ? (
            <span className="font-bold text-warn-900">بلا مزوّد — ينتظر الإسناد</span>
          ) : (
            <>
              <span>المزوّد </span>
              {row.providerId === null ? (
                <span className="bidi-isolate">{row.providerName}</span>
              ) : (
                <Link
                  href={`/admin/providers?q=${encodeURIComponent(row.providerName)}`}
                  className="bidi-isolate relative z-10 underline decoration-dotted underline-offset-4 hover:decoration-solid"
                >
                  {row.providerName}
                </Link>
              )}
            </>
          )}
        </span>
      </div>

      <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
        <Money amount={Number(row.amount)} size="sm" showCurrency={false} className="font-bold" />

        {/* موعدُ العميل — متى يأتي، لا متى ينفد صبرُنا على المزوّد */}
        {row.scheduledAt === null ? null : (
          <span className="font-num text-3xs opacity-55">
            <span className="opacity-70">موعد العميل </span>
            {when.format(new Date(row.scheduledAt))}
          </span>
        )}

        <Sla row={row} />
      </div>
    </div>
  );
}

/** مهلةُ المزوّد — والمتأخّر يُسمّى بتأخّره لا بوصفه متأخّرًا. */
function Sla({ row }: { row: ServiceRequestRow }) {
  if (row.overdueHours === null) return null;

  if (row.overdue) {
    return (
      <span className="text-3xs font-bold text-danger">
        <span className="opacity-80">تأخّر </span>
        <Duration hours={row.overdueHours} />
      </span>
    );
  }

  /** المنجَز لا تُعدّ مهلتُه — انقضت بإنجازه. */
  if (row.overdueHours >= 0) return null;

  const left = Math.abs(row.overdueHours);
  return (
    <span className={left <= 6 ? 'text-3xs font-bold text-warn-900' : 'text-3xs opacity-45'}>
      <span className="opacity-80">بقي للمزوّد </span>
      <Duration hours={left} />
    </span>
  );
}
