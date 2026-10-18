'use client';

import type { BodyType, FuelType } from '@/generated/prisma/enums';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Button } from '@/components/ui/Button';
import { Quantity } from '@/components/ui/Quantity';
import { SpecRow } from '@/components/ui/StatCard';
import { Toast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';

const BODY = {
  SEDAN: 'سيدان', SUV: 'دفع رباعي', CROSSOVER: 'كروس أوفر', PICKUP: 'وانيت',
  HATCHBACK: 'هاتشباك', COUPE: 'كوبيه', CONVERTIBLE: 'مكشوفة', VAN: 'فان',
} as const satisfies Record<BodyType, string>;
const TRANS = { AUTOMATIC: 'أوتوماتيك', MANUAL: 'عادي', CVT: 'CVT', DCT: 'DCT' } as const;
const FUEL = {
  PETROL: 'بنزين', DIESEL: 'ديزل', HYBRID: 'هايبرد',
  PLUGIN_HYBRID: 'هجين قابل للشحن', ELECTRIC: 'كهرباء',
} as const satisfies Record<FuelType, string>;
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
  yearFrom: number | null;
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
  inSellForm,
  selected,
  canEdit,
}: {
  trim: Trim;
  path: { brand: string; model: string; brandId: string; modelId: string };
  vehicleCount: number;
  features: readonly { key: string; nameAr: string; group: keyof typeof GROUP }[];
  /** هل تُعرض هذه الميزة في استمارة البائع — وحالُها من الكتالوج. */
  inSellForm: Readonly<Record<string, boolean>>;
  selected: readonly string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Trim>(trim);
  const [keys, setKeys] = useState<string[]>([...selected]);
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * ═══ زرُّ + — الميزةُ تُضاف وتُسمّى من هنا ═══
   *
   * **وكان المحرّر يُعلّم من قائمةٍ ثابتة وحدها**: ميزةٌ لا توجد في
   * الكتالوج لا سبيل إلى إضافتها إلّا بمغادرة الشاشة إلى
   * `/admin/catalog/features` والعودة. (طلب المالك ٢٠٢٦-١٠-١٨.)
   *
   * **والمُنشَأةُ هنا تدخل الكتالوج كلَّه** لا هذه الفئةَ وحدها —
   * `Feature.key` مفتاحٌ عامّ تشترك فيه كلُّ الفئات. فيُقال ذلك في
   * الشاشة، لا يُكتشف بعد أن تظهر الميزةُ عند كلّ بائع.
   */
  const [adding, setAdding] = useState<{
    nameAr: string;
    nameEn: string;
    group: keyof typeof GROUP;
  } | null>(null);

  async function createFeature(): Promise<void> {
    if (adding === null) return;
    /** المفتاحُ يُشتقّ من الاسم الإنجليزيّ — ولا يُطلب من المشغّل. */
    const key = adding.nameEn
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);
    if (key === '' || adding.nameAr.trim() === '') {
      setToast({ tone: 'error', text: 'الاسمان مطلوبان، والإنجليزي بحروف لاتينية.' });
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/v1/admin/features', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          key,
          nameAr: adding.nameAr.trim(),
          nameEn: adding.nameEn.trim(),
          group: adding.group,
          /** تُضاف ظاهرةً في المحرّر وفي استمارة البائع وصفحة السيارة. */
          placements: ['trim_editor', 'sell_form', 'listing_page'],
        }),
      });
      if (!response.ok) {
        const json = (await response.json()) as { error?: { messageAr: string } };
        setToast({ tone: 'error', text: json.error?.messageAr ?? 'تعذرت إضافة الميزة.' });
        return;
      }
      /** **وتُعلَّم لهذه الفئة فورًا** — من أضافها أرادها هنا. */
      setKeys((was) => [...new Set([...was, key])]);
      setAdding(null);
      setToast({ tone: 'success', text: 'أضفت الميزة وعلمتها لهذه الفئة. احفظ لتثبت.' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

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
        setToast({ tone: 'error', text: json.error?.messageAr ?? 'تعذر الحفظ.' });
        return;
      }
      setToast({ tone: 'success', text: 'حفظت الفئة.' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const field =
    'w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-base outline-none focus:border-accent';
  const label = 'flex flex-col gap-1.5 text-2xs font-semibold opacity-70';

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-end gap-4 rounded-lg border border-line bg-surface p-4.5">
        <div>
          <h2 className="text-xl font-bold">
            {path.model} {trim.nameEn} — محرر الفئة
          </h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs opacity-70">
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-line bg-surface p-5.5">
          <h3 className="mb-3.5 text-3xs font-bold tracking-[0.14em] opacity-65">الهوية</h3>
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
                  value={draft.yearFrom ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      yearFrom: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  className={cn(field, 'font-num')}
                  placeholder="اختيارية"
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
          <h3 className="mb-1 text-3xs font-bold tracking-[0.14em] opacity-65">
            قيم موروثة
          </h3>
          <p className="mb-3.5 text-xs opacity-70">تملأ تلقائيا ولا يعبئها البائع</p>

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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-line bg-surface p-5.5 lg:col-span-2">
          <h3 className="mb-3.5 text-3xs font-bold tracking-[0.14em] opacity-65">
            المميزات الافتراضية للفئة
          </h3>
          {/*
            **والعنوانُ وعدٌ، فيقول ما يفعله التعليم.** كان يُقرأ
            «المميزات التي تظهر للبائع»، وهو خطأ: ما يظهر في
            الاستمارة يقرّره الكتالوج بموضع `sell_form` مرّةً،
            وهذه ترجيحٌ — تصل مُعلَّمةً ويشطب البائع ما ليس عنده.
          */}
          <p className="mb-3.5 text-xs leading-relaxed opacity-70">
            ما تعلمه هنا يصل البائع <b>معلما مسبقا</b> في استمارته، ويشطب ما ليس في
            سيارته. وظهور الميزة نفسها في الاستمارة يقرره موضع «استمارة البائع» في{' '}
            <Link href="/admin/catalog/features" className="underline underline-offset-4">
              صفحة المميزات
            </Link>
            .
          </p>
          {(Object.keys(GROUP) as (keyof typeof GROUP)[]).map((group) => {
            const inGroup = features.filter((f) => f.group === group);
            if (inGroup.length === 0) return null;
            return (
              <div key={group} className="mb-3.5 last:mb-0">
                <p className="mb-2 text-2xs opacity-65">{GROUP[group]}</p>
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
                      {/*
                        **وميزةٌ لا يسأل عنها البائعُ تُقال**: تعليمُها
                        هنا بلا أثرٍ في الاستمارة، ومن علّمها ينتظر
                        ظهورًا لا يقع.
                      */}
                      {inSellForm[f.key] === true ? null : (
                        <span className="text-3xs opacity-65">(لا تظهر في الاستمارة)</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}

          {/*
            ═══ زرُّ + ═══

            **ولا يُخفى أثرُه.** الميزةُ المُنشَأة تدخل الكتالوج كلَّه
            — `Feature.key` مفتاحٌ عامّ — فتظهر لكلّ فئة ولكلّ بائع.
            وقولُ ذلك هنا أرخص من اكتشافه بعد أن تظهر عند الجميع.
          */}
          {!canEdit ? null : adding === null ? (
            <Button
              size="sm"
              variant="ghost"
              className="mt-4"
              onClick={() => setAdding({ nameAr: '', nameEn: '', group: 'COMFORT' })}
            >
              + أضف ميزة
            </Button>
          ) : (
            <div className="mt-4 rounded-lg border border-line bg-bg p-4">
              <p className="mb-3 text-2xs leading-relaxed opacity-70">
                تضاف إلى كتالوج المميزات كله — فتظهر لكل فئة ولكل بائع، لا لهذه الفئة
                وحدها.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className={label}>
                  الاسم بالعربي
                  <input
                    value={adding.nameAr}
                    onChange={(e) => setAdding({ ...adding, nameAr: e.target.value })}
                    className={field}
                    placeholder="مقاعد خلفية مدفأة"
                  />
                </label>
                <label className={label}>
                  الاسم بالإنجليزي
                  <input
                    value={adding.nameEn}
                    onChange={(e) => setAdding({ ...adding, nameEn: e.target.value })}
                    className={cn(field, 'bidi-ltr')}
                    placeholder="Heated rear seats"
                  />
                </label>
                <label className={label}>
                  المجموعة
                  <select
                    value={adding.group}
                    onChange={(e) =>
                      setAdding({ ...adding, group: e.target.value as keyof typeof GROUP })
                    }
                    className={cn(field, 'text-sm')}
                  >
                    {(Object.keys(GROUP) as (keyof typeof GROUP)[]).map((g) => (
                      <option key={g} value={g}>
                        {GROUP[g]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3.5 flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => void createFeature()}>
                  أضفها
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>
                  إلغاء
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-line bg-surface p-5.5">
          <h3 className="mb-1 text-3xs font-bold tracking-[0.14em] opacity-65">
            قيم يدخلها البائع
          </h3>
          <p className="mb-3 text-xs opacity-70">لا تحرر هنا</p>
          <ul className="flex flex-col gap-2 text-sm opacity-72">
            {SELLER_FIELDS.map((f) => (
              <li key={f}>· {f}</li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface p-5.5">
          <h3 className="mb-3.5 text-3xs font-bold tracking-[0.14em] opacity-65">
            معاينة — ما يراه البائع
          </h3>
          <p className="mb-2.5 text-xs opacity-65">الخطوة 2 — بيانات المركبة</p>
          <SpecRow label="نوع الهيكل">{BODY[draft.bodyType]}</SpecRow>
          <SpecRow label="ناقل الحركة">{TRANS[draft.transmission]}</SpecRow>
          <SpecRow label="الوقود">{FUEL[draft.fuel]}</SpecRow>
          <SpecRow label="نظام الدفع">{DRIVE[draft.drivetrain]}</SpecRow>
          <SpecRow label="عدد المقاعد">
            <ArabicNumber value={draft.seats} />
          </SpecRow>
          <SpecRow label="الممشى">
            <span className="opacity-65">يكتبه البائع</span>
          </SpecRow>
        </section>

        <div className="flex flex-col gap-4">
          <p className="rounded-lg bg-warn-100 p-4.5 text-sm leading-loose text-warn-900">
            تعديل قيمة موروثة <strong>لا يغير الإعلانات المنشورة</strong> — القيم
            تنسخ لقطة في الإعلان وقت النشر. التعديل يسري على الإعلانات الجديدة
            وحدها، ويسجل في سجل التدقيق.
          </p>
          <p className="rounded-lg border border-line bg-bg p-4.5 text-sm leading-loose opacity-72">
            <strong>الاستثناء المسموح:</strong> يمكن للبائع تجاوز قيمة موروثة واحدة
            بسبب مكتوب (مثل ناقل مستبدل)، ويظهر الإعلان بوسم «قيمة معدلة» للمشتري.
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
