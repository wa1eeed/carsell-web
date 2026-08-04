'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';

/**
 * ═══ تقدّم الطلب — الخطوة التي لم يكن لها مسار أصلًا ═══
 *
 * `advanceStage` مبنيّة ومختبَرة، و`/v1/orders` يقبل الإنشاء وحده —
 * فالطلب يصل إلى «دفع»، ويُحجز المال، ثم **لا شيء في المنتج كلّه
 * يحرّكه**. لا نقل ملكية ولا إتمام ولا تسوية ولا مستندات.
 *
 * فالمنصّة كانت تأخذ المال ولا تُسلّم — وهو أخطر ما بقي فيها.
 *
 * ═══ ولكلٍّ خطوته ═══
 *
 * **البائع يبدأ النقل** (هو من يذهب بالاستمارة)، **والمشتري يؤكّد
 * الإتمام** (هو من استلم). ولو أكّد البائع إتمامه لبدأت نافذة الاسترجاع
 * ومشى المال نحوه بإقراره هو.
 */
export function StagePanel({
  orderRef,
  stage,
  viewerIsBuyer,
  frozen,
}: {
  orderRef: string;
  stage: string;
  viewerIsBuyer: boolean;
  /** متنازَعٌ عليه ⇒ مجمَّد، ولا تُعرض خطوة تُرفض */
  frozen: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const move = (to: 'DONE'): void => {
    start(async () => {
      const response = await fetch(`/api/v1/orders/${orderRef}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر تحديث المرحلة.');
        return;
      }

      setConfirming(false);
      setToast('أُكّد الاستلام.');
      router.refresh();
    });
  };

  if (frozen) return null;

  /**
   * **ولا زرّ للبائع في مرحلة الدفع.**
   *
   * كتبتُ له «بدأنا إجراء النقل» ثم قِستُ: `applyState` تنقل الطلب من
   * `PAYMENT` إلى `TRANSFER` فور تأكيد الحجز — فالمرحلة لا تجلس عند
   * الدفع والمال محجوز أبدًا، والزرّ لا يبلغه أحد. وحذفُه أصدق من
   * شحنِ زرٍّ ميّت، وهو الصنف الذي أُصلح في غيره أربع مرّات.
   */

  /** المشتري في مرحلة النقل: هو من يؤكّد أنه استلم. */
  if (stage === 'TRANSFER' && viewerIsBuyer) {
    return (
      <>
        <section className="rounded-lg border-2 border-ink p-5">
          <h2 className="mb-1.5 text-sm font-bold">أكّد استلام المركبة</h2>
          <p className="mb-4 text-2xs leading-loose opacity-65">
            لا تؤكّد قبل أن تنتقل الملكية باسمك فعلًا في المرور، وتستلم المركبة.
            وبعد التأكيد تبدأ نافذة الاسترجاع، ثم يُفرَج عن المبلغ للبائع.
          </p>
          <Button className="w-full" disabled={pending} onClick={() => setConfirming(true)}>
            أكّدتُ الاستلام ونقل الملكية
          </Button>
        </section>

        {/*
          تأكيدٌ ثانٍ لأنه **لا رجعة فيه**: بعده يسير المال نحو البائع.
          والخطوة التي لا رجعة فيها تُسأل مرّة قبل وقوعها لا بعده.
        */}
        <Modal
          open={confirming}
          onClose={() => setConfirming(false)}
          title="تأكيد الاستلام"
        >
          <p className="mb-4 text-xs leading-loose">
            بتأكيدك تُقرّ أن الملكية انتقلت باسمك وأنك استلمت المركبة. تبدأ بعدها
            نافذة الاسترجاع، وبانقضائها يُفرَج عن المبلغ للبائع.
          </p>
          <p className="mb-4 rounded-md border border-warn-200 bg-warn-100 p-3 text-2xs leading-loose text-warn-900">
            إن كان في المركبة عيبٌ جوهريّ لم يُذكر، افتح نزاعًا قبل انقضاء نافذة
            الاسترجاع — لا بعدها.
          </p>
          <div className="flex gap-2.5">
            <Button className="flex-1" disabled={pending} onClick={() => move('DONE')}>
              {pending ? 'جارٍ…' : 'نعم، أكّد'}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setConfirming(false)}>
              تراجع
            </Button>
          </div>
        </Modal>

        {toast === null ? null : <Toast title={toast} />}
      </>
    );
  }

  /**
   * **والانتظار يُقال ولا يُترك فراغًا.** من ينتظر الطرف الآخر يجب أن
   * يعرف أنه ينتظر، وممّن — وإلّا ظنّ الشاشة معطّلة.
   */
  const waiting =
    stage === 'PAYMENT' && viewerIsBuyer
      ? 'بعد أن يُحجز مبلغك ينتقل الطلب إلى نقل الملكية.'
      : stage === 'TRANSFER' && !viewerIsBuyer
        ? 'ينتظر تأكيد المشتري استلام المركبة ونقل الملكية.'
        : null;

  if (waiting === null) return null;

  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <p className="text-2xs leading-loose opacity-65">{waiting}</p>
    </section>
  );
}
