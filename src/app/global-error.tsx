'use client';

import { useEffect } from 'react';

/**
 * حدّ الخطأ الأخير — ما لم يمسكه شيء قبله.
 *
 * **ولا يعرض رسالة الخطأ للزائر**: قد تحمل مسارًا أو معرّفًا أو جزءًا
 * من استعلام. و`digest` وحده يكفي للربط بالسجلّ — يقرؤه الزائر للدعم
 * ولا يقول عن النظام شيئًا.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void fetch('/api/v1/client-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: error.message, digest: error.digest ?? null }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body className="flex min-h-screen items-center justify-center bg-bg p-10 text-ink">
        <main className="max-w-md text-center">
          <h1 className="mb-2.5 text-2xl font-bold">تعذّر عرض الصفحة</h1>
          <p className="mb-6 text-sm leading-loose opacity-65">
            حدث خلل غير متوقّع وسُجّل عندنا. حاول مجددًا، وإن تكرّر فأبلغ الدعم بالرمز أدناه.
          </p>
          {error.digest === undefined ? null : (
            <p dir="ltr" className="bidi-isolate font-num mb-6 text-2xs opacity-50">
              {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-ink px-7 py-3 text-sm font-bold"
          >
            حاول مجددًا
          </button>
        </main>
      </body>
    </html>
  );
}
