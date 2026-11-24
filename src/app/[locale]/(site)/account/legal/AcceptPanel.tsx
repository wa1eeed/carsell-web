'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { displayDigits } from '@/lib/arabic';

/**
 * ═══ طلبُ القبول — **والمربّعُ يُؤشَّر قبل الزرّ** ═══
 *
 * قبولٌ يقع بضغطةِ زرٍّ وحده ليس قبولًا مُعلَنًا: الإقرارُ يُؤشَّر،
 * والزرُّ ينفّذه. وهو شكلُ شاشة الدخول نفسُه، **وهناك كان يموت في
 * المتصفّح** — وهنا يُكتب صفًّا بنسخته.
 */
export function AcceptPanel({
  locale,
  pending,
}: {
  locale: string;
  pending: { key: string; titleAr: string; version: string }[];
}) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, start] = useTransition();

  const accept = (): void => {
    start(async () => {
      const response = await fetch('/api/v1/me/legal', { method: 'POST' });
      if (!response.ok) {
        setToast({ tone: 'error', text: 'لم تسجل الموافقة، أعد المحاولة.' });
        return;
      }
      setToast({ tone: 'success', text: 'سجلت موافقتك بتاريخها ونسختها.' });
      router.refresh();
    });
  };

  return (
    <>
      <div className="mb-7 rounded-xl border border-warn-200 bg-warn-100 p-5">
        <p className="text-2xs font-bold">ننتظر موافقتك</p>
        <p className="mt-1 text-3xs leading-loose opacity-78">
          اقرأ المستندات التالية ثم أشر الإقرار. <b>ولن تمنع من شيء قبل ذلك</b> —
          لكن موافقتك تسجل بنسختها، وهي ما نرجع إليه إن وقع خلاف.
        </p>

        <ul className="mt-3.5 flex flex-col gap-2">
          {pending.map((doc) => (
            <li key={doc.key} className="flex flex-wrap items-center gap-2.5 text-2xs">
              <a
                href={`/${locale}/legal/${doc.key}`}
                target="_blank"
                rel="noreferrer"
                className="font-bold underline"
              >
                {doc.titleAr}
              </a>
              <span className="font-num text-3xs opacity-70">{displayDigits(doc.version)}</span>
            </li>
          ))}
        </ul>

        <label className="mt-4 flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            className="mt-0.5 size-3.5 shrink-0 accent-ink"
          />
          <span className="text-2xs leading-loose">
            أقر بأني قرأت المستندات أعلاه بنسخها المذكورة وأوافق عليها.
          </span>
        </label>

        <div className="mt-4">
          <Button size="sm" onClick={accept} disabled={busy || !agreed}>
            {busy ? 'جاري…' : 'سجل موافقتي'}
          </Button>
        </div>
      </div>

      {toast === null ? null : <Toast tone={toast.tone} title={toast.text} />}
    </>
  );
}
