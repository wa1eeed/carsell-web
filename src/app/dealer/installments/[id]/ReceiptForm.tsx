'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Toast } from '@/components/ui/Toast';
import { INSTALLMENT_METHOD_AR } from '@/lib/labels/installments';
import { InstallmentMethod } from '@/generated/prisma/enums';
import type { PlanDetail } from '@/lib/domain/installments';

const field =
  'w-full rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-ink';

/**
 * ═══ سندُ قبضٍ على قسطٍ بعينه ═══
 *
 * **والقسطُ يُختار لا يُستنتَج.** مبلغٌ يُسجَّل بلا قسطٍ يحمله يجعل
 * «المدفوع والباقي» رقمين لا يُعرف من أين جاءا — فلا يستطيع المعرضُ أن
 * يقول لعميله أيُّ شهرٍ بقي عليه.
 *
 * **والافتراضيُّ أقدمُ غيرِ مسدَّد** — وهو ما يُسدَّد في تسعةٍ من عشر،
 * ومن أراد غيره بدّله.
 */
export function ReceiptForm({ planId, dues }: { planId: string; dues: PlanDetail['dues'] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const open = dues.filter((due) => !due.settled);
  const oldest = open[0];

  const [dueId, setDueId] = useState(oldest?.id ?? '');
  const [amount, setAmount] = useState(
    oldest === undefined ? '' : String(Number(oldest.amount) - Number(oldest.paidAmount)),
  );
  const [method, setMethod] = useState<string>(InstallmentMethod.CASH);
  const [note, setNote] = useState('');

  if (open.length === 0) {
    return (
      <p className="rounded-lg border border-accent bg-accent-100/40 px-4 py-3 text-2xs leading-loose">
        سدد العقد كاملا — ولا قسط متبقي.
      </p>
    );
  }

  const picked = dues.find((due) => due.id === dueId);
  const outstanding =
    picked === undefined ? 0 : Number(picked.amount) - Number(picked.paidAmount);

  const submit = (): void => {
    start(async () => {
      const response = await fetch('/api/v1/dealer/installments/receipts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          planId,
          dueId,
          amount: Number(amount),
          method,
          note: note.trim() === '' ? null : note.trim(),
        }),
      }).catch(() => null);

      const body = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(body?.error?.messageAr ?? 'تعذر تسجيل السند.');
        return;
      }
      setNote('');
      router.refresh();
    });
  };

  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="mb-1 text-sm font-bold">سجل قبضا</h2>
      <p className="mb-3.5 text-3xs leading-loose opacity-70">
        على قسط بعينه — فيعرف عميلك أي شهر سدد وأيه بقي.
      </p>

      <div className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1">
          <span className="text-3xs opacity-70">القسط</span>
          <select
            value={dueId}
            onChange={(event) => {
              const next = event.target.value;
              setDueId(next);
              const row = dues.find((due) => due.id === next);
              setAmount(row === undefined ? '' : String(Number(row.amount) - Number(row.paidAmount)));
            }}
            className={field}
          >
            {open.map((due) => (
              <option key={due.id} value={due.id}>
                {/* check-9-ok: عنصر option لا يحمل مكونا — نص فقط، والأرقام لاتينية بقرار العرض */}
                {`القسط ${String(due.sequence)} — ${due.dueOn.slice(0, 10)}`}
              </option>
            ))}
          </select>
          {picked === undefined ? null : (
            <span className="text-3xs opacity-65">
              الباقي عليه <Money amount={outstanding.toFixed(2)} />
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-3xs opacity-70">المبلغ المقبوض</span>
          <input
            dir="ltr"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={`${field} font-num bidi-ltr`}
          />
          {/*
            **ولا يُقبل ما يتجاوز القسط** — ويُقال قبل الضغط لا بعده:
            الزائدُ يُخصَّص على القسط التالي بسندٍ ثانٍ.
          */}
          {Number(amount) > outstanding ? (
            <span className="text-3xs text-danger">
              أكثر من الباقي على هذا القسط — سجل الزائد على القسط التالي بسند آخر.
            </span>
          ) : null}
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-3xs opacity-70">طريقة القبض</span>
          <span className="flex flex-wrap gap-1.5">
            {Object.values(InstallmentMethod).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMethod(option)}
                className={
                  option === method
                    ? 'rounded-md border border-ink bg-ink px-3 py-1.5 text-2xs font-bold text-bg'
                    : 'rounded-md border border-line px-3 py-1.5 text-2xs opacity-75 hover:opacity-100'
                }
              >
                {INSTALLMENT_METHOD_AR[option]}
              </button>
            ))}
          </span>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-3xs opacity-70">ملاحظة — اختيارية</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} className={field} />
        </label>

        <div>
          <Button
            disabled={pending || !(Number(amount) > 0) || Number(amount) > outstanding}
            onClick={submit}
          >
            {pending ? 'يسجل…' : 'سجل القبض'}
          </Button>
        </div>
      </div>

      {toast === null ? null : <Toast title={toast} />}
    </section>
  );
}
