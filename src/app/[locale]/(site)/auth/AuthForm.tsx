'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { OtpInput, OTP_BOXES } from '@/components/ui/OtpInput';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Quantity } from '@/components/ui/Quantity';

/** إعادة الإرسال بعد ٣٠ ثانية (قرار ٢٨). */
const RESEND_SECONDS = 30;

type Step = 'phone' | 'code';

/**
 * نموذج الدخول بخطوتين.
 *
 * **لا يُسرَّب وجود الحساب.** الشاشة لا تقول «مرحبًا بعودتك» ولا «حساب
 * جديد» ولا تفرّق رسالتَي الخطأ: من يعرف أن رقمًا مسجَّل عندنا يعرف أن
 * صاحبه يبيع سيارة. والفرق يظهر **بعد** التحقّق لا قبله.
 *
 * ورسالة تجاوز الحدّ واحدة لكل الأرقام (٥ في الساعة)، فلا يُستدلّ بها
 * على تسجيل رقم من عدمه.
 */
export function AuthForm({ locale }: { locale: string }) {
  const t = useTranslations('auth');
  const router = useRouter();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  /**
   * رمز التطوير — **يخرجه الخادم في التطوير وحده ولم يكن يُعرض**.
   *
   * فمن يجرّب المنصّة محلّيًّا لا رسالة تصله ولا رمز يراه: يقف عند أوّل
   * شاشة ولا يبلغ ما بعدها إلا بفتح أدوات المطوّر. وأوّل جدارٍ في رحلة
   * التجربة هو الدخول نفسه.
   */
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const valid = phone.length === 9 && phone.startsWith('5');

  const send = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/auth/otp/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: `0${phone}` }),
      });
      const body = (await response.json()) as {
        data?: { challengeId: string; devCode?: string };
        error?: { messageAr: string; messageEn: string };
      };

      if (!response.ok || body.data === undefined) {
        setError(
          locale === 'ar'
            ? (body.error?.messageAr ?? t('genericError'))
            : (body.error?.messageEn ?? t('genericError')),
        );
        return;
      }

      setChallengeId(body.data.challengeId);
      // الخادم لا يُخرجه خارج التطوير — فالشرط هناك لا هنا
      setDevCode(body.data.devCode ?? null);
      setCode('');
      setStep('code');
      setCooldown(RESEND_SECONDS);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (submitted: string): Promise<void> => {
    if (challengeId === null) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/auth/otp/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeId, code: submitted }),
      });
      const body = (await response.json()) as {
        data?: { isNew: boolean };
        error?: { messageAr: string; messageEn: string };
      };

      if (!response.ok || body.data === undefined) {
        setError(
          locale === 'ar'
            ? (body.error?.messageAr ?? t('genericError'))
            : (body.error?.messageEn ?? t('genericError')),
        );
        setCode('');
        return;
      }

      // الفرق بين الجديد والعائد يظهر **بعد** التحقّق لا قبله
      router.push(`/${locale}/account`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (step === 'phone') {
    return (
      <div className="max-w-sm">
        <h1 className="mb-1.5 text-2xl font-bold">{t('title')}</h1>
        <p className="mb-7 text-xs leading-loose opacity-60">{t('subtitle')}</p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && agreed && !busy) void send();
          }}
        >
          <PhoneInput
            value={phone}
            onChange={setPhone}
            disabled={busy}
            invalid={error !== null}
            label={t('phone')}
            className="mb-4"
          />

          <label className="mb-5 flex items-start gap-2.5 text-2xs leading-relaxed opacity-70">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              className="mt-0.5 size-4 accent-accent"
            />
            <span>
              {t('agreeTo')}{' '}
              <Link href={`/${locale}/legal/terms`} className="font-bold text-accent-700 hover:underline">
                {t('terms')}
              </Link>{' '}
              {t('and')}{' '}
              <Link href={`/${locale}/legal/privacy`} className="font-bold text-accent-700 hover:underline">
                {t('privacy')}
              </Link>
            </span>
          </label>

          {error === null ? null : (
            <p role="alert" className="mb-4 rounded-md bg-danger/10 px-3.5 py-2.5 text-2xs text-danger">
              {error}
            </p>
          )}

          <Button type="submit" disabled={!valid || !agreed || busy} className="w-full">
            {t('sendCode')}
          </Button>
        </form>

        <p className="mt-5 text-center text-3xs leading-loose opacity-50">{t('browseFree')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-sm">
      <h1 className="mb-1.5 text-2xl font-bold">{t('codeTitle')}</h1>
      <p className="mb-7 flex flex-wrap items-center gap-1.5 text-xs opacity-60">
        {t('sentTo')}
        <span dir="ltr" className="font-num font-bold opacity-100">
          +966 {phone}
        </span>
        <button
          type="button"
          onClick={() => {
            setStep('phone');
            setError(null);
          }}
          className="font-bold text-accent-700 hover:underline"
        >
          {t('change')}
        </button>
      </p>

      {devCode === null ? null : (
        /**
         * لا رسالة تصل في التطوير — فالرمز يُعرض ويُملأ بضغطة.
         * والخادم لا يُخرجه إلا في التطوير، فلا حارس هنا يُنسى تشغيله.
         */
        <button
          type="button"
          onClick={() => {
            setCode(devCode);
            void verify(devCode);
          }}
          className="mb-4 flex w-full items-center justify-between rounded-md border border-dashed border-line px-3.5 py-2.5 text-2xs opacity-70 hover:opacity-100"
        >
          <span>وضع التطوير — لا تصل رسالة</span>
          {/* الرمز يُقارن خانةً بخانة — لاتينيّ معزول */}
          <span dir="ltr" className="font-num font-bold tracking-[0.3em]">
            {devCode}
          </span>
        </button>
      )}

      <OtpInput
        value={code}
        onChange={setCode}
        onComplete={(submitted) => void verify(submitted)}
        disabled={busy}
        invalid={error !== null}
        autoFocus
        className="mb-5"
      />

      {error === null ? null : (
        <p role="alert" className="mb-4 rounded-md bg-danger/10 px-3.5 py-2.5 text-2xs text-danger">
          {error}
        </p>
      )}

      <Button
        onClick={() => void verify(code)}
        disabled={code.length !== OTP_BOXES || busy}
        className="mb-4 w-full"
      >
        {t('verify')}
      </Button>

      {cooldown > 0 ? (
        <p className="flex items-center justify-center gap-1.5 text-center text-2xs opacity-50">
          {t('resendIn')}
          <Quantity unit="seconds" count={cooldown} />
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy}
          className="w-full text-center text-2xs font-bold text-accent-700 hover:underline"
        >
          {t('resend')}
        </button>
      )}
    </div>
  );
}
