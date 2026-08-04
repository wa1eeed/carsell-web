'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

/**
 * ═══ الدخول — خطوة واحدة ═══
 *
 * كانت خطوتين: بريدٌ وكلمة، ثم ستّ خانات TOTP إلزامية لكل الأدوار.
 * أُلغيت الثانية بقرار المصمّم.
 *
 * والحارس الباقي في الخادم: خمس محاولات فاشلة ⇒ ربع ساعة قفل، والعدّاد
 * على الحساب لا على الاتصال فلا يلتفّ عليه تبديلُ عنوان.
 */
export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/admin/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json: unknown = await response.json();
      const payload = json as { error?: { messageAr: string } };
      if (payload.error !== undefined) throw new Error(payload.error.messageAr);

      router.replace('/admin');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذّر الدخول.');
      setBusy(false);
    }
  }

  const field =
    'w-full rounded-md border border-line bg-surface px-4 py-3 text-base outline-none focus:border-accent';

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold opacity-55">البريد الإلكتروني</span>
          {/* `dir="ltr"` — بريدٌ يُقارن خانةً بخانة، وسياق RTL يقلب أجزاءه */}
          <input
            type="email"
            required
            autoComplete="username"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={cn(field, 'bidi-ltr')}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold opacity-55">كلمة المرور</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={cn(field, 'bidi-ltr')}
          />
        </label>

        <Button type="submit" disabled={busy} className="mt-1 w-full">
          {busy ? 'جارٍ التحقّق…' : 'دخول'}
        </Button>
      </form>

      {error === null ? null : (
        <p role="alert" className="rounded-md bg-danger/10 px-3.5 py-2.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
