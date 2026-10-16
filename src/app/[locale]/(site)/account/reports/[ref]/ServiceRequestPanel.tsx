'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { MIN_DECLINE_REASON } from '@/lib/domain/service-rules';

/**
 * ═══ قرارُ البائع وسدادُ الطالب — شاشةٌ بوجهين ═══
 *
 * قرار المالك (٢٠٢٦-١٠-١٤): طلبُ المشتري لفحص مركبةٍ ليست له **يمرّ
 * بالبائع**، والسداد بعد قبوله.
 *
 * **ولا شيء من هذا كان له زرّ**: الدورة مبنيّةٌ في النطاق ومسارُها
 * مكتوب، وبلا هذه اللوحة يبقى الطلبُ عند «ينتظر إذن البائع» أبدًا —
 * وهو الصنف الذي أُصلح في غيره مرارًا: طرفٌ يُبنى بلا الطرف الثاني.
 */
export function ServiceRequestPanel({
  ref_,
  role,
  status,
  total,
  locale,
}: {
  /** `ref` اسمٌ محجوز في React — ولا يُمرَّر خاصّيةً */
  ref_: string;
  role: 'REQUESTER' | 'SELLER';
  status: string;
  total: string;
  locale: string;
}) {
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  const send = (path: string, body: unknown, done: string): void => {
    start(async () => {
      const response = await fetch(`/api/v1/service-requests/${encodeURIComponent(ref_)}/${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(path === 'pay' ? { 'idempotency-key': `svc-${ref_}-${String(Date.now())}` } : {}),
        },
        body: JSON.stringify(body),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string; actionUrl?: string } }
        | null;

      if (response === null || !response.ok) {
        /** تحدّي البطاقة وجهةٌ يُكملها — لا رسالةُ فشل */
        const action = payload?.error?.actionUrl;
        if (typeof action === 'string' && action !== '') {
          window.location.assign(action);
          return;
        }
        setToast(payload?.error?.messageAr ?? 'تعذّر التنفيذ.');
        return;
      }

      setToast(done);
      /**
       * **تحميلٌ كامل لا `router.refresh`**: الحال تُقرأ في الخادم،
       * وتنقّلٌ داخل العميل يُبقي ما صُيّر قبله — فيقرأ من قرّر نجاحًا
       * ويرى شكل ما قبله.
       */
      window.location.assign(`/${locale}/account/reports/${encodeURIComponent(ref_)}`);
    });
  };

  if (role === 'SELLER' && status === 'AWAITING_SELLER') {
    return (
      <>
        <div className="flex flex-col gap-3 rounded-xl border-2 border-ink p-5">
          <p className="text-sm font-bold">يُطلب فحصُ مركبتك</p>
          <p className="text-2xs leading-loose opacity-75">
            طلب أحد المهتمّين فحصَ هذه المركبة على حسابه. وبقبولك يصل الفاحص بياناتِ
            التواصل والمدينة ليحدّد الموعد معك — ولا يُكشف شيء قبل ذلك. ولا تدفع أنت
            شيئًا.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Button disabled={pending} onClick={() => send('decision', { accept: true, reason: null }, 'أذِنتَ بالفحص.')}>
              أذن بالفحص
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => setDeclining(true)}>
              ارفض
            </Button>
          </div>
        </div>

        <Modal
          open={declining}
          onClose={() => setDeclining(false)}
          title="رفض طلب الفحص"
          footer={
            <>
              <span className="flex-1" />
              <Button variant="ghost" onClick={() => setDeclining(false)}>
                تراجع
              </Button>
              <Button
                variant="danger"
                disabled={pending || reason.trim().length < MIN_DECLINE_REASON}
                onClick={() => send('decision', { accept: false, reason: reason.trim() }, 'رُفض الطلب.')}
              >
                ارفض
              </Button>
            </>
          }
        >
          {/* **ورفضٌ بلا سببٍ يُعيد الطالب إلى الحيرة** — فالسبب شرط */}
          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-bold opacity-70">لماذا؟ — يقرؤه طالبُ الفحص</span>
            <textarea
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="مثال: المركبة محجوزة لمشترٍ آخر هذا الأسبوع."
              className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm leading-loose"
            />
          </label>
        </Modal>

        {toast === null ? null : <Toast title={toast} />}
      </>
    );
  }

  if (role === 'REQUESTER' && status === 'AWAITING_PAYMENT') {
    return (
      <>
        <div className="flex flex-col gap-3 rounded-xl border-2 border-ink p-5">
          <p className="text-sm font-bold">أُذن بالفحص — يبقى السداد</p>
          <p className="text-2xs leading-loose opacity-75">
            يُحجز المبلغ على بطاقتك ولا يصل المزوّد إلّا بعد أداء الخدمة. وبعد السداد
            يذهب الطلب إلى فاحصي مدينة السيارة.
          </p>
          <Button
            disabled={pending}
            onClick={() =>
              send(
                'pay',
                {
                  method: 'mada',
                  returnUrl: `${window.location.origin}/${locale}/account/reports/${encodeURIComponent(ref_)}`,
                },
                'حُجز المبلغ — الطلب في طابور الفاحصين.',
              )
            }
          >
            ادفع {total} ريال
          </Button>
        </div>
        {toast === null ? null : <Toast title={toast} />}
      </>
    );
  }

  return null;
}
