'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ActionButton } from './ActionLink';
import { ArabicNumber } from './ArabicNumber';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';
import { Quantity } from './Quantity';
import { cn } from '@/lib/cn';
import type { InspectionSection, PointState } from '@/lib/domain/inspection';

/**
 * ═══ العلامةُ شكلٌ لا لونٌ وحده ═══
 *
 * ثلاثُ علاماتٍ **متمايزةُ الشكل**: صحٌّ للسليم، وتعجّبٌ في دائرةٍ لما
 * عليه ملاحظة، وتعجّبٌ في مثلّثٍ لما يحتاج إصلاحًا، وشَرطةٌ لما لم
 * يُفحَص. ولو كان اللونُ وحده الفارقَ لما قرأها عاجزٌ عن تمييز
 * الأحمر من الأخضر — وهم واحدٌ من كلّ اثني عشر رجلًا.
 *
 * **ويبقى النصُّ مع العلامة** في كل صفّ: العلامة تُسرّع القراءة ولا
 * تحملها وحدها.
 */
const STATE_TONE: Record<PointState, 'accent' | 'warn' | 'danger' | 'neutral'> = {
  OK: 'accent',
  NOTE: 'warn',
  PAINT: 'warn',
  FAIL: 'danger',
  NOT_INSPECTED: 'neutral',
};

const MARK_CLASS: Record<PointState, string> = {
  OK: 'bg-accent-100 text-accent-800',
  NOTE: 'bg-warn-200 text-warn-900',
  PAINT: 'bg-warn-200 text-warn-900',
  FAIL: 'bg-danger/12 text-danger',
  NOT_INSPECTED: 'bg-ink/8 text-ink/55',
};

/** **السليمُ أوّلًا في العدّ، وآخرًا في العرض** — والخبرُ ما ليس سليمًا. */
const ORDER: Record<PointState, number> = {
  FAIL: 0,
  NOT_INSPECTED: 1,
  PAINT: 2,
  NOTE: 3,
  OK: 4,
};

/**
 * علامةُ الحالة — رسمٌ واحد يتبدّل مساره.
 *
 * و`aria-hidden` لأن الصفّ يحمل تسميتها نصًّا: قارئُ الشاشة يقرأ
 * «سليم» لا «أيقونة».
 */
function StateMark({ state, className }: { state: PointState; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-full',
        MARK_CLASS[state],
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
        {state === 'OK' ? (
          <path d="M20 6 9 17l-5-5" />
        ) : state === 'NOT_INSPECTED' ? (
          <path d="M5 12h14" />
        ) : state === 'FAIL' ? (
          <>
            {/* مثلّثٌ — شكلٌ ثالثٌ يميّزه عن الدائرة بلا لون */}
            <path d="M12 4 2.5 20h19z" strokeWidth={2.4} />
            <path d="M12 10v4" />
            <path d="M12 17.4h.01" />
          </>
        ) : (
          <>
            <path d="M12 7v6" />
            <path d="M12 16.6h.01" />
          </>
        )}
      </svg>
    </span>
  );
}

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
            <span className="w-full text-xs opacity-70 sm:w-80">{section.note}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * ═══ البنودُ تحت أقسامها — لا جدولٌ مسطَّح بمئتي سطر ═══
 *
 * كان جدولًا واحدًا بـ٢١٠ صفوف وزرٌّ يفتحها دفعةً — المعلومة صحيحة
 * والشكل خطأ: من يسأل «كيف الفرامل؟» يمسح قائمةً لا تقول أين ينتهي
 * قسمٌ ويبدأ آخر.
 *
 * فكلُّ قسمٍ **طيّةٌ تُفتح**، ورأسُها يحمل خلاصته: درجتُه، وكم سليمًا
 * فيه وكم عليه ملاحظة. **وما فيه ملاحظةٌ يُفتح ابتداءً** وما سلم
 * يبقى مطويًّا — فالأربعةُ التي هي الخبر أوّلُ ما يُقرأ، والبقيّةُ
 * حاضرةٌ معدودةٌ على بُعد نقرة.
 *
 * **والبنودُ داخل القسم تُرتَّب بحالها لا بترتيب الكتالوج**: ما يحتاج
 * إصلاحًا، فما لم يُفحَص، فالملاحظات، فالسليم.
 */
