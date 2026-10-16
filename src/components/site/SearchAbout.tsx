import Link from 'next/link';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';

/**
 * ═══ Wb — ما تحت النتائج ═══
 *
 * التصميم يُنهي صفحة البحث بثلاثة: عنوانٌ عن أسعار ما بحثتَ عنه،
 * وفقرةٌ تصفُه، وبحوثٌ ذات صلة. **ولم يكن تحت النتائج شيء.**
 *
 * وهي ليست زينةً ولا حشوَ محرّكات: من وصل آخر الصفحة ولم يجد مركبته
 * إمّا أن يخرج أو يجد أين يذهب. والشرائح تقول **أين توجد نتائج فعلًا**
 * — لا وجهاتٍ محتملة.
 *
 * ═══ وما لا يُحسب لا يُكتب ═══
 *
 * التصميم يكتب «جميع السيارات موثّقة الملكية» — **ولا توثيقَ ملكيةٍ في
 * المنتج**: لا حقل ولا خطوة ولا فحص. فالجملة لم تُكتب. وجملةُ الضمان
 * كُتبت لأنها تقع فعلًا: المال محجوزٌ حتى تنتقل الملكية.
 */
export type SearchSibling = { label: string; href: string; count: number };

export function SearchAbout({
  total,
  priceRange,
  scope,
  siblings,
}: {
  total: number;
  priceRange: { min: string; max: string } | null;
  /** ما يصف هذا البحث — ومن بحث عن «كل السيارات» لا يُقال له شيء خاصّ */
  scope: string | null;
  siblings: readonly SearchSibling[];
}) {
  if (total === 0 || scope === null) return null;

  const min = priceRange === null ? null : Number(priceRange.min);
  const max = priceRange === null ? null : Number(priceRange.max);
  const spread = min !== null && max !== null && max > min;

  return (
    <section className="mt-10 border-t border-line pt-7">
      <h2 className="mb-2.5 text-base font-bold">عن أسعار {scope}</h2>

      <p className="max-w-3xl text-sm leading-loose opacity-75">
        {/*
          **والعدد بـ`Quantity`**: «٥٢ سيارة» و«سيارتان» و«سيارة»
          ستُّ صيغٍ لا يحكمها قالب. ولا صفةَ بعده ولا جارَّ قبله —
          البوابة ٣١.
        */}
        في هذا البحث <Quantity unit="cars" count={total} />.
        {spread ? (
          <>
            {' '}أسعارها بين <Money amount={min ?? 0} showCurrency={false} /> و
            <Money amount={max ?? 0} />، وتتفاوت بسنة الصنع والممشى وتقييم الفحص.
          </>
        ) : null}{' '}
        والدفع عبر حساب ضمان لا يُحوَّل للبائع قبل نقل الملكية باسمك.
      </p>

      {siblings.length === 0 ? null : (
        <>
          <h3 className="mt-6 mb-2.5 text-2xs font-bold tracking-wider opacity-65">
            بحوث ذات صلة
          </h3>
          <div className="flex flex-wrap gap-2">
            {/*
              **ولا تُعرض وجهةٌ بلا نتائج.** الشريحة تُحسب من وجوه
              البحث نفسها — وهي محسوبةٌ ضمن بقية الفلاتر — فما يُعرض
              له نتائج بالضرورة. وصفحةُ الهبوط علّمتنا الثمن: رابطٌ
              نشرتَه بنفسك ثمّ أمَتَّه.
            */}
            {siblings.map((sibling) => (
              <Link
                key={sibling.href}
                href={sibling.href}
                className="rounded-lg border border-line px-3 py-1.5 text-2xs hover:bg-surface"
              >
                {sibling.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
