import Link from 'next/link';
import { ArabicNumber } from '@/components/ui/ArabicNumber';

/**
 * ═══ شريط تابز القوائم — النمط المتكرّر في التصميم ═══
 *
 * A4 (الطلبات بالمراحل) وA5 (العملاء بالشرائح) وما بعدهما تبدأ كلّها
 * بشريط شرائح: **اسم وعدد**، النشط بخلفية داكنة وعدّاده فاتح، والخامل
 * بحدٍّ وعدّاده رماديّ.
 *
 * وكانت القوائم كلّها بلا شريط: صفحةٌ واحدة تعرض كل شيء، فمن أراد
 * «المتعثّرة» قرأ ثلاث مئة صفّ بعينه.
 *
 * ═══ والمقاسات مقيسة من الترميز ═══
 *
 * الشريحة `padding: 9px 15px` و`gap: 7px` وخطّها `11px`؛ والعدّاد
 * `padding: 1px 7px` وخطّه `9.5px` بخطّ لاتينيّ (Arial) لأنه رقم.
 * وتوكناتنا: `py-2.25 px-3.75` و`gap-1.75` و`text-3xs` — والرقم على
 * `font-num`.
 *
 * ═══ والصفر يُعرض ولا يُخفى ═══
 *
 * تابٌ بصفر يقول «لا شيء هنا الآن»، وإخفاؤه يجعل الشريط يتغيّر طوله
 * بين زيارتين فيضيع موضع ما يبحث عنه المشغّل.
 */

export type FilterTab = {
  key: string;
  label: string;
  count: number;
  /** نبرة العدّاد — للحالات التي تعني عملًا متأخّرًا. */
  tone?: 'neutral' | 'warn' | 'danger';
};

export function FilterTabs({
  tabs,
  active,
  basePath,
  param = 'tab',
}: {
  tabs: readonly FilterTab[];
  active: string;
  basePath: string;
  param?: string;
}) {
  return (
    <nav className="mb-5 flex flex-wrap gap-2.5">
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.key === 'all' ? basePath : `${basePath}?${param}=${tab.key}`}
            aria-current={on ? 'page' : undefined}
            className={
              on
                ? 'flex items-center gap-1.75 rounded-full bg-ink px-3.75 py-2.25 text-3xs font-bold text-bg'
                : 'flex items-center gap-1.75 rounded-full border border-line px-3.75 py-2.25 text-3xs font-semibold hover:border-ink'
            }
          >
            {tab.label}
            <span
              className={
                on
                  ? 'rounded-full bg-bg px-1.75 py-px font-num text-3xs font-bold text-ink'
                  : tab.tone === 'danger'
                    ? 'rounded-full bg-danger/12 px-1.75 py-px font-num text-3xs font-bold text-danger'
                    : tab.tone === 'warn'
                      ? 'rounded-full bg-warn-100 px-1.75 py-px font-num text-3xs font-bold text-warn-900'
                      : 'rounded-full bg-ink/8 px-1.75 py-px font-num text-3xs font-bold'
              }
            >
              <ArabicNumber value={tab.count} />
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
