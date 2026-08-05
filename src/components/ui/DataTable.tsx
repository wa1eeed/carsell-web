'use client';

import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';
import { cn } from '@/lib/cn';

export type Column<Row> = {
  id: string;
  header: string;
  /** عمود قابل للفرز */
  sortable?: boolean;
  /** محاذاة للنهاية — للأرقام والمبالغ */
  numeric?: boolean;
  cell: (row: Row) => ReactNode;
};

export type SortState = { columnId: string; direction: 'asc' | 'desc' };

/**
 * جدول الأدمن — A4 وA5 وA12.
 *
 * حشو الخلايا يُضبط هنا مرة واحدة ولا يتكرّر في أي شاشة:
 * الصفوف `13px 22px` والرأس `12px 22px` (DESIGN-DECISIONS · بعد المهمة ١).
 * وهذا ليس توكن حافة — لذلك يُكتب بأنصاف درجات السلّم.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  loading = false,
  sort,
  onSortChange,
  selectable = false,
  selected,
  onSelectedChange,
  empty,
  className,
}: {
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  loading?: boolean;
  sort?: SortState;
  onSortChange?: (next: SortState) => void;
  selectable?: boolean;
  selected?: ReadonlySet<string>;
  onSelectedChange?: (next: Set<string>) => void;
  empty?: { title: string; description?: string; action?: ReactNode };
  className?: string;
}) {
  const allSelected =
    selectable && rows.length > 0 && rows.every((r) => selected?.has(rowKey(r)));

  const toggleAll = (): void => {
    if (onSelectedChange === undefined) return;
    onSelectedChange(allSelected ? new Set() : new Set(rows.map(rowKey)));
  };

  const toggleOne = (key: string): void => {
    if (onSelectedChange === undefined) return;
    const next = new Set(selected ?? []);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedChange(next);
  };

  if (!loading && rows.length === 0 && empty !== undefined) {
    return <EmptyState {...empty} className={className} />;
  }

  return (
    /*
      مقيسٌ من الترميز: نصف قطر ١٤px · حشو ‎12px/20px‎ للترويسة و‎13px/20px‎
      للصفّ · تباعد حروفٍ ‎.06em‎ — **وخلفية مصمتة**.

      والخلفية كانت غائبة عن الجسم: الترويسة وحدها مصمتة والصفوف شفّافة
      على خلفية الصفحة، والترميز يملأ الجدول كلَّه.
    */
    <div className={cn('overflow-x-auto rounded-xl border border-line bg-surface', className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-surface text-start">
            {selectable ? (
              <th className="w-11 px-5 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="size-4 accent-[var(--color-accent)]"
                  aria-label="select all"
                />
              </th>
            ) : null}
            {columns.map((col) => (
              <th
                key={col.id}
                className={cn(
                  'px-5 py-3 text-2xs font-bold tracking-[0.06em] opacity-45 whitespace-nowrap',
                  col.numeric ? 'text-end' : 'text-start',
                )}
              >
                {col.sortable === true && onSortChange !== undefined ? (
                  <button
                    type="button"
                    onClick={() =>
                      onSortChange({
                        columnId: col.id,
                        direction:
                          sort?.columnId === col.id && sort.direction === 'asc'
                            ? 'desc'
                            : 'asc',
                      })
                    }
                    className="inline-flex items-center gap-1 hover:opacity-100"
                  >
                    {col.header}
                    <svg
                      viewBox="0 0 24 24"
                      className={cn(
                        'size-3 transition-transform',
                        sort?.columnId === col.id ? 'opacity-100' : 'opacity-30',
                        sort?.columnId === col.id && sort.direction === 'desc' && 'rotate-180',
                      )}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m6 15 6-6 6 6" />
                    </svg>
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {loading
            ? Array.from({ length: 4 }, (_, i) => (
                <tr key={i} className="border-b border-line-2 last:border-b-0">
                  {selectable ? <td className="px-5 py-3.25" /> : null}
                  {columns.map((col) => (
                    <td key={col.id} className="px-5 py-3.25">
                      <span className="block h-3 w-2/3 animate-pulse rounded-full bg-ink/10" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => {
                const key = rowKey(row);
                return (
                  <tr
                    key={key}
                    className={cn(
                      'border-b border-line-2 last:border-b-0',
                      selected?.has(key) === true && 'bg-accent-100',
                    )}
                  >
                    {selectable ? (
                      <td className="px-5 py-3.25">
                        <input
                          type="checkbox"
                          checked={selected?.has(key) === true}
                          onChange={() => toggleOne(key)}
                          className="size-4 accent-[var(--color-accent)]"
                          aria-label={`select ${key}`}
                        />
                      </td>
                    ) : null}
                    {columns.map((col) => (
                      <td
                        key={col.id}
                        className={cn(
                          'px-5 py-3.25 align-middle',
                          col.numeric ? 'bidi-isolate text-end' : 'text-start',
                        )}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}
