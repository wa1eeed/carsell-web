import { Quantity, type Unit } from '@/components/ui/Quantity';

/**
 * ═══ مدّةُ المكوث مقابل هدفها ═══
 *
 * كان الكرت يعرض **«120 / 2,037»** — رقمين عاريين بشرطة، بلا تسمية في
 * الكرت ولا شرحٍ في صفحة التفاصيل. والمالك سأل: ما هذا؟
 *
 * **والترتيب كان يكذب فوق ذلك.** المكوث أوّلُ عنصرٍ في الشجرة والهدف
 * ثانيه، وفي RTL يُرسم الأوّلُ يمينًا — فتُقرأ الجملة من اليسار
 * «١٢٠ من أصل ٢٬٠٣٧»، وحقيقتُها أنّ الطلب مكث **٢٬٠٣٧ ساعة وهدفُه
 * ١٢٠**. أي أنّ القارئ يرى طلبًا متعثّرًا تعثّرًا شديدًا فيحسبه في
 * أوّل طريقه — وهو عكسُ القرار الذي يتّخذه.
 *
 * ═══ والعلاج صياغةٌ لا إعادةُ ترتيب ═══
 *
 * ساعاتٌ خامّة لا تُقرأ: «٢٬٠٣٧ ساعة» يحتاج قسمةً في الرأس. فالمدّة
 * بوحدتها الطبيعية — شهرًا أو يومًا أو ساعة — **والهدف مُسمًّى
 * بجانبها**، فلا يبقى رقمٌ بلا معنى.
 *
 * **والجمعُ من `Quantity` لا من يدي** (البوابة ١٦): «٢ ساعة» خطأ،
 * وصوابُها «ساعتان». **ولا جارَّ قبلها** (البوابة ١٨): «منذ» تُبقي
 * المثنّى مرفوعًا، فالتسمية اسمٌ لا حرفُ جرّ.
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
  if (hours < 1) return <span>أقلّ من ساعة</span>;
  const { unit, count } = scale(hours);
  return <Quantity unit={unit} count={count} />;
}

/** «مدة المرحلة ٨٥ يومًا · المستهدف ٥ أيام» */
export function Dwell({
  hours,
  targetHours,
  className,
}: {
  hours: number;
  targetHours: number;
  className?: string;
}) {
  return (
    <span className={className}>
      <span className="opacity-55">مدة المرحلة </span>
      <Duration hours={hours} />
      {/**
       * **ولا هدفَ لمرحلةٍ بلا هدف.** الأخيرة صفرٌ، و«الهدف لا ساعات»
       * جملةٌ تُقرأ عطلًا لا معلومة.
       */}
      {targetHours <= 0 ? null : (
        <>
          <span aria-hidden className="mx-1.5 opacity-30">
            ·
          </span>
          <span className="opacity-55">المستهدف </span>
          <Duration hours={targetHours} />
        </>
      )}
    </span>
  );
}