export function FindingsTable({
  sections,
  className,
}: {
  sections: readonly InspectionSection[];
  className?: string;
}) {
  const t = useTranslations('ui');

  const points = sections.flatMap((section) => section.points);
  const counts = {
    OK: points.filter((point) => point.state === 'OK').length,
    findings: points.filter((point) => point.state !== 'OK' && point.state !== 'NOT_INSPECTED')
      .length,
    NOT_INSPECTED: points.filter((point) => point.state === 'NOT_INSPECTED').length,
  };

  /**
   * **والمفتوحُ ابتداءً يُشتقّ من المحتوى لا يُنسخ في حالة** (البوابة
   * ٣٠): الحالةُ تحمل ما **بدّله القارئ** وحده، فإن وصل تقريرٌ آخر لم
   * تتقادم. و`null` تعني «كما هو افتراضًا».
   */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  /**
   * **والقسمُ يُفتح لما يستحقّ النظر.** «لم يُفحَص» ليس خبرًا سيّئًا
   * فلا يفتح قسمًا — لكنّه يُعدّ في المفتاح، فمن أراده وجده.
   */
  const hasFindings = (section: InspectionSection): boolean =>
    section.points.some((point) => point.state !== 'OK' && point.state !== 'NOT_INSPECTED');
  const isOpen = (section: InspectionSection): boolean =>
    toggled[section.key] ?? hasFindings(section);

  const allOpen = sections.every((section) => isOpen(section));
  const toggleAll = (): void => {
    const next: Record<string, boolean> = {};
    for (const section of sections) next[section.key] = !allOpen;
    setToggled(next);
  };

  if (points.length === 0) {
    return (
      <section className={className}>
        <EmptyState title={t('noFindings')} description={t('noFindingsBody')} />
      </section>
    );
  }

  return (
    <section className={className}>
      <header className="mb-4 flex flex-wrap items-baseline gap-3.5">
        <h2 className="flex items-baseline gap-2 text-2xl font-bold">
          {t('checkedPoints')}
          <span className="text-base font-medium opacity-70">
            <ArabicNumber value={points.length} />
          </span>
        </h2>
        <span className="h-px flex-1 bg-line" />
        <ActionButton onClick={toggleAll}>
          {allOpen ? t('collapseAll') : t('expandAll')}
        </ActionButton>
      </header>

      {/*
        ═══ ومفتاحُ العلامات يُقرأ قبلها لا بعدها ═══

        ثلاثُ علاماتٍ لا تُفهم بلا مفتاح، ومرجعُ السوق يضعه في الذيل —
        فمن لم يبلغه يخمّن. وهو هنا **عدّادٌ وخلاصةٌ معًا**: يشرح
        العلامة ويقول كم بندًا تحتها.
      */}
      <ul className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2.5 border-y border-line-2 py-3">
        <LegendItem state="OK" label={t('statePass')} count={counts.OK} />
        <LegendItem state="NOTE" label={t('stateFlagged')} count={counts.findings} />
        <LegendItem
          state="NOT_INSPECTED"
          label={t('state.NOT_INSPECTED')}
          count={counts.NOT_INSPECTED}
        />
      </ul>

      <ul className="flex flex-col gap-2.5">
        {sections.map((section) => {
          const open = isOpen(section);
          const sound = section.points.filter((point) => point.state === 'OK').length;
          const flagged = section.points.length - sound;
          const rows = [...section.points].sort((a, b) => ORDER[a.state] - ORDER[b.state]);

          return (
            <li key={section.key} className="rounded-xl border border-line">
              <h3>
                <button
                  type="button"
                  onClick={() =>
                    setToggled((current) => ({ ...current, [section.key]: !open }))
                  }
                  aria-expanded={open}
                  aria-controls={`section-${section.key}`}
                  className="flex w-full items-center gap-3.5 p-4 text-start hover:bg-surface"
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className={cn(
                      'size-4 shrink-0 opacity-50 transition-transform',
                      open ? 'rotate-90' : 'rtl:-scale-x-100',
                    )}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>

                  <span className="min-w-0 flex-1 text-sm font-bold">{section.name}</span>

                  {/*
                    **وخلاصةُ القسم على رأسه** — فالمطويُّ يقول ما فيه
                    قبل أن يُفتح، ولا يُفتح المرءُ ستّة أقسامٍ ليعرف
                    أيُّها يعنيه.
                  */}
                  <span className="flex shrink-0 items-center gap-2.5 text-3xs">
                    {flagged === 0 ? (
                      <span className="flex items-center gap-1.5 text-accent-800">
                        <StateMark state="OK" />
                        {t('allSound')}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 opacity-80">
                        <StateMark state="NOTE" />
                        <ArabicNumber value={flagged} />
                      </span>
                    )}
                    <span className="w-9 text-end text-sm font-bold">
                      <ArabicNumber value={section.score} grouped={false} />
                    </span>
                  </span>
                </button>
              </h3>

              {open ? (
                <div id={`section-${section.key}`} className="border-t border-line-2 px-4 pb-1">
                  {section.note === null ? null : (
                    <p className="border-b border-line-2 py-3 text-xs leading-loose opacity-70">
                      {section.note}
                    </p>
                  )}
                  <ul className="grid gap-x-8 sm:grid-cols-2">
                    {rows.map((point) => (
                      <li
                        key={point.id}
                        className="flex items-start gap-2.5 border-b border-line-2 py-2.5 last:border-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-0"
                      >
                        <StateMark state={point.state} className="mt-0.5" />
                        <span className="min-w-0 flex-1">
                          <span className="bidi-isolate block text-xs font-medium">
                            {point.label}
                          </span>
                          {point.state === 'OK' ? null : (
                            <span className="mt-1 flex flex-wrap items-baseline gap-2">
                              <Badge tone={STATE_TONE[point.state]}>
                                {point.state === 'NOT_INSPECTED'
                                  ? t('state.NOT_INSPECTED')
                                  : t(`state.${point.state}`)}
                              </Badge>
                              {point.note === null ? null : (
                                <span className="text-3xs leading-relaxed opacity-75">
                                  {point.note}
                                </span>
                              )}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LegendItem({
  state,
  label,
  count,
}: {
  state: PointState;
  label: string;
  count: number;
}) {
  return (
    <li className="flex items-center gap-2 text-3xs">
      <StateMark state={state} />
      <span className="opacity-75">{label}</span>
      <span className="font-bold">
        <ArabicNumber value={count} />
      </span>
    </li>
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
          <span className="text-base font-medium opacity-70">
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
            <figcaption className="bidi-isolate border-t border-line px-3.5 py-2.5 text-2xs opacity-75">
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
