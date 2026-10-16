'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { MIN_FAIL_REASON } from '@/lib/domain/provider-rules';
import { PROVIDER_STEP_LABEL, PROVIDER_STEP_NOTE } from '@/lib/labels/provider';

/**
 * ═══ القسمُ المتغيّر — أزرارُ معالجة الطلب ═══
 *
 * قرار المالك (٢٠٢٦-١٠-١٤): «قسمٌ أسفله **متغيّر حسب نوعية الطلب**
 * وفيه أزرار الأكشن … وإن استطعنا توحيدها بشكل ذكي يكون أفضل».
 *
 * **والتوحيد في الصدفة والاختلاف في التعريف**: الأزرار تأتي من
 * `stepsFor(type, status)` — فإضافةُ «نقل الملكية» سطرٌ في التعريف لا
 * شاشةٌ ثانية. ولا يُعرض زرٌّ لا تقبله الحال: زرٌّ يردّ ٤٠٩ بعد الضغط
 * أسوأ من غيابه.
 */
export function StepActions({
  ref_,
  steps,
}: {
  ref_: string;
  steps: readonly { key: string; form: 'INSPECTION' | null }[];
}) {
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [failing, setFailing] = useState(false);
  const [reason, setReason] = useState('');

  const send = (step: string, why: string | null): void => {
    start(async () => {
      const response = await fetch(
        `/api/v1/provider/requests/${encodeURIComponent(ref_)}/step`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ step, reason: why }),
        },
      ).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر التنفيذ.');
        return;
      }
      /** تحميلٌ كامل — الحال تُقرأ في الخادم، فيُرى ما وقع لا ما قبله */
      window.location.assign(`/provider/${encodeURIComponent(ref_)}`);
    });
  };

  if (steps.length === 0) {
    return (
      <p className="rounded-xl border border-line p-5 text-2xs leading-loose opacity-70">
        لا إجراء مطلوبٌ منك على هذا الطلب الآن.
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 rounded-xl border-2 border-ink p-5">
        <h2 className="text-sm font-bold">ما تستطيع فعله الآن</h2>
        {steps.map((step) => (
          <div key={step.key} className="flex flex-wrap items-center gap-3">
            <Button
              variant={step.key === 'fail' ? 'outline' : 'primary'}
              disabled={pending}
              onClick={() => {
                if (step.key === 'fail') {
                  setFailing(true);
                  return;
                }
                /**
                 * **ونموذج الفحص بابُه هنا.** حقولُه يزوّدنا بها المالك
                 * بعد انتهاء المهام الحالية، فلا تُخترع حقولٌ تُستبدل —
                 * والزرّ يُنهي الطلب اليوم بلا نموذج.
                 */
                send(step.key, null);
              }}
            >
              {PROVIDER_STEP_LABEL[step.key] ?? step.key}
            </Button>
            <span className="min-w-0 flex-1 text-3xs leading-loose opacity-70">
              {PROVIDER_STEP_NOTE[step.key] ?? ''}
            </span>
          </div>
        ))}
      </div>

      <Modal
        open={failing}
        onClose={() => setFailing(false)}
        title="تعذّر تنفيذ الطلب"
        footer={
          <>
            <span className="flex-1" />
            <Button variant="ghost" onClick={() => setFailing(false)}>
              تراجع
            </Button>
            <Button
              variant="danger"
              disabled={pending || reason.trim().length < MIN_FAIL_REASON}
              onClick={() => send('fail', reason.trim())}
            >
              أكّد التعذّر
            </Button>
          </>
        }
      >
        {/* **و«تعذّر» بلا سببٍ لا يُصلحها أحد** — يقرؤها فريق المنصّة */}
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-bold opacity-70">ما الذي منع التنفيذ؟</span>
          <textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="مثال: حضرتُ الموعد ولم أجد المركبة، ولم يردّ صاحبها."
            className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm leading-loose"
          />
        </label>
      </Modal>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
