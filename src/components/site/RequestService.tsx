'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Button, LinkButton } from '@/components/ui/Button';
import { SERVICE_SHORT } from '@/lib/labels/services';
import { formatNumber } from '@/lib/arabic';
import { Toast } from '@/components/ui/Toast';
import type { TemplateField } from '@/lib/domain/service-template';

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
  fields = [],
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
  /**
   * حقولُ القالب التي يملؤها العميل — و`[]` لخدمةٍ بلا قالب.
   *
   * **وما يُسعِّر منها يرفع المبلغ قبل الدفع** (قرار المالك)، والحسابُ
   * في الخادم: الشاشةُ تسأل `/quote` ولا تجمع بنفسها.
   */
  fields?: readonly TemplateField[];
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

  /**
   * ═══ إجاباتُ القالب — ومختومةٌ بقائمة حقوله ═══
   *
   * نسخةٌ تُؤخذ مرّةً تتقادم حين تتبدّل الخدمة في المسار نفسِه
   * (`/services/[key]`): فمن فتح خدمةً ثمّ أخرى يرسل إجاباتِ الأولى.
   * وهي القاعدةُ المكتوبة في هذا الملفّ نفسِه عن المركبة.
   */
  const fieldKey = fields.map((item) => item.key).join('|');
  const [answerState, setAnswerState] = useState<{ key: string; values: Record<string, string> }>({
    key: fieldKey,
    values: {},
  });
  const answers = answerState.key === fieldKey ? answerState.values : {};
  const setAnswer = (key: string, value: string): void =>
    setAnswerState({ key: fieldKey, values: { ...answers, [key]: value } });

  /**
   * ═══ والسعرُ من الخادم لا من جمعٍ هنا ═══
   *
   * قرارُ المالك أنّ حقولَ السعر تحسبه قبل الدفع، **والحسابُ في
   * الخادم**: نسخةٌ هنا للعرض تتباعد أوّلَ تعديل، فتقول الشاشةُ رقمًا
   * ويُحصّل الخادمُ آخر. فيُسأل `/quote` عند كلّ تغيير.
   */
  const [quote, setQuote] = useState<{ total: string; extra: string } | null>(null);
  const [missing, setMissing] = useState<Record<string, string>>({});

  useEffect(() => {
    if (fields.length === 0) return;
    const timer = setTimeout(() => {
      void fetch(`/api/v1/services/${serviceKey}/quote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
        .then(async (response) => {
          const body = (await response.json().catch(() => null)) as
            | { data?: { ready?: boolean; total?: string; extra?: string; fields?: Record<string, string> } }
            | null;
          if (body?.data?.ready === true && typeof body.data.total === 'string') {
            setQuote({ total: body.data.total, extra: body.data.extra ?? '0.00' });
            setMissing({});
            return;
          }
          /** **والناقصُ يُعرض تحت حقله** — لا «أكمل البيانات» فوق الاستمارة. */
          setQuote(null);
          setMissing(body?.data?.fields ?? {});
        })
        .catch(() => undefined);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceKey, fields.length, JSON.stringify(answers)]);

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
          ...(fields.length === 0 ? {} : { answers }),
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
          ═══ حقولُ قالب الخدمة — ما تسأل عنه هذه الخدمة بعينها ═══

          خدمةُ شحنٍ تسأل المسافة، وتأمينٌ يسأل التغطية — **وما يحمل
          زيادةً يرفع المبلغ قبل الدفع**، والمبلغُ على الزرّ يتبعه.
        */}
        {fields.map((item) => (
          <label key={item.key} className="flex flex-col gap-1.5">
            <span className="text-3xs font-bold opacity-70">
              {item.labelAr}
              {item.required ? ' *' : ''}
            </span>

            {item.kind === 'SELECT' ? (
              <select
                value={answers[item.key] ?? ''}
                onChange={(event) => setAnswer(item.key, event.target.value)}
                className="rounded-md border border-line bg-bg px-3 py-2 text-sm"
              >
                <option value="">اختر</option>
                {item.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.labelAr}
                  </option>
                ))}
              </select>
            ) : item.kind === 'CHECKBOX' ? (
              <span className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={answers[item.key] === 'true'}
                  onChange={(event) => setAnswer(item.key, event.target.checked ? 'true' : '')}
                />
                نعم
              </span>
            ) : item.kind === 'NOTE' ? (
              <textarea
                rows={3}
                value={answers[item.key] ?? ''}
                onChange={(event) => setAnswer(item.key, event.target.value)}
                className="rounded-md border border-line bg-bg px-3 py-2 text-sm"
              />
            ) : (
              <input
                /** **واللاتينيُّ والرقمُ يُعزلان** — يُقارنان خانةً بخانة. */
                dir={item.kind === 'TEXT' ? 'auto' : 'ltr'}
                type={item.kind === 'DATE' ? 'date' : 'text'}
                inputMode={
                  item.kind === 'NUMBER' || item.kind === 'MONEY' ? 'decimal' : undefined
                }
                value={answers[item.key] ?? ''}
                onChange={(event) => setAnswer(item.key, event.target.value)}
                className="w-full rounded-md border border-line bg-bg px-3 py-2 text-start text-sm"
              />
            )}

            {missing[item.key] === undefined ? (
              item.hintAr === null ? null : (
                <span className="text-3xs leading-loose opacity-65">{item.hintAr}</span>
              )
            ) : (
              <span className="text-3xs leading-loose text-danger">
                {missing[item.key] === 'REQUIRED'
                  ? 'هذا الحقل مطلوب لإتمام الطلب.'
                  : missing[item.key] === 'NOT_A_NUMBER'
                    ? 'اكتب رقما.'
                    : 'اختر من القائمة.'}
              </span>
            )}
          </label>
        ))}

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
          {/* والاسمُ القصير — لا اسمُ التسويق داخل فعلٍ يُضغط عليه مال */}
          <span>{pending ? 'جاري…' : `ادفع واطلب ${SERVICE_SHORT[serviceKey] ?? serviceName}`}</span>
          {/*
            **والمبلغُ يتبع الإجابات**: من اختار خيارًا يزيد يرى الزيادة
            على الزرّ قبل أن يضغطه — لا بعد أن يُخصم.
          */}
          {pending ? null : (
            <span className="font-num text-3xs opacity-75">
              {quote === null ? total : formatNumber(Number(quote.total), 'ar', { decimals: 2 })} ر.س
            </span>
          )}
        </span>
      </Button>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
