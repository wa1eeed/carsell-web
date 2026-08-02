import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { formatNumber, formatPercent, type NumeralLocale } from '@/lib/arabic';
import { cn } from '@/lib/cn';

/** الوحدات المعدودة — تُضاف هنا لا تُكتب في شاشة. */
export type Unit =
  | 'orders'
  | 'bidders'
  | 'deals'
  | 'days'
  | 'hours'
  | 'photos'
  | 'cars'
  | 'trims'
  | 'listings'
  | 'models'
  | 'km';

/**
 * عدد + وحدته.
 *
 * **الجمع العربي ست حالات** (zero · one · two · few · many · other):
 * «طلب واحد» و«طلبان» و«٩ طلبات» و«١١ طلبًا». كتابة الوحدة يدويًا
 * تنتج «٩ طلب» — خطأ نحوي يتكرّر في كل شاشة. القواعد في `units`
 * بصيغة ICU، ولا وحدة تُكتب خارج هذا المكوّن.
 *
 * والنصّ كله مقطع معزول واحد: الرقم ووحدته لا يفترقان، فلا ينزلق
 * ما بينهما في RTL. ولا `font-num` هنا — سلسلة الخط العربية تضع
 * الأرقام في Arial تلقائيًا عبر `unicode-range`، وفرضها على النصّ
 * كله يضع الحروف العربية في Arial أيضًا.
 */
export function Quantity({
  unit,
  count,
  className,
}: {
  unit: Unit;
  count: number;
  className?: string;
}) {
  const t = useTranslations('units');
  const locale = useLocale() as NumeralLocale;
  /**
   * `count` للاختيار النحوي، و`n` للعرض.
   * `#` في ICU يطبع بـ`Intl.NumberFormat('ar')` وهو **لاتيني** —
   * فيخرج «9 طلبات». الرقم يُصاغ هنا ثم يُمرَّر جاهزًا.
   */
  return (
    <span className={cn('bidi-isolate', className)}>
      {t(unit, { count, n: formatNumber(count, locale) })}
    </span>
  );
}

/**
 * نسبة مئوية.
 * الإشارة والرقم وعلامة النسبة في **مقطع واحد** — تقسيمها إلى
 * ثلاثة عناصر يجعل الاتجاه يفرّقها فتُقرأ «٪ ٤٠ −».
 */
export function Percent({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const locale = useLocale() as NumeralLocale;
  return (
    <span className={cn('bidi-isolate', className)}>
      {formatPercent(value, locale)}
    </span>
  );
}
