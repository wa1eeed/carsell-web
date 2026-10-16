'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { OtpInput } from '@/components/ui/OtpInput';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { cn } from '@/lib/cn';

const field =
  'w-full rounded-md border border-line bg-bg px-3.5 py-2.75 text-sm outline-none focus:border-ink';

type Step = 'account' | 'verify' | 'registry' | 'bank' | 'done';

const ORDER: readonly Step[] = ['account', 'verify', 'registry', 'bank'];

type Manager = { name: string; role: string | null };

/**
 * ═══ تهيئةُ المعرض — أربع خطوات ═══
 *
 * حسابٌ تجاريّ يُفتح على أربع إجابات: من أنت، وأنّ الرقم رقمُك، وما
 * سجلُّك، وأين يصلك المال. وعرضُها دفعةً واحدة يُري المعرضَ جدارًا من
 * اثني عشر حقلًا فيُغلق الصفحة.
 *
 * ═══ والحساب يُفتح عند الخطوة الثانية لا الرابعة ═══
 *
 * من أكّد جوّاله صار له حساب، وما بعده تهيئةٌ يُكملها الآن أو من ملفّه.
 * وتهيئةٌ تُلزم بالإكمال قبل أن يوجد الحساب تُضيّع ما كُتب عند أوّل
 * انقطاع — ونسبةُ الاكتمال وبنرُها يتكفّلان بالباقي.
 */
