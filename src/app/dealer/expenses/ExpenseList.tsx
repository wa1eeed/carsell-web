'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { DEALER_EXPENSE_KIND_AR } from '@/lib/labels/dealer';
import type { ExpenseRow } from '@/lib/domain/dealer-expenses';

/**
 * ═══ وجدولُ ما أُدخل — ويُحذف ما أُدخل خطأً ═══
 *
 * **ودفترٌ لا يُصحَّح يُهجَر**: من أدخل رقمًا خطأً ولا يستطيع حذفه
 * يتوقّف عن الإدخال كلِّه.
 */
export function ExpenseList({ rows }: { rows: readonly ExpenseRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (rows.length === 0) {
    return (
      <EmptyState
        title="لا مصروف مسجل في هذا الشهر"
        description="سجل الإيجار والرواتب والتسويق — ومنها تعرف نتيجة معرضك لا مبيعاته وحدها."
      />
    );
  }

  const remove = (id: string): void => {
    start(async () => {
      await fetch(`/api/v1/dealer/expenses?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }).catch(() => null);
      router.refresh();
    });
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[46rem] border-collapse text-start">
        <thead>
          <tr className="border-b border-line bg-surface text-3xs opacity-70">
            <th className="p-3 text-start font-bold">التاريخ</th>
            <th className="p-3 text-start font-bold">الصنف</th>
            <th className="p-3 text-start font-bold">الفرع</th>
            <th className="p-3 text-start font-bold">الملاحظة</th>
            <th className="p-3 text-end font-bold">المبلغ</th>
            <th className="p-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-line last:border-0">
              <td className="font-num p-3 text-2xs" dir="ltr">
                {row.spentAt.slice(0, 10)}
              </td>
              <td className="p-3 text-2xs font-bold">{DEALER_EXPENSE_KIND_AR[row.kind]}</td>
              <td className="p-3 text-2xs opacity-75">{row.branchName ?? 'المعرض كله'}</td>
              <td className="p-3 text-2xs opacity-75">{row.note ?? '—'}</td>
              <td className="p-3 text-end">
                <Money amount={row.amount} />
              </td>
              <td className="p-3 text-end">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(row.id)}
                  className="rounded-btn border border-line px-2.5 py-1 text-3xs font-bold hover:border-danger hover:text-danger"
                >
                  احذف
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
