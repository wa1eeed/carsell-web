import { toArabicDigits } from '@/lib/arabic';
import { cn } from '@/lib/cn';

/**
 * ═══ منحنى المساحة — A2 «حجم الطلبات اليومي» · A3 «GMV والإيراد» ═══
 *
 * `viewBox="0 0 100 100"` مع `preserveAspectRatio="none"`: الرسم يتمدّد
 * إلى عرض الحاوية مهما كان، والارتفاع ثابت. **والسمك يبقى ثابتًا**
 * بـ`vector-effect="non-scaling-stroke"` — وبدونه يُمطّ الخطّ أفقيًّا
 * فيصير شعرةً رأسيةً وحبلًا أفقيًّا في الرسم نفسه.
 *
 * ═══ ويُرسم على الخادم ═══
 *
 * لا حالة ولا تفاعل: نقاطٌ تُحسب من بيانات وتُكتب في `points`. فلا
 * مكتبة رسمٍ في الحزمة، ولا جافاسكربت تصل المتصفّح.
 */

export type SparkPoint = { label: string; value: number };

export function Sparkline({
  points,
  height = 140,
  className,
}: {
  points: readonly SparkPoint[];
  height?: number;
  className?: string;
}) {
  /**
   * **نقطةٌ واحدة ليست منحنى.** وسلسلةٌ فارغة تُنتج `points=""` فيرسم
   * المتصفّح لا شيء بلا خطأ — والقارئ يرى مربّعًا فارغًا يظنّه عطلًا.
   */
  if (points.length < 2) {
    return (
      <div
        className={cn('rounded-xl border border-line bg-surface p-6 text-2xs opacity-50', className)}
      >
        لا بيانات كافية للرسم — نقطتان فأكثر.
      </div>
    );
  }

  const values = points.map((point) => point.value);
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  /**
   * **المدى صفرٌ حين تتساوى القيم كلّها** — والقسمة عليه تُنتج `NaN`
   * في كل إحداثيّ، فيختفي المنحنى صامتًا. فيُرسم خطًّا في الوسط.
   */
  const span = max - min === 0 ? 1 : max - min;

  const coords = points.map((point, i) => {
    const x = (i / (points.length - 1)) * 100;
    // ‏٨ فوق و١٠٠ تحت: هامشٌ علويّ كي لا تلتصق القمّة بالحافّة
    const y = max - min === 0 ? 54 : 100 - 8 - ((point.value - min) / span) * 84;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const line = coords.join(' ');
  const area = `0,100 ${line} 100,100`;

  // أربع علامات على المحور — كالتصميم: الأولى والثلث والثلثان والأخيرة
  const ticks = [0, Math.floor((points.length - 1) / 3), Math.floor((2 * (points.length - 1)) / 3), points.length - 1];
  const seen = new Set<number>();
  const axis = ticks.filter((i) => (seen.has(i) ? false : (seen.add(i), true)));

  return (
    <div className={cn('rounded-xl border border-line bg-surface px-5.5 pt-5 pb-3.5', className)}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ height }}
        className="block w-full"
        role="img"
        aria-label={`منحنى — عدد النقاط (${toArabicDigits(String(points.length))})`}
      >
        <polyline points={area} className="fill-accent/13" />
        <polyline
          points={line}
          fill="none"
          className="stroke-accent"
          strokeWidth={1.4}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      </svg>

      <div className="font-num mt-2 flex justify-between text-3xs font-semibold opacity-40">
        {axis.map((i) => (
          <span key={i}>{points[i]?.label}</span>
        ))}
      </div>
    </div>
  );
}
