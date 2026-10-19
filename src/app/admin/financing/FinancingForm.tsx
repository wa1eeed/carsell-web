'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { Toast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { toLatinDigits } from '@/lib/arabic';
import { monthlyInstalment, type FinancingSettings } from '@/lib/finance/terms';

/** أسعارُ أمثلةٍ تغطّي ما يُباع فعلًا — رخيصةٌ ومتوسّطةٌ وغالية. */
const SAMPLES = [45_000, 120_000, 250_000] as const;

const FIELDS = [
  { key: 'downPaymentPct', label: 'الدفعة الأولى', unit: '٪', hint: 'بين 0 و90' },
  { key: 'months', label: 'مدة التمويل', unit: 'شهرا', hint: 'بين 6 و96' },
  { key: 'profitRatePct', label: 'نسبة الربح السنوية', unit: '٪', hint: 'بين 0 و30' },
  { key: 'minPrice', label: 'أقل سعر يظهر له قسط', unit: 'ريال', hint: 'الأقل منه بلا قسط' },
] as const;

/**
 * ═══ ويرى المشغّل أثرَ ما يحفظ قبل حفظه ═══
 *
 * «نسبة الربح ٦٪» لا تقول ما يقوله «٢٬١٤٠ ريالًا شهريًّا على سيارةٍ
 * بمئةٍ وعشرين ألفًا». والرقمُ الذي يُحفظ هنا يُطبع تحت كلّ سيارة في
 * المنصّة، فعرضُ أثره قبل الحفظ ليس ترفًا — وهو مسلكُ بطاقة رسوم
 * المعالجة نفسُه: «مثالٌ حيّ على مئة ألف».
 */
export function FinancingForm({
  settings,
  canEdit,
}: {
  settings: FinancingSettings;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, string>>({
    downPaymentPct: String(settings.downPaymentPct),
    months: String(settings.months),
    profitRatePct: String(settings.profitRatePct),
    minPrice: String(settings.minPrice),
  });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  /** **والحقل يقبل ما يُلصق ويطبّعه** — عربيٌّ أو لاتينيّ أو بفواصل. */
  const numberOf = (key: string): number => {
    const clean = toLatinDigits(draft[key] ?? '').replace(/[^0-9.]/g, '');
    const value = Number(clean);
    return Number.isFinite(value) ? value : 0;
  };

  const preview: FinancingSettings = {
    downPaymentPct: numberOf('downPaymentPct'),
    months: Math.round(numberOf('months')),
    profitRatePct: numberOf('profitRatePct'),
    minPrice: numberOf('minPrice'),
  };

  const changed = (['downPaymentPct', 'months', 'profitRatePct', 'minPrice'] as const).some(
    (key) => preview[key] !== settings[key],
  );

  async function save(): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch('/api/v1/admin/financing', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(preview),
      });
      if (!response.ok) {
        const json = (await response.json()) as { error?: { messageAr: string } };
        setToast({ tone: 'error', text: json.error?.messageAr ?? 'تعذر الحفظ.' });
        return;
      }
      setToast({ tone: 'success', text: 'حفظت إعداد التمويل.' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const field =
    'w-full rounded-md border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-ink';

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <section className="rounded-xl border border-line bg-surface p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((entry) => (
              <label key={entry.key} className="flex flex-col gap-1.5">
                <span className="text-2xs font-semibold opacity-70">{entry.label}</span>
                <span className="flex items-center gap-2">
                  <input
                    value={draft[entry.key] ?? ''}
                    onChange={(e) => setDraft({ ...draft, [entry.key]: e.target.value })}
                    disabled={!canEdit}
                    inputMode="decimal"
                    dir="ltr"
                    className={cn(field, 'font-num bidi-ltr')}
                  />
                  <span className="shrink-0 text-2xs opacity-65">{entry.unit}</span>
                </span>
                <span className="text-3xs opacity-65">{entry.hint}</span>
              </label>
            ))}
          </div>

          {!canEdit ? null : (
            <div className="mt-5 flex items-center gap-3">
              <Button disabled={busy || !changed} onClick={() => void save()}>
                احفظ
              </Button>
              {!changed ? null : (
                <span className="text-2xs opacity-70">يسري على ما يعرض بعد الحفظ</span>
              )}
            </div>
          )}
        </section>

        {/*
          **والمثالُ يُحسب بما في الحقول لا بما حُفظ** — فمن يكتب رقمًا
          يرى أثره قبل أن يلتزم به، لا بعد أن يراه كلُّ زائر.
        */}
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="mb-1 text-3xs font-bold tracking-[0.14em] opacity-65">
            القسط بهذه الأرقام
          </h2>
          <p className="mb-4 text-2xs leading-loose opacity-70">
            {changed ? 'بما في الحقول الآن — قبل الحفظ.' : 'بالمحفوظ حاليا.'}
          </p>

          <ul className="flex flex-col divide-y divide-line-2">
            {SAMPLES.map((price) => (
              <li key={price} className="flex items-center justify-between gap-4 py-3">
                <span className="flex flex-col gap-0.5">
                  <span className="text-2xs opacity-70">سعر السيارة</span>
                  <Money amount={price} showCurrency={false} />
                </span>
                {price < preview.minPrice ? (
                  <span className="text-2xs opacity-70">دون حد التمويل — بلا قسط</span>
                ) : (
                  <span className="flex flex-col items-end gap-0.5">
                    <span className="text-2xs opacity-70">شهريا</span>
                    <Money amount={monthlyInstalment(price, preview)} size="lg" showCurrency={false} />
                  </span>
                )}
              </li>
            ))}
          </ul>

          {/*
            **والوحدةُ لا تُكتب بيد بجوار رقم**: العربية ستُّ حالات جمع،
            و«شهرا» تُصيب واحدةً منها — فالمدّةُ على `Quantity`.
          */}
          {/*
            **ولا جارَّ قبل `<Quantity>`**: «على» تُدخَل في صيغة الجمع
            وإلّا بقي المثنّى خاطئًا («على شهران»). فالجملةُ تُصاغ
            وسمًا وقيمةً بلا جارّ — وهي أوضح للقارئ أصلًا.
          */}
          <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-3xs leading-loose opacity-65">
            <span className="flex items-center gap-1">
              <span>المدة</span>
              <Quantity unit="months" count={preview.months} />
            </span>
            <span aria-hidden className="opacity-40">·</span>
            <span className="flex items-center gap-1">
              <span>الدفعة الأولى</span>
              <span className="font-num">
                <ArabicNumber value={preview.downPaymentPct} grouped={false} />٪
              </span>
            </span>
          </p>
        </section>
      </div>

      {toast === null ? null : (
        <div className="fixed bottom-6 end-6 z-50">
          <Toast tone={toast.tone} title={toast.text} />
        </div>
      )}
    </>
  );
}
