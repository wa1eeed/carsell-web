'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Picker } from '@/components/ui/Picker';
import { Toast } from '@/components/ui/Toast';
import {
  useVehicleCatalog,
  VehicleFields,
  VehicleProgress,
  type BrandOption,
} from '@/components/site/VehicleFields';

const field =
  'w-full rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-ink';

/**
 * ═══ `D2b` — المعرضُ يُدخل مركبةً إلى مخزونه ═══
 *
 * قِيس ٢٠٢٦-١١-٢٦: **لا بابَ في اللوحة يضيف مركبة**. نصُّ الجدول
 * الفارغ يقول «أضف مركبة ليبدأ حساب الكلفة والهامش» ولا زرَّ تحته.
 *
 * **والاستمارةُ `VehicleFields` نفسُها** التي يملؤها الفرد — لا نسخةٌ
 * ثانية: شلّالُ الماركة والطراز والفئة، والموروثُ من الفئة، وتطبيعُ
 * اللوحة، وخياراتُ المواصفة المشتقّة من الكتالوج. ونسختان لاستمارةٍ
 * واحدة تتباعدان أوّلَ حقلٍ يُضاف إلى إحداهما — وقد كلّف ذلك هذا
 * المستودعَ مرارًا.
 *
 * **وتنتهي بـ«أضفها للمخزون» لا بالنشر**: المخزونُ قبل العرض
 * (`ADR 0003`)، والعرضُ على كارز قرارٌ ثانٍ من خيارات المركبة.
 */
export function AddVehicleForm({
  brands,
  cities,
  branches,
  fixedBranch,
}: {
  brands: readonly BrandOption[];
  cities: readonly string[];
  branches: readonly { id: string; name: string; city: string }[];
  /** فرعُ البائع — يُثبَّت ولا يُختار. */
  fixedBranch: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const catalog = useVehicleCatalog();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [branchId, setBranchId] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');

  const submit = (): void => {
    start(async () => {
      const v = catalog.vehicle;
      const response = await fetch('/api/v1/dealer/vehicles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brandId: v.brandId,
          modelId: v.modelId,
          trimId: v.trimId,
          year: Number(v.year),
          mileageKm: Number(v.mileageKm),
          transmission: v.transmission,
          fuel: v.fuel,
          spec: v.spec,
          condition: v.condition,
          city: v.city,
          colorExterior: v.colorExterior,
          vin: v.vin.trim() === '' ? null : v.vin.trim(),
          plateLetters: v.plateLetters === '' ? null : v.plateLetters,
          plateNumbers: v.plateNumbers === '' ? null : v.plateNumbers,
          branchId: fixedBranch?.id ?? (branchId === '' ? null : branchId),
          purchasePrice: purchasePrice.trim() === '' ? null : Number(purchasePrice),
        }),
      }).catch(() => null);

      const body = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(body?.error?.messageAr ?? 'تعذر إدخال المركبة.');
        return;
      }
      /** **والوجهةُ المخزونُ لا الاستمارة** — فيرى صفَّه وقد دخل. */
      router.push('/dealer/inventory');
      router.refresh();
    });
  };

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <VehicleProgress catalog={catalog} />

      <VehicleFields catalog={catalog} brands={brands} cities={cities} locale="ar" />

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-1 text-sm font-bold">الفرع وكلفة الشراء</h2>
        <p className="mb-3.5 text-3xs leading-loose opacity-70">
          من كلفة الشراء يبدأ حساب الهامش — وتضيف إليها النقل والفحص والتجهيز من
          صفحة المركبة.
        </p>
        <div className="flex flex-col gap-3.5">
          {fixedBranch !== null ? (
            <p className="text-2xs opacity-70">
              تدخل في فرع <b>{fixedBranch.name}</b> — وهو فرعك.
            </p>
          ) : branches.length === 0 ? null : (
            <Labelled label="الفرع">
              <Picker
                id="branch"
                value={branchId}
                onChange={setBranchId}
                options={branches.map((row) => ({
                  value: row.id,
                  label: row.name,
                  sub: row.city,
                }))}
                placeholder="بلا فرع"
              />
            </Labelled>
          )}

          <Labelled label="سعر الشراء بالريال" hint="اتركه فارغا إن لم يتحدد بعد">
            <input
              dir="ltr"
              inputMode="numeric"
              value={purchasePrice}
              onChange={(event) => setPurchasePrice(event.target.value)}
              placeholder="85000"
              className={`${field} font-num bidi-ltr`}
            />
          </Labelled>
        </div>
      </section>

      <div className="flex gap-2.5">
        <Button disabled={!catalog.ready || pending} onClick={submit}>
          {pending ? 'يضيف…' : 'أضفها للمخزون'}
        </Button>
        <Button variant="outline" onClick={() => router.push('/dealer/inventory')}>
          رجوع
        </Button>
      </div>

      {toast === null ? null : <Toast title={toast} />}
    </div>
  );
}

function Labelled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-3xs opacity-70">{label}</span>
      {children}
      {hint === undefined ? null : <span className="text-3xs opacity-65">{hint}</span>}
    </label>
  );
}
