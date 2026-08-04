'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { toLatinDigits } from '@/lib/arabic';
import { DEADLINE_LABEL } from '@/lib/labels/admin';
import type { DeadlineRow } from '@/lib/domain/deadlines';

/**
 * A22 — المهل الزمنية.
 *
 * **كانت اثنتين وعشرين ثابتة في الشيفرة**، تغييرُ أيٍّ منها يحتاج نشرًا.
 * وهي قواعد عمل يقرّرها المشغّل: مهلة الدفع تُقصَّر حين يزدحم الطلب،
 * ومهلة نقل الملكية تتبع دوام المرور لا دورة إصدارنا.
 *
 * **وأثر كل مهلة مكتوبٌ تحتها** — من يقرأ «٢٤ ساعة» لا يعرف ماذا يقع
 * بعدها، ومن يعدّلها يجب أن يعرف أنه يُسقط طلبات.
 */
export function DeadlinesTable({
  rows,
  canManage,
}: {
  rows: readonly DeadlineRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const save = (row: DeadlineRow): void => {
    const raw = drafts[row.key];
    if (raw === undefined) return;
    const value = Number(toLatinDigits(raw).replace(/\D/g, ''));
    if (!Number.isFinite(value)) return;

    start(async () => {
      const response = await fetch('/api/v1/admin/deadlines', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: row.key, value }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر الحفظ.');
        return;
      }

      setDrafts((prev) => {
        const next = { ...prev };
        delete next[row.key];
        return next;
      });
      setToast('حُفظت المهلة. والطلبات القائمة تبقى على مهلتها.');
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex flex-col gap-2.5">
        {rows.map((row) => {
          const label = DEADLINE_LABEL[row.key];
          const draft = drafts[row.key];
          const dirty = draft !== undefined && Number(toLatinDigits(draft)) !== row.value;

          return (
            <section key={row.key} className="rounded-lg border border-line bg-surface p-4">
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-bold">{label?.name ?? row.key}</h2>
                {row.isDefault ? (
                  <Badge tone="neutral">الافتراضيّ</Badge>
                ) : (
                  <Badge tone="accent">معدَّلة</Badge>
                )}
              </div>

              <p className="mb-3 text-2xs leading-loose opacity-55">{label?.effect ?? ''}</p>

              <div className="flex flex-wrap items-center gap-2.5">
                {!canManage ? (
                  <span className="font-num text-lg font-bold">
                    <ArabicNumber value={row.value} grouped={false} />
                  </span>
                ) : (
                  <>
                    {/* الرقم يُدخل ويُقارن — لاتينيّ معزول */}
                    <input
                      dir="ltr"
                      inputMode="numeric"
                      value={draft ?? String(row.value)}
                      onChange={(event) =>
                        setDrafts((prev) => ({ ...prev, [row.key]: event.target.value }))
                      }
                      className="font-num w-28 rounded-md border border-line bg-bg px-3.5 py-2 text-sm font-bold"
                    />
                    <span className="text-2xs opacity-60">{label?.unit ?? ''}</span>
                    <Button size="sm" disabled={pending || !dirty} onClick={() => save(row)}>
                      حفظ
                    </Button>
                  </>
                )}

                {/*
                  الحدّ يُعرض قبل المحاولة لا بعد الرفض. ومدىً بشرطة لا
                  بـ«بين … و…»: الواو بعد رقمٍ تقرؤها البوابة ١٨ وحدةً،
                  وهي محقّة في الصنف — العربية ستّ حالات جمع.
                */}
                <span className="text-3xs opacity-40">
                  الحدّ{' '}
                  <span dir="ltr" className="font-num">
                    <ArabicNumber value={row.min} grouped={false} />–
                    <ArabicNumber value={row.max} grouped={false} />
                  </span>
                </span>
              </div>
            </section>
          );
        })}
      </div>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
