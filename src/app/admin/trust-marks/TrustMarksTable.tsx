'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import type { AdminTrustMark } from '@/lib/domain/trust-marks';

const KIND: Record<string, string> = {
  REGULATORY: 'جهة نظامية',
  PAYMENT: 'وسيلة دفع',
};

type Draft = { registrationNo: string; verifyUrl: string; active: boolean };

/**
 * ═══ صفٌّ لكل علامة، وتحريرٌ في موضعه ═══
 *
 * **والحقلان اللذان يملكهما المالك وحدهما يُحرَّران**: الشعار ملفٌّ
 * في المستودع والاسمُ اسمُ جهة — وما يملكه هو الدعوى: رقمُه، وصفحةُ
 * التحقّق، وأيعرضها أصلًا.
 *
 * **ورقمُ التسجيل يُقارَن خانةً بخانة** بما في شهادة الجهة، فحقلُه
 * `dir="ltr"` كالآيبان ورقم الهيكل — والعربيّةُ تقلب ترتيبَ ما يُلصق
 * فيه فلا يُطابق صاحبُه ما كتب.
 */
export function TrustMarksTable({
  marks,
  canEdit,
}: {
  marks: readonly AdminTrustMark[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      marks.map((mark) => [
        mark.key,
        {
          registrationNo: mark.registrationNo ?? '',
          verifyUrl: mark.verifyUrl ?? '',
          active: mark.active,
        },
      ]),
    ),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const field =
    'w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-ink';
  const label = 'flex flex-col gap-1.5 text-2xs font-semibold opacity-70';

  async function save(key: string): Promise<void> {
    const draft = drafts[key];
    if (draft === undefined) return;
    setBusy(key);
    try {
      const response = await fetch(`/api/v1/admin/trust-marks/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          registrationNo: draft.registrationNo,
          verifyUrl: draft.verifyUrl,
          active: draft.active,
        }),
      });
      if (!response.ok) {
        const json = (await response.json()) as { error?: { messageAr: string } };
        setToast({ tone: 'error', text: json.error?.messageAr ?? 'تعذر الحفظ.' });
        return;
      }
      setToast({ tone: 'success', text: 'حفظت العلامة.' });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {marks.map((mark) => {
          const draft = drafts[mark.key];
          if (draft === undefined) return null;
          const set = (patch: Partial<Draft>): void =>
            setDrafts((was) => ({ ...was, [mark.key]: { ...draft, ...patch } }));

          return (
            <section
              key={mark.key}
              className={cn(
                'rounded-xl border border-line bg-surface p-5',
                draft.active ? '' : 'opacity-70',
              )}
            >
              <header className="mb-4 flex flex-wrap items-center gap-4">
                {/*
                  **والشعار يُعرض كما يراه الزائر** — فمن يطفئ علامةً
                  يعرف أيَّ صورةٍ أطفأ، لا مفتاحًا نصّيًّا.
                */}
                <span className="flex h-10 w-28 shrink-0 items-center justify-start">
                  <Image
                    src={mark.logoPath}
                    alt={mark.nameAr}
                    width={160}
                    height={56}
                    className="h-9 w-auto object-contain"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{mark.nameAr}</span>
                  <span className="bidi-ltr block text-2xs opacity-65">{mark.nameEn}</span>
                </span>
                <Badge tone="neutral">{KIND[mark.kind] ?? mark.kind}</Badge>
                {/*
                  **والحال تُقال بما تعنيه للزائر**: «موثقة» لمن له
                  رقم، و«بلا رقم» لمن لم يُملأ — فالفرق هو ما يفصل
                  العلامة الجادة من الصورة.
                */}
                {!draft.active ? (
                  <Badge tone="neutral">مطفأة</Badge>
                ) : mark.registrationNo === null ? (
                  <Badge tone="warn">بلا رقم</Badge>
                ) : (
                  <Badge tone="accent">موثقة</Badge>
                )}
              </header>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className={label}>
                  رقم التسجيل
                  <input
                    value={draft.registrationNo}
                    onChange={(e) => set({ registrationNo: e.target.value })}
                    disabled={!canEdit}
                    dir="ltr"
                    placeholder="٣٠١٢٣٤٥٦٧٨٩٠٠٠٣"
                    className={cn(field, 'font-num bidi-ltr')}
                  />
                </label>
                <label className={label}>
                  صفحة التحقق الرسمية
                  <input
                    value={draft.verifyUrl}
                    onChange={(e) => set({ verifyUrl: e.target.value })}
                    disabled={!canEdit}
                    dir="ltr"
                    placeholder="https://..."
                    className={cn(field, 'bidi-ltr')}
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <label className="flex items-center gap-2.5 text-2xs">
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(e) => set({ active: e.target.checked })}
                    disabled={!canEdit}
                    className="size-4 accent-[var(--color-accent)]"
                  />
                  تظهر في التذييل
                </label>
                {!canEdit ? null : (
                  <Button size="sm" disabled={busy === mark.key} onClick={() => void save(mark.key)}>
                    احفظ
                  </Button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {toast === null ? null : (
        <div className="fixed bottom-6 end-6 z-50">
          <Toast tone={toast.tone} title={toast.text} />
        </div>
      )}
    </>
  );
}
