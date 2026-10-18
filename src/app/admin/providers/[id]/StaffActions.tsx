'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import type { ProviderStaff } from '@/lib/domain/admin-provider-detail';

/**
 * ═══ من يدخل لوحته — والبطاقةُ كانت تعرض ولا تُنشئ ═══
 *
 * `providerUser.create` كان في البذرة وحدها، والبطاقة تقول «بلا حساب
 * لا يرى المزوّد طلباته» **ثمّ لا تعرض علاجًا**. فكلُّ مزوّدٍ يُضاف
 * من اللوحة مسدودٌ عليه الباب إلى الأبد.
 *
 * **والكلمة تُعرض مرّةً واحدة.** لا تُخزَّن إلّا مجزَّأة ولا تُكتب في
 * سجلّ — والسجلّ يُقرأ بعد سنةٍ بعيونٍ كثيرة. فمن أغلق النافذة قبل
 * نسخها يُعيد الضبط، ولا يسترجعها أحد.
 */
const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  dateStyle: 'medium',
  timeZone: 'Asia/Riyadh',
});

export function StaffActions({
  providerId,
  staff,
  canManage,
}: {
  providerId: string;
  staff: readonly ProviderStaff[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', email: '' });
  /** الكلمةُ الظاهرة الآن — تختفي بأوّل تحديثٍ للصفحة ولا تُطلب ثانيةً. */
  const [shown, setShown] = useState<{ email: string; password: string } | null>(null);

  const ready = form.name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());

  const create = (): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/providers/${providerId}/staff`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), email: form.email.trim() }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { data?: { tempPassword?: string }; error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok || typeof payload?.data?.tempPassword !== 'string') {
        setToast(payload?.error?.messageAr ?? 'تعذر فتح الحساب.');
        return;
      }

      setShown({ email: form.email.trim(), password: payload.data.tempPassword });
      setForm({ name: '', email: '' });
      setAdding(false);
      router.refresh();
    });
  };

  const patch = (userId: string, body: unknown, done: string): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/providers/${providerId}/staff/${userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { data?: { tempPassword?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast('تعذر التنفيذ.');
        return;
      }
      if (typeof payload?.data?.tempPassword === 'string') {
        const person = staff.find((row) => row.id === userId);
        setShown({ email: person?.email ?? '', password: payload.data.tempPassword });
      }
      setToast(done);
      router.refresh();
    });
  };

  return (
    <>
      {shown === null ? null : (
        <div className="mb-4 rounded-lg border border-line bg-surface p-4">
          <p className="mb-2 text-2xs font-bold">كلمة الدخول المؤقتة</p>
          <p className="mb-2.5 text-3xs leading-loose opacity-75">
            انسخها الآن وسلمها للمزود — <b>لا تظهر مرة أخرى</b>، ويجبر على
            تغييرها عند أول دخول.
          </p>
          <p dir="ltr" className="bidi-ltr mb-1 font-num text-2xs opacity-70">{shown.email}</p>
          <p dir="ltr" className="bidi-ltr font-num text-base font-bold">{shown.password}</p>
          <Button size="sm" variant="ghost" className="mt-2.5" onClick={() => setShown(null)}>
            أخفها
          </Button>
        </div>
      )}

      {staff.length === 0 ? (
        <p className="mb-3.5 text-2xs leading-loose opacity-75">
          بلا حساب لا يرى المزود طلباته ولا يؤكد إنجازها.
        </p>
      ) : (
        <div className="mb-3.5 flex flex-col divide-y divide-line">
          {staff.map((person) => (
            <div key={person.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-2xs font-bold">{person.name}</span>
                <span dir="ltr" className="bidi-ltr mt-0.5 block text-3xs opacity-70">
                  {person.email}
                </span>
              </span>
              {person.mustChangePassword ? <Badge tone="warn">لم يغير كلمته بعد</Badge> : null}
              {person.active ? null : <Badge tone="danger">موقوف</Badge>}
              <span className="text-3xs opacity-65">
                {person.lastSeenAt === null
                  ? 'لم يدخل بعد'
                  : riyadh.format(new Date(person.lastSeenAt))}
              </span>
              {!canManage ? null : (
                <span className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      patch(person.id, { resetPassword: true }, 'أعيد ضبط الكلمة وسحبت جلساته.')
                    }
                  >
                    كلمة جديدة
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={person.active ? 'text-danger' : undefined}
                    disabled={busy}
                    onClick={() =>
                      patch(
                        person.id,
                        { active: !person.active },
                        person.active ? 'أوقف الحساب.' : 'أعيد تفعيل الحساب.',
                      )
                    }
                  >
                    {person.active ? 'أوقفه' : 'أعده'}
                  </Button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {!canManage ? null : adding ? (
        <div className="rounded-lg border border-line p-4">
          <label className="mb-3 flex flex-col gap-1.5">
            <span className="text-3xs font-bold opacity-70">الاسم</span>
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="mb-3 flex flex-col gap-1.5">
            <span className="text-3xs font-bold opacity-70">البريد — به يدخل</span>
            {/* بريدٌ يُقارن خانةً بخانة — لاتينيّ معزول */}
            <input
              dir="ltr"
              inputMode="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              className="rounded-md border border-line bg-surface px-3 py-2 text-start font-num text-sm"
            />
          </label>
          <span className="flex gap-2">
            <Button size="sm" disabled={busy || !ready} onClick={create}>
              {busy ? 'جار…' : 'افتح الحساب'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              إلغاء
            </Button>
          </span>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          افتح حساب دخول
        </Button>
      )}

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
