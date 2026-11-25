'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import { Money } from '@/components/ui/Money';
import { Toast } from '@/components/ui/Toast';
import { toLatinDigits } from '@/lib/arabic';
import type { StockRow } from '@/lib/domain/dealer-dashboard';

const KIND_AR: Record<string, string> = {
  PURCHASE: 'سعر الشراء',
  TRANSPORT: 'نقل',
  INSPECTION: 'فحص',
  MAINTENANCE: 'صيانة',
  DETAILING: 'تلميع وتنظيف',
  CUSTOMS: 'جمارك',
  OTHER: 'أخرى',
};

type Book = {
  purchase: string | null;
  addOns: string;
  total: string;
  lines: { id: string; kind: string; amount: string; note: string | null; at: string }[];
};

/**
 * ═══ دفترُ كلفة مركبة ═══
 *
 * **وسعرُ الشراء أوّلًا ثمّ ما بعده.** النافذةُ تطلبه وحده ما دام
 * غيرَ مسجَّل: مركبةٌ لها «نقلٌ ٥٠٠» ولا ثمنَ شراء لا هامشَ لها، وجمعُ
 * المصاريف قبل الثمن يُنتج دفترًا لا يُقرأ منه شيء.
 */
export function CostDrawer({
  row,
  canEdit,
  onClose,
}: {
  row: StockRow;
  canEdit: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [book, setBook] = useState<Book | null>(null);
  const [kind, setKind] = useState<string>('PURCHASE');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    void fetch(`/api/v1/dealer/vehicles/${row.vehicleId}/costs`)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { data?: Book } | null) => {
        if (alive && payload?.data !== undefined) {
          setBook(payload.data);
          setKind(payload.data.purchase === null ? 'PURCHASE' : 'TRANSPORT');
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [row.vehicleId]);

  const submit = (): void => {
    const value = Number(toLatinDigits(amount).replace(/\D/g, ''));
    if (!Number.isFinite(value) || value <= 0) return;

    start(async () => {
      const response = await fetch(`/api/v1/dealer/vehicles/${row.vehicleId}/costs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, amount: value, ...(note.trim() === '' ? {} : { note: note.trim() }) }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { data?: Book; error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذر التسجيل.');
        return;
      }
      if (payload?.data !== undefined) setBook(payload.data);
      setAmount('');
      setNote('');
      setKind('TRANSPORT');
      setToast('سجلت الكلفة.');
      /** **والجدولُ يقرأ من الخادم**، فعمودُ الكلفة لا يبقى على قيمته القديمة. */
      router.refresh();
    });
  };

  return (
    <>
      {toast === null ? null : <Toast title={toast} />}
      <Modal open onClose={onClose} title={`كلفة ${row.title}`}>
        {book === null ? (
          <p className="text-2xs opacity-70">يقرأ الدفتر…</p>
        ) : (
          <>
            <dl className="mb-4 grid grid-cols-3 gap-3 rounded-lg border border-line p-3.5 text-center">
              <div>
                <dt className="text-3xs opacity-70">الشراء</dt>
                <dd className="mt-1 font-bold">
                  {book.purchase === null ? (
                    <span className="text-2xs text-warn-900">لم يسجل</span>
                  ) : (
                    <Money amount={Number(book.purchase)} showCurrency={false} size="sm" />
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-3xs opacity-70">ما بعده</dt>
                <dd className="mt-1 font-bold">
                  <Money amount={Number(book.addOns)} showCurrency={false} size="sm" />
                </dd>
              </div>
              <div>
                <dt className="text-3xs opacity-70">الكلفة</dt>
                <dd className="mt-1 font-bold">
                  <Money amount={Number(book.total)} showCurrency={false} size="sm" />
                </dd>
              </div>
            </dl>

            {book.lines.length === 0 ? null : (
              <ul className="mb-4 flex flex-col gap-1.5 text-2xs">
                {book.lines.map((line) => (
                  <li key={line.id} className="flex items-center justify-between gap-3 border-b border-line-2 pb-1.5 last:border-b-0">
                    <span className="min-w-0">
                      <b className="font-bold">{KIND_AR[line.kind] ?? line.kind}</b>
                      {line.note === null ? null : (
                        <span className="opacity-65"> · {line.note}</span>
                      )}
                    </span>
                    <Money amount={Number(line.amount)} showCurrency={false} size="sm" />
                  </li>
                ))}
              </ul>
            )}

            {!canEdit ? (
              <p className="text-3xs leading-loose opacity-70">
                دورك يقرأ المخزون ولا يعدله.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5 border-t border-line pt-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-2xs font-bold opacity-70">النوع</span>
                  <select
                    value={kind}
                    onChange={(event) => setKind(event.target.value)}
                    className="rounded-lg border border-line bg-surface px-3 py-2.5 text-2xs"
                  >
                    {Object.entries(KIND_AR)
                      .filter(([key]) => key !== 'PURCHASE' || book.purchase === null)
                      .map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-2xs font-bold opacity-70">المبلغ</span>
                  <input
                    dir="ltr"
                    inputMode="numeric"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="font-num rounded-lg border border-line bg-surface px-3 py-2.5 text-base font-bold"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-2xs font-bold opacity-70">ملاحظة (اختيارية)</span>
                  <input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={200}
                    className="rounded-lg border border-line bg-surface px-3 py-2.5 text-2xs"
                  />
                </label>
                <Button className="mt-1.5 w-full" disabled={pending} onClick={submit}>
                  {pending ? 'يسجل…' : 'سجل الكلفة'}
                </Button>
              </div>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
