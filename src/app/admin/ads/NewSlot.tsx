'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';

/**
 * ═══ A30 — «أضف مساحة» ═══
 *
 * **ولم يكن لها باب.** الجدول يقلب راية المساحة، ولا شيء يُنشئ واحدة
 * — فالسبعُ المزروعة هي كلُّ ما يملكه المشغّل، ومساحةٌ جديدة تحتاج
 * صفًّا في القاعدة بيد.
 *
 * ═══ والمفتاح `dir="ltr"` ═══
 *
 * لاتينيٌّ يُقرأ في الشيفرة حين يُبنى سطحٌ جديد، ويُقارن خانةً بخانة.
 * وداخل نموذجٍ عربيٍّ تنزلق الشرطةُ السفلية والأرقام إن لم يُعزَل.
 */

const PRICING = [
  { key: 'day', label: 'باليوم' },
  { key: 'week', label: 'بالأسبوع' },
  { key: 'month', label: 'بالشهر' },
  { key: 'cpm', label: 'بالألف ظهور' },
  { key: 'cpc', label: 'بالنقرة' },
] as const;

const EMPTY = {
  key: '',
  nameAr: '',
  sizeLabel: '',
  placement: '',
  pricingModel: 'month',
  basePrice: '',
  maxPerSession: '1',
};

export function NewSlot() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = (patch: Partial<typeof EMPTY>): void => setDraft({ ...draft, ...patch });

  const submit = (): void => {
    start(async () => {
      const response = await fetch('/api/v1/admin/ads/slots', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          key: draft.key.trim().toLowerCase(),
          nameAr: draft.nameAr.trim(),
          sizeLabel: draft.sizeLabel.trim(),
          placement: draft.placement.trim(),
          pricingModel: draft.pricingModel,
          basePrice: draft.basePrice.trim(),
          maxPerSession: Number(draft.maxPerSession),
        }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذر إنشاء المساحة.');
        return;
      }

      setOpen(false);
      setDraft(EMPTY);
      /** **وتُنشأ معطَّلة** — والنصّ يقول ذلك بدل أن يكتشفه من يبحث عنها. */
      setToast('أنشئت المساحة معطلة. فعلها من الجدول حين يصبح لها سطح يعرضها.');
      router.refresh();
    });
  };

  const ready =
    draft.key.trim() !== '' && draft.nameAr.trim() !== '' && draft.basePrice.trim() !== '';

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        أضف مساحة
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="مساحة إعلانية جديدة"
        footer={
          <div className="flex items-center gap-2">
            <Button onClick={submit} disabled={!ready || pending}>
              {pending ? 'تنشأ…' : 'أنشئ المساحة'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 p-5">
          <Field label="المفتاح" hint="لاتيني صغير وأرقام وشرطة سفلية — يقرأ في الشيفرة ولا يتغير">
            <input
              dir="ltr"
              value={draft.key}
              onChange={(event) => set({ key: event.target.value })}
              placeholder="car_detail_banner"
              className="font-num rounded-md border border-line bg-bg px-3.5 py-2 text-sm"
            />
          </Field>

          <Field label="الاسم بالعربية">
            <input
              value={draft.nameAr}
              onChange={(event) => set({ nameAr: event.target.value })}
              className="rounded-md border border-line bg-bg px-3.5 py-2 text-sm"
            />
          </Field>

          <Field label="المقاس كما يقرأ" hint="«16:6» أو «بطاقة سيارة» أو «48px سطر»">
            <input
              value={draft.sizeLabel}
              onChange={(event) => set({ sizeLabel: event.target.value })}
              className="rounded-md border border-line bg-bg px-3.5 py-2 text-sm"
            />
          </Field>

          <Field label="الموضع" hint="أين تظهر — ومساحة بلا موضع تباع لمعلن لا يعرف أين يظهر إعلانه">
            <input
              value={draft.placement}
              onChange={(event) => set({ placement: event.target.value })}
              className="rounded-md border border-line bg-bg px-3.5 py-2 text-sm"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="التسعير">
              <select
                value={draft.pricingModel}
                onChange={(event) => set({ pricingModel: event.target.value })}
                className="rounded-md border border-line bg-bg px-3.5 py-2 text-sm"
              >
                {PRICING.map((row) => (
                  <option key={row.key} value={row.key}>
                    {row.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="السعر بالريال">
              <input
                dir="ltr"
                inputMode="decimal"
                value={draft.basePrice}
                onChange={(event) => set({ basePrice: event.target.value })}
                className="font-num rounded-md border border-line bg-bg px-3.5 py-2 text-sm"
              />
            </Field>
          </div>

          <Field label="السقف في الجلسة" hint="كم مرة تظهر هذه المساحة للزائر الواحد">
            <input
              dir="ltr"
              inputMode="numeric"
              value={draft.maxPerSession}
              onChange={(event) => set({ maxPerSession: event.target.value })}
              className="font-num rounded-md border border-line bg-bg px-3.5 py-2 text-sm"
            />
          </Field>
        </div>
      </Sheet>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-2xs font-bold">{label}</span>
      {children}
      {hint === undefined ? null : <span className="text-3xs opacity-65">{hint}</span>}
    </label>
  );
}
