'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Button } from '@/components/ui/Button';
import { Quantity } from '@/components/ui/Quantity';
import { SpecRow } from '@/components/ui/StatCard';
import { Toast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';

const BODY = { SEDAN: 'سيدان', SUV: 'دفع رباعي', PICKUP: 'وانيت', HATCHBACK: 'هاتشباك', COUPE: 'كوبيه', VAN: 'فان' } as const;
const TRANS = { AUTOMATIC: 'أوتوماتيك', MANUAL: 'عادي', CVT: 'CVT', DCT: 'DCT' } as const;
const FUEL = { PETROL: 'بنزين', DIESEL: 'ديزل', HYBRID: 'هايبرد', ELECTRIC: 'كهرباء' } as const;
const DRIVE = { FWD: 'أمامي FWD', RWD: 'خلفي RWD', AWD: 'رباعي دائم AWD', FOUR_WD: 'رباعي 4WD' } as const;
const GROUP = { SAFETY: 'الأمان', COMFORT: 'الراحة', TECH: 'التقنية' } as const;

/** ما يدخله البائع بنفسه — يُعرض هنا ليُعرف الفرق، ولا يُحرَّر. */
const SELLER_FIELDS = [
  'الممشى',
  'اللون الخارجي',
  'اللون الداخلي',
  'سنة الصنع',
  'المواصفات (سعودي/خليجي/وارد وكيل)',
  'حالة الصبغ',
] as const;

type Trim = {
  id: string;
  nameAr: string;
  nameEn: string;
  yearFrom: number;
  yearTo: number | null;
  bodyType: keyof typeof BODY;
  transmission: keyof typeof TRANS;
  fuel: keyof typeof FUEL;
  drivetrain: keyof typeof DRIVE;
  seats: number;
  doors: number;
  engineL: string | null;
  cylinders: number | null;
  horsepower: number | null;
};

export function TrimEditor({
  trim,
  path,
  vehicleCount,
  features,
  selected,
  canEdit,
}: {
  trim: Trim;
  path: { brand: string; model: string; brandId: string; modelId: string };
  vehicleCount: number;
  features: readonly { key: string; nameAr: string; group: keyof typeof GROUP }[];
  selected: readonly string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Trim>(trim);
  const [keys, setKeys] = useState<string[]>([...selected]);
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(): Promise<void> {
    setBusy(true);
    try {
      const responses = await Promise.all([
        fetch(`/api/v1/admin/trims/${trim.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(draft),
        }),
        fetch(`/api/v1/admin/trims/${trim.id}/features`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ keys }),
        }),
      ]);
      const failed = responses.find((r) => !r.ok);
      if (failed !== undefined) {
        const json = (await failed.json()) as { error?: { messageAr: string } };
        setToast({ tone: 'error', text: json.error?.messageAr ?? 'تعذّر الحفظ.' });
        return;
      }
      setToast({ tone: 'success', text: 'حُفظت الفئة.' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const field =
    'w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-base outline-none focus:border-accent';
  const label = 'flex flex-col gap-1.5 text-2xs font-semibold opacity-55';

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-end gap-4 rounded-lg border border-line bg-surface p-4.5">
        <div>
          <h2 className="text-xl font-bold">
            {path.model} {trim.nameEn} — محرّر الفئة
          </h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs opacity-55">
            <span className="bidi-isolate">
              {path.brand} ← {path.model} ← {trim.nameEn}
            </span>
            <span aria-hidden className="opacity-40">·</span>
            <Quantity unit="listings" count={vehicleCount} />
          </p>
        </div>
        <span className="flex-1" />
        <Button variant="ghost" onClick={() => router.back()}>إلغاء</Button>
        {canEdit ? (
          <Button disabled={busy} onClick={() => void save()}>احفظ</Button>
        ) : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-line bg-surface p-5.5">
          <h3 className="mb-3.5 text-3xs font-bold tracking-[0.14em] opacity-45">الهوية</h3>
          <div className="flex flex-col gap-3.5">
            <label className={label}>
              اسم الفئة (عربي)
              <input
                value={draft.nameAr}
                onChange={(e) => setDraft({ ...draft, nameAr: e.target.value })}
                className={field}
              />
            </label>
            <label className={label}>
              اسم الفئة (إنجليزي)
              <input
                dir="ltr"
                value={draft.nameEn}
                onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })}
                className={cn(field, 'bidi-ltr')}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={label}>
                من سنة
                <input
                  type="number"
                  value={draft.yearFrom}
                  onChange={(e) => setDraft({ ...draft, yearFrom: Number(e.target.value) })}
                  className={cn(field, 'font-num')}
                />
              </label>
              <label className={label}>
                إلى سنة
                <input
                  type="number"
                  value={draft.yearTo ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      yearTo: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  className={cn(field, 'font-num')}
                />
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-line bg-surface p-5.5 lg:col-span-2">
          <h3 className="mb-1 text-3xs font-bold tracking-[0.14em] opacity-45">
            قيَم موروثة
          </h3>
          <p className="mb-3.5 text-xs opacity-55">تُملأ تلقائيًا ولا يعبّئها البائع</p>

          <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3">
            {(
              [
                ['bodyType', 'نوع الهيكل', BODY],
                ['transmission', 'ناقل الحركة', TRANS],
                ['fuel', 'الوقود', FUEL],
                ['drivetrain', 'نظام الدفع', DRIVE],
              ] as const
            ).map(([key, title, options]) => (
              <label key={key} className={label}>
                {title}
                <select
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value } as Trim)}
                  className={cn(field, 'text-sm')}
                >
                  {Object.entries(options).map(([value, text]) => (
                    <option key={value} value={value}>{text}</option>
                  ))}
                </select>
              </label>
            ))}

            {(
              [
                ['seats', 'عدد المقاعد'],
                ['doors', 'عدد الأبواب'],
                ['cylinders', 'عدد السلندرات'],
                ['horsepower', 'القوة (حصان)'],
              ] as const
            ).map(([key, title]) => (
              <label key={key} className={label}>
                {title}
                <input
                  type="number"
                  value={draft[key] ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [key]: e.target.value === '' ? null : Number(e.target.value),
                    } as Trim)
                  }
                  className={cn(field, 'font-num')}
                />
              </label>
            ))}

            <label className={label}>
              سعة المحرك (لتر)
              <input
                value={draft.engineL ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, engineL: e.target.value === '' ? null : e.target.value })
                }
                className={cn(field, 'font-num')}
              />
            </label>
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-line bg-surface p-5.5 lg:col-span-2">
          <h3 className="mb-3.5 text-3xs font-bold tracking-[0.14em] opacity-45">
            المميّزات الافتراضية للفئة
          </h3>
          {(Object.keys(GROUP) as (keyof typeof GROUP)[]).map((group) => {
            const inGroup = features.filter((f) => f.group === group);
            if (inGroup.length === 0) return null;
            return (
              <div key={group} className="mb-3.5 last:mb-0">
                <p className="mb-2 text-2xs opacity-45">{GROUP[group]}</p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {inGroup.map((f) => (
                    <label key={f.key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={keys.includes(f.key)}
                        onChange={(e) =>
                          setKeys(
                            e.target.checked
                              ? [...keys, f.key]
                              : keys.filter((k) => k !== f.key),
                          )
                        }
                        className="size-4 accent-[var(--color-accent)]"
                      />
                      {f.nameAr}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        <section className="rounded-lg border border-line bg-surface p-5.5">
          <h3 className="mb-1 text-3xs font-bold tracking-[0.14em] opacity-45">
            قيَم يدخلها البائع
          </h3>
          <p className="mb-3 text-xs opacity-55">لا تُحرَّر هنا</p>
          <ul className="flex flex-col gap-2 text-sm opacity-72">
            {SELLER_FIELDS.map((f) => (
              <li key={f}>· {f}</li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface p-5.5">
          <h3 className="mb-3.5 text-3xs font-bold tracking-[0.14em] opacity-45">
            معاينة — ما يراه البائع
          </h3>
          <p className="mb-2.5 text-xs opacity-45">الخطوة ٢ — بيانات المركبة</p>
          <SpecRow label="نوع الهيكل">{BODY[draft.bodyType]}</SpecRow>
          <SpecRow label="ناقل الحركة">{TRANS[draft.transmission]}</SpecRow>
          <SpecRow label="الوقود">{FUEL[draft.fuel]}</SpecRow>
          <SpecRow label="نظام الدفع">{DRIVE[draft.drivetrain]}</SpecRow>
          <SpecRow label="عدد المقاعد">
            <ArabicNumber value={draft.seats} />
          </SpecRow>
          <SpecRow label="الممشى">
            <span className="opacity-45">يكتبه البائع</span>
          </SpecRow>
        </section>

        <div className="flex flex-col gap-4">
          <p className="rounded-lg bg-warn-100 p-4.5 text-sm leading-loose text-warn-900">
            تعديل قيمة موروثة <strong>لا يغيّر الإعلانات المنشورة</strong> — القيَم
            تُنسخ لقطةً في الإعلان وقت النشر. التعديل يسري على الإعلانات الجديدة
            وحدها، ويُسجَّل في سجل التدقيق.
          </p>
          <p className="rounded-lg border border-line bg-bg p-4.5 text-sm leading-loose opacity-72">
            <strong>الاستثناء المسموح:</strong> يمكن للبائع تجاوز قيمة موروثة واحدة
            بسبب مكتوب (مثل ناقل مستبدل)، ويظهر الإعلان بوسم «قيمة معدّلة» للمشتري.
          </p>
        </div>
      </div>

      {toast === null ? null : (
        <div className="fixed bottom-6 end-6 z-50">
          <Toast tone={toast.tone} title={toast.text} />
        </div>
      )}
    </div>
  );
}
