'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Toast } from '@/components/ui/Toast';
import type { DealerReplyRow } from '@/lib/domain/dealer-replies';

const HINT: Record<string, string> = {
  price: 'أقرب سعر ممكن',
  branch: 'اسم الفرع',
  score: 'درجة الحالة في تقرير الفحص',
};

/**
 * **والمتغيّراتُ تُعرض بمعناها لا برمزها.** `{score}` وحدها لا تقول
 * بم تُملأ، فمن يكتبها يحسبها رقمًا يكتبه هو.
 */
export function RepliesPanel({ rows }: { rows: readonly DealerReplyRow[] }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = (method: 'POST' | 'DELETE', payload: object, done: string): void => {
    start(async () => {
      const response = await fetch('/api/v1/dealer/replies', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null);

      const data = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(data?.error?.messageAr ?? 'تعذر التنفيذ.');
        return;
      }
      setBody('');
      setToast(done);
      router.refresh();
    });
  };

  return (
    <>
      {toast === null ? null : <Toast title={toast} />}

      <section className="mb-6 rounded-xl border border-line p-5">
        <h2 className="mb-3 text-3xs font-bold tracking-wide opacity-70">رد جديد</h2>
        <label htmlFor="reply" className="mb-2 block text-2xs opacity-75">
          نص الرد
        </label>
        <textarea
          id="reply"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          maxLength={400}
          className="w-full rounded-lg border border-line bg-bg p-3 text-2xs leading-loose"
          placeholder="شكرا لعرضك — أقرب سعر ممكن هو {price}"
        />
        <p className="mt-2 flex flex-wrap gap-2.5 text-3xs opacity-70">
          {Object.entries(HINT).map(([name, meaning]) => (
            <span key={name} className="rounded-md bg-ink/8 px-2 py-1">
              <span dir="ltr" className="font-num">{`{${name}}`}</span> — {meaning}
            </span>
          ))}
        </p>
        <Button
          size="sm"
          className="mt-3.5"
          disabled={pending || body.trim().length < 10}
          onClick={() => send('POST', { body }, 'أضيف الرد.')}
        >
          أضف
        </Button>
      </section>

      {rows.length === 0 ? (
        <EmptyState
          title="لا ردود جاهزة بعد"
          description="الرد الجاهز يختصر عليك كتابة الجملة نفسها في كل مفاوضة."
        />
      ) : (
        <ul className="rounded-xl border border-line">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-3 border-b border-line-2 p-4 last:border-b-0"
            >
              <p className="min-w-0 flex-1 text-2xs leading-loose">{row.body}</p>
              {row.variables.length === 0 ? null : (
                <span className="shrink-0 text-3xs opacity-70">
                  {row.variables.map((name) => (
                    <span key={name} dir="ltr" className="font-num me-1.5">{`{${name}}`}</span>
                  ))}
                </span>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => send('DELETE', { id: row.id }, 'حذف الرد.')}
              >
                احذف
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
