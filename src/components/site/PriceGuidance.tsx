'use client';

import { useTranslations } from 'next-intl';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Button } from '@/components/ui/Button';
import { Quantity } from '@/components/ui/Quantity';
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
  onUse,
}: {
  price: number;
  stat: RangeStats | null;
  /** «كامري ٢٠٢٤ … في الرياض» — وصفُ الشريحة التي بُني عليها الرقم */
  segment: string;
  /** يملأ الخانة بالمقترَح — وبدونها يكون الاقتراحُ رقمًا يُنسَخ بيد. */
  onUse?: (price: number) => void;
}) {
  const t = useTranslations('sell');

  /**
   * ═══ والصدرُ وعد، فلا يُترك بلا جواب ═══
   *
   * كان المكوّن يعود `null` ما دامت الخانةُ فارغة — **فهو يُموضِع
   * رقمًا اختاره البائع ولا يقترح عليه شيئًا**، وصدرُ الصفحة يقول
   * «ونقترح عليك سعرًا مبنيًّا على صفقات حقيقية». فيقف البائع أمام
   * خانةٍ فارغة تحت جملةٍ وعدته بعون.
   *
   * فإن كان للشريحة إحصاء ولم يُكتب سعرٌ بعد: يُقترح الوسيط صراحةً،
   * ومعه عدد الصفقات التي بُني عليها وزرٌّ يملأ الخانة به.
   */
  if (stat === null) {
    return price > 0 ? null : (
      <p className="text-2xs leading-loose opacity-70">{t('suggestNone')}</p>
    );
  }

  if (price <= 0) {
    return (
      <section className="rounded-xl border border-line bg-surface p-5">
        <p className="mb-1.5 text-2xs font-bold">{t('suggestTitle')}</p>
        <p className="mb-2.5 flex flex-wrap items-baseline gap-1.5">
          <ArabicNumber value={stat.p50} className="text-lg font-bold" />
          <span className="text-2xs opacity-70">{t('currency')}</span>
        </p>
        {/* **والوصفُ من المُطابِق لا من المُدخَل** — الشريحةُ كما حُسبت */}
        <p className="mb-3.5 flex flex-wrap items-center gap-1.5 text-3xs opacity-70">
          <span className="bidi-isolate">{segment}</span>
          <span aria-hidden className="opacity-40">·</span>
          <Quantity unit="deals" count={stat.sampleSize} />
        </p>
        <p className="mb-4 text-3xs leading-loose opacity-70">{t('suggestNote')}</p>
        {onUse === undefined ? null : (
          <Button size="sm" variant="outline" onClick={() => onUse(stat.p50)}>
            {t('suggestUse')}
          </Button>
        )}
      </section>
    );
  }

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
              <ArabicNumber value={Math.abs(delta)} grouped={false} percent />
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
