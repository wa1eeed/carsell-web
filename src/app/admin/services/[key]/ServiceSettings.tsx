'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { toLatinDigits } from '@/lib/arabic';
import { PROVIDER_TYPE_LABEL } from '@/lib/labels/providers';
import { SERVICE_CATEGORY } from '@/lib/labels/services';

/**
 * ═══ ما لم تكن تبلغه شاشة ═══
 *
 * `includesAr`/`includesEn` تزرعهما البذرة ويقرؤهما المشتري قبل زرّ
 * الدفع — **ولا شاشةَ تكتبهما**، فبندٌ واحد يحتاج نشرًا. و`providerType`
 * قاعدةُ طابور المدينة، و`adminFeeMode` و`category` كانا يُختاران عند
 * الإنشاء وحده: من أنشأ خدمةً برسمٍ ثابت لا يستطيع جعله نسبةً أبدًا.
 */
const PROVIDER_TYPES = Object.keys(PROVIDER_TYPE_LABEL);
const CATEGORIES = Object.keys(SERVICE_CATEGORY);

export function ServiceSettings({
  serviceKey,
  includesAr,
  includesEn,
  providerType,
  adminFeeMode,
  category,
  price,
  adminFee,
  adminFeeEnabled,
  canEdit,
}: {
  serviceKey: string;
  includesAr: readonly string[];
  includesEn: readonly string[];
  providerType: string | null;
  adminFeeMode: 'FIXED' | 'PERCENT';
  category: string;
  price: string;
  adminFee: string;
  adminFeeEnabled: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const [ar, setAr] = useState(includesAr.join('\n'));
  const [en, setEn] = useState(includesEn.join('\n'));
  const [type, setType] = useState(providerType ?? '');
  const [mode, setMode] = useState(adminFeeMode);
  const [group, setGroup] = useState(category);

  const lines = (text: string): string[] =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

  /**
   * **والرقمُ يُرى أثرُه قبل حفظه**: «نسبة» و«ثابت» كلمتان، و«٦٨ ريالًا
   * على خدمةٍ بـ٤٥٠» رقمٌ يقرؤه من يكتب — فلا يكتشف أثرَه بعد أن يراه
   * كلُّ مشترٍ.
   */
  const feeNow =
    !adminFeeEnabled
      ? null
      : mode === 'PERCENT'
        ? (Number(price) * Number(adminFee)) / 100
        : Number(adminFee);

  const save = (): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/services/${encodeURIComponent(serviceKey)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          includesAr: lines(ar),
          includesEn: lines(en),
          providerType: type === '' ? null : type,
          adminFeeMode: mode,
          category: group,
        }),
      }).catch(() => null);

      if (response === null || !response.ok) {
        const payload = (await response?.json().catch(() => null)) as
          | { error?: { messageAr?: string } }
          | null;
        setToast(payload?.error?.messageAr ?? 'تعذر الحفظ.');
        return;
      }
      setToast('حفظ. ما تشمله الخدمة يظهر للمشتري قبل الدفع.');
      router.refresh();
    });
  };

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-3.5 flex items-baseline gap-2.5">
        <h2 className="text-sm font-bold">ما تشمله الخدمة وقواعدها</h2>
        <span className="text-3xs opacity-65">بند في كل سطر</span>
      </div>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-bold opacity-70">البنود — عربي</span>
          <textarea
            dir="rtl"
            rows={5}
            value={ar}
            disabled={!canEdit}
            onChange={(event) => setAr(event.target.value)}
            className="w-full min-w-0 rounded-md border border-line bg-bg px-3.5 py-2.5 text-2xs leading-loose"
          />
          <span className="text-3xs opacity-65">
            يراها المشتري قبل زر الدفع — <Quantity unit="items" count={lines(ar).length} />
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-bold opacity-70">البنود — إنجليزي</span>
          <textarea
            dir="ltr"
            rows={5}
            value={en}
            disabled={!canEdit}
            onChange={(event) => setEn(event.target.value)}
            className="bidi-ltr w-full min-w-0 rounded-md border border-line bg-bg px-3.5 py-2.5 text-2xs leading-loose"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-bold opacity-70">صنف من يؤديها</span>
            <select
              value={type}
              disabled={!canEdit}
              onChange={(event) => setType(event.target.value)}
              className="w-full min-w-0 rounded-md border border-line bg-bg px-3.5 py-2.5 text-2xs"
            >
              <option value="">بلا صنف</option>
              {PROVIDER_TYPES.map((value) => (
                <option key={value} value={value}>
                  {PROVIDER_TYPE_LABEL[value as keyof typeof PROVIDER_TYPE_LABEL]}
                </option>
              ))}
            </select>
            <span className="text-3xs opacity-65">به يجمع طابور مدينة المركبة</span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-bold opacity-70">المجموعة</span>
            <select
              value={group}
              disabled={!canEdit}
              onChange={(event) => setGroup(event.target.value)}
              className="w-full min-w-0 rounded-md border border-line bg-bg px-3.5 py-2.5 text-2xs"
            >
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {SERVICE_CATEGORY[value]}
                </option>
              ))}
            </select>
            <span className="text-3xs opacity-65">موضعها في دليل الخدمات</span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-bold opacity-70">وضع الرسم الإداري</span>
            <select
              value={mode}
              disabled={!canEdit}
              onChange={(event) => setMode(event.target.value === 'PERCENT' ? 'PERCENT' : 'FIXED')}
              className="w-full min-w-0 rounded-md border border-line bg-bg px-3.5 py-2.5 text-2xs"
            >
              <option value="FIXED">مبلغ ثابت</option>
              <option value="PERCENT">نسبة من السعر</option>
            </select>
            <span className="text-3xs opacity-65">
              {!adminFeeEnabled ? (
                'الرسم معطل — يفعل من جدول الخدمات'
              ) : (
                <>
                  يضاف <Money amount={feeNow ?? 0} size="sm" decimals={2} /> على سعر{' '}
                  <Money amount={Number(toLatinDigits(price))} size="sm" />
                </>
              )}
            </span>
          </label>
        </div>

        {!canEdit ? (
          <p className="text-2xs opacity-65">لا تملك صلاحية تعديل الخدمات.</p>
        ) : (
          <div className="flex justify-end">
            <Button size="sm" disabled={busy} onClick={save}>
              {busy ? 'جاري…' : 'احفظ'}
            </Button>
          </div>
        )}
      </div>

      {toast === null ? null : <Toast title={toast} />}
    </section>
  );
}
