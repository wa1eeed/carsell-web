'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';

/**
 * ═══ بابُ الخروج — ولم يكن له باب ═══
 *
 * قِيس فلم يكن في المنتج كلّه طريقٌ لإغلاق حساب: لا شاشة ولا مسار
 * ولا دالّة. فمن سجّل يبقى إلى الأبد.
 *
 * ═══ وقرار المالك: تجهيلٌ لا محو ═══
 *
 * تُمسح البيانات الشخصية وتبقى الفواتير والعقود — مستنداتٌ تُحفظ
 * سنوات. **والشاشة تقول ذلك صراحةً**: من ضغط «أغلق» وهو يظنّ أن كلّ
 * أثرٍ يذهب سيعود غدًا يسأل لماذا بقيت فاتورته.
 *
 * ═══ والمانع يُقرأ قبل الضغط ═══
 *
 * اكتشافُ «عليك عمل» بعد الضغط أسوأ توقيت — فتُقرأ الموانع عند فتح
 * الشاشة، ويُعطَّل الزرّ ويُقال سببُه.
 */

type Blocker = { code: string; messageAr: string };

export function CloseAccount() {
  const [open, setOpen] = useState(false);
  const [blockers, setBlockers] = useState<Blocker[] | null>(null);
  const [confirm, setConfirm] = useState('');
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    let alive = true;
    void fetch('/api/v1/me/close')
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { data?: { blockers: Blocker[] } } | null) => {
        if (alive) setBlockers(payload?.data?.blockers ?? []);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const blocked = blockers !== null && blockers.length > 0;

  /**
   * **والتأكيد بالكتابة لا بالضغط.** زرٌّ ثانٍ يُضغط بالعادة، وكلمةٌ
   * تُكتب تُوقف اليد — وهو إجراءٌ لا رجعة فيه.
   */
  const typed = confirm.trim() === 'إغلاق';

  const close = (): void => {
    if (!typed || blocked) return;
    start(async () => {
      const response = await fetch('/api/v1/me/close', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() === '' ? null : reason.trim() }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر إغلاق الحساب.');
        return;
      }

      /** والوداع يكون نظيفًا — إلى الرئيسية بلا جلسة. */
      window.location.href = '/';
    });
  };

  /**
   * **ولا سلّم لـ`danger` في التوكنات** — والأحمرُ لونُ الفعل هنا لا
   * لونُ البطاقة: عنوانٌ أحمرُ وزرٌّ أحمر على سطحٍ عاديّ أهدأ من
   * لوحةٍ حمراء كاملة تُفزع من جاء ليُكمل ملفّه.
   */
  return (
    <section className="mt-10 rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-1.5 text-sm font-bold text-danger">إغلاق الحساب</h2>
      <p className="mb-4 max-w-xl text-2xs leading-loose opacity-85">
        تُمسح بياناتك الشخصية — اسمك وجوّالك وبريدك وهويتك وآيبانك ومفضّلتك وبحوثك.
        <b> وتبقى فواتيرك وعقودك وسجلّ صفقاتك</b>، فهي مستندات يلزم حفظها نظامًا، وقد
        صدرت باسمك وقت إصدارها.
      </p>

      {blockers === null ? (
        <p className="text-2xs opacity-70">يُقرأ حالُ حسابك…</p>
      ) : blocked ? (
        <div className="rounded-lg border border-line bg-bg p-4">
          <p className="mb-2 text-2xs font-bold">لا يُغلق الآن:</p>
          <ul className="flex flex-col gap-1.5 text-2xs leading-loose opacity-85">
            {blockers.map((row) => (
              <li key={row.code}>· {row.messageAr}</li>
            ))}
          </ul>
        </div>
      ) : (
        <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
          أغلق حسابي
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="إغلاق الحساب"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              تراجع
            </Button>
            <Button variant="danger" size="sm" onClick={close} disabled={busy || !typed}>
              {busy ? 'يُغلق…' : 'أغلق نهائيًّا'}
            </Button>
          </>
        }
      >
        <p className="mb-3.5 text-xs leading-loose">
          لا رجعة في هذا. ولن تستطيع الدخول بعدها بهذا الجوّال، ولا استعادة ما مُسح.
        </p>

        <label className="mb-3.5 flex flex-col gap-1.5">
          <span className="text-2xs font-semibold">لماذا تغادر؟ (اختياريّ)</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            className="w-full rounded-md border border-line bg-bg p-3 text-2xs leading-loose outline-none focus:border-ink"
            placeholder="يصلنا ولا يُنشَر"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold">
            اكتب <b>إغلاق</b> لتأكيد
          </span>
          <input
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className="w-full rounded-md border border-line bg-bg p-3 text-2xs outline-none focus:border-ink"
          />
        </label>
      </Modal>

      {toast === null ? null : <Toast title={toast} tone="error" />}
    </section>
  );
}
