'use client';

import { useState, useTransition } from 'react';

/**
 * ═══ الرقمُ يُكشف بنقرةٍ ويُسجَّل ═══
 *
 * كانت اللوحة تعرض رقمَي العميل وصاحب المركبة **كاملين عند فتحها**،
 * ولا سطر يقول من نظر فيهما. والمزوّدُ هويةٌ ثالثة — مركزُ فحصٍ
 * خارجيّ بحسابه — فيرى رقمَي شخصين لم يتعاملا معه، ولا أثرَ يُراجَع.
 *
 * **ولا يُطلب سبب.** كشفُ الهوية في الأدمن يطلبه لأنه استثناء،
 * والرقم هنا أداةُ العمل: المزوّد يتّصل ليُحدّد موعدًا. فطلبُ سببٍ
 * في كل مرّة عداءٌ لمن يؤدّي عملَه — **والنقرةُ هي القصد، والسجلّ هو
 * الحساب**.
 */
export function RevealPhone({
  requestRef,
  party,
  tail,
}: {
  requestRef: string;
  party: 'requester' | 'keeper';
  /** آخر أربع خانات — تكفي للتمييز ولا تكفي للاتّصال. */
  tail: string;
}) {
  const [phone, setPhone] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [busy, start] = useTransition();

  if (phone !== null) {
    return (
      <a dir="ltr" href={`tel:${phone}`} className="font-num text-2xs underline underline-offset-4">
        {phone}
      </a>
    );
  }

  return (
    <span className="flex flex-wrap items-baseline gap-2">
      <span dir="ltr" className="font-num text-2xs opacity-75">
        ••••{tail}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          start(async () => {
            setError(false);
            const response = await fetch(
              `/api/v1/provider/requests/${encodeURIComponent(requestRef)}/contact`,
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ party }),
              },
            ).catch(() => null);

            const payload = (await response?.json().catch(() => null)) as
              | { data?: { phone?: string } }
              | null;

            if (response === null || !response.ok || typeof payload?.data?.phone !== 'string') {
              setError(true);
              return;
            }
            setPhone(payload.data.phone);
          })
        }
        className="text-3xs font-bold underline underline-offset-4 opacity-75 hover:opacity-100"
      >
        {busy ? 'يكشف…' : 'أظهر الرقم'}
      </button>
      {!error ? null : <span className="text-3xs text-danger">تعذر الكشف.</span>}
    </span>
  );
}
