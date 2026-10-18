'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button, LinkButton } from '@/components/ui/Button';
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
  serviceName,
  vehicles,
  initialVehicleId,
  cities,
  total,
  addVehicleHref,
}: {
  serviceKey: string;
  vehicles: readonly { id: string; title: string }[];
  /**
   * المركبة المختارة سلفًا — تصل من صفحة المركبة حين يفتح صاحبُها
   * خدمةً من بنرها. **ولا تُوثق بها**: إن لم تكن في قائمته سقطت إلى
   * الأولى، فمعرّفٌ ملفَّق في العنوان لا يختار له مركبةَ غيره.
   */
  initialVehicleId?: string | undefined;
  cities: readonly string[];
  /** اسمُ الخدمة — يُكتب في الزرّ، فمن يضغط يعرف ما يشتري. */
  serviceName: string;
  /** الإجماليّ شامل الضريبة — نصًّا كما تعرضه البطاقة فوقها. */
  total: string;
  addVehicleHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  /**
   * ═══ الاختيارُ يُشتقّ من القائمة لا يُنسخ منها مرّة ═══
   *
   * `useState(vehicles[0]?.id)` يُقرأ عند التركيب وحده، وصفحتا خدمتين
   * من المسار نفسه (`/services/[key]`) لا تُعيدان تركيب المكوّن — فمن
   * فتح الخدمة من مركبةٍ ثم فتحها من أخرى **يطلب الفحص للأولى**،
   * والشاشة تُظهر اسم الأولى ولا شيء يقول إنه ليس ما قصد.
   *
   * فيُحفظ الاختيار مختومًا بالقائمة، ويسقط إلى افتراضيّها حين تتبدّل.
   */
  const vehicleKey = `${vehicles.map((vehicle) => vehicle.id).join('|')}#${initialVehicleId ?? ''}`;
  const [pickedVehicle, setPickedVehicle] = useState<{ key: string; id: string } | null>(null);
  const vehicleId =
    pickedVehicle !== null && pickedVehicle.key === vehicleKey
      ? pickedVehicle.id
      : vehicles.some((vehicle) => vehicle.id === initialVehicleId)
        ? (initialVehicleId ?? '')
        : (vehicles[0]?.id ?? '');
  const setVehicleId = (id: string): void => setPickedVehicle({ key: vehicleKey, id });

  const cityKey = cities.join('|');
  const [pickedCity, setPickedCity] = useState<{ key: string; city: string } | null>(null);
  const city =
    pickedCity !== null && pickedCity.key === cityKey ? pickedCity.city : (cities[0] ?? '');
  const setCity = (value: string): void => setPickedCity({ key: cityKey, city: value });
  const [when, setWhen] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  if (vehicles.length === 0) {
    return (
      <>
        <p className="mb-3 text-2xs leading-loose opacity-75">
          لا مركبة في حسابك بعد — والخدمة تطلب لمركبة بعينها، فموعدها
          وموقعها يتبعانها.
        </p>
        <LinkButton href={addVehicleHref} className="w-full">
          أضف مركبتك
        </LinkButton>
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
        setToast(payload?.error?.messageAr ?? 'تعذر إرسال الطلب.');
        return;
      }

      setToast(`طلبك ${payload?.data?.ref ?? ''} وصل المزود — وتتابعه من «تقاريري».`);
      router.refresh();
    });
  };

  return (
    <>
      <div className="mb-3.5 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-3xs font-bold opacity-70">المركبة</span>
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

        {/*
          ═══ والموقع والموعد قسمٌ واحد — كما في التصميم ═══

          كانا حقلين متجاورين بلا رابط، والتصميم يجمعهما تحت عنوانٍ
          واحد: هما جوابُ سؤالٍ واحد — **أين يلقاك الفاحص ومتى**.
        */}
        <p className="mt-1 text-3xs font-bold tracking-wider opacity-65">الموقع والموعد</p>

        <label className="flex flex-col gap-1.5">
          <span className="text-3xs font-bold opacity-70">الموقع</span>
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
          <span className="text-3xs font-bold opacity-70">الموعد (اختياري)</span>
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
          <span className="text-3xs leading-loose opacity-65">
            اتركه فارغا ليحدده المزود في أقرب موعد ضمن مهلته.
          </span>
        </label>
      </div>

      {/*
        **والمبلغ على الزرّ لا فوقه وحده.** من يضغط «ادفع» يجب أن يرى
        كم يدفع في اللحظة نفسها — لا أن يرفع بصره إلى بطاقةٍ قرأها قبل
        دقيقة.
      */}
      {/*
        ═══ والمبلغ سطرٌ ثانٍ لا ذيلٌ على الأوّل ═══

        **والمبلغ على الزرّ لا فوقه وحده**: من يضغط «ادفع» يجب أن يرى
        كم يدفع في اللحظة نفسها — لا أن يرفع بصره إلى بطاقةٍ قرأها
        قبل دقيقة.

        واسمُ الخدمة معه في سطرٍ واحد لا يتّسع لـ٣٧٥px: **قِيس فكان
        عرض الصفحة ٤٠٣ على شاشة ٣٧٥**، وتمريرٌ أفقيّ على صفحةٍ كاملة
        من زرٍّ واحد. و`Button` تمنع اللفّ (`whitespace-nowrap`) وهو
        صحيحٌ لزرٍّ من كلمتين، و`cn` تَصِل الأصناف ولا تحلّ تعارضها —
        فلا يُلغى بإضافة `whitespace-normal`.

        فسطران صريحان: الفعل ثمّ المبلغ.
      */}
      <Button className="w-full" disabled={pending} onClick={submit}>
        <span className="flex flex-col items-center gap-0.5 leading-tight">
          <span>{pending ? 'جار…' : `ادفع واطلب ${serviceName}`}</span>
          {pending ? null : <span className="font-num text-3xs opacity-75">{total} ر.س</span>}
        </span>
      </Button>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
