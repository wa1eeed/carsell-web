'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';

/** أقصر سببٍ مقبول — والخادم يفحصه أيضًا. */
const MIN_REASON = 20;

/**
 * ═══ فتح نزاع — الباب الذي لم يكن موجودًا ═══
 *
 * `openDispute` وأخواتها مبنيّات ومختبَرات، ولا مسار ولا زرّ. وشاشة
 * الطلب **تعرض النزاع إن وُجد** — فيقرأ المشتري عنه ولا يجد إليه سبيلًا.
 *
 * ═══ والزرّ هادئ لا صارخ ═══
 *
 * النزاع آخر الحلول لا أوّلها: زرٌّ أحمر بارز يدفع إليه من كان يكفيه
 * أن يراسل البائع. فهو سطرٌ ثانويّ تحت الخطوة الصحيحة، ونصُّه يقول
 * متى يُفتح — لا «هل من مشكلة؟».
 */
export function DisputePanel({
  orderRef,
  canOpen,
  hasOpen,
}: {
  orderRef: string;
  /** بعد الدفع وقبل الإغلاق، وللمشتري وحده — والخادم يفحص الثلاثة */
  canOpen: boolean;
  hasOpen: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  if (!canOpen || hasOpen) return null;

  const submit = (): void => {
    if (reason.trim().length < MIN_REASON) return;

    start(async () => {
      const response = await fetch(`/api/v1/orders/${orderRef}/disputes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'open', reason: reason.trim() }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر فتح النزاع.');
        return;
      }

      setOpen(false);
      setReason('');
      setToast('فُتح النزاع. المبلغ مجمَّد حتى يُحسم.');
      router.refresh();
    });
  };

  return (
    <>
      <p className="mt-3 text-center text-3xs opacity-45">
        وصلتك المركبة مخالفةً للوصف؟{' '}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-bold underline underline-offset-2 hover:opacity-100"
        >
          افتح نزاعًا
        </button>
      </p>

      <Modal open={open} onClose={() => setOpen(false)} title="فتح نزاع">
        {/*
          الأثر يُقال قبل الفعل: تجميدُ المبلغ يحمي المشتري ويؤخّر
          البائع، ومن لا يعرف ذلك يفتح نزاعًا على ما كان يُحلّ برسالة.
        */}
        <p className="mb-4 rounded-md border border-warn-200 bg-warn-100 p-3 text-2xs leading-loose text-warn-900">
          بفتح النزاع يُجمَّد المبلغ في حساب الضمان حتى يُحسم، ويتوقّف الإفراج
          للبائع. فريقنا يراجعه ويردّ خلال المهلة المعلنة.
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-bold opacity-60">
            ما الذي خالف الوصف؟ اكتب ما رأيته بالتفصيل
          </span>
          <textarea
            rows={5}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="مثال: الإعلان يقول «أصلي بالكامل» والباب الخلفي الأيمن مصبوغ ويظهر فيه تفاوت واضح…"
            className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm leading-loose"
          />
        </label>

        {/*
          العدّ يقول كم بقي لا كم كُتب: «١٢ حرفًا» لا تخبر متى يُقبل.
          والرقم يُكتب لاتينيًّا معزولًا فلا تحكمه حالات الجمع الستّ.
        */}
        <p className="mt-2 text-3xs opacity-45">
          {reason.trim().length >= MIN_REASON ? (
            'يكفي.'
          ) : (
            <>
              اكتب أكثر — بقي{' '}
              <span dir="ltr" className="font-num">
                {MIN_REASON - reason.trim().length}
              </span>
            </>
          )}
        </p>

        <Button
          className="mt-4 w-full"
          disabled={pending || reason.trim().length < MIN_REASON}
          onClick={submit}
        >
          {pending ? 'جارٍ…' : 'افتح النزاع'}
        </Button>
      </Modal>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
