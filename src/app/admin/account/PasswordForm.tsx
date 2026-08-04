'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { toArabicDigits } from '@/lib/arabic';

/**
 * ═══ تغيير كلمة الأدمن ═══
 *
 * **والتغيير يُخرجك.** كل الجلسات تُبطَل — والحارس يقرأ `passwordChangedAt`
 * في كل طلب، فجلسةٌ أُنشئت قبله لا تُحلّ. فالشاشة تقولها قبل الفعل لا
 * بعده: من يفاجئه خروجٌ لم يُنذَر به يظنّ النظام معطوبًا.
 */
export function PasswordForm({ minLength }: { minLength: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });

  const mismatch = form.confirm !== '' && form.next !== form.confirm;
  const tooShort = form.next !== '' && form.next.length < minLength;
  const ready =
    form.current !== '' && form.next !== '' && !mismatch && !tooShort && form.confirm !== '';

  const submit = (): void => {
    start(async () => {
      const response = await fetch('/api/v1/admin/account/password', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { code?: string; fields?: Record<string, string> } }
        | null;

      if (response === null || !response.ok) {
        const field = payload?.error?.fields?.password;
        setToast(
          field === 'WRONG_PASSWORD'
            ? 'الكلمة الحالية غير صحيحة.'
            : field === 'WEAK_PASSWORD'
              ? `الكلمة أقصر من الحدّ — محارف (${toArabicDigits(String(minLength))}) فأكثر.`
              : field === 'SAME_PASSWORD'
                ? 'الكلمة الجديدة هي نفسها الحالية.'
                : 'تعذّر التغيير.',
        );
        return;
      }

      /**
       * الجلسة انتهت بالفعل — فالتحويل إلى الدخول، لا `router.refresh`
       * الذي سيصطدم بحارسٍ يعيده إلى الدخول بلا رسالة.
       */
      router.replace('/admin/login?changed=1');
    });
  };

  return (
    <>
      <div className="max-w-md">
        <Field
          label="الكلمة الحالية"
          value={form.current}
          onChange={(v) => setForm({ ...form, current: v })}
        />
        <Field
          label="الكلمة الجديدة"
          value={form.next}
          onChange={(v) => setForm({ ...form, next: v })}
          note={`محارف (${toArabicDigits(String(minLength))}) فأكثر`}
          error={tooShort ? 'أقصر من الحدّ' : undefined}
        />
        <Field
          label="أعِد الكلمة الجديدة"
          value={form.confirm}
          onChange={(v) => setForm({ ...form, confirm: v })}
          error={mismatch ? 'لا تطابق ما فوقها' : undefined}
        />

        {/* **يُقال قبل الضغط لا بعده.** */}
        <p className="mt-4 rounded-lg border border-line bg-surface p-3.5 text-3xs leading-loose opacity-70">
          <b>التغيير يُنهي جلساتك كلّها — بما فيها هذه.</b> وستعود إلى شاشة الدخول
          بالكلمة الجديدة.
        </p>

        <Button className="mt-5" disabled={pending || !ready} onClick={submit}>
          {pending ? 'جارٍ…' : 'غيّر الكلمة'}
        </Button>
      </div>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  note,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  note?: string;
  error?: string;
}) {
  return (
    <label className="mb-4 flex flex-col gap-1.5">
      <span className="text-2xs font-bold opacity-60">{label}</span>
      {/*
        **الحقل يقبل كل صيغة لصق**: من يستعمل مدير كلمات يلصق، ومنعُ
        اللصق يدفعه إلى كلمةٍ يحفظها — أضعف بالضرورة.
      */}
      <input
        dir="ltr"
        type="password"
        autoComplete={label === 'الكلمة الحالية' ? 'current-password' : 'new-password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-start font-num text-sm"
      />
      {error !== undefined ? (
        <span className="text-3xs text-danger">{error}</span>
      ) : note === undefined ? null : (
        <span className="text-3xs opacity-45">{note}</span>
      )}
    </label>
  );
}
