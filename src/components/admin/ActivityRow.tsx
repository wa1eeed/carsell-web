import Link from 'next/link';
import { Money } from '@/components/ui/Money';
import type { ActivityEvent } from '@/lib/domain/admin-activity';
import { ACTIVITY_KIND_LABEL, activityLabel } from '@/lib/labels/activity';
import { cn } from '@/lib/cn';

/**
 * سطرٌ في المجرى: نقطةٌ بنبرتها · ما وقع · على أيّ مرجع · بيد من ·
 * بكم · ومتى.
 *
 * **والمرجع لاتينيٌّ معزول** — يُنسخ ويُقارن خانةً بخانة، فلو ورث
 * اتّجاه السطر انقلب ترتيبُه في العين.
 */
export function ActivityRow({ event, at }: { event: ActivityEvent; at: string }) {
  const body = (
    <span className="flex items-start gap-3 py-3.5">
      <span
        aria-hidden
        className={cn(
          'mt-1.5 size-2 shrink-0 rounded-full',
          event.tone === 'danger'
            ? 'bg-danger'
            : event.tone === 'warn'
              ? 'bg-warn-400'
              : event.tone === 'accent'
                ? 'bg-accent'
                : 'bg-ink/25',
        )}
      />

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-2xs font-bold">{activityLabel(event.key)}</span>
          {event.subject === null ? null : (
            <span dir="ltr" className="font-num text-3xs opacity-55">
              {event.subject}
            </span>
          )}
        </span>

        <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-3xs opacity-45">
          <span className="rounded-sm bg-ink/6 px-1.5 py-px">
            {ACTIVITY_KIND_LABEL[event.kind]}
          </span>
          {/*
            **والنظام يُسمّى، ومجهولُ الاسم لا يُسمّى به.** كان كلُّ
            فاعلٍ فارغ يُكتب «بالنظام» — فقرأ المشغّل «حسابٌ جديد …
            بالنظام» عن إنسانٍ سجّل بنفسه بلا اسمٍ بعد.
          */}
          {event.bySystem ? <span>بالنظام</span> : null}
          {event.actor === null ? null : (
            <span className="bidi-isolate truncate">{event.actor}</span>
          )}
        </span>
      </span>

      {event.amount === null ? null : (
        <Money amount={Number(event.amount)} size="sm" showCurrency={false} className="shrink-0" />
      )}

      <span className="shrink-0 text-3xs opacity-40">{at}</span>
    </span>
  );

  /** **ولا رابطَ بلا وجهة** — وسطرٌ ينقر إلى ٤٠٤ أسوأ من سطرٍ لا يُنقر. */
  if (event.href === null) {
    return (
      <li className="px-1">
        <span className="block">{body}</span>
      </li>
    );
  }

  return (
    <li className="px-1">
      <Link href={event.href} className="-mx-2 block rounded-lg px-2 transition-colors hover:bg-surface">
        {body}
      </Link>
    </li>
  );
}
