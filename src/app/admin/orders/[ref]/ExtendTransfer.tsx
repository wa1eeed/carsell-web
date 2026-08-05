'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { toArabicDigits } from '@/lib/arabic';

/**
 * ═══ تمديد سقف النقل — مرّة واحدة بسببٍ مكتوب ═══
 *
 * `extendTransferDeadline` مبنيّة ومختبَرة بحدّها وبسببها الإلزاميّ،
 * **ولا ينادِيها شيء**. فطلبٌ عالق في المرور لسببٍ خارج يدَي الطرفين
 * يمضي إلى الإلغاء التلقائيّ، ولا يملك التشغيلُ ما يوقفه به.
 *
 * **والممدَّد لا يُعرض له زرّ**: النطاق يردّ `ALREADY_EXTENDED`، وزرٌّ
 * يُرفض بعد الضغط أسوأ من غيابه.
 */
const REASON_MIN = 10;

export function ExtendTransfer({
  orderRef,
  days,
  extendedAt,
  reason,
}: {
  orderRef: string;
  days: number;
  extendedAt: string | null;
  reason: string | null;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  if (extendedAt !== null) {
    return (
      <p className="mt-2.5 rounded-md border border-line bg-surface p-3 text-3xs leading-loose opacity-70">
        <b>مُدّد مرّة</b> — ولا يُمدَّد ثانية.
        {reason === null || reason === '' ? null : <> السبب: {reason}</>}
      </p>
    );
  }

  const submit = (): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/orders/${orderRef}/extend-transfer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: text.trim() }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر التمديد.');
        return;
      }

      setOpen(false);
      setText('');
      setToast('مُدّد سقف النقل — وسُجّل السبب في الأثر.');
      router.refresh();
    });
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="mt-2.5" onClick={() => setOpen(true)}>
        مدّد سقف النقل
      </Button>
    );
  }

  return (
    <>
      <div className="mt-2.5 rounded-md border border-line p-3.5">
        <p className="mb-2.5 text-3xs leading-loose opacity-70">
          يُضاف أيّام ({toArabicDigits(String(days))}) إلى السقف، مرّة واحدة. والسبب
          إلزاميّ لأن التمديد يؤخّر مال المشتري — فمن يؤخّره يُسمّي لماذا.
        </p>
        <textarea
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="تأخّر موعد المرور بسبب…"
          className="mb-2.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-2xs leading-loose"
        />
        <div className="flex gap-2">
          <Button size="sm" disabled={busy || text.trim().length < REASON_MIN} onClick={submit}>
            {busy ? 'جارٍ…' : 'مدّد'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            تراجع
          </Button>
        </div>
      </div>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
