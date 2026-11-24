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

/** وحداتُ الزمن التي لها صيغةُ مجرور. */
type TimeUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';

/**
 * الوحدةُ التي تُقرأ بلا قسمة — والعدد معها.
 *
 * **والسُّلَّمُ كان يقف عند الشهر**، فعضويّةُ خمس سنوات تُقرأ «٦٠
 * شهرًا» — ورقمٌ يحتاج قسمةً في الرأس هو ما وُضع هذا المكوّن ليمنعه.
 * (وترميز `Wg` يكتبها «٥ سنوات».) والسنةُ تبدأ عند أربعةٍ وعشرين
 * شهرًا لا دونها: **«سنة واحدة» عن ثمانيةَ عشرَ شهرًا تُنقص نصفَ
 * المدّة** — والقسمةُ تهبط، فكلُّ ما بين السنة والسنتين يُقرأ سنة.
 */
function scale(hours: number): { unit: TimeUnit; count: number } {
  if (hours < 24) return { unit: 'hours', count: hours };
  const days = Math.floor(hours / 24);
  if (days < 60) return { unit: 'days', count: days };
  const months = Math.floor(days / 30);
  if (months < 24) return { unit: 'months', count: months };
  return { unit: 'years', count: Math.floor(days / 365) };
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
type DurationProps = ({ hours: number; minutes?: never } | { minutes: number; hours?: never }) & {
  /**
   * ═══ يسبقها حرفُ جرّ ═══
   *
   * «منذ» و«أقل من» و«خلال» تحكم إعرابَ ما بعدها، والمثنّى يصير
   * «يومين» لا «يومان». وسائرُ الصيغ لا تتغيّر، **فالخطأ يقع عند
   * اثنين وحده** ويمرّ ما دام العدد غيرَه — وهو ما أبقاه في الشاشات
   * حتى قِيس.
   */
  genitive?: boolean;
};

/** صيغةُ المجرور لنفس الوحدة — والتسميةُ موجودة لكلٍّ منها. */
const GENITIVE = {
  minutes: 'minutesGenitive',
  hours: 'hoursGenitive',
  days: 'daysGenitive',
  weeks: 'weeksGenitive',
  months: 'monthsGenitive',
  years: 'yearsGenitive',
} as const satisfies Record<TimeUnit, Unit>;

const form = (unit: TimeUnit, genitive: boolean): Unit => (genitive ? GENITIVE[unit] : unit);

export function Duration(props: DurationProps) {
  /**
   * **والصفرُ في سياق الزمن جملةٌ خاصّة**: `Quantity` تصوغه نفيًا («لا
   * دقائق»)، و«منذ لا دقائق» تقع في اللحظة الأولى — أي حين يفتح
   * المشغّل الطابور على بلاغٍ وصل للتوّ.
   */
  if (props.minutes !== undefined) {
    if (props.minutes < 1) return <span>الآن</span>;
    if (props.minutes < 60) {
      return <Quantity unit={form('minutes', props.genitive === true)} count={props.minutes} />;
    }
    const { unit, count } = scale(Math.floor(props.minutes / 60));
    return <Quantity unit={form(unit, props.genitive === true)} count={count} />;
  }

  /**
   * **وأقلُّ من ساعةٍ تُقال بجملتها.** `Quantity` تصوغ الصفر نفيًا
   * («لا ساعات») — وهي حالُ كل طلبٍ في دقائقه الأولى، أي حين يفتحه
   * المشغّل أوّل مرّة.
   */
  if (props.hours < 1) return <span>أقل من ساعة</span>;
  const { unit, count } = scale(props.hours);
  return <Quantity unit={form(unit, props.genitive === true)} count={count} />;
}
