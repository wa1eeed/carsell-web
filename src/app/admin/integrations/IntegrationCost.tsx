'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';

/**
 * ═══ A11 — كلفةُ الشهر وصلاحيةُ المفتاح ═══
 *
 * بطاقتان في الترميز بلا حقلٍ يحملهما، ولا سبيل إلى جلبهما: الكلفةُ
 * **عقدٌ مع مزوّد**، وتاريخُ الانتهاء يقرؤه المشغّل في لوحة المزوّد.
 *
 * ═══ ولا طلبَ موافقةٍ عليهما ═══
 *
 * التدويرُ وتبديلُ البيئة يفتحان بابًا ويُبدّلان سرًّا، فيمرّان
 * بطلب موافقةٍ يبقى أثرًا يُقرأ. وهذان رقمٌ وتاريخ، فيُحفظان مباشرةً
 * — ويُسجَّلان في التدقيق كغيرهما.
 */
export function IntegrationCost({
  integrationKey,
  monthlyCost,
  expiresAt,
}: {
  integrationKey: string;
  monthlyCost: string | null;
  expiresAt: { TEST: string | null; LIVE: string | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cost, setCost] = useState(monthlyCost ?? '');
  const [test, setTest] = useState(expiresAt.TEST ?? '');
  const [live, setLive] = useState(expiresAt.LIVE ?? '');
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (): void => {
    start(async () => {
      const response = await fetch(
        `/api/v1/admin/integrations/${integrationKey}/cost`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            monthlyCost: cost.trim() === '' ? null : cost.trim(),
            expiresAt: {
              TEST: test === '' ? null : `${test}T00:00:00.000Z`,
              LIVE: live === '' ? null : `${live}T00:00:00.000Z`,
            },
          }),
        },
      ).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذر الحفظ.');
        return;
      }

      setOpen(false);
      setToast('حفظت.');
      router.refresh();
    });
  };

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        الكلفة والصلاحية
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="كلفة الشهر وصلاحية المفاتيح"
        footer={
          <div className="flex items-center gap-2">
            <Button onClick={submit} disabled={pending}>
              {pending ? 'يحفظ…' : 'احفظ'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 p-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-bold">كلفة الشهر بالريال</span>
            <input
              dir="ltr"
              inputMode="decimal"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              className="font-num rounded-md border border-line bg-bg px-3.5 py-2 text-sm"
            />
            {/* **والفراغُ «لم تُدخَل» لا «مجّانيّ»** — والمجموع يقول كم أُدخل. */}
            <span className="text-3xs opacity-65">
              اتركها فارغة إن كانت غير معروفة — ولا تدخل في المجموع
            </span>
          </label>

          {(
            [
              ['TEST', 'انتهاء مفتاح الاختبار', test, setTest],
              ['LIVE', 'انتهاء مفتاح الإنتاج', live, setLive],
            ] as const
          ).map(([env, label, value, set]) => (
            <label key={env} className="flex flex-col gap-1.5">
              <span className="text-2xs font-bold">{label}</span>
              <input
                type="date"
                dir="ltr"
                value={value}
                onChange={(event) => set(event.target.value)}
                className="font-num rounded-md border border-line bg-bg px-3.5 py-2 text-sm"
              />
            </label>
          ))}

          <p className="text-3xs leading-loose opacity-65">
            سجل التاريخ متى عرفته — والتنبيه يبدأ قبل الانتهاء بثلاثين يوما،
            فلا ينتهي مفتاح في منتصف يوم عمل.
          </p>
        </div>
      </Sheet>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
