'use client';

import { useTranslations } from 'next-intl';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { RangeBar, type RangeStats } from '@/components/ui/RangeBar';

/**
 * ═══ إرشادُ السعر — والبائع كان يكتب رقمًا على غير هدى ═══
 *
 * صدرُ صفحة البيع يَعِد بـ«سعرٍ عادل»، ثمّ تُقدَّم خانةٌ فارغة بلا
 * مرجع. **والبيانات كانت موجودة كلَّها**: `PriceStat` بمئيناتها،
 * و`priceStatFor` تختار أدقّ صفٍّ، و`RangeBar` يرسمه في صفحة
 * المركبة — وستُّ سلاسلَ لهذه اللوحة بعينها في `ar.json` **لا
 * يناديها أحد**. فُصمّمت ثمّ سقطت.
 *
 * ═══ وما لا قاعدة له لا يُعرض ═══
 *
 * التصميم يعرض أيضًا «عند سعرك ٥٢ يومًا · عند ١٣٥٬٠٠٠ ١٨ يومًا» —
 * وهو إسقاطٌ من السعر إلى زمن البيع **لا وجود لقاعدته**:
 * `daysToSellMedian` رقمٌ واحد للشريحة كلّها لا دالّةٌ في السعر.
 * واختلاقُ منحنًى يجعل الشاشة تَعِد ببيعٍ في ثمانيةَ عشرَ يومًا لا
 * تملك ما يسنده.
 */
export function PriceGuidance({
  price,
  stat,
  segment,
}: {
  price: number;
  stat: RangeStats | null;
  /** «كامري ٢٠٢٤ … في الرياض» — وصفُ الشريحة التي بُني عليها الرقم */
  segment: string;
}) {
  const t = useTranslations('sell');

  if (stat === null || price <= 0) return null;

  /**
   * الفارق عن **الوسيط** لا عن طرفَي النطاق: الوسيط هو «السوق»،
   * والطرفان حدّاه.
   */
  const delta = stat.p50 === 0 ? 0 : Math.round(((price - stat.p50) / stat.p50) * 100);
  const within = price >= stat.p25 && price <= stat.p75;

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <p className="mb-3.5 flex flex-wrap items-baseline gap-1.5 text-2xs font-bold">
        {within ? (
          t('atMarket')
        ) : (
          <>
            {delta > 0 ? t('aboveMarket') : t('belowMarket')}
            {/* النسبة بمقطعٍ واحد — وتقسيمها يجعل الاتّجاه يفرّقها */}
            <span className="font-num" dir="ltr">
              <ArabicNumber value={Math.abs(delta)} grouped={false} />٪
            </span>
          </>
        )}
      </p>

      {/*
        **والأساس يقوله `RangeBar` نفسه** — فلا يُكتب سطرٌ ثانٍ بجواره
        يقول ما يقوله. وكان مكرَّرًا في أوّل تصيير.
      */}
      <RangeBar price={price} stats={stat} segment={segment} />

    </section>
  );
}
