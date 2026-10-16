'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Toast } from '@/components/ui/Toast';
import { toLatinDigits } from '@/lib/arabic';

/**
 * ═══ رسومُ البوّابة — تُعدَّل بلا نشر ═══
 *
 * `resolve.ts` يقرأ القدرات من الصفّ منذ بُني ويقول «المشغّل يعدّلها
 * بلا نشر»، **ولم تكن هناك شاشة تعدّلها**: القيَم تأتي من البذرة،
 * وتعديلُ عقدٍ مع بوّابة كان يحتاج نشرًا. والنصُّ المعروض وعدٌ لا وصف.
 *
 * **والرسومُ وحدها.** الرايات (حجزٌ · إفراجٌ جزئيّ · استرجاع) حقائق
 * في الشيفرة، ومنحُها بيدٍ يجعل المنتج يَعِد بقدرةٍ لا وصلةَ لها.
 * و`maxHoldDays` كذلك: رقمٌ أوسع من نافذة البوّابة يُنتج حجزًا يموت
 * قبل الموعد المعروض.
 */
export function GatewayFeesForm({
  gatewayKey,
  feePct,
  feeFixed,
  canManage,
}: {
  gatewayKey: string;
  feePct: number;
  feeFixed: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [pct, setPct] = useState(String(feePct));
  const [fixed, setFixed] = useState(String(feeFixed));

  /**
   * **والفتحُ يبذر من الصفّ لا من آخر ما كُتب.** محرّرٌ يُغلق بـ«إلغاء»
   * ثم يُفتح فيُظهر ما تُرك — فيقرؤه المشغّل قيمةً محفوظة وهي مُلغاة.
   */
  const show = (): void => {
    setPct(String(feePct));
    setFixed(String(feeFixed));
    setOpen(true);
  };

  const reading = (
    <span className="flex items-baseline gap-1">
      <span className="font-num">
        <ArabicNumber value={feePct} decimals={2} grouped={false} />٪
      </span>
      <span aria-hidden className="opacity-40">+</span>
      <Money amount={String(feeFixed)} />
    </span>
  );

  if (!canManage) return reading;

  const save = (): void => {
    start(async () => {
      const response = await fetch(
        `/api/v1/admin/payments/gateways/${encodeURIComponent(gatewayKey)}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            feePct: Number(toLatinDigits(pct).replace(/[^\d.]/g, '') || '0'),
            feeFixed: Number(toLatinDigits(fixed).replace(/[^\d.]/g, '') || '0'),
          }),
        },
      ).catch(() => null);

      if (response === null || !response.ok) {
        setToast('تعذّر الحفظ — راجع النسبة والمبلغ.');
        return;
      }
      setToast('حُفظت الرسوم.');
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      {!open ? (
        <span className="flex items-baseline gap-2">
          {reading}
          <button
            type="button"
            onClick={show}
            className="text-3xs underline opacity-70 hover:opacity-90"
          >
            تعديل
          </button>
        </span>
      ) : (
        <span className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-3xs opacity-70">٪</span>
            <input
              dir="ltr"
              inputMode="decimal"
              value={pct}
              onChange={(event) => setPct(event.target.value)}
              className="font-num w-16 rounded-md border border-line bg-bg px-2 py-1 text-2xs font-bold"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-3xs opacity-70">ريال</span>
            <input
              dir="ltr"
              inputMode="decimal"
              value={fixed}
              onChange={(event) => setFixed(event.target.value)}
              className="font-num w-16 rounded-md border border-line bg-bg px-2 py-1 text-2xs font-bold"
            />
          </label>
          <Button size="sm" onClick={save} disabled={pending}>
            حفظ
          </Button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="pb-1.5 text-3xs underline opacity-70 hover:opacity-90"
          >
            إلغاء
          </button>
        </span>
      )}
      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
