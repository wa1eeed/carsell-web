import { useTranslations } from 'next-intl';
import { ArabicNumber } from './ArabicNumber';
import { cn } from '@/lib/cn';

export type MoneySize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<MoneySize, string> = {
  sm: 'text-xs',
  md: 'text-base',
  lg: 'text-xl',
  xl: 'text-3xl',
};

/**
 * مبلغ بالريال.
 *
 * `struck` للسعر السابق · `negative` لخصم أو ردّ — **بالأخضر لا بالأحمر**،
 * فالأحمر للفشل والحذف وحدهما (القسم ٣ قاعدة ٦).
 * العملة مقطع منفصل: لولا ذلك لانزلقت بين الرقم وما بعده في RTL.
 */
export function Money({
  amount,
  size = 'md',
  decimals = 0,
  struck = false,
  negative = false,
  showCurrency = true,
  className,
}: {
  amount: number | string;
  size?: MoneySize;
  decimals?: number;
  struck?: boolean;
  negative?: boolean;
  showCurrency?: boolean;
  className?: string;
}) {
  const t = useTranslations('ui');

  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1',
        SIZE[size],
        struck && 'line-through opacity-45',
        negative && 'text-accent-700',
        className,
      )}
    >
      {negative ? <span className="font-num bidi-isolate">−</span> : null}
      <ArabicNumber value={amount} decimals={decimals} className="font-bold" />
      {showCurrency ? (
        <span className="bidi-isolate text-[0.72em] font-medium opacity-60">
          {t('currency')}
        </span>
      ) : null}
    </span>
  );
}
