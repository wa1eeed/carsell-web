'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { toArabicDigits, toLatinDigits } from '@/lib/arabic';
import type { AuctionSettings } from '@/lib/domain/admin-auction-settings';

/**
 * ═══ A32 — إعدادات المزادات ═══
 *
 * **التعديل لا يمسّ مزادًا جاريًا**: القواعد تُنسَخ لقطةً في كل مزاد
 * وقت إنشائه، فمزايدٌ بدأ على عربونٍ بخمسة آلاف لا يُطالَب بعشرة في
 * منتصف المزاد. والسطر مكتوبٌ في الشاشة لا في تعليقٍ يقرؤه مبرمج.
 *
 * ═══ وأربعة حقولٍ موسومةٌ بالنصاب ═══
 *
 * قيمة العربون · مهلة السداد · إخفاء الاحتياطي. لأن كلًّا منها يمسّ
 * مالًا محجوزًا لدى الناس أو سرًّا وعدنا بحفظه.
 */

const DURATIONS = [1, 3, 7, 14, 30];

export function AuctionSettingsForm({
  settings,
  canEdit,
}: {
  settings: AuctionSettings;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({
    maxExtensions: String(settings.maxExtensions),
    defaultDeposit: settings.defaultDeposit,
    minIncrement: settings.minIncrement,
    winnerPaymentHours: String(settings.winnerPaymentHours),
    hideReserve: settings.hideReserve,
    buyNowBeforeReserve: settings.buyNowBeforeReserve,
    durationsDays: settings.durationsDays,
  });

  const num = (raw: string): number => {
    const value = Number(toLatinDigits(raw).replace(/[^\d.]/g, ''));
    return Number.isFinite(value) ? value : 0;
  };

  const save = (): void => {
    start(async () => {
      const response = await fetch('/api/v1/admin/auction-settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          maxExtensions: Math.round(num(form.maxExtensions)),
          defaultDeposit: num(form.defaultDeposit),
          minIncrement: num(form.minIncrement),
          winnerPaymentHours: Math.round(num(form.winnerPaymentHours)),
          hideReserve: form.hideReserve,
          buyNowBeforeReserve: form.buyNowBeforeReserve,
          durationsDays: form.durationsDays,
        }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر الحفظ.');
        return;
      }

      setToast('حُفظت — وتسري على المزادات الجديدة وحدها.');
      router.refresh();
    });
  };

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-4 text-sm font-bold">التوقيت</h2>

          <Readonly
            label="التمديد عند مزايدة أخيرة"
            value={`دقائق (${toArabicDigits(String(Math.round(settings.extendBySeconds / 60)))})`}
            note="يُضبط من المهل الزمنية"
          />
          <Readonly
            label="نافذة التمديد"
            value={`ثوانٍ (${toArabicDigits(String(settings.extendWindowSeconds))})`}
            note="آخر ما قبل الإغلاق"
          />
          <Field
            label="أقصى عدد تمديدات"
            value={form.maxExtensions}
            disabled={!canEdit}
            onChange={(v) => setForm({ ...form, maxExtensions: v })}
          />

          <p className="mt-4 mb-2 text-2xs font-bold opacity-60">المدد المتاحة للبائع</p>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((days) => {
              const on = form.durationsDays.includes(days);
              return (
                <button
                  key={days}
                  type="button"
                  disabled={!canEdit}
                  onClick={() =>
                    setForm({
                      ...form,
                      durationsDays: on
                        ? form.durationsDays.filter((d) => d !== days)
                        : [...form.durationsDays, days].sort((a, b) => a - b),
                    })
                  }
                  className={`rounded-full border px-4 py-1.5 text-2xs ${
                    on ? 'border-ink bg-ink text-bg' : 'border-line hover:border-ink'
                  }`}
                >
                  أيّام ({toArabicDigits(String(days))})
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-4 flex items-center gap-2.5 text-sm font-bold">
            العربون والمزايدة
            <Badge tone="warn">يحتاج موافقة شخصين</Badge>
          </h2>

          <Field
            label="العربون"
            value={form.defaultDeposit}
            disabled={!canEdit}
            onChange={(v) => setForm({ ...form, defaultDeposit: v })}
            note="الموصى به ٣–٥٪ من الاحتياطي"
          />
          <Field
            label="أقلّ فرق بين مزايدتين"
            value={form.minIncrement}
            disabled={!canEdit}
            onChange={(v) => setForm({ ...form, minIncrement: v })}
          />
          <Field
            label="مهلة سداد الفائز — بالساعات"
            value={form.winnerPaymentHours}
            disabled={!canEdit}
            onChange={(v) => setForm({ ...form, winnerPaymentHours: v })}
            note="وعند عدم السداد يُصادَر العربون"
          />
        </section>

        <section className="rounded-lg border border-line bg-surface p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-bold">الاحتياطي</h2>

          <Toggle
            label="إخفاء السعر الاحتياطيّ عن المشترين"
            note="تظهر الحالة «بُلغ / لم يُبلغ» بلا المبلغ"
            checked={form.hideReserve}
            disabled={!canEdit}
            onChange={(v) => setForm({ ...form, hideReserve: v })}
          />
          <Toggle
            label="السماح بـ«اشترِ الآن» قبل بلوغ الاحتياطي"
            note="ويختفي تلقائيًّا عند بلوغه"
            checked={form.buyNowBeforeReserve}
            disabled={!canEdit}
            onChange={(v) => setForm({ ...form, buyNowBeforeReserve: v })}
          />
          <Readonly
            label="مهلة قرار البائع دون الاحتياطي"
            value={`ساعات (${toArabicDigits(String(settings.sellerDecisionHours))})`}
            note="بعدها يُغلق وتُرَدّ العرابين — من المهل الزمنية"
          />
        </section>
      </div>

      {/*
        **السطر الذي يمنع سوء الفهم**: من يعدّل عربونًا يظنّ أنه يمسّ
        مزادًا جاريًا، فيتردّد أو يفعلها ويخشى أثرها.
      */}
      <p className="mt-6 max-w-2xl rounded-lg border border-line bg-surface p-4 text-2xs leading-loose opacity-70">
        <b>التعديل لا يمسّ مزادًا جاريًا.</b> القواعد تُنسَخ لقطةً في كل مزاد وقت إنشائه
        — فمزايدٌ بدأ على قاعدة لا تتغيّر عليه في منتصف المزاد. والتغيير يسري على
        الجديد وحده، ويُسجَّل في سجل التدقيق باسم من فعله.
      </p>

      {canEdit ? (
        <Button className="mt-5" disabled={pending} onClick={save}>
          {pending ? 'جارٍ…' : 'احفظ'}
        </Button>
      ) : null}

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  note,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  note?: string;
}) {
  return (
    <label className="mb-3.5 flex flex-col gap-1.5">
      <span className="text-2xs font-bold opacity-60">{label}</span>
      {/* رقمٌ يُقارن خانةً بخانة — لاتينيّ معزول */}
      <input
        dir="ltr"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-start font-num text-sm disabled:opacity-40"
      />
      {note === undefined ? null : <span className="text-3xs opacity-45">{note}</span>}
    </label>
  );
}

function Readonly({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="mb-3.5 flex flex-col gap-1">
      <span className="text-2xs font-bold opacity-60">{label}</span>
      <span className="rounded-md border border-line border-dashed px-3.5 py-2.5 text-sm opacity-70">
        {value}
      </span>
      <span className="text-3xs opacity-45">{note}</span>
    </div>
  );
}

function Toggle({
  label,
  note,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  note: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className="mb-3.5 flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-accent"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-2xs font-semibold">{label}</span>
        <span className="text-3xs opacity-50">{note}</span>
      </span>
    </label>
  );
}
