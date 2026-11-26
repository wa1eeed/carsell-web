'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Picker } from '@/components/ui/Picker';
import { Toast } from '@/components/ui/Toast';
import { DealerExpenseKind } from '@/generated/prisma/enums';
import { DEALER_EXPENSE_KIND_AR } from '@/lib/labels/dealer';

const field =
  'w-full rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-ink';

/**
 * ═══ `D13` — إدخالُ مصروف ═══
 *
 * **وتاريخُ الصرف لا تاريخُ الإدخال**: من يسجّل إيجارَ الشهر الماضي
 * متأخّرًا يسجّله بتاريخه، وإلّا انتقل الرقمُ إلى شهرٍ لا يخصّه فكذب
 * مجموعان معًا.
 */
export function ExpenseForm({
  branches,
  fixedBranch,
  today,
}: {
  branches: readonly { id: string; name: string }[];
  fixedBranch: { id: string; name: string } | null;
  /** اليومُ بتوقيت الرياض — يُحسب في الخادم لا في المتصفّح. */
  today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const [kind, setKind] = useState<string>(DealerExpenseKind.RENT);
  const [amount, setAmount] = useState('');
  const [spentAt, setSpentAt] = useState(today);
  const [branchId, setBranchId] = useState('');
  const [note, setNote] = useState('');

  const submit = (): void => {
    start(async () => {
      const response = await fetch('/api/v1/dealer/expenses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          amount: Number(amount),
          spentAt,
          branchId: fixedBranch?.id ?? (branchId === '' ? null : branchId),
          note: note.trim() === '' ? null : note.trim(),
        }),
      }).catch(() => null);

      const body = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(body?.error?.messageAr ?? 'تعذر تسجيل المصروف.');
        return;
      }
      setAmount('');
      setNote('');
      router.refresh();
    });
  };

  return (
    <section className="mb-6 rounded-lg border border-line bg-surface p-5">
      <h2 className="mb-1 text-sm font-bold">سجل مصروفا</h2>
      <p className="mb-4 text-3xs leading-loose opacity-70">
        ما لا ينسب إلى سيارة بعينها. وكلفة شراء سيارة أو نقلها أو فحصها تسجل من صفحة
        المركبة — فتدخل هامشها.
      </p>

      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-3xs opacity-70">المبلغ بالريال</span>
            <input
              dir="ltr"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="12000"
              className={`${field} font-num bidi-ltr`}
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-3xs opacity-70">تاريخ الصرف</span>
            <input
              dir="ltr"
              type="date"
              max={today}
              value={spentAt}
              onChange={(event) => setSpentAt(event.target.value)}
              className={`${field} font-num`}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-3xs opacity-70">الصنف</span>
          <Picker
            id="expense-kind"
            value={kind}
            onChange={setKind}
            placeholder="اختر الصنف"
            options={Object.values(DealerExpenseKind).map((value) => ({
              value,
              label: DEALER_EXPENSE_KIND_AR[value],
            }))}
          />
        </label>

        {fixedBranch !== null ? (
          <p className="text-2xs opacity-70">
            يسجل على فرع <b>{fixedBranch.name}</b> — وهو فرعك.
          </p>
        ) : branches.length === 0 ? null : (
          <label className="flex flex-col gap-1">
            <span className="text-3xs opacity-70">الفرع</span>
            <Picker
              id="expense-branch"
              value={branchId}
              onChange={setBranchId}
              placeholder="على المعرض كله"
              options={branches.map((row) => ({ value: row.id, label: row.name }))}
            />
            <span className="text-3xs opacity-65">
              واتركه على المعرض كله لما لا يخص فرعا — فنتيجة الفرع تحتاج نصيبه لا كل شيء.
            </span>
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-3xs opacity-70">ملاحظة — اختيارية</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="إيجار الربع الأول"
            className={field}
          />
        </label>

        <div>
          <Button disabled={pending || amount.trim() === ''} onClick={submit}>
            {pending ? 'يسجل…' : 'سجل'}
          </Button>
        </div>
      </div>

      {toast === null ? null : <Toast title={toast} />}
    </section>
  );
}
