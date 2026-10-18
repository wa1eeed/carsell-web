'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { Sheet } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { ENV_LABEL, PAYMENT_PURPOSE_LABEL, ROUTE_DISABLED_LABEL } from '@/lib/labels/admin';
import type { GatewayChoice, PendingSwitch, RouteRow } from '@/lib/domain/payment-routing';
import type { HoldShortfall } from '@/lib/payments/gateway';

/**
 * A20 — جدول الأغراض ولوح التبديل.
 *
 * **حجم الشهر عمودان** (قرار ٣٥): «مُسوّى هذا الشهر» و«محجوز الآن».
 * ورقمٌ واحد كان يخلطهما — وفي غرضٍ ضمانيّ أكثر المال محجوز لم يُسوَّ،
 * فـ«٢٫٤ مليون» تعني «مرّ عندنا» أو «وصل البائعين» ولا يُعرف أيّهما.
 */
export function RoutesTable({
  routes,
  awaiting,
  adminId,
  canManage,
}: {
  routes: readonly RouteRow[];
  /** طلبات تنتظر العضو الثاني — تُعرض فوق الجدول لا في سجلّ بعيد */
  awaiting: readonly PendingSwitch[];
  /** لأن الطالب لا يوافق على طلبه — والشاشة تقول ذلك قبل الضغط */
  adminId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [target, setTarget] = useState<RouteRow | null>(null);
  const [choices, setChoices] = useState<GatewayChoice[] | null>(null);
  const [chosen, setChosen] = useState<string>('');
  const [reason, setReason] = useState('');

  /**
   * الموافقة الثانية — **ولم يكن لها زرّ ولا مسار.**
   *
   * كانت الشاشة تقول «ينتظر موافقة عضو ثانٍ» ثم لا تعرض المنتظِر ولا
   * تعطي العضو الثاني موضعًا يوافق فيه، فيبقى الطلب حتى ينقضي.
   */
  const approve = (item: PendingSwitch): void => {
    start(async () => {
      const response = await fetch(
        `/api/v1/admin/payments/routes/${item.purpose}/approve`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ requestId: item.id }),
        },
      ).catch(() => null);

      const body = (await response?.json().catch(() => null)) as
        | { data?: { state?: string }; error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(body?.error?.messageAr ?? 'تعذر اعتماد الطلب.');
        return;
      }
      setToast(
        body?.data?.state === 'APPLIED'
          ? 'طبق التبديل — والمعاملات الجارية تبقى على بوابتها.'
          : 'سجلت موافقتك — ما زال ينتظر عضوا آخر.',
      );
      router.refresh();
    });
  };

  /**
   * **المكبح — بلا عضوٍ ثانٍ.**
   *
   * التبديل يحوّل مالًا إلى مزوّدٍ آخر فيحتاج اثنين؛ والتعطيل يمنع
   * الجديد ولا يحوّل شيئًا. واشتراط زميلٍ على المكبح يعني بوابةً
   * معطوبة تبتلع الدفعات حتى يستيقظ — وهو أسوأ ما يقع في عطل.
   */
  const toggle = (route: RouteRow): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/payments/routes/${route.purpose}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !route.enabled }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذر تغيير حالة الغرض.');
        return;
      }

      setToast(route.enabled ? 'عطل الغرض — لا معاملات جديدة عليه.' : 'أعيد تفعيل الغرض.');
      router.refresh();
    });
  };

  const openSwitch = (route: RouteRow): void => {
    setTarget(route);
    setChosen('');
    setReason('');
    setChoices(null);
    start(async () => {
      const response = await fetch(`/api/v1/admin/payments/routes/${route.purpose}/choices`);
      const body = (await response.json()) as { data?: GatewayChoice[] };
      setChoices(body.data ?? []);
    });
  };

  const submit = (): void => {
    if (target === null || chosen === '') return;
    start(async () => {
      const response = await fetch(`/api/v1/admin/payments/routes/${target.purpose}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toGatewayKey: chosen, toEnvironment: target.storedEnv, reason }),
      });
      const body = (await response.json()) as { error?: { code?: string } };
      if (!response.ok) {
        setToast(
          body.error?.code === 'REASON_REQUIRED'
            ? 'اكتب سببا — القرار بلا سببه يعاد نقضه.'
            : body.error?.code === 'NOT_ELIGIBLE'
              ? 'هذه البوابة تنقصها قدرة يحتاجها الغرض.'
              : 'تعذر تسجيل الطلب.',
        );
        return;
      }
      setToast('سجل الطلب — ينتظر موافقة عضو ثان، ولم يتغير التوجيه بعد.');
      setTarget(null);
      router.refresh();
    });
  };

  const selected = choices?.find((choice) => choice.key === chosen);

  return (
    <>
      {awaiting.length === 0 ? null : (
        <div className="mb-4 flex flex-col gap-2.5">
          {awaiting.map((item) => {
            const isRequester = item.requestedBy === adminId;
            return (
              <div
                key={item.id}
                className="rounded-lg border border-warn-200 bg-warn-100 p-3.5 text-2xs text-warn-900"
              >
                <p className="font-bold">
                  تبديل ينتظر الاعتماد — {PAYMENT_PURPOSE_LABEL[item.purpose]}
                </p>
                <p className="mt-1.5 leading-loose opacity-80">
                  إلى <span className="font-bold">{item.toGatewayKey}</span> على{' '}
                  {ENV_LABEL[item.toEnvironment]} · الموافقات{' '}
                  <span className="font-num">
                    <ArabicNumber value={item.approvals} grouped={false} />
                  </span>{' '}
                  من{' '}
                  <span className="font-num">
                    <ArabicNumber value={item.required} grouped={false} />
                  </span>
                </p>
                {/* السبب يُعرض للموافق: من يعتمد بلا سببٍ يعتمد ورقة */}
                <p className="mt-1.5 leading-loose opacity-75">السبب: {item.reason}</p>
                {!canManage ? null : (
                  <Button
                    size="sm"
                    className="mt-3"
                    disabled={pending || isRequester}
                    onClick={() => approve(item)}
                  >
                    {isRequester ? 'طلبته — ينتظر عضوا آخر' : 'اعتمد التبديل'}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[760px] text-2xs">
          <thead className="border-b border-line text-3xs opacity-65">
            <tr>
              <th className="p-3.5 text-start font-bold">الغرض</th>
              <th className="p-3.5 text-start font-bold">البوابة الفعالة</th>
              <th className="p-3.5 text-end font-bold">مسوى هذا الشهر</th>
              <th className="p-3.5 text-end font-bold">محجوز الآن</th>
              <th className="p-3.5 text-start font-bold">البيئة</th>
              <th className="p-3.5 text-start font-bold" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {routes.map((route) => (
              <tr key={route.purpose}>
                <td className="p-3.5">
                  <span className="font-bold">{PAYMENT_PURPOSE_LABEL[route.purpose]}</span>
                  {!route.enabled ? (
                    <span className="block text-3xs opacity-65">معطل — لا معاملات جديدة</span>
                  ) : null}
                  {route.shortfall === null ? null : (
                    /* قِصَر المدّة تحذيرٌ يشرح الأثر ولا يمنع */
                    <span className="mt-1 block text-3xs text-warn">
                      <Shortfall {...route.shortfall} />
                    </span>
                  )}
                </td>
                <td className="p-3.5">{route.gatewayNameAr ?? ROUTE_DISABLED_LABEL}</td>
                <td className="p-3.5 text-end">
                  <Money amount={route.settledThisMonth} />
                </td>
                <td className="p-3.5 text-end">
                  <span className="flex flex-col items-end gap-0.5">
                    <Money amount={route.heldNow} />
                    {route.inFlight === 0 ? null : (
                      <span className="text-3xs opacity-65">
                        <Quantity unit="inFlight" count={route.inFlight} />
                      </span>
                    )}
                  </span>
                </td>
                <td className="p-3.5">
                  <Badge tone={route.activeEnv === 'LIVE' ? 'accent' : 'neutral'}>
                    {ENV_LABEL[route.activeEnv]}
                  </Badge>
                  {route.storedEnv === route.activeEnv ? null : (
                    <span className="mt-1 block text-3xs text-warn">
                      مخزن على {ENV_LABEL[route.storedEnv]} — القيد في الكود
                    </span>
                  )}
                </td>
                <td className="p-3.5">
                  {!canManage ? null : (
                    <span className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => openSwitch(route)}>
                        غير البوابة
                      </Button>
                      {/*
                        **وحجزٌ قائم يمنع التعطيل** — والشاشة تقولها قبل
                        الضغط لا بعده: الحجوزات تُفرَج من بوابتها، وقطعُ
                        الطريق عليها يترك مالًا بلا مسار إفراج.
                      */}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending || (route.enabled && route.inFlight > 0)}
                        onClick={() => toggle(route)}
                      >
                        {route.enabled ? 'عطل' : 'فعل'}
                      </Button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet
        open={target !== null}
        onClose={() => setTarget(null)}
        title={target === null ? '' : `تبديل بوابة — ${PAYMENT_PURPOSE_LABEL[target.purpose]}`}
        className="w-[520px]"
        footer={
          <div className="flex items-center gap-2.5">
            <Button onClick={submit} disabled={pending || chosen === '' || reason.trim().length < 10}>
              اطلب الموافقة الثانية
            </Button>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              إلغاء
            </Button>
          </div>
        }
      >
        {target === null ? null : (
          <div className="flex flex-col gap-4">
            <p className="flex items-baseline gap-2 text-2xs">
              <span className="opacity-70">الحالية</span>
              <span className="font-bold">{target.gatewayNameAr ?? ROUTE_DISABLED_LABEL}</span>
            </p>

            {choices === null ? (
              <p className="text-2xs opacity-65">…</p>
            ) : choices.length === 0 ? (
              <p className="text-2xs opacity-70">
                لا بوابة أخرى تملك القدرات التي يحتاجها هذا الغرض.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-2xs font-bold opacity-70">البوابة الجديدة</span>
                {choices.map((choice) => (
                  <label
                    key={choice.key}
                    className="flex cursor-pointer items-start gap-2.5 rounded-sm border border-line p-3"
                  >
                    <input
                      type="radio"
                      name="gateway"
                      checked={chosen === choice.key}
                      onChange={() => setChosen(choice.key)}
                      className="mt-1"
                    />
                    <span className="flex-1">
                      <span className="block text-xs font-bold">{choice.nameAr}</span>
                      <span className="mt-0.5 block text-3xs opacity-70">
                        أقصى حجز{' '}
                        <Quantity unit="days" count={choice.capabilities.maxHoldDays} /> ·{' '}
                        <span className="font-num">
                          <ArabicNumber value={choice.capabilities.feePct} decimals={2} grouped={false} />٪
                        </span>
                      </span>
                      {choice.shortfall === null ? null : (
                        <span className="mt-1.5 block text-3xs text-warn">
                          <Shortfall {...choice.shortfall} />
                        </span>
                      )}
                    </span>
                  </label>
                ))}
                <p className="text-3xs opacity-65">
                  البوابة التي تنقصها قدرة مطلوبة لا تظهر هنا أصلا.
                </p>
              </div>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-2xs font-bold opacity-70">سبب التبديل</span>
              <textarea
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="ارتفاع الرسوم · تعطل متكرر · انتهاء العقد"
                className="w-full rounded-sm border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-ink/40"
              />
              <span className="text-3xs opacity-70">
                إلزامي — بعد سنة لن يتذكر أحد لماذا، والقرار بلا سببه يعاد نقضه.
              </span>
            </label>

            {selected === undefined ? null : (
              <div className="rounded-sm border border-line p-3 text-3xs leading-relaxed opacity-75">
                المعاملات الجارية تبقى على {target.gatewayNameAr ?? ROUTE_DISABLED_LABEL}، والحجز القائم يفرج عنه من
                حيث أنشئ. والتبديل يسري على الجديد وحده من لحظة تنفيذه.
              </div>
            )}
          </div>
        )}
      </Sheet>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}

/**
 * نصّ التحذير — **يُصاغ هنا لا في النطاق**.
 *
 * الأرقام تمرّ بـ`Quantity` فتصير عربية-هندية بجمعٍ صحيح: «٦ أيام» لا
 * «6 يومًا». والنطاق لا يملك ذلك ولا يجب أن يملكه.
 */
function Shortfall({ maxHoldDays, neededDays }: HoldShortfall) {
  return (
    <>
      أقصى مدة حجز <Quantity unit="days" count={maxHoldDays} />، ومسار الطلب يحتاج{' '}
      <Quantity unit="days" count={neededDays} /> (دفع + سقف نقل + نافذة استرجاع) — فسيتحول
      الحجز إلى تحصيل مبكر قبل أن تنقضي النافذة، وهذا يغير معنى الضمان للمشتري.
    </>
  );
}
