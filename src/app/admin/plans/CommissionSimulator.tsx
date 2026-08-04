'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { toArabicDigits, toLatinDigits } from '@/lib/arabic';

/**
 * ═══ A29 — محاكي العمولة ═══
 *
 * **ولا يحسب بنفسه.** ينادي مسارًا يستدعي `commissionFrom` نفسها التي
 * يستدعيها إنشاء الطلب — فمحاكاةٌ تُعيد الحساب في المتصفّح تُنتج
 * قاعدةً ثانية تقول رقمًا ويكتب الطلبُ غيره، وأسوأ ما فيها أنها تبدو
 * صحيحة.
 *
 * **ولا يكتب شيئًا.** والتطبيق على باقة يمرّ بالمحرّر — وبنصاب عضوين
 * حين يمسّ العمولة النافذة.
 */
export function CommissionSimulator({
  defaultPct,
  defaultFixed,
  defaultMin,
  defaultMax,
}: {
  defaultPct: string;
  defaultFixed: string;
  defaultMin: string | null;
  defaultMax: string | null;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    price: '145000',
    pct: defaultPct,
    fixedFee: defaultFixed,
    minFee: defaultMin ?? '',
    maxFee: defaultMax ?? '',
  });

  const num = (raw: string): number => {
    const value = Number(toLatinDigits(raw).replace(/[^\d.]/g, ''));
    return Number.isFinite(value) ? value : 0;
  };

  // حقلٌ فارغ = بلا حدّ. وصفرٌ ليس فراغًا: حدٌّ أقصى بصفر يُلغي العمولة.
  const orNull = (raw: string): number | null => (raw.trim() === '' ? null : num(raw));

  const run = (): void => {
    start(async () => {
      setError(null);
      const response = await fetch('/api/v1/admin/plans/simulate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          price: num(form.price),
          pct: num(form.pct),
          fixedFee: num(form.fixedFee),
          minFee: orNull(form.minFee),
          maxFee: orNull(form.maxFee),
        }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { data?: { commission?: string }; error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok || typeof payload?.data?.commission !== 'string') {
        setError(payload?.error?.messageAr ?? 'تعذّرت المحاكاة.');
        return;
      }

      setResult(payload.data.commission);
    });
  };

  return (
    <section className="rounded-lg border border-line p-5">
      <h3 className="mb-4 text-sm font-bold">محاكي العمولة</h3>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field
          label="قيمة الصفقة"
          value={form.price}
          onChange={(v) => setForm({ ...form, price: v })}
        />
        <Field label="النسبة ٪" value={form.pct} onChange={(v) => setForm({ ...form, pct: v })} />
        <Field
          label="مبلغ ثابت"
          value={form.fixedFee}
          onChange={(v) => setForm({ ...form, fixedFee: v })}
        />
        <Field
          label="حد أدنى"
          value={form.minFee}
          onChange={(v) => setForm({ ...form, minFee: v })}
          note="فارغ = بلا حدّ"
        />
        <Field
          label="حد أقصى"
          value={form.maxFee}
          onChange={(v) => setForm({ ...form, maxFee: v })}
          note="فارغ = بلا حدّ"
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-5">
        <Button size="sm" disabled={pending} onClick={run}>
          {pending ? 'جارٍ…' : 'احسب'}
        </Button>

        {result === null ? null : (
          <span className="flex items-baseline gap-2.5">
            <span className="text-2xs opacity-55">العمولة المحسوبة</span>
            <span className="font-num text-xl font-bold">{toArabicDigits(result)}</span>
            <span className="text-2xs opacity-55">ريال</span>
          </span>
        )}

        {error === null ? null : <span className="text-2xs text-danger">{error}</span>}
      </div>

      <p className="mt-4 text-3xs opacity-55">
        المحاكاة لا تكتب شيئًا — والتطبيق على باقة يحتاج موافقة عضوين.
      </p>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  note,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  note?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-3xs font-bold opacity-60">{label}</span>
      {/* رقمٌ يُقارن خانةً بخانة — لاتينيّ معزول */}
      <input
        dir="ltr"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-line bg-surface px-3 py-2 text-start font-num text-2xs"
      />
      {note === undefined ? null : <span className="text-3xs opacity-40">{note}</span>}
    </label>
  );
}
