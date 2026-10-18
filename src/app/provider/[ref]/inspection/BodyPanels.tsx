'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Toast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';

/**
 * ═══ خريطةُ الهيكل — يضغط الفاحصُ قطعةً فيختار حالها ═══
 *
 * `saveDraftPanel` والمسارُ مبنيّان، **ولا شيء في الواجهة يبلغهما**:
 * فخريطةُ الطلاء على صفحة المركبة تُرسم من لقطةٍ لا يملؤها أحد. وهي
 * الصنف المسجَّل: الطرفُ الثاني يُبنى مع الأوّل.
 *
 * **والترتيبُ هو ترتيبُ `PaintMap`** الذي يقرؤه العرضُ العامّ —
 * شبكةُ ٣×٣ تقارب الهيكل. وشبكةٌ ثانية بترتيبٍ آخر تجعل الفاحصَ
 * يضغط قطعةً ويرى غيرَها تتلوّن للمشتري.
 */
const GRID: readonly string[] = [
  'frontLeftFender', 'hood', 'frontRightFender',
  'leftFrontDoor', 'roof', 'rightFrontDoor',
  'leftRearDoor', 'trunk', 'rightRearDoor',
];

const STATES = [
  { key: 'original', label: 'أصلي' },
  { key: 'repainted', label: 'مصبوغ' },
  { key: 'replaced', label: 'مستبدل' },
] as const;

type Condition = (typeof STATES)[number]['key'];

const TONE: Readonly<Record<string, string>> = {
  original: 'bg-accent-200 border-accent',
  repainted: 'bg-warn-400 border-warn',
  /** **ولا درجةَ لـ** — توكنٌ واحد، والتمييزُ بالحدّ لا بالتعبئة. */
  replaced: 'bg-surface border-danger',
  unknown: 'bg-ink/12 border-line',
};

export function BodyPanels({
  ref_,
  initial,
  editable,
}: {
  ref_: string;
  initial: readonly { panel: string; condition: string; microns: number | null }[];
  editable: boolean;
}) {
  const t = useTranslations('ui');
  const [, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, { condition: Condition; microns: string }>>(
    () => {
      const seed: Record<string, { condition: Condition; microns: string }> = {};
      for (const row of initial) {
        seed[row.panel] = {
          condition: row.condition as Condition,
          microns: row.microns === null ? '' : String(row.microns),
        };
      }
      return seed;
    },
  );

  const save = (panel: string, condition: Condition, microns: string): void => {
    setRows((current) => ({ ...current, [panel]: { condition, microns } }));
    start(async () => {
      const parsed = Number(microns);
      const response = await fetch(
        `/api/v1/provider/requests/${encodeURIComponent(ref_)}/inspection`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: 'panel',
            panel,
            condition,
            microns: microns.trim() === '' || !Number.isFinite(parsed) ? null : Math.round(parsed),
          }),
        },
      ).catch(() => null);

      if (response === null || !response.ok) setToast('تعذر حفظ القطعة.');
    });
  };

  const current = picked === null ? undefined : rows[picked];

  return (
    <>
      <p className="mb-1.5 text-sm font-bold">خريطة الهيكل</p>
      <p className="mb-3.5 text-3xs leading-loose opacity-70">
        اضغط قطعة لتحديد حالها — وسماكة الطلاء اختيارية.
      </p>

      <div className="grid max-w-56 grid-cols-3 gap-1.5">
        {GRID.map((panel) => {
          const row = rows[panel];
          return (
            <button
              key={panel}
              type="button"
              disabled={!editable}
              onClick={() => setPicked(picked === panel ? null : panel)}
              title={t(`panel.${panel}`)}
              className={cn(
                'h-9 rounded-xs border text-3xs',
                TONE[row?.condition ?? 'unknown'],
                picked === panel && 'ring-2 ring-ink',
                !editable && 'opacity-65',
              )}
            >
              <span className="sr-only">{t(`panel.${panel}`)}</span>
            </button>
          );
        })}
      </div>

      {picked === null ? null : (
        <div className="mt-3.5 rounded-lg border border-line p-4">
          <p className="mb-2.5 text-2xs font-bold">{t(`panel.${picked}`)}</p>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {STATES.map((state) => (
              <button
                key={state.key}
                type="button"
                disabled={!editable}
                onClick={() => save(picked, state.key, current?.microns ?? '')}
                className={cn(
                  'rounded-btn border px-3 py-2 text-3xs font-bold',
                  current?.condition === state.key
                    ? 'border-ink bg-ink text-bg'
                    : 'border-line hover:border-ink',
                )}
              >
                {state.label}
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-3xs font-bold opacity-70">سماكة الطلاء — ميكرون</span>
            {/* رقمٌ يُقارن خانةً بخانة — لاتينيّ معزول */}
            <input
              dir="ltr"
              inputMode="numeric"
              disabled={!editable || current === undefined}
              value={current?.microns ?? ''}
              onChange={(event) =>
                save(picked, current?.condition ?? 'original', event.target.value)
              }
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-start font-num text-sm"
            />
            {current === undefined ? (
              <span className="text-3xs opacity-65">اختر الحال أولا.</span>
            ) : null}
          </label>
        </div>
      )}

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
