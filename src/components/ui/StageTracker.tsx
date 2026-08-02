import { useTranslations } from 'next-intl';
import { ArabicNumber } from './ArabicNumber';
import { cn } from '@/lib/cn';

export const ORDER_STAGES = [
  'REQUEST',
  'APPROVED',
  'INSPECTION',
  'PAYMENT',
  'TRANSFER',
  'DONE',
] as const;

export type OrderStage = (typeof ORDER_STAGES)[number];

/**
 * مراحل الطلب الستّ — أفقي في Wj ورأسي في عمود الأدمن.
 *
 * الترتيب البصري يُبنى من اتجاه المستند لا من قيَم ثابتة (HANDOFF §١٢):
 * لذلك لا `left/right` هنا، والخطّ الواصل منطقي الاتجاه.
 */
export function StageTracker({
  current,
  orientation = 'horizontal',
  className,
}: {
  current: OrderStage;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}) {
  const t = useTranslations('orderStage');
  const currentIndex = ORDER_STAGES.indexOf(current);
  const vertical = orientation === 'vertical';

  return (
    <ol
      className={cn(
        'flex',
        vertical ? 'flex-col gap-0' : 'items-start gap-0',
        className,
      )}
    >
      {ORDER_STAGES.map((stage, i) => {
        const state = i < currentIndex ? 'done' : i === currentIndex ? 'now' : 'next';
        const isLast = i === ORDER_STAGES.length - 1;

        return (
          <li
            key={stage}
            className={cn(
              'relative flex',
              vertical ? 'gap-3.5 pb-5 last:pb-0' : 'flex-1 flex-col gap-2.5',
            )}
          >
            <div className={cn('flex items-center', vertical && 'flex-col self-stretch')}>
              <span
                className={cn(
                  'z-1 flex size-6 shrink-0 items-center justify-center rounded-full text-3xs font-bold',
                  state === 'done' && 'bg-accent text-bg',
                  state === 'now' && 'bg-ink text-bg',
                  state === 'next' && 'border border-line bg-bg text-ink/45',
                )}
              >
                {state === 'done' ? (
                  <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12l6 6L20 6" />
                  </svg>
                ) : (
                  <ArabicNumber value={i + 1} />
                )}
              </span>

              {isLast ? null : (
                <span
                  className={cn(
                    state === 'done' ? 'bg-accent' : 'bg-line',
                    vertical ? 'w-px flex-1 self-center' : 'h-px flex-1',
                  )}
                />
              )}
            </div>

            <span
              className={cn(
                'text-2xs',
                state === 'next' ? 'opacity-45' : 'font-semibold',
                vertical && '-mt-6 pb-2',
              )}
            >
              {t(stage)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
