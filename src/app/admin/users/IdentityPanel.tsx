'use client';

import { useState } from 'react';
import { Quantity } from '@/components/ui/Quantity';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';

type Identity = {
  name: string | null;
  phone: string;
  email: string | null;
  idVerified: boolean;
  idVerifiedAt: string | null;
  ibanTail: string | null;
};

type AccessEntry = { actorId: string; createdAt: string; reason: string | null };

/**
 * كشف الهوية — **بسبب مكتوب قبل الكشف**.
 *
 * حقل السبب ليس بيروقراطية: هو ما يجعل سجلّ الاطّلاع قابلًا للمراجعة.
 * سجلٌّ يقول «فلان اطّلع» بلا لماذا لا يفرّق بين معالجة طلب وفضول.
 */
export function IdentityPanel({ userId, allowed }: { userId: string; allowed: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [log, setLog] = useState<AccessEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const reveal = async (): Promise<void> => {
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/admin/users/${userId}/identity`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) return;
      const body = (await response.json()) as {
        data?: { identity: Identity; accessLog: AccessEntry[] };
      };
      if (body.data === undefined) return;
      setIdentity(body.data.identity);
      setLog(body.data.accessLog);
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) return <span className="text-3xs opacity-40">بلا صلاحية</span>;

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        الهوية
      </Button>

      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          setIdentity(null);
          setReason('');
        }}
        title="كشف الهوية"
      >
        {identity === null ? (
          <>
            <p className="mb-4 text-sm leading-loose opacity-70">
              هذا الاطّلاع يُسجَّل باسمك وبالسبب الذي تكتبه، ويظهر للعميل في سجلّه.
            </p>
            <label className="mb-2 block text-2xs font-semibold opacity-60">سبب الاطّلاع</label>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="mb-4 w-full rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm outline-none"
            />
            <Button onClick={() => void reveal()} disabled={reason.trim().length < 10 || busy}>
              اكشف وسجّل
            </Button>
            {reason.trim().length < 10 ? (
              <p className="mt-2.5 text-2xs opacity-50">اكتب سببًا واضحًا — عشرة أحرف على الأقل.</p>
            ) : null}
          </>
        ) : (
          <>
            <dl className="mb-6 flex flex-col gap-3.5">
              {(
                [
                  ['الاسم', identity.name ?? '—'],
                  ['الجوال', identity.phone],
                  ['البريد', identity.email ?? '—'],
                  ['الآيبان', identity.ibanTail === null ? '—' : `···${identity.ibanTail}`],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4">
                  <dt className="text-2xs opacity-55">{label}</dt>
                  <dd className="bidi-isolate text-sm font-bold">{value}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-2xs opacity-55">التوثيق</dt>
                <dd>
                  <Badge tone={identity.idVerified ? 'accent' : 'neutral'}>
                    {identity.idVerified ? 'موثّق' : 'غير موثّق'}
                  </Badge>
                </dd>
              </div>
            </dl>

            <h3 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-45">
              سجلّ الاطّلاع
            </h3>
            <ul className="flex flex-col gap-2.5 text-2xs">
              {log.map((entry, i) => (
                <li key={i} className="flex items-baseline justify-between gap-4 border-b border-line-2 pb-2">
                  <span className="font-num opacity-55">{entry.actorId.slice(-6)}</span>
                  <span className="bidi-isolate flex-1 opacity-70">{entry.reason ?? '—'}</span>
                </li>
              ))}
              {log.length === 0 ? <li className="opacity-50">لا اطّلاع سابق.</li> : null}
            </ul>
            <p className="mt-4 flex items-center gap-1.5 text-3xs opacity-45">
              <Quantity unit="accesses" count={log.length} />
              <span>مسجَّل</span>
            </p>
          </>
        )}
      </Sheet>
    </>
  );
}
