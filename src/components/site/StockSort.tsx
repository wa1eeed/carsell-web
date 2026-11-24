'use client';

import { useRouter, useSearchParams } from 'next/navigation';

/**
 * ═══ ترتيبُ مخزون المعرض ═══
 *
 * ترميز `Wg` يضع «الأحدث ▾» بجوار مرشّحات المخزون. **وكان المخزون
 * يُرتَّب بالأحدث دائمًا ولا سبيل إلى غيره** — فمن يفتح صفحةَ معرضٍ
 * ليرى أرخص ما عنده يُقلّب الصفحات بعينه.
 *
 * وهو قائمةٌ لا شرائح: ثلاثةُ خيارات بجوار أربعةِ مرشّحات تزدحم،
 * والترتيبُ اختيارٌ واحدٌ من مجموعة — وذلك شكلُ القائمة.
 *
 * **والمرشّحُ يبقى عند تبديل الترتيب**: من اختار «مزاد» ثمّ رتّب
 * بالسعر لا يقصد العودة إلى الكلّ.
 */
export function StockSort({
  value,
  label,
  options,
}: {
  value: string;
  label: string;
  options: readonly { key: string; label: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    /*
      بلا عنوانٍ مرئيّ — فالتسمية بـ`aria-label`، وإلّا قرأ قارئُ
      الشاشة «الأحدث» ولا يعرف أنها ترتيب.
    */
    <select
      aria-label={label}
      value={value}
      onChange={(event) => {
        const next = new URLSearchParams(params.toString());
        if (event.target.value === options[0]?.key) next.delete('sort');
        else next.set('sort', event.target.value);
        router.push(`?${next.toString()}`, { scroll: false });
      }}
      className="rounded-md border border-line bg-surface px-3.5 py-2 text-2xs outline-none"
    >
      {options.map((option) => (
        <option key={option.key} value={option.key}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
