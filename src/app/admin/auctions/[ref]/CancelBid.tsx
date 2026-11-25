'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import { Money } from '@/components/ui/Money';
import { Toast } from '@/components/ui/Toast';

/**
 * ═══ إلغاء مزايدة — والسببُ يُكتب ولا يُختار ═══
 *
 * قائمةٌ منسدلة بأسبابٍ جاهزة تُغري بأقربها، والسببُ يُعرض **للمزايد**
 * في جرسه وفي سجلّ المزاد العامّ: «ملغاة · إخلال بالشروط». فمن يُلغي
 * يكتب ما سيقرؤه صاحبُ المزايدة.
 *
 * **والنافذة تقول ما يقع قبل أن يقع**: المبلغ يخرج من الحساب فيعود
 * السعر إلى ما دونه، والعربون لا يُمَسّ. وزرٌّ اسمُه «ألغِ» وحدَه
 * يجعل الضغطة قرارًا في الظلام.
 */
export function CancelBid({
  bidId,
  amount,
  bidderName,
}: {
  bidId: string;
  amount: string;
  bidderName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/bids/${bidId}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذر الإلغاء.');
        return;
      }

      setOpen(false);
      setReason('');
      setToast('ألغيت المزايدة، وأخطر صاحبها.');
      router.refresh();
    });
  };

  return (
    <>
      {toast === null ? null : <Toast title={toast} />}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-btn border border-danger/50 px-2.5 py-1 text-3xs font-bold text-danger hover:bg-danger/6"
      >
        ألغ
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="إلغاء مزايدة">
        <p className="mb-3.5 flex flex-wrap items-center gap-1.5 text-2xs leading-loose opacity-75">
          مزايدة <b className="bidi-isolate">{bidderName}</b> بمبلغ{' '}
          <Money amount={Number(amount)} /> تخرج من المزاد، فيعود السعر إلى المزايدة
          التي تحتها. والعربون لا يمس — وله أن يزايد من جديد.
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-bold opacity-70">
            السبب — يقرؤه المزايد ويظهر في سجل المزاد
          </span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="إخلال بشروط المزاد"
            maxLength={200}
            className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-2xs"
          />
        </label>
        <Button
          variant="dangerOutline"
          className="mt-4 w-full"
          disabled={pending || reason.trim().length < 6}
          onClick={submit}
        >
          {pending ? 'يلغي…' : 'ألغ المزايدة'}
        </Button>
      </Modal>
    </>
  );
}
