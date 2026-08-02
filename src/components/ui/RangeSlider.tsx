'use client';

import { useEffect, useId, useState } from 'react';
import { ArabicNumber } from './ArabicNumber';
import { cn } from '@/lib/cn';

/**
 * شريط مدى بمقبضين.
 *
 * **لماذا شريط لا رقائق:** الرقاقة تعرض نطاقًا واحدًا اخترناه نحن
 * («أقل من ٥٠ ألف»)، والشريط يترك القارئ يحدّ نطاقه هو. وفي سوق
 * سيارات هذا أكثر ما يُستعمل — المشتري يعرف سقفه وأرضيّته معًا.
 *
 * **التثبيت عند الإفلات لا عند كل بكسل**: كل تغيير فلتر يكتب في
 * الرابط ويعيد الطلب، فالتثبيت أثناء السحب يُطلق عشرات الطلبات.
 * الحالة المحلّية تتحرّك مع الإصبع، والتثبيت عند رفعه.
 *
 * `bars` مدرَّج اختياري يعرض توزّع القيَم — يجيب «أين يتكدّس المعروض»
 * وهو سؤال لا يجيبه الشريط وحده.
 */
export function RangeSlider({
  min,
  max,
  value,
  step = 1,
  bars,
  label,
  grouped = true,
  onCommit,
  className,
}: {
  min: number;
  max: number;
  /** `null` في أي طرف = غير مقيَّد، فيقع المقبض على الحدّ. */
  value: readonly [number | null, number | null];
  step?: number;
  bars?: readonly number[];
  /** تسمية الوحدة بين الطرفين — «ريال» · «الموديل» · «كيلومتر». */
  label?: string;
  grouped?: boolean;
  onCommit: (next: [number | null, number | null]) => void;
  className?: string;
}) {
  const id = useId();
  const lo = value[0] ?? min;
  const hi = value[1] ?? max;
  const [draft, setDraft] = useState<[number, number]>([lo, hi]);

  // الرابط هو الحالة: إن تغيّر من الخارج (رجوع بالمتصفّح، مسح فلتر)
  // فالمسوّدة تتبعه ولا تعاند.
  useEffect(() => {
    setDraft([lo, hi]);
  }, [lo, hi]);

  const span = max - min;
  const pct = (n: number): number => (span <= 0 ? 0 : ((n - min) / span) * 100);

  /** طرف يساوي الحدّ = بلا قيد؛ فلا يُكتب في الرابط ولا يُعدّ فلترًا. */
  const commit = (next: [number, number]): void =>
    onCommit([next[0] <= min ? null : next[0], next[1] >= max ? null : next[1]]);

  const move = (side: 0 | 1, raw: number): void => {
    const next: [number, number] = [...draft];
    // المقبضان لا يتجاوزان بعضهما — نطاق مقلوب لا معنى له
    next[side] = side === 0 ? Math.min(raw, draft[1]) : Math.max(raw, draft[0]);
    setDraft(next);
  };

  const disabled = span <= 0;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between text-xs font-bold">
        <ArabicNumber value={draft[0]} grouped={grouped} />
        {label === undefined ? null : (
          <span className="text-2xs font-medium opacity-50">{label}</span>
        )}
        <ArabicNumber value={draft[1]} grouped={grouped} />
      </div>

      <div className="relative h-4">
        <div className="absolute inset-x-0 top-1.5 h-1 rounded-full bg-ink/10" />
        <div
          className="absolute top-1.5 h-1 rounded-full bg-accent"
          style={{
            insetInlineStart: `${pct(draft[0])}%`,
            insetInlineEnd: `${100 - pct(draft[1])}%`,
          }}
        />
        {([0, 1] as const).map((side) => (
          <input
            key={side}
            id={`${id}-${side}`}
            type="range"
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            value={draft[side]}
            aria-label={label}
            onChange={(e) => move(side, Number(e.target.value))}
            onPointerUp={() => commit(draft)}
            onKeyUp={() => commit(draft)}
            onBlur={() => commit(draft)}
            /**
             * مسارٌ شفاف ومقبض ظاهر: العنصر الأصلي يحمل الوصول
             * بلوحة المفاتيح وقارئ الشاشة، والطلاء فوقه بـCSS.
             * `pointer-events` على المقبض وحده حتى لا يبتلع العلوي
             * السفلي فيتجمّد أحدهما.
             */
            className="range-thumb absolute inset-x-0 top-0 h-4 w-full appearance-none bg-transparent"
          />
        ))}
      </div>

      {bars === undefined || bars.length === 0 ? null : (
        <div className="flex h-8 items-end gap-0.5" aria-hidden>
          {bars.map((count, i) => {
            const peak = Math.max(...bars, 1);
            const from = min + (span * i) / bars.length;
            const to = min + (span * (i + 1)) / bars.length;
            const inside = to > draft[0] && from < draft[1];
            return (
              <span
                key={i}
                className={cn(
                  'flex-1 rounded-t-xs',
                  count === 0 ? 'bg-ink/8' : inside ? 'bg-accent' : 'bg-ink/14',
                )}
                style={{ height: `${Math.max(6, (count / peak) * 100)}%` }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
