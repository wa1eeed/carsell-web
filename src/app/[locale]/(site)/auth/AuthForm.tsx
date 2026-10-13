'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Counted } from '@/components/ui/Counted';
import { OtpInput, OTP_BOXES } from '@/components/ui/OtpInput';
import { PhoneInput } from '@/components/ui/PhoneInput';

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
export function AuthForm({
  locale,
  cities,
}: {
  locale: string;
  /** مدنُ المنصّة — من جدول المقاطع نفسه الذي يبني الروابط. */
  cities: readonly string[];
}) {
  const t = useTranslations('auth');
  const router = useRouter();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [agreed, setAgreed] = useState(false);

  /**
   * ═══ ثلاثةُ أنماطٍ على شاشةٍ واحدة ═══
   *
   * `code` — رمزٌ لمرّة واحدة، وهو البابُ القائم للجميع.
   * `password` — لمن وضع كلمةً عند تسجيله.
   * `register` — تسجيلٌ جديد، فردًا أو معرضًا.
   *
   * وشاشةٌ ثانيةٌ للتسجيل تجعل من أخطأ البابَ يرجع ويبحث — والنمط
   * يُبدَّل هنا بلا تحميل.
   */
  const [mode, setMode] = useState<'code' | 'password' | 'register'>('code');
  const [accountType, setAccountType] = useState<'INDIVIDUAL' | 'BUSINESS'>('INDIVIDUAL');
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  /** جاهزيةُ التسجيل — والزرّ لا يُفعَّل على استمارةٍ تُردّ. */
  const registerReady =
    fullName.trim().length >= 2 &&
    password.trim().length >= 8 &&
    (accountType === 'BUSINESS' ? email.trim() !== '' : city !== '');

  const signInWithPassword = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: `+966${phone}`, password }),
      });
      if (!response.ok) {
        setError(t('wrongCredentials'));
        return;
      }
      router.push(`/${locale}/account`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

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
        body: JSON.stringify({
          challengeId,
          code: submitted,
          /**
           * **وتُحمَل ولا تُكتب إلّا بعد أن يصحّ الرمز.** تسجيلٌ يكتب
           * حسابًا ثمّ يطلب التحقّق يترك صفوفًا لأرقامٍ لا يملكها أحد.
           */
          ...(mode === 'register'
            ? {
                registration: {
                  accountType,
                  name: fullName,
                  city: accountType === 'BUSINESS' ? null : city,
                  email: accountType === 'BUSINESS' ? email : null,
                  password,
                },
              }
            : {}),
        }),
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
      <div className="w-full max-w-sm">
        <h1 className="mb-1.5 text-2xl font-bold">{t('title')}</h1>
        <p className="mb-7 text-xs leading-loose opacity-60">{t('subtitle')}</p>

        {/*
          ═══ النمط يُبدَّل هنا لا بشاشةٍ ثانية ═══

          من أخطأ البابَ يرجع ويبحث. والثلاثة أبوابٌ لشيءٍ واحد:
          رمزٌ لمرّة واحدة (وهو القائم للجميع)، أو كلمةٌ لمن وضعها،
          أو تسجيلٌ جديد.
        */}
        <div className="mb-5 flex flex-wrap gap-2">
          <ModeChip on={mode !== 'register'} onClick={() => setMode('code')}>
            {t('modeSignIn')}
          </ModeChip>
          <ModeChip on={mode === 'register'} onClick={() => setMode('register')}>
            {t('modeRegister')}
          </ModeChip>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (busy || !agreed) return;
            if (mode === 'password') {
              if (valid && password !== '') void signInWithPassword();
              return;
            }
            if (mode === 'register' && !registerReady) return;
            if (valid) void send();
          }}
        >
          {mode !== 'register' ? null : (
            <div className="mb-4 flex flex-wrap gap-2">
              <ModeChip
                on={accountType === 'INDIVIDUAL'}
                onClick={() => setAccountType('INDIVIDUAL')}
              >
                {t('typeIndividual')}
              </ModeChip>
              <ModeChip on={accountType === 'BUSINESS'} onClick={() => setAccountType('BUSINESS')}>
                {t('typeBusiness')}
              </ModeChip>
            </div>
          )}

          {mode !== 'register' ? null : (
            <label className="mb-4 flex flex-col gap-1.5">
              <span className="text-2xs font-semibold opacity-60">
                {accountType === 'BUSINESS' ? t('showroomName') : t('fullName')}
              </span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                disabled={busy}
                className="rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm"
              />
            </label>
          )}

          <PhoneInput
            value={phone}
            onChange={setPhone}
            disabled={busy}
            invalid={error !== null}
            label={t('phone')}
            className="mb-4"
          />

          {/*
            **والمعرض يُسأل بريدَه لا مدينتَه**: عنوانُه يُستكمل في
            التهيئة مع سجلّه وآيبانه، وسؤالُه عن مدينةٍ مفردة الآن ثمّ
            عن عنوانٍ بعد قليل سؤالان عن شيءٍ واحد.
          */}
          {mode !== 'register' ? null : accountType === 'BUSINESS' ? (
            <label className="mb-4 flex flex-col gap-1.5">
              <span className="text-2xs font-semibold opacity-60">{t('email')}</span>
              <input
                dir="ltr"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
                className="bidi-ltr rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm"
              />
            </label>
          ) : (
            <label className="mb-4 flex flex-col gap-1.5">
              <span className="text-2xs font-semibold opacity-60">{t('city')}</span>
              <select
                value={city}
                onChange={(event) => setCity(event.target.value)}
                disabled={busy}
                className="rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm"
              >
                <option value="">{t('cityPick')}</option>
                {cities.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {mode === 'code' ? null : (
            <label className="mb-4 flex flex-col gap-1.5">
              <span className="text-2xs font-semibold opacity-60">{t('password')}</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                className="rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm"
              />
              {mode !== 'register' ? null : (
                <span className="text-3xs opacity-50">{t('passwordHint')}</span>
              )}
            </label>
          )}

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

          <Button
            type="submit"
            disabled={
              !valid ||
              !agreed ||
              busy ||
              (mode === 'register' && !registerReady) ||
              (mode === 'password' && password === '')
            }
            className="w-full"
          >
            {mode === 'password' ? t('signIn') : t('sendCode')}
          </Button>

          {/*
            **والرمز بابٌ قائم للجميع** — فالتبديل بينهما سطرٌ لا شاشة.
            وحسابٌ قديم لا كلمة له يجد طريقه ولو ضغط «بكلمة المرور».
          */}
          {mode === 'register' ? null : (
            <p className="mt-3.5 text-center text-3xs opacity-60">
              <button
                type="button"
                onClick={() => setMode(mode === 'code' ? 'password' : 'code')}
                className="font-semibold underline"
              >
                {mode === 'code' ? t('usePassword') : t('useCode')}
              </button>
            </p>
          )}
        </form>

        <p className="mt-5 text-center text-3xs leading-loose opacity-50">{t('browseFree')}</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
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
        <p className="text-center text-2xs opacity-50">
          {/*
            **والجارّ داخل الصيغة.** «إعادة الإرسال بعد» + `<Quantity>`
            تُخرج «بعد ثانيتان» عند الثانيتين — مثنًّى مرفوعٌ بعد حرف
            جرّ، والمؤقّت يمرّ بها في كل عدٍّ تنازليّ. (والبوابة ٣١
            أخفتها لأن الجارّ كان في ملفّ الترجمة لا في الشاشة.)
          */}
          <Counted message="resendIn" count={cooldown} />
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

/** اختيارُ النمط أو النوع — زرٌّ بحالةٍ محلّية، فلا عنوانَ يحملها. */
function ModeChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={
        on
          ? 'rounded-full bg-ink px-4 py-2 text-2xs font-bold text-bg'
          : 'rounded-full border border-line px-4 py-2 text-2xs font-semibold hover:border-ink'
      }
    >
      {children}
    </button>
  );
}
