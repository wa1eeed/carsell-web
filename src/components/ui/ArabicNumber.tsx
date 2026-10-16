import { useLocale } from 'next-intl';
import { formatNumber, type NumeralLocale, percentSign } from '@/lib/arabic';
import { cn } from '@/lib/cn';

/**
 * كل رقم معروض يمرّ من هنا.
 *
 * ثلاث قواعد مجتمعة في مكوّن واحد:
 *   · `font-num` — الأرقام بـArial داخل نص Tajawal.
 *   · صيغتُها من `DISPLAY_NUMERALS` — لاتينية اليوم بقرار المالك.
 *   · `bidi-isolate` + `dir="ltr"` — الرقم مقطعٌ معاكس الاتّجاه.
 */
export function ArabicNumber({
  value,
  decimals = 0,
  grouped = true,
  percent = false,
  className,
}: {
  value: number | string;
  decimals?: number;
  grouped?: boolean;
  /**
   * علامةُ النسبة **داخل المقطع لا بجواره**.
   *
   * كانت تُكتب «٪» بعد المكوّن في خمسة مواضع: فهي **عربية على
   * صفحةٍ إنجليزية**، وهي خارج عزل `dir="ltr"` — ففي مقطعٍ يرث
   * RTL تنزلق إلى الطرف الآخر فيُرسم «٪15». وموضعها مع رقمها.
   */
  percent?: boolean;
  className?: string;
}) {
  const locale = useLocale() as NumeralLocale;

  /**
   * ═══ و`dir="ltr"` على كل رقمٍ لا على السالب وحده ═══
   *
   * كانت على السالب فقط: **العزل وحده لا يكفي** — داخل مقطعٍ معزول
   * يرث RTL تسقط الإشارة المحايدة إلى يمين الرقم فيُرسم «٨٩٢−».
   *
   * ولمّا صارت الأرقام لاتينية صار **كلُّ رقمٍ** مقطعًا معاكس
   * الاتّجاه داخل نصٍّ عربيّ، لا السالب وحده: «1,234» بلا تثبيتٍ
   * قد تلتصق بما قبلها فينزلق الترتيب، و«2026-10» تُرسم مقلوبة.
   * فالتثبيت على الجميع — وثمنُه لا شيء، وغيابُه رقمٌ يُقرأ خطأ.
   */
  return (
    <span dir="ltr" className={cn('font-num bidi-isolate', className)}>
      {formatNumber(value, locale, { decimals, grouped })}
      {!percent ? null : percentSign(locale)}
    </span>
  );
}
