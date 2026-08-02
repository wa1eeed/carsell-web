import { toArabicDigits } from '@/lib/arabic';
import { cn } from '@/lib/cn';

export type PlateSize = 'sm' | 'md' | 'lg';

const SIZE: Record<PlateSize, { box: string; ksa: string; row: string; sub: string }> = {
  sm: { box: 'w-24', ksa: 'text-3xs py-0.5', row: 'text-sm', sub: 'text-3xs' },
  md: { box: 'w-32', ksa: 'text-2xs py-1', row: 'text-lg', sub: 'text-2xs' },
  lg: { box: 'w-44', ksa: 'text-xs py-1.5', row: 'text-3xl', sub: 'text-xs' },
};

/**
 * اللوحة السعودية: شريط KSA أعلى، ثم صفّان — العربي فوق واللاتيني تحته.
 *
 * كل المحتوى **Arial** (`font-num`) بما فيه الحروف — حروف اللوحة رموز لا نصّ.
 * والصندوق `dir="ltr"` لأن ترتيب الأرقام والحروف ثابت لا يتبع اتجاه الصفحة.
 */
export function PlateBadge({
  letters,
  numbers,
  lettersEn,
  size = 'md',
  className,
}: {
  /** ثلاثة أحرف عربية مفصولة بمسافات: «أ ب ج» */
  letters: string;
  /** أربعة أرقام Latin للتخزين */
  numbers: string;
  /** المقابل اللاتيني للأحرف: «A B J» */
  lettersEn?: string;
  size?: PlateSize;
  className?: string;
}) {
  const s = SIZE[size];

  return (
    <span
      dir="ltr"
      className={cn(
        'inline-flex flex-col overflow-hidden rounded-sm border border-ink bg-bg text-center',
        s.box,
        className,
      )}
    >
      <span className={cn('bg-ink font-num font-bold tracking-[0.2em] text-bg', s.ksa)}>
        KSA
      </span>

      <span className={cn('font-num flex items-center justify-center gap-2 font-bold', s.row)}>
        <span>{toArabicDigits(numbers)}</span>
        <span className="w-px self-stretch bg-line" />
        <span>{letters}</span>
      </span>

      <span
        className={cn(
          'font-num flex items-center justify-center gap-2 border-t border-line-2 font-bold opacity-60',
          s.sub,
        )}
      >
        <span>{numbers}</span>
        <span className="w-px self-stretch bg-line" />
        <span>{lettersEn ?? letters}</span>
      </span>
    </span>
  );
}
