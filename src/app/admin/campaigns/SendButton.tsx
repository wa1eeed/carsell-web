'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { toArabicDigits } from '@/lib/arabic';

/**
 * ═══ إرسال حملة — والزرّ الذي لم يكن ═══
 *
 * `sendCampaign` مبنيّة ومختبَرة: تحوسب الشريحة الآن، وتحترم سقف
 * الشهر والتهدئة، وتكتب `CampaignSend` لمن يصلهم فعلًا — **ولا
 * ينادِيها شيء**. فحملةٌ في `DRAFT` تبقى فيه إلى الأبد.
 *
 * ═══ ولا رجعة فيه ═══
 *
 * رسالةٌ خرجت لا تُستردّ، والسقف الشهريّ يُستهلك بها. فتُسأل مرّة قبل
 * وقوعها لا بعده — وكم وصلت وكم حُجبت يُقالان بعدها لا يُخمَّنان.
 */
export function SendCampaignButton({
  campaignId,
  nameAr,
  status,
}: {
  campaignId: string;
  nameAr: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  /**
   * **والمُرسَلة لا يُعرض لها زرّ.** النطاق يردّ `NOT_SENDABLE`، وزرٌّ
   * يردّ الرفض بعد الضغط أسوأ من غيابه.
   */
  if (status === 'SENT' || status === 'CANCELLED') return null;

  const send = (): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/campaigns/${campaignId}/send`, {
        method: 'POST',
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { data?: { sent?: number; skipped?: number }; error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر الإرسال.');
        return;
      }

      setAsking(false);

      /**
       * **والعدد يُقال بجملةٍ لا يحكمها المعدود.** `Quantity` مكوّن ولا
       * يبلغ نصّ الـToast، و`` `و${n} رسالة` `` تُخرج رقمًا لاتينيًّا
       * وجمعًا يُصيب حالةً من ستّ (البوابة ١٨).
       */
      const sent = toArabicDigits(String(payload?.data?.sent ?? 0));
      const skipped = toArabicDigits(String(payload?.data?.skipped ?? 0));
      setToast(`أُرسلت الحملة — الواصلون (${sent}) · المحجوبون بالسقف والتهدئة (${skipped})`);
      router.refresh();
    });
  };

  return (
    <>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setAsking(true)}>
        أرسل
      </Button>

      <Modal open={asking} onClose={() => setAsking(false)} title="إرسال الحملة">
        <p className="mb-4 text-xs leading-loose">
          سترسل «<b>{nameAr}</b>» إلى من يطابق شريحتها الآن. والرسالة الخارجة لا
          تُستردّ، ويُستهلَك بها سقفُ الشهر لكل من وصلته.
        </p>
        <p className="mb-4 rounded-md border border-line bg-surface p-3 text-2xs leading-loose opacity-70">
          ومن تجاوز سقفه الشهريّ أو لم تمضِ تهدئته يُحجب تلقائيًّا — ويُقال عددهم
          بعد الإرسال.
        </p>
        <div className="flex gap-2.5">
          <Button className="flex-1" disabled={busy} onClick={send}>
            {busy ? 'جارٍ…' : 'نعم، أرسل'}
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setAsking(false)}>
            تراجع
          </Button>
        </div>
      </Modal>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
