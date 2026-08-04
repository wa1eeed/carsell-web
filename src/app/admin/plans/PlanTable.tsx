'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { toArabicDigits, toLatinDigits } from '@/lib/arabic';
import type { EntitlementRow, PlanRow } from '@/lib/domain/admin-plans';
import { ENTITLEMENT_LABEL, TYPE_LABEL, pctLabel, saleOptions } from './labels';

/**
 * ═══ A29 — الباقات ═══
 *
 * **تعديل الباقة تعديلُ قيَمها لا سلوكها.** فما في المحرّر هو ما في
 * `PlanEntitlement`: سعرٌ وظهورٌ وقيمةٌ لكل خاصّية — ولا مفتاح جديد،
 * لأن كل مفتاح بابٌ يفتحه الكود باسمه.
 */

export function PlanTable({
  plans,
  entitlements,
  canEdit,
}: {
  plans: readonly PlanRow[];
  entitlements: readonly EntitlementRow[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<PlanRow | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-3xl border-collapse text-2xs">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="p-3 text-start font-bold">الباقة</th>
              <th className="p-3 text-start font-bold">السعر</th>
              <th className="p-3 text-start font-bold">خيارات البيع</th>
              <th className="p-3 text-start font-bold">حد الإعلانات</th>
              <th className="p-3 text-start font-bold">مقاعد الفريق</th>
              <th className="p-3 text-start font-bold">العمولة</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => {
              const value = (key: string): string =>
                plan.entitlements.find((row) => row.key === key)?.value ?? '';
              const listings = value('max_active_listings');
              const seats = value('team_seats');

              return (
                <tr key={plan.id} className="border-b border-line last:border-0">
                  <td className="p-3">
                    <span className="flex items-center gap-2.5">
                      <span className="font-bold">{plan.nameAr}</span>
                      {plan.key === 'free' ? <Badge tone="neutral">افتراضية</Badge> : null}
                      {plan.visible ? null : <Badge tone="warn">مخفيّة</Badge>}
                    </span>
                  </td>
                  <td className="p-3">
                    {Number(plan.price) === 0 ? (
                      <span className="opacity-70">مجانًا</span>
                    ) : (
                      <span className="font-num">
                        {toArabicDigits(plan.price)} ريال /{' '}
                        {plan.billingCycle === 'yearly' ? 'سنة' : 'شهر'}
                      </span>
                    )}
                  </td>
                  <td className="p-3 opacity-75">{saleOptions(plan.entitlements)}</td>
                  <td className="font-num p-3 opacity-75">
                    {/* ‏−١ = بلا حدّ. ورقمٌ سالبٌ معروضًا يُقرأ عطلًا. */}
                    {listings === '-1' ? 'بلا حد' : toArabicDigits(listings)}
                  </td>
                  <td className="font-num p-3 opacity-75">{toArabicDigits(seats)}</td>
                  <td className="font-num p-3 opacity-75">
                    {toArabicDigits(pctLabel(value('commission_pct')))}٪
                  </td>
                  <td className="p-3 text-end">
                    {canEdit ? (
                      <Button size="sm" variant="outline" onClick={() => setEditing(plan)}>
                        تعديل
                      </Button>
                    ) : (
                      <span className="text-3xs opacity-40">قراءة</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing === null ? null : (
        <PlanEditor
          plan={editing}
          entitlements={entitlements}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function PlanEditor({
  plan,
  entitlements,
  onClose,
}: {
  plan: PlanRow;
  entitlements: readonly EntitlementRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [price, setPrice] = useState(plan.price);
  const [visible, setVisible] = useState(plan.visible);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      entitlements.map((row) => [
        row.key,
        plan.entitlements.find((e) => e.key === row.key)?.value ?? row.defaultValue,
      ]),
    ),
  );

  const save = (): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          price: Number(toLatinDigits(price).replace(/[^\d.]/g, '')),
          visible,
          entitlements: values,
        }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر الحفظ.');
        return;
      }

      setToast('حُفظت الباقة — ولا تمسّ طلبًا قائمًا.');
      router.refresh();
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-6">
      <div className="w-full max-w-lg rounded-lg border border-line bg-bg p-6">
        <h3 className="mb-1 text-md font-bold">{plan.nameAr}</h3>
        <p className="mb-5 text-3xs opacity-55">
          مشتركون ({toArabicDigits(String(plan.subscriberCount))}) — والتعديل لا يمسّ اشتراكًا
          قائمًا حتى تجديده.
        </p>

        <label className="mb-4 flex flex-col gap-1.5">
          <span className="text-2xs font-bold opacity-60">السعر بالريال</span>
          {/* رقمٌ يُقارن خانةً بخانة — لاتينيّ معزول */}
          <input
            dir="ltr"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-start font-num text-sm"
          />
        </label>

        <label className="mb-5 flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={visible}
            onChange={(event) => setVisible(event.target.checked)}
            className="size-4 accent-accent"
          />
          <span className="text-2xs font-semibold">تظهر للعملاء</span>
        </label>

        <p className="mb-3 text-2xs font-bold opacity-60">الخصائص</p>
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {entitlements.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-4 py-2.5">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-2xs">{ENTITLEMENT_LABEL[row.key] ?? row.key}</span>
                <span dir="ltr" className="font-num truncate text-3xs opacity-40">
                  {row.key} · {TYPE_LABEL[row.type] ?? row.type}
                </span>
              </span>

              {row.type === 'bool' ? (
                <input
                  type="checkbox"
                  checked={values[row.key] === 'true'}
                  onChange={(event) =>
                    setValues({ ...values, [row.key]: event.target.checked ? 'true' : 'false' })
                  }
                  className="size-4 shrink-0 accent-accent"
                />
              ) : (
                <input
                  dir="ltr"
                  inputMode="decimal"
                  value={values[row.key] ?? ''}
                  onChange={(event) =>
                    setValues({ ...values, [row.key]: toLatinDigits(event.target.value) })
                  }
                  className="w-24 shrink-0 rounded-md border border-line bg-surface px-2.5 py-1.5 text-start font-num text-2xs"
                />
              )}
            </div>
          ))}
        </div>

        <p className="mt-3 text-3xs opacity-45">
          العدد ‎-1‎ يعني بلا حدّ. والنسبة بين صفر ومئة.
        </p>

        <div className="mt-6 flex gap-3">
          <Button disabled={pending} onClick={save}>
            {pending ? 'جارٍ…' : 'احفظ'}
          </Button>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </div>

      {toast === null ? null : <Toast title={toast} />}
    </div>
  );
}
