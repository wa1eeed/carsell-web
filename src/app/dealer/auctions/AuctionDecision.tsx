'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Toast } from '@/components/ui/Toast';

/**
 * ═══ المخرجان اللذان يملكهما المعرض ═══
 *
 * الترميزُ يرسم ثلاثة: اقبل · أعِد المزاد باحتياطي أقلّ · حوّلها
 * لتفاوض. **والثالثان لا كاتب لهما في المنتج** — لا إعادةَ مزادٍ تحتفظ
 * بالمتابعين ولا تحويلَ مزادٍ منتهٍ إلى إعلان تفاوضيّ. وزرٌّ لا يبلغ
 * دالّةً هو الصنف الذي أُصلح هنا مرارًا، فيُشحن ما يعمل ويُقال نقصُ
 * الباقي في `DESIGN-DEVIATIONS`.
 *
 * **والرفضُ يقع وحده عند انقضاء المهلة**: الوظيفة الدورية تمرّر
 * `false`، فالزرُّ هنا هو **الفرع الآخر** — وكان ميّتًا حتى بُني.
 */
export function AuctionDecision({ listingRef, topBid }: { listingRef: string; topBid: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const decide = (accept: boolean): void => {
    start(async () => {
      const response = await fetch(`/api/v1/dealer/auctions/${listingRef}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accept }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { data?: { orderRef?: string | null; orderFailed?: string | null }; error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذر تنفيذ القرار.');
        return;
      }

      /**
       * **ولا يُقال «أنشئ الطلب» إلّا إن أُنشئ.** الخادمُ يردّ مرجعَه
       * أو سببَ تعذّره، والشاشةُ تقول ما وقع — لا ما كان يُفترض.
       */
      const failed = payload?.data?.orderFailed ?? null;
      setToast(
        !accept
          ? 'رفضت، وردت العرابين.'
          : typeof failed === 'string' && failed !== ''
            ? 'قبلت أعلى مزايدة — ولم ينشأ الطلب. راسلنا قبل أن تتصرف في المركبة.'
            : 'قبلت أعلى مزايدة — وأنشئ الطلب.',
      );
      router.refresh();
    });
  };

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2.5">
        {/*
          **والرقمُ على الزرّ هو الرقمُ في البطاقة فوقه.** كان خامًا
          («67760.00») والبطاقةُ تقول «67,760» — صيغتان لمبلغٍ واحد
          في شاشةٍ واحدة، وهي قاعدةٌ مسجَّلة في هذا المستودع.
        */}
        <Button size="sm" disabled={pending} onClick={() => decide(true)}>
          اقبل <Money amount={topBid} size="sm" className="ms-1.5" />
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => decide(false)}>
          ارفض ورد العرابين
        </Button>
      </div>
      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
