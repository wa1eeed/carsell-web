import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArabicNumber } from './ArabicNumber';
import { Money } from './Money';
import { Quantity } from './Quantity';

export type SimilarItem = {
  ref: string;
  title: string;
  year: number;
  mileageKm: number;
  price: number;
  inspected: boolean;
  href: string;
};

/**
 * سيارات مشابهة — بطاقة مختصرة لا `CarCard` كاملة.
 *
 * القارئ هنا لم يأتِ ليبحث، بل ليقارن بما يقرأه. فالبطاقة تحمل ما
 * يُقارَن به وحده: الاسم والسنة والممشى والسعر. وإقحام البائع والشارات
 * يجعلها تنافس المحتوى الذي جاء من أجله.
 *
 * **بلا مشابهات لا يُعرض القسم إطلاقًا** — عنوان فوق فراغ يقول إننا
 * نسينا شيئًا.
 */
export function SimilarGrid({
  items,
  className,
}: {
  items: readonly SimilarItem[];
  className?: string;
}) {
  const t = useTranslations('ui');
  if (items.length === 0) return null;

  return (
    <section className={className}>
      <header className="mb-5 flex items-baseline gap-3.5">
        <h2 className="text-2xl font-bold">{t('similarCars')}</h2>
        <span className="h-px flex-1 bg-line" />
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.ref}
            href={item.href}
            className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface hover:border-ink/25"
          >
            <span className="washed h-28" />
            <span className="flex flex-col gap-1 p-4">
              <span className="flex flex-wrap items-baseline gap-1.5 text-sm font-bold">
                <span className="bidi-isolate">{item.title}</span>
                <ArabicNumber value={item.year} grouped={false} />
              </span>
              <span className="flex flex-wrap items-center gap-1.5 text-3xs opacity-50">
                <Quantity unit="km" count={item.mileageKm} />
                {item.inspected ? (
                  <>
                    <span aria-hidden className="opacity-40">
                      ·
                    </span>
                    <span>{t('inspected')}</span>
                  </>
                ) : null}
              </span>
              <Money amount={item.price} size="md" showCurrency={false} className="mt-1.5 text-accent-700" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
