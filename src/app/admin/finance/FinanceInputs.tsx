'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { toLatinDigits } from '@/lib/arabic';
import type { FinanceInputRow } from '@/lib/domain/admin-finance';
import { FINANCE_INPUT_LABEL } from '@/lib/labels/admin';

/**
 * المدخلات اليدوية — ما لا تملكه المنصّة.
 *
 * الرواتب ومصروف التسويق والرصيد البنكي لا تعرفها قاعدة البيانات، فهي
 * تُدخَل بشهرها ومُدخِلها. وما يُشتقّ منها — CAC والمدرج — **يُحسب ولا
 * يُدخَل**: رقمٌ يُكتب باليد يبقى صحيحًا حتى يتغيّر ما تحته، ثم يكذب
 * بلا أن يُلاحَظ.
 */
export function FinanceInputs({
  month,
  monthLabel,
  rows,
  canEdit,
}: {
  month: string;
  monthLabel: string;
  rows: readonly FinanceInputRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const save = (key: string): void => {
    const raw = draft[key];
    if (raw === undefined) return;

    start(async () => {
      const response = await fetch('/api/v1/admin/finance/inputs', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ month, key, value: Number(raw || '0') }),
      });
      setToast(response.ok ? 'حُفظ.' : 'تعذّر الحفظ.');
      if (response.ok) {
        setDraft((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        router.refresh();
      }
    });
  };

  return (
    <section className="mt-4 rounded-lg border border-line bg-surface p-5.5">
      <div className="mb-1 flex flex-wrap items-baseline gap-3">
        <h2 className="text-sm font-bold">مدخلات {monthLabel}</h2>
      </div>
      <p className="mb-4 text-3xs opacity-50">
        ما لا تعرفه المنصّة عن نفسها. وCAC والمدرج يُحسبان من هذه — لا يُدخَلان.
      </p>

      <div className="flex flex-col divide-y divide-line border-t border-line">
        {rows.map((row) => {
          const editing = draft[row.key];
          return (
            <div key={row.key} className="flex flex-wrap items-center gap-3 py-3">
              <span className="min-w-32 flex-1 text-xs font-bold">
                {FINANCE_INPUT_LABEL[row.key] ?? row.key}
              </span>

              {!canEdit ? (
                <span className="font-num text-sm">{row.value}</span>
              ) : (
                <input
                  // مبلغ يُقارَن بكشف بنكيّ خانةً بخانة
                  dir="ltr"
                  inputMode="numeric"
                  value={editing ?? row.value}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [row.key]: toLatinDigits(event.target.value).replace(/[^\d.]/g, ''),
                    }))
                  }
                  className="font-num w-36 rounded-sm border border-line bg-bg px-3 py-1.5 text-end text-sm outline-none focus:border-ink/40"
                />
              )}

              <span className="min-w-40 text-3xs opacity-45">
                {row.updatedAt === null ? (
                  // لم يُدخَل قطّ — لا «أُدخل صفرًا»
                  'لم يُدخَل بعد'
                ) : (
                  <>أدخله {row.enteredBy ?? '—'}</>
                )}
              </span>

              {!canEdit ? null : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || editing === undefined || editing === row.value}
                  onClick={() => save(row.key)}
                >
                  حفظ
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {toast === null ? null : <Toast title={toast} />}
    </section>
  );
}
