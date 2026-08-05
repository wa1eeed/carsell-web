import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { toArabicDigits } from '@/lib/arabic';
import { cn } from '@/lib/cn';

/**
 * ═══ أشرطة الحصص — A2 «جودة المحتوى» · A3 «مزيج الإيراد» ═══
 *
 * أجزاءٌ من كلّ، وكلٌّ منها بنسبته. **والنسبة تُحسب هنا لا تُمرَّر**:
 * نسبةٌ يحسبها المستدعي ورقمٌ يمرّره تتباعدان أوّل تغيير، فيقول الشريط
 * ٤٠٪ ويقول الرقم غير ذلك.
 *
 * **والقاعدة مكتوبة تحت الأشرطة**: «٣٬٨٤٠ صورة مرفوعة هذا الشهر» —
 * فنسبةٌ بلا مقامٍ معلَن لا تُقرأ.
 */

export type Share = { label: string; value: number; tone?: 'accent' | 'warn' | 'danger' };

export function ShareBars({
  shares,
  baseNote,
  /** المقام — وحين يُترك يُجمع من القيَم */
  total,
  decimals = 0,
  className,
}: {
  shares: readonly Share[];
  baseNote: string;
  total?: number;
  decimals?: number;
  className?: string;
}) {
  const base = total ?? shares.reduce((sum, share) => sum + share.value, 0);

  return (
    <div className={cn('rounded-xl border border-line bg-surface px-5 py-4.5', className)}>
      {shares.map((share) => {
        // مقامٌ صفر: شهرٌ بلا نشاط — والصفر حالٌ متوقّعة لا خطأ
        const pct = base === 0 ? 0 : (share.value / base) * 100;

        return (
          <div key={share.label} className="py-2">
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="truncate text-2xs opacity-72">{share.label}</span>
              <span className="font-num shrink-0 text-2xs font-bold">
                <ArabicNumber value={share.value} decimals={decimals} />
                <span className="opacity-45">
                  {' · '}
                  {toArabicDigits(pct.toFixed(1))}٪
                </span>
              </span>
            </div>

            <span className="block h-2 overflow-hidden rounded-full bg-line-2">
              <span
                className={cn(
                  'block h-full rounded-full',
                  share.tone === 'danger'
                    ? 'bg-danger'
                    : share.tone === 'warn'
                      ? 'bg-warn'
                      : 'bg-accent',
                )}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </span>
          </div>
        );
      })}

      <p className="mt-3 border-t border-line pt-3 text-3xs opacity-50">{baseNote}</p>
    </div>
  );
}
