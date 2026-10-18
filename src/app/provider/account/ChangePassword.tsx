'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Quantity } from '@/components/ui/Quantity';
import { Toast } from '@/components/ui/Toast';

/**
 * ═══ والشرطُ كان مفروضًا بلا باب ═══
 *
 * `mustChangePassword` يُرفع عند إنشاء الحساب ويُردّ في كل دخول —
 * **ولا مسار كان يغيّرها**. فيُقال للمزوّد «غيّر كلمتك» في كل مرّة
 * ولا سبيل له إليها، وهو قفلٌ بلا مفتاح.
 */
const MIN = 10;

const REASON: Readonly<Record<string, string>> = {
  WRONG_CURRENT: 'الكلمة الحالية غير صحيحة.',
  TOO_SHORT: 'الكلمة الجديدة قصيرة.',
  SAME_PASSWORD: 'الكلمة الجديدة هي نفسها الحالية.',
};

export function ChangePassword({ mustChange }: { mustChange: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });

  const match = form.next.length > 0 && form.next === form.confirm;
  const ready = form.current.length > 0 && form.next.length >= MIN && match;

  const submit = (): void => {
    start(async () => {
      const response = await fetch('/api/v1/provider/account/password', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ current: form.current, next: form.next }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { fields?: Record<string, string>; messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        const code = payload?.error?.fields?.password;
        setToast(
          (code === undefined ? undefined : REASON[code]) ??
            payload?.error?.messageAr ??
            'تعذر تغيير الكلمة.',
        );
        return;
      }

      setForm({ current: '', next: '', confirm: '' });
      setToast('تغيرت كلمتك.');
      router.refresh();
    });
  };

  const field = 'rounded-md border border-line bg-surface px-3 py-2 text-start font-num text-sm';

  return (
    <>
      {!mustChange ? null : (
        <p className="mb-4 rounded-lg border border-line bg-surface p-4 text-2xs leading-loose">
          <b>كلمتك مؤقتة.</b> أنشأها من فتح حسابك ومرت بعينه — غيرها الآن.
        </p>
      )}

      <div className="flex max-w-sm flex-col gap-3.5">
        {(
          [
            ['current', 'الكلمة الحالية'],
            ['next', 'الكلمة الجديدة'],
            ['confirm', 'أعد الكلمة الجديدة'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1.5">
            <span className="text-3xs font-bold opacity-70">{label}</span>
            {/* كلمةٌ تُكتب خانةً بخانة — لاتينيّة معزولة */}
            <input
              dir="ltr"
              type="password"
              autoComplete={key === 'current' ? 'current-password' : 'new-password'}
              value={form[key]}
              onChange={(event) => setForm({ ...form, [key]: event.target.value })}
              className={field}
            />
          </label>
        ))}

        <p className="text-3xs leading-loose opacity-70">
          <Quantity unit="characters" count={MIN} /> فأكثر.
          {form.confirm.length === 0 || match ? null : ' والكلمتان غير متطابقتين.'}
        </p>

        <Button disabled={busy || !ready} onClick={submit}>
          {busy ? 'جاري…' : 'غير كلمتي'}
        </Button>
      </div>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
