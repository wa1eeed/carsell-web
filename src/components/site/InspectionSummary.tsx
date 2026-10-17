'use client';

import { useTranslations } from 'next-intl';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { cn } from '@/lib/cn';

/**
 * ═══ ملخّصُ الفحص — يُقرأ قبل أن يُفتح شيء ═══
 *
 * كان على الصفحة رابطٌ بحلقة درجةٍ وحدها: رقمٌ واحد لا يقول **أين**
 * الخلل. ومن يقرأ «٨٨» لا يعرف أهي ثماني ملاحظاتٍ خفيفة أم عطلٌ
 * واحدٌ في المحرّك — والفرقُ هو ما يريد معرفته قبل أن يتّصل بالبائع.
 *
 * فأربعةُ أقسامٍ بحالها بلمحة، **واللونُ من النقاط لا من الدرجة**:
 * عطلٌ واحد يُحمِّر القسمَ ولو كانت درجتُه عالية.
 */
export type SummarySection = {
  key: string;
  name: string;
  score: number;
  major: number;
  minor: number;
};

/** حالُ القسم — والعطلُ يسبق الملاحظة، والسليمُ ما خلا منهما. */
function toneOf(section: SummarySection): 'accent' | 'warn' | 'danger' {
  if (section.major > 0) return 'danger';
  if (section.minor > 0) return 'warn';
  return 'accent';
}

const DOT: Readonly<Record<'accent' | 'warn' | 'danger', string>> = {
  accent: 'bg-accent',
  warn: 'bg-warn',
  danger: 'bg-danger',
};

export function InspectionSummary({
  score,
  sections,
  onOpen,
  className,
}: {
  score: number;
  sections: readonly SummarySection[];
  /** يفتح تبويبَ التقرير — فالملخّصُ بابٌ لا لوحةٌ معلّقة. */
  onOpen: () => void;
  className?: string;
}) {
  const t = useTranslations('ui');

  /**
   * **وما فيه خللٌ أوّلًا.** عرضُ الأقسام بترتيبها يدفن العطلَ تحت
   * ثلاثة أقسامٍ سليمة — والاستثناءُ هو الخبر.
   */
  const ordered = [...sections].sort((a, b) => {
    const rank = (row: SummarySection): number =>
      row.major > 0 ? 0 : row.minor > 0 ? 1 : 2;
    return rank(a) - rank(b);
  });

  return (
    <section
      className={cn('rounded-xl border border-line bg-surface p-5', className)}
      aria-label={t('inspectionReport')}
    >
      <div className="flex flex-wrap items-center gap-5">
        <ScoreRing score={score} size="sm" className="shrink-0" />

        <div className="min-w-0 flex-1">
          <p className="mb-2.5 text-sm font-bold">{t('inspectionReport')}</p>

          <ul className="flex flex-wrap gap-x-5 gap-y-2.5">
            {ordered.slice(0, 4).map((section) => {
              const tone = toneOf(section);
              return (
                <li key={section.key || section.name} className="flex items-center gap-2">
                  <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full', DOT[tone])} />
                  <span className="text-2xs">{section.name}</span>
                  {section.major === 0 ? null : (
                    <Badge tone="danger">
                      <ArabicNumber value={section.major} />
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/*
          **وزرٌّ لا رابط**: التقريرُ تبويبٌ في هذه الصفحة لا صفحةٌ
          أخرى — ورابطٌ يُعيد تحميلها كلَّها ليُظهر ما هو فيها.
        */}
        <button
          type="button"
          onClick={onOpen}
          className="shrink-0 rounded-btn border border-line px-4 py-2.5 text-2xs font-bold hover:border-ink"
        >
          {t('readFullReport')}
        </button>
      </div>
    </section>
  );
}
