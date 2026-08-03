'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Chip } from '@/components/ui/Chip';
import { Toast } from '@/components/ui/Toast';
import { toArabicDigits, toLatinDigits } from '@/lib/arabic';
import type { ProcessingFeeRow } from '@/lib/domain/payment-routing';

const BEARER_LABEL: Record<'SELLER' | 'BUYER', string> = {
  SELLER: 'تُخصم من مستحقّ البائع',
  BUYER: 'تُضاف إلى إجمالي المشتري',
};

/**
 * ═══ رسوم المعالجة — سياستنا لا تكلفة البوابة ═══
 *
 * وموضعها هنا مقصود: من يبدّل بوابةً هو من يراجع ما يُحمَّل مقابلها.
 * وبطاقات البوابات فوقها تعرض **ما تأخذه البوابة منّا**، وهذه تعرض **ما
 * نأخذه نحن** — ولا تُشتقّ إحداهما من الأخرى.
 *
 * والصيغتان تجتمعان: نسبة × قيمة البيع + ثابت. وترك أحدهما صفرًا يُنتج
 * الصيغة المفردة، فلا حاجة إلى راية ثالثة تقول «أيّهما».
 */
export function ProcessingFeeCard({
  initial,
  canManage,
}: {
  initial: ProcessingFeeRow;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(initial.enabled);
  const [bearer, setBearer] = useState(initial.bearer);
  const [pct, setPct] = useState(initial.pct);
  const [fixed, setFixed] = useState(initial.fixed);

  /** مثالٌ حيّ على مئة ألف — الرقم المجرّد لا يقول أثره. */
  const sample = (Number(pct) / 100) * 100_000 + Number(fixed);

  const save = (): void => {
    start(async () => {
      const response = await fetch('/api/v1/admin/payments/processing-fee', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled,
          bearer,
          pct: Number(toLatinDigits(pct).replace(/[^\d.]/g, '') || '0'),
          fixed: Number(toLatinDigits(fixed).replace(/[^\d.]/g, '') || '0'),
        }),
      }).catch(() => null);

      if (response === null || !response.ok) {
        setToast('تعذّر الحفظ — راجع النسبة والمبلغ.');
        return;
      }

      const payload = (await response.json()) as { data: { openOrders: number } };
      /**
       * **العددُ بين قوسين فلا يحكم المعدود.** «و١٠ طلبًا» تُصيب حالةً
       * من ستّ، و«الطلبات القائمة (١٠)» تصحّ في كلّها. والرقم يمرّ على
       * `toArabicDigits` — فالعرض عربيّ-هنديّ والتخزين Latin.
       */
      setToast(
        payload.data.openOrders === 0
          ? 'حُفظ.'
          : `حُفظ · الطلبات القائمة (${toArabicDigits(String(payload.data.openOrders))}) تبقى بسياستها.`,
      );
      router.refresh();
    });
  };

  return (
    <>
      <section className="mt-5 rounded-lg border border-line bg-surface p-5.5">
        <h2 className="mb-1 text-3xs font-bold tracking-[0.14em] opacity-45">
          رسوم معالجة الدفع — ما نأخذه نحن
        </h2>
        <p className="mb-4 text-2xs leading-loose opacity-60">
          غير رسوم البوابات أعلاه: تلك ما تأخذه البوابة منّا، وهذه سياسة تحميلها على
          الطرفين. وهي <strong>توريدٌ منّا</strong> فتسري عليها الضريبة — بخلاف رسوم نقل
          الملكية الحكومية التي تُمرَّر كما هي.
        </p>

        <label className="mb-4 flex cursor-pointer items-center gap-2.5 text-xs font-bold">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!canManage}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          تفعيل رسوم المعالجة
        </label>

        {!enabled ? null : (
          <div className="flex flex-col gap-4 border-t border-line pt-4">
            <div>
              <p className="mb-2 text-2xs font-bold opacity-60">من يتحمّلها</p>
              {/*
                خيارٌ واحد لا خياران: خصمُها من البائع **و**إضافتها على
                المشتري يأخذها مرّتين، وكلٌّ منهما يبدو صحيحًا وحده.
              */}
              <div className="flex flex-wrap gap-1.5">
                {(['SELLER', 'BUYER'] as const).map((option) => (
                  <Chip
                    key={option}
                    active={bearer === option}
                    onClick={canManage ? () => setBearer(option) : undefined}
                  >
                    {BEARER_LABEL[option]}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <Field
                label="نسبة من قيمة البيع ٪"
                value={pct}
                disabled={!canManage}
                onChange={setPct}
              />
              <Field
                label="مبلغ ثابت بالريال"
                value={fixed}
                disabled={!canManage}
                onChange={setFixed}
              />
            </div>

            {/*
              الصيغتان تجتمعان — والمثال يقول الأثر قبل الحفظ. و«ريال»
              تأتي من `Money` لا مكتوبةً: العربية ستّ حالات جمع، والوحدة
              اليدوية تخطئ في أكثرها.
            */}
            <p className="flex flex-wrap items-center gap-1.5 text-2xs opacity-60">
              <span>على بيعةٍ قدرها</span>
              <Money amount={100_000} />
              <span aria-hidden className="opacity-40">←</span>
              <Money amount={sample} className="font-bold" />
              <span>— {BEARER_LABEL[bearer]}.</span>
            </p>

            {!canManage ? null : (
              <p className="text-3xs leading-loose opacity-50">
                الطلبات القائمة تبقى بسياستها — الرسم لقطةٌ وقت إنشاء الطلب.
              </p>
            )}
          </div>
        )}

        {!canManage ? null : (
          <Button size="sm" className="mt-4" onClick={save} disabled={pending}>
            حفظ السياسة
          </Button>
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
      <span className="text-2xs font-bold opacity-60">{label}</span>
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
