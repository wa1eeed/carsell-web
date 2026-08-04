'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import { Money } from '@/components/ui/Money';
import { Toast } from '@/components/ui/Toast';
import { toLatinDigits } from '@/lib/arabic';

/**
 * ═══ الردّ على العرض — الطرف الثاني من التفاوض ═══
 *
 * **العرض كان يُرسَل ولا يُجاب.** المشتري يضغط «قدّم عرضًا» فيصل،
 * ويراه البائع في صندوقه — شارةً ومبلغًا وحدهما. ولا قبولَ ولا رفضَ
 * ولا مقابل: قواعد التفاوض الخمس مبنيّة في النطاق ومختبَرة، ولا زرّ
 * يبلغ واحدةً منها.
 *
 * فالمشتري ينتظر ردًّا لا يستطيع البائع إرساله، حتى تنقضي المهلة.
 *
 * ═══ والدور يحكم ما يُعرض ═══
 *
 * **من أرسله يسحبه، ومن وصله يقبله أو يقابله** — لا الدور.
 *
 * والمقابل يرسله البائع، فكان يراه في «واردة» وفوقه «اقبل»: يقبل
 * عرض نفسه. والخادم يفحص المُرسِل أيضًا، فالشاشة تُخفي وهو يمنع.
 */
export function OfferActions({
  offerId,
  sentByMe,
  amount,
  askPrice,
  actionable,
}: {
  offerId: string;
  /** أنا أرسلتُه ⇒ أسحب. وغيري أرسله ⇒ أقبل أو أقابل. */
  sentByMe: boolean;
  amount: string;
  askPrice: string;
  /** منتهٍ أو مغلق ⇒ لا ردّ — والشارة تقول الحال */
  actionable: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [countering, setCountering] = useState(false);
  const [counterAmount, setCounterAmount] = useState('');

  if (!actionable) return null;

  const send = (body: Record<string, unknown>, done: string): void => {
    start(async () => {
      const response = await fetch(`/api/v1/offers/${offerId}`, {
        // المسار يصدّر `PATCH` — والفعل تعديلُ عرضٍ قائم لا إنشاء
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { data?: { orderRef?: string }; error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر تنفيذ الإجراء.');
        return;
      }

      /**
       * القبول يُنشئ طلبًا — **فيُذهب إليه**. وتركُ البائع في الصندوق
       * بعد أن باع يجعله يسأل «وماذا الآن؟»، والجواب صفحةٌ لا يعرفها.
       */
      const ref = payload?.data?.orderRef;
      if (typeof ref === 'string' && ref !== '') {
        router.push(`/ar/account/orders/${ref}`);
        return;
      }

      setToast(done);
      setCountering(false);
      router.refresh();
    });
  };

  const submitCounter = (): void => {
    const value = Number(toLatinDigits(counterAmount).replace(/\D/g, ''));
    if (!Number.isFinite(value) || value <= 0) return;
    send({ action: 'counter', amount: value }, 'أُرسل عرضك المقابل.');
  };

  return (
    <>
      <span className="flex shrink-0 flex-wrap gap-2">
        {!sentByMe ? (
          <>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => send({ action: 'accept' }, 'قُبل العرض.')}
            >
              اقبل
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCountering(true)}>
              قابِل
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => send({ action: 'withdraw' }, 'سُحب عرضك.')}
          >
            اسحب
          </Button>
        )}
      </span>

      <Modal open={countering} onClose={() => setCountering(false)} title="عرض مقابل">
        <p className="mb-3.5 flex flex-wrap items-center gap-2 text-2xs opacity-65">
          عرضه <Money amount={Number(amount)} /> · وسعرك المعروض{' '}
          <Money amount={Number(askPrice)} />
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-bold opacity-60">مبلغك المقابل</span>
          {/* الرقم يُدخل ويُقارن — لاتينيّ، والتطبيع عند الإرسال */}
          <input
            dir="ltr"
            inputMode="numeric"
            value={counterAmount}
            onChange={(event) => setCounterAmount(event.target.value)}
            className="font-num rounded-lg border border-line bg-surface px-3.5 py-2.5 text-lg font-bold"
          />
        </label>
        {/*
          الوصف يتبع ما يقع: `COUNTERED` تبقى في الحالات النشطة، فعرضه
          يظلّ قابلًا للقبول. وكتبتُ أوّلًا «يُلغي عرضه» — وعدٌ يخالف
          النظام، وهو الصنف نفسه الذي أصلحتُه في غيره.
        */}
        <p className="mt-3 text-3xs leading-loose opacity-50">
          يصل إليه بمهلةٍ جديدة، ويبقى عرضه قائمًا حتى يُقبل أحدهما.
        </p>
        <Button
          className="mt-4 w-full"
          disabled={pending || counterAmount === ''}
          onClick={submitCounter}
        >
          {pending ? 'جارٍ…' : 'أرسل العرض المقابل'}
        </Button>
      </Modal>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
