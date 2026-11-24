import { ArabicNumber } from './ArabicNumber';
import { cn } from '@/lib/cn';

/**
 * ═══ شريطٌ واحد مقسومٌ على أجزائه، وتحته مفتاحُه ═══
 *
 * ترميز A2 يرسم فوق كلّ مجموعةٍ شريطًا بارتفاع ٧px مقسومًا بنسب
 * أجزائها، ثمّ يسرد الأجزاء بمربّعاتٍ تطابق ألوانَ الشريط.
 *
 * **وهو غيرُ `ShareBars`**: تلك أشرطةٌ متوازية، كلُّ جزءٍ منها نسبةٌ
 * من قاعدةٍ واحدة — «٥٫٦٪ من الصور رُفضت». وهذا **قسمةُ كلٍّ على
 * أجزائه**: أين يقع الثقل، لا كم نسبةُ كلٍّ من الكلّ.
 *
 * ═══ ولماذا الشريطُ لا الأرقامُ وحدها ═══
 *
 * قائمةٌ من أربعة أرقام تُقرأ رقمًا رقمًا. والشريطُ يقول في لمحةٍ
 * أنّ ثلاثةَ أرباع الطابور في مكانٍ واحد — وهو السؤال الذي تُفتح
 * الشاشةُ لأجله.
 *
 * ═══ والصفرُ لا يُرسم ولا يُخفى ═══
 *
 * جزءٌ بصفرٍ لا قطعةَ له في الشريط (قطعةٌ بعرض صفر تُرسم خطًّا
 * كاذبًا)، **ويبقى في المفتاح** بصفره: غيابُه يجعل القارئ يظنّ أنّ
 * الطابور لا يعرف هذا الصنف أصلًا.
 */
export type SharePart = {
  key: string;
  label: string;
  count: number;
};

/** خمسةُ ألوانٍ من التوكنات — وتدور إن زادت الأجزاء. */
const TONES = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
] as const;

export function StackedShare({
  parts,
  className,
}: {
  parts: readonly SharePart[];
  className?: string;
}) {
  const total = parts.reduce((sum, part) => sum + part.count, 0);

  return (
    <div className={cn('flex flex-col', className)}>
      {/*
        **والمجموعُ صفرًا شريطٌ رماديّ لا شريطٌ غائب**: اختفاؤه يُزحزح
        ما تحته فتهتزّ البطاقة بين تحديثين، وفراغُه يقول «لا شيء هنا»
        وهو ما نريد قوله.
      */}
      <div
        aria-hidden
        className="mb-2.75 flex h-1.75 overflow-hidden rounded-full bg-line"
      >
        {total === 0
          ? null
          : parts.map((part, index) =>
              part.count === 0 ? null : (
                <span
                  key={part.key}
                  className={TONES[index % TONES.length]}
                  style={{ width: `${String((part.count / total) * 100)}%` }}
                />
              ),
            )}
      </div>

      <ul className="flex flex-col text-3xs">
        {parts.map((part, index) => (
          <li key={part.key} className="flex items-center gap-2 py-1">
            <span
              aria-hidden
              className={cn(
                'size-1.75 shrink-0 rounded-[2px]',
                part.count === 0 ? 'bg-line' : TONES[index % TONES.length],
              )}
            />
            <span className="min-w-0 flex-1 truncate opacity-70">{part.label}</span>
            <ArabicNumber
              value={part.count}
              className={part.count === 0 ? 'opacity-45' : 'font-bold'}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
