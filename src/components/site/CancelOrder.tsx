'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';

/**
 * ═══ إلغاء الطلب — وكان لا باب له ═══
 *
 * `OrderStatus.CANCELLED` في المخطّط، واللوحة تعدّه، و**شروطُنا
 * المنشورة تَعِد به** — ولا شيء في المنتج يكتبه. فمن دفع ثم احتاج
 * الإلغاء كان يفتح نزاعًا على ما ليس خلافًا، أو يتصل ويُطلب منه
 * الانتظار.
 *
 * ═══ والسبب يُكتب قبل أن يُضغط ═══
 *
 * لا بعده في شاشةٍ ثانية: **من يُسأل بعد الإلغاء يكتب أيّ شيء**، ومن
 * يُسأل قبله يفكّر — والسبب أوّل ما يُقرأ في نزاعٍ لاحق.
 */
export function CancelOrder({
  orderRef,
  /** الطلب الذي دُفع يُردّ ماله — ونصُّ الزرّ يقول ذلك قبل الضغط. */
  paid,
}: {
  orderRef: string;
  paid: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const cancel = (): void => {
    start(async () => {
      const response = await fetch(`/api/v1/orders/${orderRef}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذر إلغاء الطلب.');
        return;
      }

      setOpen(false);
      setToast(paid ? 'ألغي الطلب، ويرد المبلغ إلى وسيلة دفعك.' : 'ألغي الطلب.');
      /** الفعل الناجح يُتبعه تحديثُ المصدر الذي تقرأ منه الشاشة. */
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-3xs opacity-70 underline-offset-4 hover:underline hover:opacity-100"
      >
        ألغ الطلب
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="إلغاء الطلب">
        <p className="mb-4 text-xs leading-loose">
          {paid
            ? 'يلغى الحجز لدى بوابة الدفع ويعود المبلغ إلى وسيلة دفعك، ويعود الإعلان معروضا للآخرين.'
            : 'لم يدفع شيء بعد — ويعود الإعلان معروضا للآخرين.'}
        </p>

        <label className="mb-4 flex flex-col gap-1.5">
          <span className="text-3xs font-bold opacity-70">سبب الإلغاء</span>
          <textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="غيرت رأيي · تأخر البائع · وجدت مركبة أنسب…"
            className="rounded-md border border-line bg-bg px-3 py-2 text-2xs leading-loose"
          />
          <span className="text-3xs opacity-65">
            يقرأ في أي نزاع لاحق — واكتب ما يكفي ليفهمه غيرك.
          </span>
        </label>

        <div className="flex gap-2.5">
          <Button
            className="flex-1"
            disabled={pending || reason.trim().length < 3}
            onClick={cancel}
          >
            {pending ? 'جار…' : 'نعم، ألغ'}
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
            تراجع
          </Button>
        </div>
      </Modal>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
