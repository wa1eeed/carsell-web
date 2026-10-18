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
 */
export function Duration({ hours }: { hours: number }) {
  /**
   * **وأقلُّ من ساعةٍ تُقال بجملتها.** `Quantity` تصوغ الصفر نفيًا
   * («لا ساعات») — وهي حالُ كل طلبٍ في دقائقه الأولى، أي حين يفتحه
   * المشغّل أوّل مرّة.
   */
  if (hours < 1) return <span>أقل من ساعة</span>;
  const { unit, count } = scale(hours);
  return <Quantity unit={unit} count={count} />;
}
