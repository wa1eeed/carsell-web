'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Counted } from '@/components/ui/Counted';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Sheet';
import { Money } from '@/components/ui/Money';
import { Toast } from '@/components/ui/Toast';
import { toLatinDigits } from '@/lib/arabic';
import type { DeskOffer } from '@/lib/domain/dealer-desk';

/**
 * **والمبلغُ وحده لا يُقرَّر عليه.** الصندوق يعرض الرقم وفي عمودٍ آخر
 * السعرَ المطلوب، والبائع يطرح في رأسه — من أرضيّةٍ لا يراها. فموضعُ
 * العرض من الأرضيّة يُقال بجواره، **والحالةُ الخالية تُقال صراحةً**:
 * السكوتُ عن أرضيّةٍ غير موضوعة يُقرأ «العرضُ دونها».
 */
export function OffersTable({ rows }: { rows: readonly DeskOffer[] }) {
  const router = useRouter();
  const [counter, setCounter] = useState<DeskOffer | null>(null);
  const [amount, setAmount] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  /**
   * **والعقدُ يُقرأ من المسار لا يُتخيَّل.** كتبتُ أوّلًا
   * `POST /offers/{id}/accept` — ولا وجودَ له: المسارُ القائم
   * `PATCH /offers/{id}` بـ`action`. ومسارٌ متخيَّل يردّ ٤٠٥ ولا
   * يقول لماذا.
   */
  const act = (offerId: string, action: 'accept' | 'decline' | 'counter', amount?: number): void => {
    start(async () => {
      const response = await fetch(`/api/v1/offers/${offerId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(amount === undefined ? { action } : { action, amount }),
      }).catch(() => null);
      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;
      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذر التنفيذ.');
        return;
      }
      setCounter(null);
      setAmount('');
      setToast(
        action === 'accept'
          ? 'قبلت العرض — وأنشئ الطلب.'
          : action === 'decline'
            ? 'رفضت العرض.'
            : 'أرسلت عرضك المقابل.',
      );
      router.refresh();
    });
  };

  if (rows.length === 0) {
    return <EmptyState title="لا عروض نشطة" description="يصلك العرض هنا فور وصوله، وتجيبه من مكانك." />;
  }

  return (
    <>
      {toast === null ? null : <Toast title={toast} />}

      <div className="no-scrollbar overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-3xl border-collapse text-2xs">
          <thead>
            <tr className="border-b border-line bg-surface text-3xs opacity-70">
              <th className="p-3 text-start font-bold">المشتري</th>
              <th className="p-3 text-end font-bold">العرض</th>
              <th className="p-3 text-start font-bold">المركبة</th>
              <th className="p-3 text-start font-bold">منذ</th>
              <th className="p-3 text-start font-bold">الحالة</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line-2 last:border-b-0">
                <td className="p-3 font-bold">{row.buyerName ?? '—'}</td>
                <td className="p-3 text-end">
                  <Money amount={Number(row.amount)} showCurrency={false} size="sm" />
                  {/*
                    **وموضعُه من أرضيّتك يُقال.** بائعٌ وضع أرضيّةً
                    عاليةً يفاوض شهورًا بلا عرضٍ ولا يعرف السبب.
                  */}
                  <span className="mt-0.5 block text-3xs">
                    {row.aboveFloor === null ? (
                      <span className="opacity-60">لا حد أدنى موضوع</span>
                    ) : row.aboveFloor ? (
                      <span className="text-accent-700">فوق حدك الأدنى</span>
                    ) : (
                      <span className="text-warn-900">دون حدك الأدنى</span>
                    )}
                  </span>
                </td>
                <td className="p-3">
                  {row.vehicle} <ArabicNumber value={row.year} grouped={false} />
                </td>
                <td className="p-3">
                  <Counted message="agoHours" count={row.hours} />
                </td>
                <td className="p-3">
                  {row.top ? (
                    <Badge tone="accent" size="sm">الأعلى</Badge>
                  ) : (
                    <Badge tone="neutral" size="sm">
                      {row.status === 'COUNTERED' ? 'رد المشتري' : 'بانتظار ردك'}
                    </Badge>
                  )}
                </td>
                <td className="p-3">
                  <span className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => act(row.id, 'accept')}
                      className="rounded-btn border border-accent-700/50 px-2.5 py-1 text-3xs font-bold text-accent-700 hover:bg-accent-100 disabled:opacity-50"
                    >
                      اقبل
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setCounter(row)}
                      className="rounded-btn border border-line px-2.5 py-1 text-3xs font-bold hover:border-ink disabled:opacity-50"
                    >
                      مقابل
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => act(row.id, 'decline')}
                      className="rounded-btn border border-danger/50 px-2.5 py-1 text-3xs font-bold text-danger hover:bg-danger/6 disabled:opacity-50"
                    >
                      ارفض
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={counter !== null} onClose={() => setCounter(null)} title="عرض مقابل">
        {counter === null ? null : (
          <>
            <p className="mb-3.5 text-2xs leading-loose opacity-75">
              عرضه <Money amount={Number(counter.amount)} showCurrency={false} size="sm" /> على{' '}
              {counter.vehicle}. واكتب مقابلك — ويصله فورا، وله أن يقبله أو يرد.
            </p>
            <input
              dir="ltr"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="font-num w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-lg font-bold"
            />
            <Button
              className="mt-4 w-full"
              disabled={pending || amount.trim() === ''}
              onClick={() =>
                act(counter.id, 'counter', Number(toLatinDigits(amount).replace(/\D/g, '')))
              }
            >
              {pending ? 'يرسل…' : 'أرسل المقابل'}
            </Button>
          </>
        )}
      </Modal>
    </>
  );
}
