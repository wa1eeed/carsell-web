'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

const TOTP_LENGTH = 6;

type Stage = 'password' | 'totp';

/**
 * خطوتان في بطاقة واحدة: البريد وكلمة المرور، ثم ست خانات TOTP.
 * TOTP إلزامي لكل الأدوار — لا مسار يتخطّاه.
 */
export function AdminLoginForm() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('password');
  const [adminUserId, setAdminUserId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(TOTP_LENGTH).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(`/api/v1/admin/auth/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json: unknown = await response.json();
    const payload = json as { data?: Record<string, unknown>; error?: { messageAr: string } };
    if (payload.error !== undefined) throw new Error(payload.error.messageAr);
    return payload.data ?? {};
  }

  async function submitPassword(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await post('login', { email, password });
      setAdminUserId(String(data.adminUserId));
      setStage('totp');
      setTimeout(() => boxes.current[0]?.focus(), 0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذّر الدخول.');
    } finally {
      setBusy(false);
    }
  }

  async function submitTotp(code: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await post('totp', { adminUserId, code });
      router.replace('/admin');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذّر التحقّق.');
      setDigits(Array(TOTP_LENGTH).fill(''));
      boxes.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  }

  function onDigit(index: number, raw: string): void {
    const value = raw.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = value;
    setDigits(next);

    if (value !== '' && index < TOTP_LENGTH - 1) boxes.current[index + 1]?.focus();
    const code = next.join('');
    if (code.length === TOTP_LENGTH && !next.includes('')) void submitTotp(code);
  }

  const field =
    'w-full rounded-md border border-line bg-surface px-4 py-3 text-base outline-none focus:border-accent';

  return (
    <div className="flex flex-col gap-4">
      {stage === 'password' ? (
        <form onSubmit={submitPassword} className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-semibold opacity-55">البريد الإلكتروني</span>
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
      ) : (
        <div className="flex flex-col gap-3.5">
          <p className="text-2xs font-semibold opacity-55">
            رمز التحقّق من تطبيق المصادقة
          </p>
          {/* أرقام Latin — الرمز رمز لا نصّ يُقرأ */}
          <div className="flex gap-2" dir="ltr">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => {
                  boxes.current[index] = el;
                }}
                inputMode="numeric"
                maxLength={1}
                value={digit}
                disabled={busy}
                onChange={(e) => onDigit(index, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && digit === '' && index > 0) {
                    boxes.current[index - 1]?.focus();
                  }
                }}
                className="font-num aspect-square flex-1 rounded-md border-2 border-ink bg-surface text-center text-2xl font-bold outline-none focus:border-accent"
              />
            ))}
          </div>
        </div>
      )}

      {error === null ? null : (
        <p role="alert" className="rounded-md bg-danger/10 px-3.5 py-2.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
