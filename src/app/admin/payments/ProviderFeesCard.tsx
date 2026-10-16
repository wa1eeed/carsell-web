'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Toast } from '@/components/ui/Toast';
import { displayDigits, toLatinDigits } from '@/lib/arabic';
import type { ProviderFeePlanRow } from '@/lib/domain/provider-fees';

/**
 * ═══ مصفوفةُ رسوم بوّابة المزوّدين ═══
 *
 * قرار المالك ٢٠٢٦-١٠-١٤: «الرسوم تُضبط من لوحة الأدمن ولا نضعها داخل
 * الكود». وهي شروطٌ تجاريّة مع شريكٍ حقيقيّ، تُرسَل إلى البوّابة لحظةَ
 * فتح حسابه وتبقى عندها.
 *
 * ═══ والنسبة تُكتب مئويّةً وتُرسَل كسرًا — والشاشة تُظهر الاثنين ═══
 *
 * البوّابة تحدّ الكسر بواحد، و`1.70` تردّ ٤٠٠. ومثالُ وثيقتها يكتب
 * `1.70` ويسمّيه «نسبة» — فلو كان الحدُّ أوسع لمرّ **رسمٌ مئةَ ضعف**
 * على شريك. فالمعروض تحت الحقل هو ما يُرسَل فعلًا، لا شرحٌ له:
 * رقمان متجاوران يكشفان الخلط قبل الحفظ لا بعد أوّل خصم.
 */
export function ProviderFeesCard({
  initial,
  canManage,
}: {
  initial: ProviderFeePlanRow;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const [madaPct, setMadaPct] = useState(initial.madaPct);
  const [madaFixed, setMadaFixed] = useState(initial.madaFixed);
  const [madaCap, setMadaCap] = useState(initial.madaCap ?? '');
  const [madaRefund, setMadaRefund] = useState(initial.madaRefundFixed);
  const [cardPct, setCardPct] = useState(initial.cardPct);
  const [cardFixed, setCardFixed] = useState(initial.cardFixed);
  const [cardRefund, setCardRefund] = useState(initial.cardRefundFixed);
  const [taxInclusive, setTaxInclusive] = useState(initial.taxInclusive);

  const number = (value: string): number =>
    Number(toLatinDigits(value).replace(/[^\d.]/g, '') || '0');

  /** مثالٌ حيّ على خدمةٍ بخمس مئة — الرقم المجرّد لا يقول أثره. */
  const sample = (pct: string, fixed: string): number =>
    (number(pct) / 100) * 500 + number(fixed);

  const save = (): void => {
    start(async () => {
      const response = await fetch('/api/v1/admin/payments/provider-fees', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          madaPct: number(madaPct),
          madaFixed: number(madaFixed),
          madaCap: madaCap.trim() === '' ? null : number(madaCap),
          madaRefundFixed: number(madaRefund),
          cardPct: number(cardPct),
          cardFixed: number(cardFixed),
          cardRefundFixed: number(cardRefund),
          taxInclusive,
        }),
      }).catch(() => null);

      if (response === null || !response.ok) {
        setToast('تعذّر الحفظ — راجع النسب والمبالغ.');
        return;
      }

      const payload = (await response.json()) as { data: { openAccounts: number } };
      /** **العددُ بين قوسين فلا يحكم المعدود** — والعربية ستّ صيغ. */
      setToast(
        payload.data.openAccounts === 0
          ? 'حُفظت المصفوفة.'
          : `حُفظت · الحسابات المفتوحة (${displayDigits(String(payload.data.openAccounts))}) تبقى بشروطها.`,
      );
      router.refresh();
    });
  };

  return (
    <>
      <section className="mt-5 rounded-lg border border-line bg-surface p-5.5">
        <div className="mb-1 flex flex-wrap items-baseline gap-2">
          <h2 className="text-3xs font-bold tracking-[0.14em] opacity-65">
            رسوم بوّابة المزوّدين — ما يُخصم من الشريك
          </h2>
          {initial.configured ? null : (
            <span className="rounded-full bg-warn-100 px-2 py-0.5 text-3xs font-bold text-warn-900">
              لم تُضبط بعد
            </span>
          )}
        </div>
        <p className="mb-4 text-2xs leading-loose opacity-70">
          تُرسَل إلى البوّابة <strong>لحظةَ فتح حساب الشريك</strong> وتبقى عندها، فما فُتح يبقى
          بشروطه. ولا يُفتح حسابٌ قبل ضبطها — فأصفارٌ تعني «لا نأخذ من هذا الشريك شيئًا»، وهو
          قرارٌ تجاريّ لا يقع بالنسيان.
        </p>

        <div className="flex flex-col gap-5 border-t border-line pt-4 lg:flex-row lg:gap-8">
          <Group title="مدى">
            <Rate label="النسبة ٪" value={madaPct} disabled={!canManage} onChange={setMadaPct} />
            <Field label="ثابت بالريال" value={madaFixed} disabled={!canManage} onChange={setMadaFixed} />
            <Field
              label="السقف بالريال — فارغ = بلا سقف"
              value={madaCap}
              disabled={!canManage}
              onChange={setMadaCap}
            />
            <Field label="رسم الاسترجاع" value={madaRefund} disabled={!canManage} onChange={setMadaRefund} />
            <Sample pct={madaPct} fixed={madaFixed} amount={sample(madaPct, madaFixed)} />
          </Group>

          <Group title="بطاقات">
            <Rate label="النسبة ٪" value={cardPct} disabled={!canManage} onChange={setCardPct} />
            <Field label="ثابت بالريال" value={cardFixed} disabled={!canManage} onChange={setCardFixed} />
            <Field label="رسم الاسترجاع" value={cardRefund} disabled={!canManage} onChange={setCardRefund} />
            <Sample pct={cardPct} fixed={cardFixed} amount={sample(cardPct, cardFixed)} />
          </Group>
        </div>

        <label className="mt-5 flex cursor-pointer items-center gap-2.5 border-t border-line pt-4 text-2xs font-bold">
          <input
            type="checkbox"
            checked={taxInclusive}
            disabled={!canManage}
            onChange={(event) => setTaxInclusive(event.target.checked)}
          />
          القيَم شاملةٌ للضريبة
        </label>

        {!canManage ? null : (
          <Button size="sm" className="mt-4" onClick={save} disabled={pending}>
            حفظ المصفوفة
          </Button>
        )}
      </section>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-3">
      <p className="text-2xs font-bold opacity-70">{title}</p>
      {children}
    </div>
  );
}

