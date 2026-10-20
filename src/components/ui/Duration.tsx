import { Quantity, type Unit } from '@/components/ui/Quantity';

/**
 * ═══ مدّةٌ بوحدتها الطبيعية ═══
 *
 * ساعاتٌ خامّة لا تُقرأ: «٢٬٠٣٧ ساعة» يحتاج قسمةً في الرأس. فتُختار
 * الوحدة التي تُقرأ بلا قسمة — شهرًا أو يومًا أو ساعة.
 *
 * **والجمعُ من `Quantity` لا من يد** (البوابة ١٦): «٢ ساعة» خطأ
 * وصوابُها «ساعتان». وكان بدلَها في عشرين موضعًا «ساعات (٢)» —
 * التفافٌ على البوابة لا صياغة، ويُقرأ أنّ النصّ آليّ.
 *
 * وموضعُها هنا لا في `admin/Dwell`: مهلةُ النزاع ومهلةُ العرض ومهلةُ
 * المزوّد ومهلةُ المزاد — وصفحةُ المركبة في الموقع تحتاجها مثلها.
 */

/** الوحدةُ التي تُقرأ بلا قسمة — والعدد معها. */
function scale(hours: number): { unit: Unit; count: number } {
  if (hours < 24) return { unit: 'hours', count: hours };
  const days = Math.floor(hours / 24);
  if (days < 60) return { unit: 'days', count: days };
  return { unit: 'months', count: Math.floor(days / 30) };
}

/**
 * مدّةٌ بوحدتها الطبيعية — **وتُصدَّر لأن غير الطلبات يحتاجها**: مهلة
 * نزاعٍ ومهلة عرضٍ ومهلة مزاد. ونسخةٌ ثانية منها تصوغ «٢ ساعة».
 *
 * ═══ والدقائق مدخلٌ ثانٍ لا مكوّنٌ ثانٍ ═══
 *
 * طابورُ البلاغات يقيس بالدقائق («منذ ٧ دقائق»)، وكانت له دالّةٌ
 * تصوغ بيدها — ونسختُها في `MonitorShell` بلا منادٍ أصلًا. ومدخلان
 * لقاعدةٍ واحدة أسلمُ من قاعدتين تتباعدان.
 */
type DurationProps = { hours: number; minutes?: never } | { minutes: number; hours?: never };

export function Duration(props: DurationProps) {
  /**
   * **والصفرُ في سياق الزمن جملةٌ خاصّة**: `Quantity` تصوغه نفيًا («لا
   * دقائق»)، و«منذ لا دقائق» تقع في اللحظة الأولى — أي حين يفتح
   * المشغّل الطابور على بلاغٍ وصل للتوّ.
   */
  if (props.minutes !== undefined) {
    if (props.minutes < 1) return <span>الآن</span>;
    if (props.minutes < 60) return <Quantity unit="minutes" count={props.minutes} />;
    const { unit, count } = scale(Math.floor(props.minutes / 60));
    return <Quantity unit={unit} count={count} />;
  }

  /**
   * **وأقلُّ من ساعةٍ تُقال بجملتها.** `Quantity` تصوغ الصفر نفيًا
   * («لا ساعات») — وهي حالُ كل طلبٍ في دقائقه الأولى، أي حين يفتحه
   * المشغّل أوّل مرّة.
   */
  if (props.hours < 1) return <span>أقل من ساعة</span>;
  const { unit, count } = scale(props.hours);
  return <Quantity unit={unit} count={count} />;
}
