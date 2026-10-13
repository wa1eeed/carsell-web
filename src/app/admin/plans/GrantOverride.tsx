'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * ═══ منح تجاوزٍ لعميل ═══
 *
 * `EntitlementOverride` كان **بلا كاتبٍ إطلاقًا**: الشاشة تعدّه وتكتب
 * «وكل تجاوزٍ يُمنح يظهر هنا بسببه ومدّته» — ولا زرَّ يمنحه. وهو صنفُ
 * «شاشةٌ تَعِد بما لا يقع» الذي يتكرّر في هذا المستودع.
 *
 * **والسبب حقلٌ إلزاميّ ظاهر** لا خانةٌ اختيارية: من يمنح استثناءً
 * يكتب لماذا، وإلّا قرأه مَن بعده خطأً — أو أسوأ. والحارس في النطاق
 * أيضًا (`REASON_REQUIRED`)، فالشاشة تُسهّل ولا تحرس وحدها.
 */
export function GrantOverride({
  entitlements,
}: {
  entitlements: readonly { key: string; type: string; defaultValue: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [userId, setUserId] = useState('');
  const [key, setKey] = useState(entitlements[0]?.key ?? '');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState('');

  const ready = userId.trim() !== '' && key !== '' && value.trim() !== '' && reason.trim().length >= 4;

  const submit = (): void => {
    setError(null);
    start(async () => {
      const response = await fetch('/api/v1/admin/overrides', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: userId.trim(),
          entitlementKey: key,
          value: value.trim(),
          reason: reason.trim(),
          /** **والدائم `null` لا تاريخٌ بعيد** — البعيد يُنسى ويبقى. */
          expiresAt: until === '' ? null : new Date(`${until}T23:59:59`).toISOString(),
        }),
      }).catch(() => null);

      if (response === null || !response.ok) {
        setError('تعذّر منح التجاوز — راجع المعرّف والقيمة.');
        return;
      }

      setOpen(false);
      setUserId('');
      setValue('');
      setReason('');
      setUntil('');
      router.refresh();
    });
  };

  const field = 'w-full rounded-md border border-line bg-bg px-3 py-2 text-2xs';
  const label = 'mb-1 block text-3xs font-bold opacity-55';

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="mb-3.5">
        امنح تجاوزًا
      </Button>
    );
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-line p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label>
          <span className={label}>معرّف العميل</span>
          <input dir="ltr" value={userId} onChange={(e) => setUserId(e.target.value)} className={field} />
        </label>

        <label>
          <span className={label}>الخاصّية</span>
          <select value={key} onChange={(e) => setKey(e.target.value)} className={field}>
            {entitlements.map((row) => (
              <option key={row.key} value={row.key}>
                {row.key} — الافتراضيّ {row.defaultValue}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className={label}>القيمة</span>
          <input dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} className={field} />
        </label>

        <label>
          <span className={label}>حتى تاريخ — اتركه فارغًا لتجاوزٍ دائم</span>
          <input type="date" dir="ltr" value={until} onChange={(e) => setUntil(e.target.value)} className={field} />
        </label>
      </div>

      <label>
        <span className={label}>السبب — إلزاميّ</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="لماذا مُنح هذا الاستثناء؟ يقرؤه من بعدك."
          className={field}
        />
      </label>

      {error === null ? null : <p className="text-3xs text-danger">{error}</p>}

      <div className="flex flex-wrap items-center gap-2.5">
        <Button size="sm" onClick={submit} disabled={!ready || pending}>
          امنح
        </Button>
        <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
          إلغاء
        </Button>
      </div>
    </div>
  );
}
