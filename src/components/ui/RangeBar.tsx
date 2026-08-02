import { useTranslations } from 'next-intl';
import { Money } from './Money';
import { ArabicNumber } from './ArabicNumber';
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
  className,
}: {
  price: number;
  stats: RangeStats;
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

      <p className="flex flex-wrap items-center gap-1.5 text-2xs opacity-55">
        <span>{t('basedOn')}</span>
        <ArabicNumber value={stats.sampleSize} className="font-semibold" />
        <span>{t('deals')}</span>
      </p>
    </div>
  );
}
