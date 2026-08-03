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

  /**
   * **السالب يحتفظ بإشارته يسارًا.**
   *
   * العزل وحده لا يكفي: داخل مقطعٍ معزول يرث اتّجاه RTL، تسقط الإشارة
   * — وهي محايدة — إلى يمين الرقم فيُرسم «٨٩٢−» بدل «−٨٩٢». والقارئ
   * يقرؤها ٨٩٢ ثم يرى شرطةً لا يعرف ما هي، أو لا يراها فيقرأ خصمًا
   * زيادةً. و`dir="ltr"` على المقطع يُثبّتها في موضعها.
   */
  const numeric = typeof value === 'string' ? Number(value) : value;

  return (
    <span
      dir={numeric < 0 ? 'ltr' : undefined}
      className={cn('font-num bidi-isolate', className)}
    >
      {formatNumber(value, locale, { decimals, grouped })}
    </span>
  );
}
