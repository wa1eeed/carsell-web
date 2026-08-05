'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Countdown } from '@/components/ui/Countdown';
import { Modal } from '@/components/ui/Sheet';
import { Money } from '@/components/ui/Money';
import { Toast } from '@/components/ui/Toast';
import type { SellerDecision } from '@/lib/domain/auctions';

/**
 * ═══ قرار البائع بعد إغلاقٍ باحتياطي غير مبلوغ ═══
 *
 * **ولم يكن له باب.** `resolveSellerDecision` مبنيّة منذ المهمة ١٩
 * وتُنشئ الطلب وتخصم عربون الفائز، ولا ينادي فرعَ القبول شيءٌ في
 * المنتج: الوحيد الذي يناديها وظيفةٌ دورية تمرّر `false`.
 *
 * فكان كل مزادٍ لم يبلغ احتياطيَه ينتهي **بالردّ حتمًا** مهما أراد
 * البائع، والمهلة تُعرض له في لوحة الأدمن وحدها — ساعاتٌ تُعدّ لقرارٍ
 * لا يستطيع اتّخاذه.
 *
 * ═══ والمهلة تُعرض قبل الضغط لا بعده ═══
 *
 * وبانقضائها يُرَدّ العربون ويسقط الحقّ، فالعدّاد هنا ليس زينة: هو
 * الفرق بين بيعٍ يقع وبيعٍ لا يقع.
 */
export function SellerDecisionPanel({
  listingRef,
  decision,
}: {
  listingRef: string;
  decision: SellerDecision;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const send = (accept: boolean): void => {
    start(async () => {
      const response = await fetch(`/api/v1/auctions/${listingRef}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accept }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { data?: { orderRef?: string | null }; error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر إرسال القرار.');
        return;
      }

      setConfirming(false);

      /**
       * **والوجهة تُفحص بنوعها.** النطاق يعيد `null` عند الرفض،
       * و`x !== undefined` تمرّره فتذهب الشاشة إلى `/orders/null`.
       */
      const orderRef = payload?.data?.orderRef;
      if (accept && typeof orderRef === 'string' && orderRef !== '') {
        router.push(`/ar/account/orders/${orderRef}`);
        return;
      }

      setToast(accept ? 'قُبلت المزايدة.' : 'رُفضت المزايدة ورُدّ العربون.');
      router.refresh();
    });
  };

  /**
   * **انقضت المهلة ⇒ لا أزرار.** الحالة المخزَّنة تبقى `ENDED_UNMET`
   * حتى تمرّ الوظيفة الدورية، فزرٌّ يعمل هنا يردّ ٤٠٩ بعد الضغط —
   * وقولُها قبله أصدق.
   */
  if (decision.lapsed) {
    return (
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-1.5 text-sm font-bold">انقضى وقت القرار</h2>
        <p className="text-2xs leading-loose opacity-65">
          لم يبلغ المزاد سعرك الاحتياطيّ، ومضت مهلة قبول أعلى مزايدة — فرُدّ
          العربون إلى المزايد. وتستطيع إعادة عرض المركبة بمزادٍ جديد أو بسعرٍ
          مباشر.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="rounded-xl border-2 border-warn-200 bg-warn-100 p-5 text-warn-900">
        <h2 className="mb-1.5 text-sm font-bold">انتهى المزاد دون سعرك الاحتياطيّ</h2>
        <p className="mb-4 text-2xs leading-loose opacity-80">
          لك أن تقبل أعلى مزايدة أو ترفضها. وبقبولك يُنشأ الطلب مباشرةً ويُخصم
          عربون المزايد من مستحقّه؛ وبرفضك — أو بمرور المهلة — يُرَدّ إليه.
        </p>

        <div className="mb-4 flex flex-col gap-2.5 rounded-lg border border-warn-200 bg-bg p-3.5 text-ink">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-2xs opacity-60">أعلى مزايدة</span>
            <Money amount={Number(decision.highestBid)} size="md" />
          </span>
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-2xs opacity-60">عربون المزايد</span>
            <Money amount={Number(decision.depositAmount)} showCurrency={false} />
          </span>
          <span className="flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
            <span className="text-2xs opacity-60">يبقى للقرار</span>
            <Countdown endsAt={decision.dueAt} format="full" tone="warn" className="text-2xs" />
          </span>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Button className="flex-1" disabled={busy} onClick={() => setConfirming(true)}>
            أقبل أعلى مزايدة
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => send(false)}
          >
            {busy ? 'جارٍ…' : 'أرفض'}
          </Button>
        </div>
      </section>

      {/* القبول بيعٌ لا رجعة فيه — يُسأل مرّة قبل وقوعه لا بعده */}
      <Modal open={confirming} onClose={() => setConfirming(false)} title="قبول أعلى مزايدة">
        <p className="mb-4 text-xs leading-loose">
          بقبولك تبيع المركبة بمبلغ <Money amount={Number(decision.highestBid)} size="sm" /> —
          وهو دون سعرك الاحتياطيّ. ويُنشأ الطلب في الحال ويُطالَب المزايد بالدفع.
        </p>
        <div className="flex gap-2.5">
          <Button className="flex-1" disabled={busy} onClick={() => send(true)}>
            {busy ? 'جارٍ…' : 'نعم، أقبل'}
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
