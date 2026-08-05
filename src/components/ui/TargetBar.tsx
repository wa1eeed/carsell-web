import { cn } from '@/lib/cn';

/**
 * ═══ شريطٌ بخطّ هدف — A2 «أزمنة المراحل» ═══
 *
 * قيمةٌ على مقياسٍ مشترك، وعلامةٌ رأسية عند الهدف. **واللون يقول
 * الحكم**: أخضرُ ضمن الهدف، وأحمرُ تجاوزه — فالقارئ يعرف قبل أن يقرأ
 * رقمًا.
 *
 * ═══ والشارة تُحسب من الرقم المعروض لا من الدقيق ═══
 *
 * حسبتُ «تجاوز» من الكسر وعرضتُ المقرَّب مرّةً، فصفٌّ يقول «٢٤٠ ساعة»
 * ويحمل شارة تجاوزِ ٢٤٠ — رقمان متناقضان في سطر واحد. فالمقارنة هنا
 * على `displayValue` نفسه الذي يُعرض.
 */

export type TargetRow = {
  label: string;
  /** القيمة المعروضة — وعليها تُحسب الشارة، لا على الدقيقة */
  displayValue: number;
  target: number;
  /** النصّ إلى يسار الشريط — «٠٫٧ س» */
  valueLabel: string;
};

export function TargetBars({
  rows,
  scaleMax,
  scaleNote,
  className,
}: {
  rows: readonly TargetRow[];
  /** أقصى المحور — مشتركٌ بين الصفوف كي تُقارن */
  scaleMax: number;
  scaleNote: string;
  className?: string;
}) {
  // محورٌ بصفر لا يُقسم عليه — وسلسلةٌ كلّها أصفار حالٌ متوقّعة أوّل شهر
  const max = scaleMax <= 0 ? 1 : scaleMax;

  return (
    <div className={cn('rounded-xl border border-line bg-surface px-5 py-4.5', className)}>
      {rows.map((row) => {
        const over = row.displayValue > row.target;
        const width = Math.min(100, (row.displayValue / max) * 100);
        const mark = Math.min(100, (row.target / max) * 100);

        return (
          <div key={row.label} className="flex items-center gap-3 py-2">
            <span className="w-30 shrink-0 text-2xs opacity-72">{row.label}</span>

            <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-line-2">
              <span
                className={cn(
                  'absolute inset-y-0 start-0 rounded-full',
                  over ? 'bg-danger' : 'bg-accent',
                )}
                style={{ width: `${width}%` }}
              />
              {/* علامة الهدف — تبقى مرئيّة فوق التعبئة */}
              <span
                className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-ink opacity-55"
                style={{ insetInlineStart: `${mark}%` }}
              />
            </span>

            <span
              className={cn(
                'font-num w-13 shrink-0 text-start text-2xs font-bold',
                over ? 'text-danger' : undefined,
              )}
            >
              {row.valueLabel}
            </span>
          </div>
        );
      })}

      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-line pt-3 text-3xs opacity-55">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-accent" aria-hidden />
          ضمن الهدف
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-danger" aria-hidden />
          تجاوز الهدف
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-0.5 bg-ink opacity-55" aria-hidden />
          خط الهدف
        </span>
        <span className="flex-1" />
        <span>{scaleNote}</span>
      </div>
    </div>
  );
}
