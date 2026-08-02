import { useLocale } from 'next-intl';
import { formatNumber, type NumeralLocale } from '@/lib/arabic';
import { cn } from '@/lib/cn';

/**
 * كل رقم معروض يمرّ من هنا.
 *
 * ثلاث قواعد مجتمعة في مكوّن واحد:
 *   · `font-num` — الأرقام بـArial داخل نص Tajawal.
 *   · عربي-هندي للعرض، Latin للتخزين والحساب.
 *   · `bidi-isolate` — الرقم مقطع معزول، وإلا انزلق ما حوله في RTL.
 */
export function ArabicNumber({
  value,
  decimals = 0,
  grouped = true,
  className,
}: {
  value: number | string;
  decimals?: number;
  grouped?: boolean;
  className?: string;
}) {
  const locale = useLocale() as NumeralLocale;

  return (
    <span className={cn('font-num bidi-isolate', className)}>
      {formatNumber(value, locale, { decimals, grouped })}
    </span>
  );
}
