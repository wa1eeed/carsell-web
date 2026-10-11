import { useLocale, useTranslations } from 'next-intl';
import { formatNumber, type NumeralLocale } from '@/lib/arabic';
import { cn } from '@/lib/cn';

/**
 * ═══ «قبل يومين» — متى نُشر ═══
 *
 * التصميم يضع على كل بطاقة متى نُشر الإعلان، **وهو ليس زينة**: سعرٌ
 * معروضٌ منذ شهرين يقول شيئًا عن قابليته للتفاوض لا يقوله الرقم
 * وحده، وإعلانٌ نُشر اليوم يُقرأ فرصةً. وبلا التاريخ يستوي عند
 * المتصفّح الجديدُ والراكد.
 *
 * ═══ ولا يبلغها `<Quantity>` ═══
 *
 * **المثنّى بعد «قبل» مجرور.** و`units.months` تصوغه مرفوعًا
 * («شهران») لأنها تُكتب ليقوم وحدَه — فضمُّ «قبل» إليه يُخرج **«قبل
 * شهران»**، وهو خطأٌ نحويّ يراه كل زائرٍ على كل بطاقة. فالجملة
 * كاملةً في `since.*` بصيغها الستّ: «قبل يومين» · «قبل أسبوعين» ·
 * «قبل شهرين».
 *
 * (وهو الصنف نفسه المسجَّل في صفر `Quantity`: «منذ لا ساعات».
 * والعلّة واحدة — صيغةٌ تصلح وحدها لا تصلح بعد حرف جرّ.)
 */
export function Since({ iso, className }: { iso: string; className?: string }) {
  const t = useTranslations('since');
  const locale = useLocale() as NumeralLocale;
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);

  if (!Number.isFinite(days) || days < 0) return null;

  /**
   * **واليوم الأوّل يُقال «اليوم».** صفرٌ في صيغة «قبل» يُخرج «قبل ٠
   * أيام»، وهي حال كل إعلانٍ في ساعاته الأولى — أي حين يكون أكثرَ
   * ما يُقرأ.
   */
  if (days === 0) return <span className={className}>{t('today')}</span>;

  /**
   * **والأسبوع يُقال أسبوعًا.** «قبل ٢١ يومًا» رقمٌ يُحسب، و«قبل
   * ثلاثة أسابيع» مدّةٌ تُدرَك — والبطاقة تُمسَح بالعين لا تُقرأ.
   */
  const unit = days < 7 ? 'days' : days < 60 ? 'weeks' : 'months';
  const count =
    unit === 'days' ? days : unit === 'weeks' ? Math.floor(days / 7) : Math.floor(days / 30);

  return (
    <span className={cn('bidi-isolate', className)}>
      {/* `count` للاختيار النحويّ و`n` للعرض — و`#` في ICU لاتينيّ */}
      {t(unit, { count, n: formatNumber(count, locale) })}
    </span>
  );
}
