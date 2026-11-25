'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Button } from '@/components/ui/Button';
import { toLatinDigits } from '@/lib/arabic';

/**
 * ═══ التحقّق بنفاذ — ودورةُ الانتظار تُلغى لا تُسرَّع ═══
 *
 * قرار المالك ٢٠٢٦-١١-٢٥. واليومَ يكتب المستخدم بياناته **وينتظر
 * موظّفًا يراجعها** — ساعاتٌ لا يشتري فيها ولا يبيع. وبنفاذ يصل
 * الاسمُ والرقم من المصدر الحكوميّ في ثوانٍ.
 *
 * **والرقمُ العشوائيّ يُعرض ولا يُخفى**: المستخدم يفتح تطبيقَ نفاذ
 * فيجد ثلاثةَ أرقام ويضغط ما يطابق شاشتَنا. فالعرضُ جزءٌ من الأمان،
 * ومن لم يرَ شاشتَنا لا يعرف أيَّها يضغط.
 *
 * **والرايةُ المطفأة تُخفي لا تُعطّل** (قرار ٢٤): ما دامت نفاذُ غيرَ
 * موصولة لا يُعرض شيءٌ هنا، ويبقى النموذجُ اليدويّ وحده — لا زرٌّ
 * يردّ «غير متاح».
 */
export function NafathVerify({ available, onDone }: { available: boolean; onDone?: () => void }) {
  const router = useRouter();
  const [nationalId, setNationalId] = useState('');
  const [challenge, setChallenge] = useState<{ transactionId: string; random: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  /**
   * **ويُسأل عن الحال حتى تُحسم.** المستخدم ينظر إلى هاتفه لا إلى
   * شاشتنا، فزرُّ «تحقّقتُ، تابع» يجعله يعود ليضغط — وقد انتهت المهلة.
   */
  useEffect(() => {
    if (challenge === null) return;
    let alive = true;
    const timer = setInterval(() => {
      void fetch('/api/v1/me/identity/nafath', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transactionId: challenge.transactionId }),
      })
        .then((r) => r.json())
        .then((payload: { data?: { state?: string }; error?: { messageAr?: string } }) => {
          if (!alive) return;
          if (payload.data?.state === 'APPROVED') {
            setChallenge(null);
            onDone?.();
            router.refresh();
            return;
          }
          if (payload.error !== undefined) {
            setChallenge(null);
            setError(payload.error.messageAr ?? 'تعذر التحقق.');
          }
        })
        .catch(() => undefined);
    }, 2_500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [challenge, onDone, router]);

  /**
   * **والقرارُ يصل من الخادم لا يُسأل عنه بعد التحميل.** سؤالٌ بعد
   * الرسم يُنتج ومضةً: يرى المستخدم النموذجَ اليدويّ ثمّ يقفز فوقه
   * بابُ نفاذ — فيبدأ الكتابة في الأوّل ثمّ يُربَك.
   */
  if (!available) return null;

  const begin = (): void => {
    const value = toLatinDigits(nationalId).replace(/\D/g, '');
    setError(null);
    start(async () => {
      const response = await fetch('/api/v1/me/identity/nafath', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nationalId: value }),
      }).catch(() => null);
      const payload = (await response?.json().catch(() => null)) as
        | { data?: { transactionId: string; random: string }; error?: { messageAr?: string } }
        | null;
      if (response === null || !response.ok || payload?.data === undefined) {
        setError(payload?.error?.messageAr ?? 'تعذر بدء التحقق.');
        return;
      }
      setChallenge({ transactionId: payload.data.transactionId, random: payload.data.random });
    });
  };

  return (
    <div className="mb-4 rounded-lg border border-accent-700/40 bg-accent-100 p-4">
      {challenge === null ? (
        <>
          <p className="mb-1 text-2xs font-bold">وثق هويتك بنفاذ — ثواني بدل انتظار المراجعة</p>
          <p className="mb-3 text-3xs leading-loose opacity-75">
            يصل اسمك ورقم هويتك من المصدر الحكومي مباشرة. ولا نطلب صورة هوية.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-40 flex-1 flex-col gap-1">
              <span className="text-3xs opacity-70">رقم الهوية أو الإقامة</span>
              <input
                dir="ltr"
                inputMode="numeric"
                value={nationalId}
                onChange={(event) => setNationalId(event.target.value)}
                placeholder="1XXXXXXXXX"
                className="font-num rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm"
              />
            </label>
            <Button disabled={pending || nationalId.trim().length < 10} onClick={begin}>
              {pending ? 'يبدأ…' : 'تحقق بنفاذ'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-1 text-2xs font-bold">افتح تطبيق نفاذ واختر هذا الرقم</p>
          <p className="my-3 text-center text-4xl font-bold">
            <ArabicNumber value={Number(challenge.random)} grouped={false} />
          </p>
          <p className="text-3xs leading-loose opacity-75">
            ستجد في التطبيق ثلاثة أرقام — اضغط المطابق لما هنا. ونكمل تلقائيا بعد
            موافقتك، فلا تغلق هذه الصفحة.
          </p>
        </>
      )}
      {error === null ? null : (
        <p className="mt-2.5 text-3xs font-bold text-danger">{error}</p>
      )}
    </div>
  );
}
