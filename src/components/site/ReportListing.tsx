'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';

/**
 * ═══ الإبلاغ عن إعلان — المسار الذي لا يناديه أحد ═══
 *
 * `POST /api/v1/reports` مبنيّ ومختبَر، **ولا شاشة في المنتج كلّه
 * تناديه**. فمن رأى إعلانًا احتياليًّا أو بياناتٍ كاذبة لا يجد إلى
 * الإبلاغ سبيلًا — وصفحة «تواصل معنا» تحيله إلى «أبلغ عن الإعلان»
 * في صفحته، وهو زرٌّ لم يكن موجودًا.
 *
 * ═══ والسبب يُختار لا يُكتب ═══
 *
 * قائمةٌ مغلقة لأن الفرز هو ما يجعل البلاغات تُعالَج: طابورٌ من نصوصٍ
 * حرّة لا يُفرَز فلا يُقرأ. والتفاصيل حرّة **بعد** اختيار سبب.
 */

const REASONS = [
  { key: 'fraud', label: 'يبدو احتيالًا' },
  { key: 'wrong_data', label: 'بيانات غير صحيحة' },
  { key: 'sold_elsewhere', label: 'بيعت وما زالت معروضة' },
  { key: 'duplicate', label: 'مكرّر' },
  { key: 'offensive', label: 'محتوى مسيء' },
  { key: 'other', label: 'سبب آخر' },
] as const;

export function ReportListing({
  listingId,
  signedIn,
  locale,
}: {
  listingId: string;
  signedIn: boolean;
  locale: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>('fraud');
  const [details, setDetails] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const submit = (): void => {
    start(async () => {
      const response = await fetch('/api/v1/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetType: 'listing',
          targetId: listingId,
          reason,
          ...(details.trim() === '' ? {} : { details: details.trim() }),
        }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر إرسال البلاغ.');
        return;
      }

      setOpen(false);
      setDetails('');
      setToast('وصل بلاغك. يراجعه فريقنا.');
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // بلا جلسة: إلى الدخول ومعه وجهة العودة — لا رسالة ثم طريق مسدود
          if (!signedIn) {
            router.push(`/${locale}/auth?next=${encodeURIComponent(window.location.pathname)}`);
            return;
          }
          setOpen(true);
        }}
        className="text-3xs opacity-40 underline underline-offset-2 hover:opacity-70"
      >
        أبلغ عن هذا الإعلان
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="الإبلاغ عن الإعلان">
        {/*
          ما يقع بعد البلاغ يُقال: **البلاغ يُدخل المراجعة ولا يحذف**
          (قرار ٣٣). ومن يظنّه يحذف فورًا يبلّغ ليؤذي منافسًا.
        */}
        <p className="mb-4 text-2xs leading-loose opacity-65">
          البلاغ يُحيل الإعلان إلى مراجعة بشرية، ولا يحذفه فورًا. ولا يعرف صاحب
          الإعلان من أبلغ.
        </p>

        <fieldset className="mb-4 flex flex-col gap-2">
          {REASONS.map((entry) => (
            <label
              key={entry.key}
              className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3.5 py-2.5 text-2xs ${
                reason === entry.key ? 'border-accent-700' : 'border-line'
              }`}
            >
              <input
                type="radio"
                name="reason"
                checked={reason === entry.key}
                onChange={() => setReason(entry.key)}
              />
              <span>{entry.label}</span>
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-bold opacity-60">تفاصيل — اختيارية</span>
          <textarea
            rows={3}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm leading-loose"
          />
        </label>

        <Button className="mt-4 w-full" disabled={pending} onClick={submit}>
          {pending ? 'جارٍ…' : 'أرسل البلاغ'}
        </Button>
      </Modal>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
