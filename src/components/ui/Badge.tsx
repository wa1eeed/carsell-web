import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone =
  | 'neutral' /* وسم محايد — «مباشر» */
  | 'accent' /* أخضر — إجراء وتوثيق ونجاح */
  | 'warn' /* أوكر — وقت وما يحتاج انتباهًا */
  | 'danger' /* أحمر — فشل وحذف فقط */
  | 'ink'; /* داكن — عدّاد أو حالة حاسمة */

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-ink/8 text-ink',
  accent: 'bg-accent-100 text-accent-800',
  warn: 'bg-warn-200 text-warn-900',
  danger: 'bg-danger/12 text-danger',
  ink: 'bg-ink text-bg',
};

/** وسم حالة. المقاس واحد — التمييز باللون لا بالحجم. */
export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-2.5 py-1 text-2xs font-bold whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * «مفحوصة» — أخضر ممتلئ، **بلا رقم**.
 * وغياب الوسم يعني غياب الفحص لا رسوبه (القسم ٤).
 * لذلك لا حالة «غير مفحوصة»: العدم هو الحالة.
 */
export function InspectedBadge({ className }: { className?: string }) {
  const t = useTranslations('ui');
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm bg-accent px-2.5 py-1 text-2xs font-bold text-bg',
        className,
      )}
    >
      {t('inspected')}
    </span>
  );
}