export function DealerOnboarding({
  locale,
  registryLive,
}: {
  locale: string;
  /** للتكامل وصلة؟ — وزرٌّ لا وصلة خلفه يُشعر الضاغط أنه أخطأ. */
  registryLive: boolean;
}) {
  const t = useTranslations('auth');
  const router = useRouter();

  const [step, setStep] = useState<Step>('account');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const [unified, setUnified] = useState('');
  const [fetching, setFetching] = useState(false);
  const [registryNote, setRegistryNote] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [crNumber, setCrNumber] = useState('');
  const [address, setAddress] = useState('');
  const [managers, setManagers] = useState<Manager[]>([]);

  const [bankName, setBankName] = useState('');
  const [iban, setIban] = useState('');

  const phoneValid = phone.length === 9 && phone.startsWith('5');
  const accountReady =
    name.trim().length >= 2 && phoneValid && email.trim() !== '' && password.trim().length >= 8;

  async function sendCode(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/auth/otp/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: `+966${phone}` }),
      });
      const body = (await response.json()) as {
        data?: { challengeId: string; devCode?: string };
        error?: { messageAr: string };
      };
      if (!response.ok || body.data === undefined) {
        setError(body.error?.messageAr ?? t('genericError'));
        return;
      }
      setChallengeId(body.data.challengeId);
      setDevCode(body.data.devCode ?? null);
      setStep('verify');
    } finally {
      setBusy(false);
    }
  }

  async function verify(entered: string): Promise<void> {
    if (challengeId === null) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/auth/otp/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId,
          code: entered,
          registration: {
            accountType: 'BUSINESS',
            name,
            city: null,
            email,
            password,
          },
        }),
      });
      const body = (await response.json()) as { error?: { messageAr: string } };
      if (!response.ok) {
        setError(body.error?.messageAr ?? t('genericError'));
        setCode('');
        return;
      }
      setStep('registry');
    } finally {
      setBusy(false);
    }
  }

  /**
   * **والجلب يسقط بصمت إلى الإدخال اليدويّ.** ما دامت المفاتيح لم تصل
   * فالفشل هو الحال المتوقَّع — وسطرٌ رماديّ واحد، بلا تحويل مسار.
   */
  async function fetchRegistry(): Promise<void> {
    setFetching(true);
    setRegistryNote(null);
    try {
      const response = await fetch('/api/v1/registry/corporate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ unifiedNumber: unified }),
      });
      const body = (await response.json()) as {
        data?: {
          found: boolean;
          reason?: string;
          record?: {
            companyName: string | null;
            crNumber: string | null;
            address: string | null;
            managers: Manager[];
          };
        };
      };

      const found = body.data?.found === true && body.data.record !== undefined;
      if (!found) {
        setRegistryNote(body.data?.reason === 'NOT_FOUND' ? t('registryNotFound') : t('registryManual'));
        return;
      }

      // **والمجلوب يحلّ محلّ المكتوب** — فالملفّ نسخةٌ من السجلّ
      const record = body.data?.record;
      if (record === undefined) return;
      if (record.companyName !== null) setName(record.companyName);
      if (record.crNumber !== null) setCrNumber(record.crNumber);
      if (record.address !== null) setAddress(record.address);
      setManagers(record.managers);
      setFetched(true);
    } finally {
      setFetching(false);
    }
  }

  async function saveField(body: Record<string, string>): Promise<boolean> {
    const response = await fetch('/api/v1/me/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    return response !== null && response.ok;
  }

  async function finish(): Promise<void> {
    setBusy(true);
    try {
      if (bankName.trim() !== '') await saveField({ field: 'bankName', bankName });
      if (iban.trim() !== '') await saveField({ field: 'iban', iban });
      router.push(`/${locale}/account`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const index = ORDER.indexOf(step as (typeof ORDER)[number]);
  const reached = index === -1 ? ORDER.length : index;

  return (
    <div className="mx-auto w-full max-w-xl">
      {/*
        ═══ الشريط يقول أين هو ممّا بقي ═══

        تهيئةٌ بلا مؤشّر تُقرأ بلا نهاية. والخطوة المنجَزة تبقى ظاهرة
        لأن من أراد الرجوع يحتاج أن يرى إلى أين.
      */}
      <ol className="mb-8 flex gap-2">
        {ORDER.map((key, at) => (
          <li key={key} className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="h-1 overflow-hidden rounded-full bg-line">
              {at > reached ? null : (
                <span className={cn('rail-fill block h-full rounded-full', at < reached ? 'bg-accent' : 'bg-ink')} />
              )}
            </span>
            <span className={cn('truncate text-3xs', at <= reached ? 'font-bold' : 'opacity-65')}>
              {t(`step${key.charAt(0).toUpperCase()}${key.slice(1)}` as 'stepAccount')}
            </span>
          </li>
        ))}
      </ol>

      {error === null ? null : (
        <p role="alert" className="mb-5 rounded-md bg-danger/10 px-3.5 py-2.5 text-2xs text-danger">
          {error}
        </p>
      )}

      {step === 'account' ? (
        <section key="account" className="step-in flex flex-col gap-4">
          <Labelled label={t('showroomName')}>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </Labelled>

          <PhoneInput value={phone} onChange={setPhone} disabled={busy} label={t('phone')} />

          <Labelled label={t('email')}>
            <input
              dir="ltr"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cn(field, 'bidi-ltr')}
            />
          </Labelled>

          <Labelled label={t('password')} hint={t('passwordHint')}>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
            />
          </Labelled>

          <Button disabled={!accountReady || busy} onClick={() => void sendCode()}>
            {t('next')}
          </Button>
        </section>
      ) : null}

      {step === 'verify' ? (
        <section key="verify" className="step-in flex flex-col items-center gap-4">
          <p className="text-sm font-bold">{t('stepVerify')}</p>
          <OtpInput value={code} onChange={setCode} onComplete={(v) => void verify(v)} disabled={busy} />
          {devCode === null ? null : (
            <p dir="ltr" className="font-num text-2xs opacity-70">
              {devCode}
            </p>
          )}
          <button type="button" className="text-2xs underline opacity-70" onClick={() => setStep('account')}>
            {t('back')}
          </button>
        </section>
      ) : null}

      {step === 'registry' ? (
        <section key="registry" className="step-in flex flex-col gap-4">
          {!registryLive ? null : (
            <Labelled label={t('unifiedNumber')} hint={t('unifiedHint')}>
              <span className="relative flex gap-2">
                <span
                  className={cn(
                    'relative min-w-0 flex-1 overflow-hidden rounded-md',
                    fetching && 'registry-scan',
                  )}
                >
                  <input
                    dir="ltr"
                    inputMode="numeric"
                    value={unified}
                    onChange={(e) => setUnified(e.target.value)}
                    placeholder="7XXXXXXXXX"
                    className={cn(field, 'bidi-ltr font-num')}
                  />
                </span>
                <Button
                  variant="outline"
                  disabled={fetching || unified.trim() === ''}
                  onClick={() => void fetchRegistry()}
                >
                  {fetching ? t('fetching') : t('fetchRegistry')}
                </Button>
              </span>
            </Labelled>
          )}

          {registryNote === null ? null : (
            <p className="text-2xs leading-loose opacity-70">{registryNote}</p>
          )}

          {!fetched ? null : (
            <p className="step-in text-2xs font-bold text-accent-700">{t('registryFetched')}</p>
          )}

          <Labelled label={t('showroomName')}>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </Labelled>

          <Labelled label={t('crNumber')}>
            <input
              dir="ltr"
              inputMode="numeric"
              value={crNumber}
              onChange={(e) => setCrNumber(e.target.value)}
              placeholder="1010XXXXXX"
              className={cn(field, 'bidi-ltr font-num')}
            />
          </Labelled>

          <Labelled label={t('address')}>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className={field} />
          </Labelled>

          {managers.length === 0 ? null : (
            <div className="step-in rounded-lg border border-line bg-surface p-4">
              <p className="mb-2 text-2xs font-bold">{t('managers')}</p>
              <ul className="flex flex-col gap-1 text-2xs opacity-75">
                {managers.map((m) => (
                  <li key={`${m.name}-${m.role ?? ''}`}>
                    {m.name}
                    {m.role === null ? null : <span className="opacity-70"> — {m.role}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button
            disabled={busy}
            onClick={() => {
              void (async () => {
                if (crNumber.trim() !== '') await saveField({ field: 'crNumber', crNumber });
                if (address.trim() !== '') await saveField({ field: 'address', address });
                setStep('bank');
              })();
            }}
          >
            {t('next')}
          </Button>
        </section>
      ) : null}

      {step === 'bank' ? (
        <section key="bank" className="step-in flex flex-col gap-4">
          <Labelled label={t('bankName')}>
            <input value={bankName} onChange={(e) => setBankName(e.target.value)} className={field} />
          </Labelled>

          <Labelled label={t('iban')}>
            <input
              dir="ltr"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="SA00 0000 0000 0000 0000 0000"
              className={cn(field, 'bidi-ltr font-num')}
            />
          </Labelled>

          <Button disabled={busy} onClick={() => void finish()}>
            {t('finish')}
          </Button>

          {/*
            **ولا يُحبَس الحساب على خطوةٍ أخيرة.** من أكّد جوّاله صار له
            حساب، والباقي يُكمَل من الملفّ — وبنرُ الاكتمال يقوده إليه.
          */}
          <button
            type="button"
            className="text-2xs underline opacity-70"
            onClick={() => router.push(`/${locale}/account`)}
          >
            {t('skipForNow')}
          </button>
        </section>
      ) : null}
    </div>
  );
}

function Labelled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-2xs font-semibold opacity-70">{label}</span>
      {children}
      {hint === undefined ? null : <span className="text-3xs opacity-65">{hint}</span>}
    </label>
  );
}
