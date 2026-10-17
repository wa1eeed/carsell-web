'use client';

import { useState, useTransition } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Toast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import type { DraftItem, DraftView } from '@/lib/domain/inspection-draft';

/**
 * ═══ نموذجُ الفحص — بلمسةٍ واحدة لكل بند ═══
 *
 * الفاحصُ واقفٌ عند السيارة بجهازٍ في يده و٢١٠ بندًا أمامه. فكلُّ بندٍ
 * أربعةُ أزرارٍ تُلمس مرّةً، **والحفظُ فوريّ**: استمارةٌ تُحفظ بزرٍّ في
 * آخرها تُضيّع ساعةَ عملٍ بأوّل انقطاع.
 *
 * **والأقسامُ مطويّة**: ٢١٠ بندًا مفتوحةً دفعةً واحدة لا تُقرأ، ومن
 * يبحث عن «الفرامل» يمرّ على خمسةٍ وثلاثين بندًا للمحرّك.
 */
const STATES = [
  { key: 'PASS', label: 'سليم' },
  { key: 'MINOR', label: 'ملاحظة' },
  { key: 'MAJOR', label: 'عطل' },
  { key: 'NOT_APPLICABLE', label: 'لا ينطبق' },
] as const;

type State = (typeof STATES)[number]['key'];

export function InspectionForm({ view }: { view: DraftView }) {
  const [open, setOpen] = useState<string | null>(view.categories[0]?.id ?? null);
  const [rows, setRows] = useState<Record<string, { state: State; note: string }>>(() => {
    const seed: Record<string, { state: State; note: string }> = {};
    for (const category of view.categories) {
      for (const item of category.items) {
        if (item.state !== null) seed[item.id] = { state: item.state, note: item.note ?? '' };
      }
    }
    return seed;
  });
  const [toast, setToast] = useState<string | null>(null);
  const [, start] = useTransition();

  /**
   * ═══ والعدّادُ يعدّ ما حُفظ لا ما لُمس ═══
   *
   * «ملاحظة» بلا نصٍّ **لا تُرسَل** (الخادمُ يرفضها)، فعدُّها يجعل
   * الشاشة تقول «٦ من ٢١٠» والقاعدةُ فيها خمسة — ومن أغلق الصفحة
   * عاد فوجد أقلَّ ممّا رأى. **والنصُّ المعروض وعدٌ لا وصف.**
   */
  const isSaved = (row: { state: State; note: string }): boolean =>
    row.state !== 'MINOR' && row.state !== 'MAJOR' ? true : row.note.trim() !== '';

  const answered = Object.values(rows).filter(isSaved).length;

  const send = (body: unknown, onDone?: () => void): void => {
    start(async () => {
      const response = await fetch(
        `/api/v1/provider/requests/${encodeURIComponent(view.ref)}/inspection`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      ).catch(() => null);

      if (response === null || !response.ok) {
        const payload = (await response?.json().catch(() => null)) as
          | { error?: { fields?: Record<string, string> } }
          | null;
        setToast(
          payload?.error?.fields?.inspection === 'NOTE_REQUIRED'
            ? 'الملاحظة إلزامية مع «ملاحظة» و«عطل».'
            : 'تعذّر الحفظ — أعد المحاولة.',
        );
        return;
      }
      onDone?.();
    });
  };

  /**
   * **والملاحظةُ تُطلب قبل الحفظ لا بعده.** الخادمُ يرفض «ملاحظة» بلا
   * نصّ (وهو الحارس)، والشاشةُ لا تُرسل أصلًا حتى تُكتب — فلا يرى
   * الفاحصُ رفضًا على شيءٍ لم يُطلب منه بعد.
   */
  const setState = (item: DraftItem, state: State): void => {
    const note = rows[item.id]?.note ?? '';
    setRows((current) => ({ ...current, [item.id]: { state, note } }));

    if ((state === 'MINOR' || state === 'MAJOR') && note.trim() === '') return;
    send({ kind: 'item', itemId: item.id, state, note: note.trim() || null });
  };

  const setNote = (item: DraftItem, note: string): void => {
    const state = rows[item.id]?.state;
    setRows((current) => ({
      ...current,
      [item.id]: { state: state ?? 'PASS', note },
    }));
    if (state === undefined) return;
    if ((state === 'MINOR' || state === 'MAJOR') && note.trim() === '') return;
    send({ kind: 'item', itemId: item.id, state, note: note.trim() || null });
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-baseline gap-3 rounded-lg border border-line bg-surface p-4">
        <span className="text-2xs font-bold">أُجيب</span>
        <span className="font-num text-base font-bold">
          <ArabicNumber value={answered} /> / <ArabicNumber value={view.total} />
        </span>
        <span className="flex-1" />
        {!view.editable ? <Badge tone="warn">أُرسلت — لا تُعدَّل</Badge> : null}
      </div>

      {view.returnNote === null ? null : (
        <div className="mb-5 rounded-lg border border-line bg-surface p-4">
          <p className="mb-1.5 text-2xs font-bold">أُعيدت إليك بملاحظة</p>
          <p className="text-2xs leading-loose opacity-80">{view.returnNote}</p>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {view.categories.map((category) => {
          const isOpen = open === category.id;
          const done = category.items.filter((item) => {
            const row = rows[item.id];
            return row !== undefined && isSaved(row);
          }).length;

          return (
            <section key={category.id} className="rounded-lg border border-line">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : category.id)}
                className="flex w-full flex-wrap items-center gap-3 px-4 py-3.5 text-start"
              >
                <span className="flex-1 text-sm font-bold">{category.nameAr}</span>
                <span className="font-num text-2xs opacity-70">
                  <ArabicNumber value={done} /> / <ArabicNumber value={category.items.length} />
                </span>
                <span aria-hidden className="text-2xs opacity-50">
                  {isOpen ? '▲' : '▼'}
                </span>
              </button>

              {!isOpen ? null : (
                <div className="flex flex-col divide-y divide-line border-t border-line">
                  {category.items.map((item) => {
                    const row = rows[item.id];
                    const needsNote =
                      row !== undefined && (row.state === 'MINOR' || row.state === 'MAJOR');

                    return (
                      <div key={item.id} className="flex flex-col gap-2.5 px-4 py-3.5">
                        <span className="flex flex-wrap items-baseline gap-2">
                          <span className="flex-1 text-2xs">{item.nameAr}</span>
                          {item.isCritical ? <Badge tone="danger">حرج</Badge> : null}
                          {item.unit === null ? null : (
                            <span className="text-3xs opacity-65">{item.unit}</span>
                          )}
                        </span>

                        <span className="flex flex-wrap gap-1.5">
                          {STATES.map((state) => (
                            <button
                              key={state.key}
                              type="button"
                              disabled={!view.editable}
                              onClick={() => setState(item, state.key)}
                              className={cn(
                                'rounded-btn border px-3 py-2 text-3xs font-bold',
                                row?.state === state.key
                                  ? 'border-ink bg-ink text-bg'
                                  : 'border-line hover:border-ink',
                                !view.editable && 'opacity-65',
                              )}
                            >
                              {state.label}
                            </button>
                          ))}
                        </span>

                        {!needsNote ? null : (
                          <input
                            value={row.note}
                            disabled={!view.editable}
                            onChange={(event) => setNote(item, event.target.value)}
                            placeholder="ما الملاحظة؟ — إلزاميّة"
                            className={cn(
                              'rounded-md border bg-surface px-3 py-2 text-2xs',
                              row.note.trim() === '' ? 'border-danger' : 'border-line',
                            )}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
