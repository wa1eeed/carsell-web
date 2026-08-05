import Link from 'next/link';

/**
 * ═══ لوحة القيادة ثلاثة تابز لا ثلاث شاشات ═══
 *
 * التصميم (A1 · A2 · A3) يضع «نمو وأعداد» و«تشغيلية» و«مالية» **تابزًا
 * داخل لوحة القيادة**، والشريط الجانبي فيه «لوحة القيادة» وحدها. وكان
 * المبنيّ يفرّقها ثلاثةَ بنود — فمن أراد أن يقارن نموًّا بتشغيلٍ خرج من
 * الشاشة وعاد إليها، والتصميم يريدها نظرةً واحدة بثلاث عدسات.
 *
 * ═══ والتاب الذي لا تملكه لا يُعرض ═══
 *
 * «المالية» تحتاج `finance.view`، و`OPS` لا يملكها. وعرضُها معطّلةً
 * يقول لمن لا يملكها إن هناك ما يُخفى عنه؛ وإخفاؤها يقول إن هذه ليست
 * شاشته — وهو الصدق.
 */

export type DashboardTab = 'growth' | 'ops' | 'finance';

const LABELS: Record<DashboardTab, string> = {
  growth: 'نمو وأعداد',
  ops: 'تشغيلية',
  finance: 'مالية',
};

export function DashboardTabs({
  active,
  available,
}: {
  active: DashboardTab;
  /** ما يملكه هذا الأدمن — والترتيب ترتيب التصميم لا ترتيب الصلاحيات. */
  available: readonly DashboardTab[];
}) {
  return (
    <nav className="mb-6 flex flex-wrap justify-center gap-2">
      {(['growth', 'ops', 'finance'] as const)
        .filter((key) => available.includes(key))
        .map((key) => (
          <Link
            key={key}
            href={key === 'growth' ? '/admin' : `/admin?tab=${key}`}
            aria-current={key === active ? 'page' : undefined}
            className={
              key === active
                ? 'rounded-full bg-ink px-4.5 py-2 text-2xs font-bold text-bg'
                : 'rounded-full border border-line px-4.5 py-2 text-2xs font-bold hover:border-ink'
            }
          >
            {LABELS[key]}
          </Link>
        ))}
    </nav>
  );
}
