'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Quantity } from '@/components/ui/Quantity';
import { Button } from '@/components/ui/Button';
import { ServiceRequestCard } from '@/components/admin/ServiceRequestCard';
import { ASSIGN_FAILURE_LABEL } from '@/lib/labels/admin';
import { Toast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { displayDigits } from '@/lib/arabic';
import type { AssignFailure, ServiceRequestRow } from '@/lib/domain/admin-services';

/**
 * ═══ الإسناد — مفردًا وجماعيًّا ═══
 *
 * ترميزُ A6 يضع «أسنِد» لكلّ صفّ و«إسناد جماعي» في الترويسة. **ولم
 * يكن في اللوحة إسنادٌ إطلاقًا**: الطابورُ بطاقاتٌ تُقرأ، والمزوّدُ
 * وحده يلتقط الطلب من طابوره. فطلبٌ لا يلتقطه أحد يبقى «بلا مزوّد»
 * حتى تنقضي مهلتُه، والمشغّلُ يراه ولا يملك شيئًا.
 *
 * **والاختيارُ على ما يُسنَد وحده**: طلبٌ مُسنَدٌ أو منتهٍ لا مربّعَ
 * له — ومربّعٌ يُحدَّد ثمّ يُرفض بعد الضغط يُعلّم المشغّل تجاهل
 * التقرير.
 */
export function AssignQueue({
  requests,
  providers,
}: {
  requests: readonly ServiceRequestRow[];
  providers: readonly { id: string; nameAr: string }[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [provider, setProvider] = useState('');
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const assignable = requests.filter((row) => row.status === 'NEW' && row.providerName === null);
  const chosen = picked.filter((ref) => assignable.some((row) => row.ref === ref));

  const toggle = (ref: string): void => {
    setPicked((current) =>
      current.includes(ref) ? current.filter((entry) => entry !== ref) : [...current, ref],
    );
  };

  const send = (refs: readonly string[]): void => {
    if (provider === '' || refs.length === 0) return;
    setPending(true);
    void fetch('/api/v1/admin/service-requests/assign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refs, providerId: provider }),
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | { data?: { assigned: string[]; failed: { ref: string; reason: AssignFailure }[] } }
          | null;
        if (!response.ok || payload?.data === undefined) {
          setToast('تعذر الإسناد.');
          return;
        }
        const { assigned, failed } = payload.data;
        /**
         * **والمتعذّر يُسمّى بمرجعه وسببه** — «أُسنِد ٧ من ١٠» يترك
         * المشغّل يبحث عن الثلاثة بنفسه.
         */
        /**
         * **ورسالةُ الToast نصٌّ لا عنصر**، فلا يبلغها `<Quantity>`.
         * فتُصاغ بلا معدودٍ يحكمه العدد — «المسندة (٥)» لا «٥ طلبات» —
         * والرقمُ يمرّ بـ`displayDigits`.
         */
        const n = (value: number): string => displayDigits(String(value));
        setToast(
          failed.length === 0
            ? `المسندة (${n(assigned.length)})`
            : `المسندة (${n(assigned.length)}) · تعذر: ${failed
                .map((row) => `${row.ref} — ${ASSIGN_FAILURE_LABEL[row.reason]}`)
                .join(' · ')}`,
        );
        setPicked([]);
        router.refresh();
      })
      .catch(() => setToast('تعذر الإسناد.'))
      .finally(() => setPending(false));
  };

  return (
    <>
      {assignable.length === 0 ? null : (
        <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-lg border border-line bg-surface p-3.5">
          <label className="flex items-center gap-2 text-2xs">
            <span className="opacity-70">المزود</span>
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              className="rounded-btn border border-line bg-bg px-3 py-2 text-2xs"
            >
              <option value="">اختر مزودا</option>
              {providers.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.nameAr}
                </option>
              ))}
            </select>
          </label>

          <Button
            size="sm"
            variant="outline"
            disabled={pending || provider === '' || chosen.length === 0}
            onClick={() => send(chosen)}
          >
            إسناد جماعي
            {chosen.length === 0 ? null : (
              <>
                {' '}
                (<ArabicNumber value={chosen.length} />)
              </>
            )}
          </Button>

          <span className="flex-1" />
          <span className="text-3xs opacity-70">
            {/* **والقابلُ للإسناد يُقال** — لا يُترك المشغّل يعدّ المربّعات. */}
            <Quantity unit="unassignedRequests" count={assignable.length} />
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {requests.map((request) => {
          const canAssign = request.status === 'NEW' && request.providerName === null;
          const on = picked.includes(request.ref);

          return (
            <div key={request.ref} className="flex items-start gap-2.5">
              {canAssign ? (
                <label
                  className={cn(
                    'mt-3 flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1.5 text-3xs',
                    on ? 'bg-ink/8 font-bold' : 'opacity-70 hover:opacity-100',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(request.ref)}
                    className="size-4 accent-ink"
                  />
                  <span className="sr-only">اختر {request.ref}</span>
                </label>
              ) : (
                /** عرضُ المربّع محجوزٌ ولو لم يُعرض — فلا تتزحزح البطاقات. */
                <span aria-hidden className="mt-3 inline-block size-4 px-1.5 py-1.5" />
              )}

              <div className="min-w-0 flex-1">
                <ServiceRequestCard row={request} />
              </div>
            </div>
          );
        })}
      </div>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
