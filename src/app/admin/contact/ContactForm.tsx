'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import type { ContactChannels } from '@/lib/domain/admin-contact';

/**
 * ═══ استمارة قنوات الدعم ═══
 *
 * ثلاثة حقول، وأهمّ ما فيها **المعاينة**: ما تكتبه هنا يظهر لكل زائر،
 * فيُعرض شكلُه قبل الحفظ لا بعده.
 *
 * والحقل يقبل كل صيغة لصق — `+966 50 …` و`0501234567` و`٠٥٠…` —
 * ويطبّعها الخادم ويعيد الصيغة المحفوظة، فتعرضها الشاشة. **فما تراه
 * بعد الحفظ هو المخزَّن لا ما كتبتَه.**
 */

type Form = { supportEmail: string; supportPhone: string; supportWhatsapp: string };

export function ContactForm({
  channels,
  canEdit,
}: {
  channels: ContactChannels;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({
    supportEmail: channels.supportEmail ?? '',
    supportPhone: channels.supportPhone ?? '',
    supportWhatsapp: channels.supportWhatsapp ?? '',
  });

  const save = (): void => {
    start(async () => {
      const response = await fetch('/api/v1/admin/contact', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { data?: { saved?: ContactChannels }; error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر الحفظ.');
        return;
      }

      /** الصيغة المحفوظة تعود فتُعرض — فالتطبيع مرئيّ لا خفيّ. */
      const saved = payload?.data?.saved;
      if (saved !== undefined) {
        setForm({
          supportEmail: saved.supportEmail ?? '',
          supportPhone: saved.supportPhone ?? '',
          supportWhatsapp: saved.supportWhatsapp ?? '',
        });
      }

      setToast('تم الحفظ — وظهرت في صفحة «تواصل معنا» فورًا.');
      router.refresh();
    });
  };

  const live = [
    { label: 'واتساب', value: form.supportWhatsapp },
    { label: 'هاتف', value: form.supportPhone },
    { label: 'بريد', value: form.supportEmail },
  ].filter((row) => row.value.trim() !== '');

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-4 text-sm font-bold">القنوات</h2>

          <Field
            label="البريد الرسمي"
            value={form.supportEmail}
            placeholder="info@carz.sa"
            disabled={!canEdit}
            onChange={(v) => setForm({ ...form, supportEmail: v })}
            note="يُفتح بزرّ «بريد» في صفحة التواصل"
          />
          <Field
            label="هاتف الدعم"
            value={form.supportPhone}
            placeholder="05XXXXXXXX"
            disabled={!canEdit}
            onChange={(v) => setForm({ ...form, supportPhone: v })}
            note="الصق الرقم بأي صيغة — نحوّله إلى +966 تلقائيًا"
          />
          <Field
            label="واتساب الدعم"
            value={form.supportWhatsapp}
            placeholder="05XXXXXXXX"
            disabled={!canEdit}
            onChange={(v) => setForm({ ...form, supportWhatsapp: v })}
            note="يُفتح على wa.me — فالصيغة الخاطئة رابط مكسور"
          />
        </section>

        {/*
          ═══ المعاينة ═══

          ما يُكتب هنا يراه كل زائر. **ومن لا يرى الأثر قبل الحفظ يحفظ
          ثم يفتح الصفحة في تبويب آخر ليتأكّد** — والمعاينة تكفيه.
        */}
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-1 text-sm font-bold">كما سيراها الزائر</h2>
          <p className="mb-4 text-3xs opacity-45">معاينة مباشرة قبل الحفظ</p>

          {live.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line p-4 text-2xs leading-loose opacity-55">
              قنوات التواصل غير مضبوطة بعد.
              <br />
              <b className="opacity-80">وهذا ما يراه الزائر الآن.</b>
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {live.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-4 rounded-lg border border-line p-3.5"
                >
                  <span className="text-2xs font-bold">{row.label}</span>
                  {/* الرقم والبريد يُنسخان ويُقارنان خانةً بخانة */}
                  <span dir="ltr" className="font-num text-3xs opacity-70">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <p className="mt-6 max-w-2xl rounded-lg border border-line bg-surface p-4 text-2xs leading-loose opacity-70">
        <b>لا استمارة في صفحة التواصل.</b> صندوق رسائل بلا من يقرؤه أسوأ من رقم
        ظاهر — يَعِد بردّ لا يأتي. والبلاغ على إعلان بعينه له زرّه في صفحة
        الإعلان، ويصلنا معه مرجعه.
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
  placeholder,
  note,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  placeholder: string;
  note: string;
}) {
  return (
    <label className="mb-3.5 flex flex-col gap-1.5">
      <span className="text-2xs font-bold opacity-60">{label}</span>
      {/* يُنسخ من مصدر لاتيني ويُقارن خانةً بخانة — معزول يسارًا */}
      <input
        dir="ltr"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-start font-num text-sm disabled:opacity-40"
      />
      <span className="text-3xs opacity-45">{note}</span>
    </label>
  );
}