/**
 * حقلُ نسبةٍ — **ويُظهر الكسرَ المُرسَل تحته**.
 *
 * فالخلطُ بين «١٬٧٠٪» و«٠٬٠١٧» لا يُكتشف بقراءة شرح، ويُكتشف برقمين
 * متجاورين.
 */
function Rate({
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
  const percent = Number(toLatinDigits(value).replace(/[^\d.]/g, '') || '0');
  return (
    <div className="flex flex-col gap-1.5">
      <Field label={label} value={value} disabled={disabled} onChange={onChange} />
      {/* ما يُرسَل فعلًا — بأرقامٍ لاتينية لأنه قيمةُ بروتوكول لا رقمٌ يُقرأ */}
      <span dir="ltr" className="font-num text-3xs opacity-70">
        → {(percent / 100).toFixed(5)}
      </span>
    </div>
  );
}

function Sample({ pct, fixed, amount }: { pct: string; fixed: string; amount: number }) {
  if (pct.trim() === '' && fixed.trim() === '') return null;
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-3xs leading-loose opacity-70">
      <span>على خدمةٍ بـ</span>
      <Money amount={500} />
      <span aria-hidden className="opacity-40">←</span>
      {/* **وخانتان**: رسمٌ قدرُه ١٤٫٥٠ يُعرض «١٥» فيَعِد بغير ما يُخصم. */}
      <Money amount={amount} decimals={2} className="font-bold" />
    </p>
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
      <span className="text-3xs font-bold opacity-70">{label}</span>
      {/* `dir="ltr"` — رقمٌ يُقارن خانةً بخانة، والتطبيع عند الحفظ */}
      <input
        dir="ltr"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="font-num w-full rounded-md border border-line bg-bg px-3.5 py-2 text-sm font-bold"
      />
    </label>
  );
}
