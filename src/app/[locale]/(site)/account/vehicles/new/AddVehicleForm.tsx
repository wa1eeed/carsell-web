'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import {
  VehicleFields,
  VehiclePlateField,
  useVehicleCatalog,
  vehiclePayload,
  type CatalogOption,
} from '@/components/site/VehicleFields';

/**
 * ═══ أضف سيارة — بلا إعلان ═══
 *
 * **وزرُّ «أضف سيارة» في «سياراتي» كان يقود إلى معالج البيع**: من
 * يملك سيارةً ويريد عليها فحصًا أو تأمينًا يُساق إلى صفحةٍ ترويسُها
 * «بِع سيارتك» وتسأله عن الصور والسعر وطريقة البيع — وهي شروطُ
 * العرض لا شروطُ المِلك.
 *
 * فالشاشةُ هنا تسأل ما يسأله `POST /api/v1/vehicles` وحده، وحقولُها
 * هي حقولُ المعالج نفسها (`VehicleFields`) — لا نسخةٌ منها تتباعد.
 */
export function AddVehicleForm({
  brands,
  cities,
  locale,
}: {
  brands: readonly CatalogOption[];
  cities: readonly string[];
  locale: string;
}) {
  const router = useRouter();
  const catalog = useVehicleCatalog();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = (): void => {
    if (saving || !catalog.ready) return;
    setSaving(true);
    setError(null);

    void (async () => {
      const response = await fetch('/api/v1/vehicles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(vehiclePayload(catalog.vehicle)),
      }).catch(() => null);

      if (response === null) {
        setSaving(false);
        setError('ما قدرنا نحفظ السيارة. تحقق من اتصالك وجرب مرة ثانية.');
        return;
      }

      if (!response.ok) {
        setSaving(false);
        const payload = (await response.json().catch(() => null)) as
          | { error?: { messageAr?: string } }
          | null;
        setError(payload?.error?.messageAr ?? 'ما قدرنا نحفظ السيارة. راجع الحقول وجرب مرة ثانية.');
        return;
      }

      /**
       * **والوجهة تقول إن الحفظ وقع.** معاملٌ يُرسَل ولا يُقرأ صمتٌ
       * بعد نجاح — و«سياراتي» تقرأ `saved` فتُظهر بشارته.
       *
       * والتبويب `garage`: السيارة حُفظت مخفيّةً عن السوق، والقائمة
       * تفتح على «معروضة» افتراضًا — فيصلها صاحبُها ولا يجد ما أضافه.
       */
      /**
       * **ولا `refresh` بعده**: الوجهةُ `force-dynamic` فلا نسخةَ
       * تُحدَّث، و`refresh` يُعيد جلبَ **المسار القائم** فيسابق
       * التحويل — فيبقى الزرّ «نحفظ…» والشاشةُ مكانها بعد نجاحٍ وقع.
       */
      router.push(`/${locale}/account/vehicles?tab=garage&saved=1`);
    })();
  };

  return (
    <div>
      <VehicleFields catalog={catalog} brands={brands} cities={cities} locale={locale} />

      <div className="mt-7 border-t border-line-2 pt-6">
        <VehiclePlateField catalog={catalog} />
        {/*
          **ولا سؤال عن إظهارها**: الإظهار خاصّيةُ الإعلان، ومركبةٌ
          في المرآب لا تُعرض على أحد — فيُسأل عنه عند العرض.
        */}
        <p className="mt-4 text-3xs leading-loose opacity-70">
          اللوحة تبقى خاصة بك. وإذا عرضت السيارة للبيع لاحقا تختار وقتها إظهارها من عدمه.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={!catalog.ready || saving}>
          {saving ? 'نحفظ…' : 'احفظ السيارة'}
        </Button>
        <span className="text-3xs opacity-70">
          تحفظ مخفية عن السوق. تقدر تعرضها للبيع أو تطلب عليها خدمة بعد الحفظ.
        </span>
      </div>

      {error === null ? null : (
        <p role="alert" className="mt-3 text-2xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
