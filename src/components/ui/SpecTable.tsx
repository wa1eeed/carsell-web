import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type SpecEntry = { label: string; value: ReactNode };

/**
 * جدول المواصفات — عمودان، والفصل **بالخطوط لا بالظلال**.
 *
 * آخر صفّ بلا خطّ سفلي وآخر عمود بلا خطّ جانبي، فالإطار الخارجي وحده
 * يحدّ الجدول ولا يتضاعف عند الحواف.
 *
 * القيَم تُمرَّر عقدًا لا سلاسل: الرقم يأتي `<ArabicNumber>` والكمّية
 * `<Quantity>`، فلا رقم يُلصق في نصّ (فحص ٩).
 */
export function SpecTable({
  entries,
  columns = 2,
  className,
}: {
  entries: readonly SpecEntry[];
  columns?: 1 | 2;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        'grid overflow-hidden rounded-xl border border-line',
        columns === 2 ? 'sm:grid-cols-2' : 'grid-cols-1',
        className,
      )}
    >
      {entries.map((entry, i) => {
        const lastRow = i >= entries.length - (entries.length % columns === 0 ? columns : 1);
        const startColumn = columns === 2 && i % 2 === 0;
        return (
          <div
            key={entry.label}
            className={cn(
              'flex items-center justify-between gap-4 px-5 py-3.5',
              !lastRow && 'border-b border-line-2',
              startColumn && 'sm:border-e sm:border-e-line-2',
            )}
          >
            <dt className="text-sm opacity-60">{entry.label}</dt>
            <dd className="text-sm font-bold">{entry.value}</dd>
          </div>
        );
      })}
    </dl>
  );
}
