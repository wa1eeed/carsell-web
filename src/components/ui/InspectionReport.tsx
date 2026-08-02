'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArabicNumber } from './ArabicNumber';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';
import { Quantity } from './Quantity';
import { cn } from '@/lib/cn';
import type { InspectionSection, PointState } from '@/lib/domain/inspection';

const STATE_TONE: Record<Exclude<PointState, 'OK'>, 'warn' | 'danger'> = {
  NOTE: 'warn',
  PAINT: 'warn',
  FAIL: 'danger',
};

/**
 * درجات الأقسام — شريط وقيمة وملاحظة الفاحص.
 *
 * الشريط يطول بالدرجة، **واللون لا يتغيّر بها**: تلوين كل شريط بعتبته
 * يجعل الصفحة تسع ألوان، والقارئ يقارن الأطوال لا الأصباغ. اللون
 * محجوز للحالة الاستثنائية وحدها.
 */
export function SectionScores({ sections }: { sections: readonly InspectionSection[] }) {
  return (
    <ul className="flex flex-col">
      {sections.map((section) => (
        <li
          key={section.key}
          className="flex flex-wrap items-center gap-4 border-b border-line-2 py-4 last:border-0"
        >
          <span className="w-36 shrink-0 text-sm font-bold">{section.name}</span>
          <span className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-ink/10">
            <span
              className="block h-full rounded-full bg-accent"
              style={{ width: `${Math.max(0, Math.min(100, section.score))}%` }}
            />
          </span>
          <span className="w-10 text-end text-sm font-bold">
            <ArabicNumber value={section.score} grouped={false} />
          </span>
          {section.note === null ? null : (
            <span className="w-full text-xs opacity-60 sm:w-80">{section.note}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * جدول البنود.
 *
 * **يفتتح بغير السليم** — أربعة بنود من ٢١٠ هي الخبر، وقائمةٌ بـ٢١٠
 * سطرًا أغلبها «سليم» تدفن الأربعة. والسليمة خلف زرّ صريح يقول عددها،
 * فلا يظنّ القارئ أننا أخفيناها.
 */
export function FindingsTable({
  sections,
  className,
}: {
  sections: readonly InspectionSection[];
  className?: string;
}) {
  const t = useTranslations('ui');
  const [showAll, setShowAll] = useState(false);

  const points = sections.flatMap((section) =>
    section.points.map((point) => ({ ...point, section: section.name })),
  );
  const findings = points.filter((point) => point.state !== 'OK');
  const passed = points.length - findings.length;
  const rows = showAll ? points : findings;

  return (
    <section className={className}>
      <header className="mb-5 flex flex-wrap items-baseline gap-3.5">
        <h2 className="flex items-baseline gap-2 text-2xl font-bold">
          {t('pointsWithNotes')}
          <span className="text-base font-medium opacity-55">
            <ArabicNumber value={findings.length} /> {t('outOf')}{' '}
            <ArabicNumber value={points.length} />
          </span>
        </h2>
        <span className="h-px flex-1 bg-line" />
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          className="text-xs font-bold text-accent-700 hover:underline"
        >
          {showAll ? t('showFindingsOnly') : t('showPassed')}{' '}
          {showAll ? null : <ArabicNumber value={passed} />}
        </button>
      </header>

      {rows.length === 0 ? (
        <EmptyState title={t('noFindings')} description={t('noFindingsBody')} />
      ) : (
        <table className="w-full text-start">
          <thead>
            <tr className="border-b border-line text-3xs font-bold tracking-[0.1em] opacity-50">
              <th className="pb-3 text-start">{t('point')}</th>
              <th className="pb-3 text-start">{t('state')}</th>
              <th className="pb-3 text-start">{t('inspectorNote')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((point) => (
              <tr key={point.id} className="border-b border-line-2">
                <td className="w-56 py-3 text-sm font-medium">
                  <span className="bidi-isolate">{point.label}</span>
                  <span className="mt-0.5 block text-3xs opacity-45">{point.section}</span>
                </td>
                <td className="w-28 py-3">
                  {point.state === 'OK' ? (
                    <Badge tone="accent">{t('statePass')}</Badge>
                  ) : (
                    <Badge tone={STATE_TONE[point.state]}>{t(`state.${point.state}`)}</Badge>
                  )}
                </td>
                <td className="py-3 text-xs opacity-65">{point.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/**
 * صور الملاحظات.
 *
 * **صور ما عليه ملاحظة وحدها** — معرض صور المركبة في صفحة الإعلان،
 * وتكراره هنا يزاحم ما جاء القارئ من أجله. وكل صورة تحمل اسم بندها،
 * فصورةٌ بلا سياق لا تُثبت شيئًا.
 */
export function PhotoGrid({
  photos,
  className,
}: {
  photos: readonly { key: string; label: string }[];
  className?: string;
}) {
  const t = useTranslations('ui');
  if (photos.length === 0) return null;

  return (
    <section className={className}>
      <header className="mb-5 flex items-baseline gap-3.5">
        <h2 className="flex items-baseline gap-2 text-2xl font-bold">
          {t('findingPhotos')}
          <span className="text-base font-medium opacity-55">
            <Quantity unit="photos" count={photos.length} />
          </span>
        </h2>
        <span className="h-px flex-1 bg-line" />
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {photos.map((photo) => (
          <figure key={photo.key} className="overflow-hidden rounded-xl border border-line">
            {/* نسبة محجوزة قبل التحميل — لا انزياح */}
            <span className="washed block aspect-4/3" />
            <figcaption className="bidi-isolate border-t border-line px-3.5 py-2.5 text-2xs opacity-65">
              {photo.label}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/**
 * مخطط الهيكل — رسم جانبي بلوحات قابلة للتلوين.
 *
 * ثلاث حالات لا اثنتان: **«لم يُقس» ليست «أصلي»**. وإخفاء الفرق يجعل
 * لوحةً لم يمرّ عليها المقياس تبدو موثّقة، وهذا أسوأ من الصمت.
 */
const PANEL_LAYOUT: readonly { key: string; x: number; y: number; w: number; h: number }[] = [
  { key: 'hood', x: 12, y: 34, w: 46, h: 26 },
  { key: 'frontBumper', x: 4, y: 44, w: 8, h: 18 },
  { key: 'frontLeftFender', x: 14, y: 18, w: 30, h: 14 },
  { key: 'frontRightFender', x: 14, y: 62, w: 30, h: 14 },
  { key: 'roof', x: 60, y: 34, w: 60, h: 26 },
  { key: 'leftFrontDoor', x: 60, y: 18, w: 30, h: 14 },
  { key: 'rightFrontDoor', x: 60, y: 62, w: 30, h: 14 },
  { key: 'leftRearDoor', x: 92, y: 18, w: 30, h: 14 },
  { key: 'rightRearDoor', x: 92, y: 62, w: 30, h: 14 },
  { key: 'trunk', x: 122, y: 34, w: 40, h: 26 },
  { key: 'rearBumper', x: 164, y: 44, w: 8, h: 18 },
];

/** معرّف اللوحة في الرسم ⇒ مفتاحها في `paintMap`. */
const PANEL_ALIAS: Record<string, string> = {
  'front-bumper': 'frontBumper',
  'rear-bumper': 'rearBumper',
  hood: 'hood',
  roof: 'roof',
  trunk: 'trunk',
  'fender-fl': 'frontLeftFender',
  'fender-fr': 'frontRightFender',
  'door-fl': 'leftFrontDoor',
  'door-fr': 'rightFrontDoor',
  'door-rl': 'leftRearDoor',
  'door-rr': 'rightRearDoor',
  'quarter-l': 'leftQuarter',
  'quarter-r': 'rightQuarter',
};

function panelTitles(t: (key: string) => string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(PANEL_ALIAS).map(([id, key]) => [id, t(`panel.${key}`)]),
  );
}

/**
 * يطلي مجموعة `panels` وحدها.
 *
 * الحقن على نصّ الرسم لا على DOM: الرسم أصل ثابت يأتي من المصمّم، ولا
 * سبيل لمحتوى مستخدم إليه. والطلاء **بصنف لا بلون مكتوب**، فتبقى
 * التوكنات المصدر الوحيد ويبقى فحص اللون قادرًا على رؤيته.
 */
function paintDiagram(
  svg: string,
  panels: readonly { key: string; state: string }[],
  titles: Record<string, string>,
): string {
  const stateOf = (key: string): string =>
    panels.find((panel) => panel.key === key)?.state ?? 'unknown';

  return svg.replace(/<(path|polygon|rect|g)\b([^>]*?)\bid="([^"]+)"([^>]*)>/g, (whole, tag, before, id, after) => {
    const key = PANEL_ALIAS[id];
    if (key === undefined) return whole;
    const fill = PAINT_FILL[stateOf(key)] ?? PAINT_FILL.unknown;
    const title = titles[id];
    const open = `<${tag}${before}id="${id}"${after} class="${fill}">`;
    return title === undefined ? open : `${open}<title>${title}</title>`;
  });
}

const PAINT_FILL: Record<string, string> = {
  original: 'fill-accent-200',
  repainted: 'fill-warn-400',
  replaced: 'fill-danger',
  unknown: 'fill-ink/12',
};

export function BodyDiagram({
  panels,
  summary,
  /**
   * رسم المصمّم — منظر علويّ بمعرّف لكل لوحة. غيابه يعرض التخطيط
   * البديل: شبكةٌ صادقة بأنها شبكة، لا شكلٌ يُقرأ خطأً على أنه سيارة.
   */
  diagram = null,
  className,
}: {
  panels: readonly { key: string; state: string }[];
  summary: string | null;
  diagram?: string | null;
  className?: string;
}) {
  const t = useTranslations('ui');
  const stateOf = (key: string): string =>
    panels.find((panel) => panel.key === key)?.state ?? 'unknown';

  return (
    <section className={className}>
      <h2 className="mb-3.5 text-base font-bold">{t('bodyAndPaintMap')}</h2>
      <div className="rounded-xl border border-line bg-surface p-6">
        {diagram === null ? (
          <svg viewBox="0 0 176 94" className="h-auto w-full" role="img" aria-label={t('bodyAndPaintMap')}>
            {PANEL_LAYOUT.map((panel) => (
              <rect
                key={panel.key}
                x={panel.x}
                y={panel.y}
                width={panel.w}
                height={panel.h}
                rx={3}
                className={cn(PAINT_FILL[stateOf(panel.key)] ?? PAINT_FILL.unknown)}
              >
                <title>{t(`panel.${panel.key}`)}</title>
              </rect>
            ))}
          </svg>
        ) : (
          /**
           * الرسم يُحقَن كما هو، وتُطلى **مجموعة `panels` وحدها**:
           * الزجاج لا يُصبغ، والزينة ترث `currentColor`. الطلاء بصنف
           * لا بلون مكتوب، فالتوكنات تبقى المصدر الوحيد (فحص ٤ و١٠).
           */
          <div
            className="body-diagram text-ink/45 [&_svg]:h-auto [&_svg]:w-full"
            role="img"
            aria-label={t('bodyAndPaintMap')}
            dangerouslySetInnerHTML={{ __html: paintDiagram(diagram, panels, panelTitles(t)) }}
          />
        )}

        <ul className="mt-5 flex flex-wrap gap-4 text-2xs font-medium">
          {(['original', 'repainted', 'replaced', 'unknown'] as const).map((state) => (
            <li key={state} className="flex items-center gap-1.5">
              <svg viewBox="0 0 8 8" className="size-2">
                <rect width={8} height={8} rx={2} className={PAINT_FILL[state]} />
              </svg>
              {t(`paint.${state}`)}
            </li>
          ))}
        </ul>

        {summary === null ? null : (
          <p className="mt-4 border-t border-line-2 pt-4 text-xs leading-loose opacity-68">
            {summary}
          </p>
        )}
      </div>
    </section>
  );
}
