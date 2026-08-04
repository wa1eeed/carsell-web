'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Toast } from '@/components/ui/Toast';

/**
 * ═══ الدفع — الخطوة التي لم يكن لها زرّ ═══
 *
 * الطلب يُنشأ في مرحلة «دفع» بمهلةٍ معروضة، وصفحته تقول «مهلة الدفع
 * حتى…» — **ولا مسار في الواجهة كلّها ينادي `/api/v1/payments`**.
 * فالمشتري يصل إلى هنا ولا يجد ما يضغطه، والمهلة تنقضي وطلبه يسقط.
 *
 * وهذا ليس نقص ميزة: هو **طريقٌ مسدود في منتصف الرحلة** — بعد أن اختار
 * سيارة وأكمل ملفه وأجاب عن وضعه الضريبيّ وأنشأ طلبًا.
 *
 * ═══ ولغة الشاشة لغة الضمان لا لغة البطاقة ═══
 *
 * «يُحجز المبلغ» لا «يُخصم»: المال يبقى محجوزًا حتى تنتقل الملكية،
 * وكلمة «خصم» تجعل المشتري يظنّ أن البائع قبضه.
 */

const METHODS = [
  { key: 'mada', label: 'مدى' },
  { key: 'visa', label: 'فيزا' },
  { key: 'mastercard', label: 'ماستركارد' },
  { key: 'applepay', label: 'Apple Pay' },
] as const;

export function PayPanel({
  orderRef,
  total,
  locale,
}: {
  orderRef: string;
  total: string;
  locale: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [method, setMethod] = useState<string>('mada');
  const [toast, setToast] = useState<string | null>(null);

  const pay = (): void => {
    start(async () => {
      const response = await fetch('/api/v1/payments', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          /**
           * **مفتاحٌ لكل محاولة** — والشبكة تُعيد الطلب بلا أن يعرف
           * المستخدم، والمتصفّح يُعيده بضغطة تحديث.
           */
          'idempotency-key': `pay-${orderRef}-${String(Date.now())}`,
        },
        body: JSON.stringify({
          orderRef,
          method,
          returnUrl: `${window.location.origin}/${locale}/account/orders/${orderRef}`,
        }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { data?: { status?: string; actionUrl?: string }; error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر بدء الدفع. لم يُحجز من بطاقتك شيء.');
        return;
      }

      /**
       * تحدّي التحقّق يقع في صفحة المُصدِر — ثم يعود إلى هنا.
       *
       * والفحص على **نصٍّ غير فارغ** لا على `!== undefined`: النطاق
       * يعيد `null` حين لا تحدّي، و`null !== undefined` صادقة — فكانت
       * الشاشة تذهب إلى «null» فيرى المشتري ٤٠٤ بعد دفعةٍ نجحت.
       */
      const actionUrl = payload?.data?.actionUrl;
      if (typeof actionUrl === 'string' && actionUrl !== '') {
        window.location.href = actionUrl;
        return;
      }

      setToast('حُجز المبلغ. ينتقل الطلب إلى نقل الملكية.');
      router.refresh();
    });
  };

  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="mb-1.5 text-sm font-bold">ادفع لتأكيد الطلب</h2>
      <p className="mb-4 flex flex-wrap items-baseline gap-2 text-2xs leading-loose opacity-65">
        <span>يُحجز</span>
        <Money amount={total} />
        <span>في حساب الضمان — ولا يصل البائع قبل أن تنتقل الملكية باسمك.</span>
      </p>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {METHODS.map((entry) => (
          <label
            key={entry.key}
            className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3.5 py-2.5 text-2xs ${
              method === entry.key ? 'border-accent-700' : 'border-line'
            }`}
          >
            <input
              type="radio"
              name="method"
              checked={method === entry.key}
              onChange={() => setMethod(entry.key)}
            />
            <span>{entry.label}</span>
          </label>
        ))}
      </div>

      <Button className="w-full" onClick={pay} disabled={pending}>
        {pending ? 'جارٍ…' : 'ادفع الآن'}
      </Button>

      {toast === null ? null : <Toast title={toast} />}
    </section>
  );
}
