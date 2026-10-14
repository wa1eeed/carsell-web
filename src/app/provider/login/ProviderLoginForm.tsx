'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * دخول المزوّد — **بلا «نسيت كلمة المرور» ولا تسجيلٍ ذاتيّ**.
 *
 * الحساب تُنشئه إدارةُ المنصّة مع حساب الدفع، وإعادةُ التعيين منها:
 * بابُ تسجيلٍ مفتوح لمزوّدين يُسنَد إليهم عملٌ حقيقيّ ومالٌ يقابله
 * هو بابُ انتحال.
 */
export function ProviderLoginForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setError(null);

        start(async () => {
          const response = await fetch('/api/v1/provider/auth/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              email: String(data.get('email') ?? ''),
              password: String(data.get('password') ?? ''),
            }),
          }).catch(() => null);

          const payload = (await response?.json().catch(() => null)) as
            | { error?: { messageAr?: string } }
            | null;

          if (response === null || !response.ok) {
            setError(payload?.error?.messageAr ?? 'تعذّر الدخول.');
            return;
          }
          /** تحميلٌ كامل — الجلسة تُقرأ في الخادم */
          window.location.assign('/provider');
        });
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-2xs font-bold opacity-60">البريد الإلكتروني</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          dir="ltr"
          className="bidi-ltr rounded-md border border-line bg-surface px-3.5 py-2.5 text-base outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-2xs font-bold opacity-60">كلمة المرور</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          dir="ltr"
          className="bidi-ltr rounded-md border border-line bg-surface px-3.5 py-2.5 text-base outline-none focus:border-accent"
        />
      </label>

      {error === null ? null : <p className="text-2xs text-danger">{error}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        دخول
      </Button>
    </form>
  );
}
