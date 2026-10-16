'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';

/**
 * ═══ A31 — حملةٌ جديدة ═══
 *
 * **ولم يكن لها باب.** `AdCampaign` مقروءٌ في أربعة مواضع — منها
 * إيرادُ الإعلانات في شاشة المالية — ولا شيء يكتبه. فجدولٌ فارغ
 * يُقرأ «لا حملات الآن» وصوابُه «لا سبيل إلى حملة».
 *
 * ═══ والإبداع رابطٌ لا رفع ═══
 *
 * الحقل في المخطّط `creativeUrl`، وخدمةُ التخزين مؤجَّلة بقرار المالك.
 * فالمعلن يُعطينا رابطَ صورته — ورفعٌ يُبنى على خدمةٍ لم تصل يُنتج
 * زرًّا يسقط صامتًا.
 */

type Slot = { key: string; nameAr: string; pricingModel: string; active: boolean };

const EMPTY = {
  advertiserName: '',
  slotKey: '',
  creativeUrl: '',
  targetUrl: '',
  startsAt: '',
  endsAt: '',
  budget: '',
  city: '',
};

export function NewCampaign({ slots }: { slots: readonly Slot[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = (patch: Partial<typeof EMPTY>): void => setDraft({ ...draft, ...patch });

  const submit = (): void => {
    start(async () => {
      const response = await fetch('/api/v1/admin/ads/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          advertiserName: draft.advertiserName.trim(),
          slotKey: draft.slotKey,
          creativeUrl: draft.creativeUrl.trim(),
          targetUrl: draft.targetUrl.trim(),
          // الحقل يوم، والنافذة تبدأ أوّله وتنتهي آخر اليوم المختار
          startsAt: `${draft.startsAt}T00:00:00.000Z`,
          endsAt: `${draft.endsAt}T23:59:59.000Z`,
          budget: draft.budget.trim(),
          ...(draft.city.trim() === '' ? {} : { city: draft.city.trim() }),
        }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر إنشاء الحملة.');
        return;
      }

      setOpen(false);
      setDraft(EMPTY);
      setToast('أُنشئت الحملة.');
      router.refresh();
    });
  };

  const ready =
    draft.advertiserName.trim() !== ''
    && draft.slotKey !== ''
    && draft.creativeUrl.trim() !== ''
    && draft.targetUrl.trim() !== ''
    && draft.startsAt !== ''
    && draft.endsAt !== ''
    && draft.budget.trim() !== '';

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        حملة جديدة
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="حملة جديدة"
        footer={
          <div className="flex items-center gap-2">
            <Button onClick={submit} disabled={!ready || pending}>
              {pending ? 'يُنشأ…' : 'أنشئ الحملة'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 p-5">
          <Field label="اسم المعلن">
            <input
              value={draft.advertiserName}
              onChange={(event) => set({ advertiserName: event.target.value })}
              className="rounded-md border border-line bg-bg px-3.5 py-2 text-sm"
            />
          </Field>

          <Field label="المساحة">
            <select
              value={draft.slotKey}
              onChange={(event) => set({ slotKey: event.target.value })}
              className="rounded-md border border-line bg-bg px-3.5 py-2 text-sm"
            >
              <option value="">اختر مساحة</option>
              {/* والمعطّلة لا تُعرض — اختيارُها يردّ خطأً بعد الملء */}
              {slots
                .filter((slot) => slot.active)
                .map((slot) => (
                  <option key={slot.key} value={slot.key}>
                    {slot.nameAr}
                  </option>
                ))}
            </select>
          </Field>

          {/* الروابط تُلصق من مصدرٍ لاتينيّ وتُقارن خانةً بخانة */}
          <Field label="رابط الإبداع — صورة">
            <input
              dir="ltr"
              value={draft.creativeUrl}
              onChange={(event) => set({ creativeUrl: event.target.value })}
              placeholder="https://…"
              className="font-num rounded-md border border-line bg-bg px-3.5 py-2 text-sm"
            />
          </Field>

          <Field label="وجهة النقر">
            <input
              dir="ltr"
              value={draft.targetUrl}
              onChange={(event) => set({ targetUrl: event.target.value })}
              placeholder="https://…"
              className="font-num rounded-md border border-line bg-bg px-3.5 py-2 text-sm"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="تبدأ">
              <input
                type="date"
                dir="ltr"
                value={draft.startsAt}
                onChange={(event) => set({ startsAt: event.target.value })}
                className="font-num rounded-md border border-line bg-bg px-3.5 py-2 text-sm"
              />
            </Field>
            <Field label="تنتهي">
              <input
                type="date"
                dir="ltr"
                value={draft.endsAt}
                onChange={(event) => set({ endsAt: event.target.value })}
                className="font-num rounded-md border border-line bg-bg px-3.5 py-2 text-sm"
              />
            </Field>
          </div>

          <Field label="الميزانية — ريال">
            <input
              dir="ltr"
              inputMode="decimal"
              value={draft.budget}
              onChange={(event) => set({ budget: event.target.value })}
              className="font-num rounded-md border border-line bg-bg px-3.5 py-2 text-sm font-bold"
            />
          </Field>

          {/*
            **والاستهداف يُضيِّق ولا يُوسِّع.** حملةٌ بلا مدينة تُعرض
            للكلّ، وحملةٌ للرياض لا تُعرض لمن يبحث في جدة **ولا لمن لم
            يختر مدينة** — عرضُها حينئذٍ بيعُ استهدافٍ لم يقع.
          */}
          <Field label="مدينة الاستهداف — اتركها فارغة للكلّ">
            <input
              value={draft.city}
              onChange={(event) => set({ city: event.target.value })}
              placeholder="الرياض"
              className="rounded-md border border-line bg-bg px-3.5 py-2 text-sm"
            />
          </Field>
        </div>
      </Sheet>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-2xs font-bold opacity-70">{label}</span>
      {children}
    </label>
  );
}
