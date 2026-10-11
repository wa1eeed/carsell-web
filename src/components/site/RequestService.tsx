'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';

/**
 * ═══ طلبُ خدمة — وكان لا مدخل له ═══
 *
 * صفحة الخدمة كانت تقول «تُطلب من صفحة المركبة»، وصفحةُ المركبة لا
 * زرّ فيها، وصفحةُ «تقاريري» تقول «اطلب تقريرًا» وتربط إلى صفحة
 * الخدمة. **دائرةٌ مغلقة بلا مدخل** — وخطُّ إيرادٍ كامل لا يدخله ريال.
 *
 * والتصميم يضع الطلب **هنا**: المركبة والموقع والموعد ثم الدفع.
 *
 * ═══ ولمن لا مركبة له ═══
 *
 * استمارةٌ بقائمةٍ فارغة تُحيّر: يقرأ «اختر مركبتك» ولا يجد ما يختاره،
 * ولا تقول له لماذا. فيُقال صراحةً، ويُفتح الباب الذي يُستوفى منه.
 */
export function RequestService({
  serviceKey,
  vehicles,
  cities,
  total,
  addVehicleHref,
}: {
  serviceKey: string;
  vehicles: readonly { id: string; title: string }[];
  cities: readonly string[];
  /** الإجماليّ شامل الضريبة — نصًّا كما تعرضه البطاقة فوقها. */
  total: string;
  addVehicleHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? '');
  const [city, setCity] = useState(cities[0] ?? '');
  const [when, setWhen] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  if (vehicles.length === 0) {
    return (
      <>
        <p className="mb-3 text-2xs leading-loose opacity-65">
          لا مركبة في حسابك بعد — والخدمة تُطلب لمركبةٍ بعينها، فموعدُها
          وموقعُها يتبعانها.
        </p>
        <Link href={addVehicleHref}>
          <Button className="w-full">أضِف مركبتك</Button>
        </Link>
      </>
    );
  }

  const submit = (): void => {
    start(async () => {
      const response = await fetch(`/api/v1/services/${serviceKey}/request`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          /** يمنع حجزًا مزدوجًا حين تُعيد الشبكة الطلب بلا علم المستخدم. */
          'idempotency-key': `svc-${serviceKey}-${vehicleId}-${String(Date.now())}`,
        },
        body: JSON.stringify({
          vehicleId,
          city,
          scheduledAt: when === '' ? null : new Date(when).toISOString(),
          method: 'mada',
          returnUrl: window.location.href,
        }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { data?: { ref: string }; error?: { messageAr?: string; actionUrl?: string } }
        | null;

      if (response === null || !response.ok) {
        /** تحدّي البطاقة حالٌ متوقَّعة لا عطل — فيُذهب إليه لا يُخبَر عنه. */
        const action = payload?.error?.actionUrl;
        if (typeof action === 'string' && action !== '') {
          window.location.href = action;
          return;
        }
        setToast(payload?.error?.messageAr ?? 'تعذّر إرسال الطلب.');
        return;
      }

      setToast(`طلبك ${payload?.data?.ref ?? ''} وصل المزوّد — وتتابعه من «تقاريري».`);
      router.refresh();
    });
  };

  return (
    <>
      <div className="mb-3.5 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-3xs font-bold opacity-60">المركبة</span>
          <select
            value={vehicleId}
            onChange={(event) => setVehicleId(event.target.value)}
            className="rounded-md border border-line bg-bg px-3 py-2 text-sm"
          >
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.title}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-3xs font-bold opacity-60">الموقع</span>
          <select
            value={city}
            onChange={(event) => setCity(event.target.value)}
            className="rounded-md border border-line bg-bg px-3 py-2 text-sm"
          >
            {cities.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-3xs font-bold opacity-60">الموعد (اختياري)</span>
          {/* الموعد يُقارن خانةً بخانة — لاتينيّ معزول */}
          <input
            dir="ltr"
            type="datetime-local"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
            /*
              **و`w-0 flex-1` تصلح في صفٍّ لا في عمود.** نسختُها من
              إصلاح خانات الرمز — وهناك الحاوية أفقيّة فالعرض يأتي من
              القسمة. وهنا `flex-col`، فـ`flex-1` تمسّ الارتفاع و`w-0`
              تبقى عرضًا صفرًا: **فانكمش الحقل إلى نقطة.**
            */
            className="w-full rounded-md border border-line bg-bg px-3 py-2 text-start font-num text-sm"
          />
          <span className="text-3xs leading-loose opacity-45">
            اتركه فارغًا ليحدّده المزوّد في أقرب موعدٍ ضمن مهلته.
          </span>
        </label>
      </div>

      {/*
        **والمبلغ على الزرّ لا فوقه وحده.** من يضغط «ادفع» يجب أن يرى
        كم يدفع في اللحظة نفسها — لا أن يرفع بصره إلى بطاقةٍ قرأها قبل
        دقيقة.
      */}
      <Button className="w-full" disabled={pending} onClick={submit}>
        {/*
          **والصيغة لا يحكمها المعدود**: «٥١٧٫٥٠ ريالًا» تُصيب حالةً من
          ستّ، و«(٥١٧٫٥٠ ر.س)» تصحّ في كلّها. وهي الصيغة نفسها التي
          أُصلحت في رسائل الـToast.
        */}
        {pending ? 'جارٍ…' : `ادفع واطلب الخدمة (${total} ر.س)`}
      </Button>

      <p className="mt-2.5 text-3xs leading-loose opacity-55">
        يُحجز المبلغ على بطاقتك الآن، ولا يصل المزوّد قبل أن يُنجز الخدمة.
      </p>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
