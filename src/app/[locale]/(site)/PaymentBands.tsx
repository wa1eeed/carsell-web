'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Chip } from '@/components/ui/Chip';
import type { PaymentBandKey } from '@/lib/domain/home';

/**
 * شرائح القسط الشهري.
 *
 * **الاختيار يكتب في الرابط** كما في Wb — لا حالة عميل. فالزائر يستطيع
 * مشاركة «الرئيسية عند شريحة ٢٬٠٠٠–٢٬٥٠٠»، والعودة بالمتصفّح تعمل.
 *
 * والشريحة الفارغة **تُعرض معطّلة لا تُخفى**: اختفاؤها يغيّر ترتيب ما
 * بعدها تحت إصبع القارئ، والسلّم نفسه معلومة — أن لا شيء تحت ألف ريال
 * جوابٌ لا فراغ.
 */
export function PaymentBands({
  bands,
  selected,
}: {
  bands: readonly { key: PaymentBandKey; count: number }[];
  selected: PaymentBandKey;
}) {
  const t = useTranslations('site');
  const router = useRouter();
  const params = useSearchParams();

  const pick = (key: PaymentBandKey): void => {
    const next = new URLSearchParams(params.toString());
    next.set('band', key);
    router.push(`?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {bands.map((band) => (
        <Chip
          key={band.key}
          active={band.key === selected}
          disabled={band.count === 0}
          onClick={() => pick(band.key)}
        >
          {t(`band.${band.key}`)}
        </Chip>
      ))}
    </div>
  );
}
