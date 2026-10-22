'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Toast } from '@/components/ui/Toast';
import { displayDigits, toLatinDigits } from '@/lib/arabic';
import type { TransferFeeRow } from '@/lib/domain/payment-routing';

/**
 * ═══ رسمُ نقل الملكية — ثلاثةُ حقولٍ تقرؤها كلُّ صفقة ولا يكتبها شيء ═══
 *
 * `order-amounts.ts` تقرأ `transferFee` و`transferAdminFeeEnabled`
 * و`transferAdminFee` في حساب كل طلب — **ولا شاشةَ ولا مسارَ يكتب
 * واحدًا منها**. فالرسمُ مجمَّدٌ على ما زرعته البذرة، ورسمُنا الإداريُّ
 * مُطفأٌ إلى الأبد، وصفحةُ الطلب تعرضهما ولا تُعدِّلهما.
 *
 * ═══ والسطران منفصلان بقصد ═══
 *
 * الحكوميُّ **صرفٌ نيابةً عن العميل** فلا ضريبةَ علينا فيه، ورسمُنا
 * فوقه **توريدُنا** فعليه الضريبة. ودمجُهما في رقمٍ واحد يُسقط وصف
 * الصرف عن المبلغ كلِّه، فتُستحقّ الضريبة على ٣٥٠ لا على هامشنا.
 */
export function TransferFeeCard({
  initial,
  vatPct,
  canManage,
}: {
  initial: TransferFeeRow;
  /**
   * **والنسبةُ من قاعدتها لا من رقمٍ مكتوب** (البوابة): تُقرأ على
   * الخادم بـ`supplyVatPct('ADMIN_FEE')` — وهي القاعدةُ نفسُها التي
   * يحسب بها كلُّ طلب، فلا يقول المثالُ رقمًا وتقول الفاتورة غيره.
   */
  vatPct: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const [fee, setFee] = useState(initial.fee);
  const [enabled, setEnabled] = useState(initial.adminFeeEnabled);
  const [adminFee, setAdminFee] = useState(initial.adminFee);

  const clean = (value: string): number =>
    Number(toLatinDigits(value).replace(/[^\d.]/g, '') || '0');

  /**
   * **والأثرُ يُرى قبل حفظه**: «الرسم ٣٥٠ والإداريّ ٥٠» لا يقول ما
   * يقوله «يدفع المشتري ٤٠٧٫٥٠ ومنها ٧٫٥٠ ضريبةً على هامشنا وحده».
   * والضريبةُ على هامشنا وحده — الحكوميُّ صرفٌ لا توريد.
   */
  const base = clean(fee);
  const ours = enabled ? clean(adminFee) : 0;
  const vat = (ours * vatPct) / 100;
  const total = base + ours + vat;

  const save = (): void => {
    start(async () => {
      const response = await fetch('/api/v1/admin/payments/transfer-fee', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fee: clean(fee),
          adminFeeEnabled: enabled,
          adminFee: clean(adminFee),
        }),
      }).catch(() => null);

      if (response === null || !response.ok) {
        setToast(
          enabled && clean(adminFee) <= 0
            ? 'رسم مفعل بصفر ليس تفعيلا. اكتب مبلغه أو أطفئه.'
            : 'تعذر الحفظ — راجع المبلغين.',
        );
        return;
      }

      const payload = (await response.json()) as { data: { openOrders: number } };
      setToast(
        payload.data.openOrders === 0
          ? 'حفظ.'
          : `حفظ · الطلبات القائمة (${displayDigits(String(payload.data.openOrders))}) تبقى برسمها.`,
      );
      router.refresh();
    });
  };

  return (
    <>
      <section className="mt-5 rounded-lg border border-line bg-surface p-5.5">
        <h2 className="mb-1 text-3xs font-bold tracking-[0.14em] opacity-65">
          رسم نقل الملكية: حكومي يمرر، وإداري فوقه
        </h2>
        <p className="mb-4 text-2xs leading-loose opacity-70">
          الأول يصرف نيابة عن العميل فلا ضريبة علينا فيه، والثاني توريد منا فعليه
          الضريبة. <strong>ولذلك سطران لا رقم واحد:</strong> دمجهما يجعل الضريبة
          تستحق على المبلغ كله.
        </p>

        <div className="flex flex-wrap gap-4">
          <Field label="الرسم الحكومي بالريال" value={fee} disabled={!canManage} onChange={setFee} />
        </div>

        <label className="mt-4 mb-1 flex cursor-pointer items-center gap-2.5 text-xs font-bold">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!canManage}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          تفعيل رسمنا الإداري فوقه
        </label>

        {!enabled ? null : (
          <div className="mt-3 flex flex-col gap-4 border-t border-line pt-4">
            <Field
              label="رسمنا الإداري بالريال"
              value={adminFee}
              disabled={!canManage}
              onChange={setAdminFee}
            />
            {/*
              **ورسمٌ مفعَّلٌ بصفرٍ ليس تفعيلًا** — رايةٌ تقول «نأخذ»
              ورقمٌ يقول «لا شيء». والخادم يردّه، والشاشة تقوله قبله.
            */}
            {clean(adminFee) > 0 ? null : (
              <p className="text-2xs opacity-75">اكتب مبلغ الرسم — المفعل بصفر لا يحفظ.</p>
            )}
          </div>
        )}

        <p className="mt-4 flex flex-wrap items-center gap-1.5 text-2xs opacity-70">
          <span>يدفع المشتري</span>
          <Money amount={total} decimals={2} className="font-bold" />
          <span>
            — منها <Money amount={base} size="sm" /> حكومي
            {ours === 0 ? null : (
              <>
                {' '}
                و<Money amount={ours} size="sm" /> لنا، وضريبتها{' '}
                <Money amount={vat} size="sm" decimals={2} />
              </>
            )}
            .
          </span>
        </p>

        {!canManage ? null : (
          <>
            <p className="mt-3 text-3xs leading-loose opacity-70">
              الطلبات القائمة تبقى برسمها، فالرسم لقطة وقت إنشاء الطلب.
            </p>
            <Button size="sm" className="mt-4" onClick={save} disabled={pending}>
              حفظ الرسم
            </Button>
          </>
        )}
      </section>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}

function Field({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-2xs font-bold opacity-70">{label}</span>
      {/* `dir="ltr"` — رقمٌ يُقارن خانةً بخانة، والتطبيع عند الحفظ */}
      <input
        dir="ltr"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="font-num w-36 rounded-md border border-line bg-bg px-3.5 py-2 text-sm font-bold"
      />
    </label>
  );
}
