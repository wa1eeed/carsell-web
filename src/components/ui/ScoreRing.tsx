import { useTranslations } from 'next-intl';
import { ArabicNumber } from './ArabicNumber';
import { cn } from '@/lib/cn';

export type ScoreRingSize = 'sm' | 'md' | 'lg';

const SIZE: Record<ScoreRingSize, { px: number; stroke: number; value: string; label: string }> = {
  sm: { px: 44, stroke: 4, value: 'text-md', label: 'text-3xs' },
  md: { px: 72, stroke: 6, value: 'text-3xl', label: 'text-2xs' },
  lg: { px: 112, stroke: 8, value: 'text-5xl', label: 'text-xs' },
};

/**
 * درجة الفحص من ١٠٠.
 *
 * اللون دلالة لا زينة: أخضر توثيق · أوكر يحتاج انتباهًا · أحمر رسوب.
 * والعتبات ثابتة هنا فلا تتناقض بين Wc وWd.
 */
export function ScoreRing({
  score,
  size = 'md',
  className,
}: {
  /** ٠–١٠٠ */
  score: number;
  size?: ScoreRingSize;
  className?: string;
}) {
  const t = useTranslations('ui');
  const s = SIZE[size];
  const clamped = Math.max(0, Math.min(100, Math.round(score)));

  const radius = (s.px - s.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;

  const tone =
    clamped >= 80 ? 'text-accent' : clamped >= 60 ? 'text-warn' : 'text-danger';

  return (
    <span
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: s.px, height: s.px }}
      role="img"
      aria-label={`${t('inspectionScore')}: ${clamped}/100`}
    >
      <svg viewBox={`0 0 ${s.px} ${s.px}`} className="absolute -rotate-90">
        <circle
          cx={s.px / 2}
          cy={s.px / 2}
          r={radius}
          fill="none"
          strokeWidth={s.stroke}
          className="stroke-ink/12"
        />
        <circle
          cx={s.px / 2}
          cy={s.px / 2}
          r={radius}
          fill="none"
          strokeWidth={s.stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className={cn('stroke-current', tone)}
        />
      </svg>
      <span className="relative flex flex-col items-center leading-none">
        <ArabicNumber value={clamped} className={cn('font-bold', s.value)} />
        {size === 'sm' ? null : (
          <span className={cn('mt-1 opacity-50', s.label)}>{t('outOf100')}</span>
        )}
      </span>
    </span>
  );
}
