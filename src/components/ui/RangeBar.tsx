import { useTranslations } from 'next-intl';
import { Money } from './Money';
import { Counted } from './Counted';
import { Quantity } from './Quantity';
import { cn } from '@/lib/cn';

/** الحد الأدنى للثقة — أقل منه لا يُعرض شيء (HANDOFF §١٧٫١). */
export const RANGE_MIN_SAMPLE = 8;

export type RangeStats = {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  sampleSize: number;
  /** وسيطُ أيّام البيع — و`null` حين لا صفقاتٍ مكتملةٍ تكفي. */
  daysToSellMedian?: number | null;
  /**
   * **سعةُ المطابقة** — تقرؤها الشاشة لتصف الشريحة بما فيها لا بما
   * سألت عنه. والإحصاء يتدرّج إلى الأعمّ، فصفٌّ مدينتُه `*` لا
   * يُوصَف بمدينةٍ بعينها.
   */
  scopedToCity?: boolean;
  scopedToTrim?: boolean;
};

/**
 * موقع السعر في السوق.
 *
 * التعريف من DESIGN-DECISIONS ٣٠، لا من أرقام بطاقة التصميم:
 *   · طرفا المحور = المئين ١٠ و٩٠.
 *   · الشريط الأخضر = المئين ٢٥–٧٥ (السوق العادل).
 *   · المؤشّر = سعر هذا الإعلان، والتسمية تُوسَّط عليه.
 *   · خارج النطاق: يُثبَّت عند الطرف بسهم.
 *   · العيّنة < ٨ ⇒ **لا تُعرض البطاقة إطلاقًا** — لا نكتب متوسطًا
 *     من ثلاث صفقات، والصمت أصدق من رقم لا يُوثق به.
 *
 * يعيد `null` عند نقص العيّنة، فالمناداة لا تحتاج شرطًا خارجيًا.
 */
export function RangeBar({
  price,
  stats,
  segment,
  className,
}: {
  price: number;
  stats: RangeStats;
  /**
   * وصفُ الشريحة التي بُني عليها الرقم — «ألتيما ٢٠٢٣ في الرياض».
   *
   * **وعددٌ بلا شريحته رأيٌ لا خبر**: «مبنيّ على ٤٥ صفقة» لا تقول
   * صفقةَ ماذا، ومن يخفض سعره بناءً عليها يستحقّ أن يعرف على ماذا بنى.
   */
  segment?: string;
  className?: string;
}) {
  const t = useTranslations('ui');

  if (stats.sampleSize < RANGE_MIN_SAMPLE) return null;

  const span = Math.max(1, stats.p90 - stats.p10);
  const at = (value: number): number =>
    Math.max(0, Math.min(100, ((value - stats.p10) / span) * 100));

  const below = price < stats.p10;
  const above = price > stats.p90;
  const markerPct = below ? 0 : above ? 100 : at(price);

  const fairStart = at(stats.p25);
  const fairWidth = at(stats.p75) - fairStart;

  return (
    <div className={cn('flex flex-col gap-3.5', className)}>
      <div className="relative pt-7">
        {/* التسمية موسَّطة على المؤشّر */}
        <div
          className="absolute top-0 -translate-x-1/2 rtl:translate-x-1/2"
          style={{ insetInlineStart: `${markerPct}%` }}
        >
          <span className="flex flex-col items-center gap-1 whitespace-nowrap">
            <span className="text-3xs opacity-55">
              {below ? t('belowRange') : above ? t('aboveRange') : t('thisListing')}
            </span>
            <Money amount={price} size="sm" showCurrency={false} />
          </span>
        </div>

        <div className="relative h-2 rounded-full bg-ink/10">
          <span
            className="absolute inset-y-0 rounded-full bg-accent-200"
            style={{ insetInlineStart: `${fairStart}%`, width: `${fairWidth}%` }}
          />
          <span
            className={cn(
              'absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full border-2 border-bg bg-ink',
              (below || above) && 'ring-2 ring-warn',
            )}
            style={{ insetInlineStart: `calc(${markerPct}% - 7px)` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-3xs opacity-55">
        <Money amount={stats.p10} size="sm" showCurrency={false} />
        <span>{t('fairMarket')}</span>
        <Money amount={stats.p90} size="sm" showCurrency={false} />
      </div>

      {/*
        **والجارّ داخل الصيغة.** كان `{t('basedOn')}` («مبني على») ثمّ
        `<Quantity unit="deals">` — فيُخرج **«مبني على صفقتان»** عند
        الصفقتين: مثنًّى مرفوعٌ بعد حرف جرّ. (البوابة ٣١، وأخفتها
        لأن بينهما وسمًا مغلقًا.)
      */}
      {/*
        ═══ والشريط وحده لا يُقرَّر به ═══

        كان يعرض الطرفين والنطاق الأخضر، **ويترك الطرح للقارئ**:
        أيّ المتوسّط؟ وكم يبعد هذا السعر عنه؟ وكم يمكث مثلُه معروضًا؟

        والثلاثةُ في التصميم، وبياناتُها في `PriceStat` منذ بُني
        (`p50` و`daysToSellMedian`) — ولا تصل الشاشة. **و«أقلّ بسبعة
        آلاف من المتوسّط» أقوى سطرٍ في الصفحة كلّها**، و«يُباع في
        ثمانية عشر يومًا» هي التي تقول للمشتري أيستعجل أم لا.
      */}
      <dl className="flex flex-col gap-2 border-t border-line pt-3.5 text-2xs">
        <Row label={t('marketMedian')}>
          <Money amount={stats.p50} size="sm" showCurrency={false} />
        </Row>

        <Row label={t('priceGap')}>
          <Gap price={price} median={stats.p50} atMedian={t('atMarketMedian')} />
        </Row>

        {stats.daysToSellMedian === null || stats.daysToSellMedian === undefined ? null : (
          <Row label={t('daysToSell')}>
            <Quantity unit="days" count={stats.daysToSellMedian} />
          </Row>
        )}
      </dl>

      <p className="flex flex-wrap items-center gap-1.5 text-2xs opacity-55">
        <Counted message="basedOnDeals" count={stats.sampleSize} className="font-semibold" />
        {segment === undefined ? null : <span className="bidi-isolate">{segment}</span>}
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="opacity-55">{label}</dt>
      <dd className="font-bold">{children}</dd>
    </div>
  );
}

/**
 * الفرق عن الوسيط — **ولا إشارةَ حسابٍ تُرسَم**.
 *
 * «−٧٬٠٠٠» تُقرأ خصمًا على المشتري، وفي RTL تسقط إشارتُها على الجانب
 * الخطأ. فالكلمة تقول الاتّجاه والمبلغ موجب: «أقلّ بـ ٧٬٠٠٠».
 */
function Gap({
  price,
  median,
  atMedian,
}: {
  price: number;
  median: number;
  atMedian: string;
}) {
  const t = useTranslations('ui');
  const difference = Math.round(price - median);
  /** فرقٌ دون واحدٍ بالمئة ليس فرقًا — والدقّة هنا توهم بها. */
  if (Math.abs(difference) <= Math.max(1, median * 0.01)) {
    return <span className="opacity-70">{atMedian}</span>;
  }

  const cheaper = difference < 0;
  return (
    <span className={cheaper ? 'text-accent-700' : 'text-warn-900'}>
      {cheaper ? t('belowMedianBy') : t('aboveMedianBy')}{' '}
      <Money amount={Math.abs(difference)} size="sm" showCurrency={false} />
    </span>
  );
}
