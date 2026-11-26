'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * ═══ إسنادُ باقةٍ إلى معرض ═══
 *
 * **وهذه الشاشةُ هي الحلقةُ الرابعة الناقصة.** الموديولز مبنيّة،
 * والباقاتُ تمنحها، والمحرّكُ يقرأ اشتراكَ المعرض — **ولا بابَ يُسند
 * اشتراكًا**. فنقطةُ البيع والتقسيطُ والموقعُ بقيت غائبةً عن كلّ لوحة،
 * ولا يملك المشغّلُ شيئًا يفعله.
 */
export function PlanPicker({
  dealerId,
  current,
  plans,
}: {
  dealerId: string;
  /** مفتاحُ الباقة النافذة — و`null` لمعرضٍ بلا اشتراك. */
  current: string | null;
  plans: readonly { key: string; nameAr: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /**
   * **والاختيارُ يُشتقّ من الخاصّية لا يُنسخ منها**: نسخةٌ في
   * `useState` تتقادم حين ينتقل المشغّل من معرضٍ إلى آخر داخل التطبيق
   * — فيرى باقةَ من قبله ويبدّلها وهو يحسبها باقةَ هذا. (البوابة ٣٠،
   * وقد أمسكتها في أوّل تشغيل.)
   */
  const fallback = current ?? plans[0]?.key ?? '';
  const [choice, setChoice] = useState<{ of: string; key: string } | null>(null);
  const picked = choice !== null && choice.of === dealerId ? choice.key : fallback;
  const setPicked = (key: string): void => setChoice({ of: dealerId, key });

  const submit = (): void => {
    setError(null);
    start(async () => {
      const response = await fetch(
        `/api/v1/admin/dealers/${encodeURIComponent(dealerId)}/plan`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ planKey: picked }),
        },
      ).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setError(payload?.error?.messageAr ?? 'تعذر إسناد الباقة.');
        return;
      }
      router.refresh();
    });
  };

  if (plans.length === 0) {
    return <p className="text-2xs opacity-70">لا باقات للمعارض بعد — أنشئها من الباقات.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <label>
        <span className="mb-1 block text-3xs font-bold opacity-70">الباقة</span>
        <select
          value={picked}
          onChange={(event) => setPicked(event.target.value)}
          className="w-full rounded-md border border-line bg-bg px-3 py-2 text-2xs"
        >
          {plans.map((plan) => (
            <option key={plan.key} value={plan.key}>
              {plan.nameAr}
            </option>
          ))}
        </select>
      </label>

      {error === null ? null : <p className="text-3xs text-danger">{error}</p>}

      <Button
        size="sm"
        variant="outline"
        disabled={pending || picked === '' || picked === current}
        onClick={submit}
      >
        {current === null ? 'أسند الباقة' : 'بدل الباقة'}
      </Button>
    </div>
  );
}
