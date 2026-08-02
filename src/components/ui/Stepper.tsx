import { ArabicNumber } from './ArabicNumber';
import { cn } from '@/lib/cn';

export type Step = { id: string; label: string };

/**
 * شريط الخطوات.
 *
 * **الخطوة المكتملة قابلة للنقر والقادمة ليست كذلك.** الرجوع لتصحيح
 * بيان أدخلتَه حقٌّ، والقفز إلى خطوة تعتمد على ما لم يُدخَل بعد يُنتج
 * شاشة نصفها فارغ ونصفها معطّل — وهي أسوأ من منع النقر.
 */
export function Stepper({
  steps,
  active,
  onSelect,
  className,
}: {
  steps: readonly Step[];
  active: string;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const current = steps.findIndex((step) => step.id === active);

  return (
    <ol className={cn('flex flex-wrap items-center gap-3', className)}>
      {steps.map((step, i) => {
        const done = i < current;
        const here = i === current;
        const reachable = done && onSelect !== undefined;

        const Tag = reachable ? 'button' : 'span';

        return (
          <li key={step.id} className="flex items-center gap-3">
            {i > 0 ? <span className="h-px w-8 bg-line" aria-hidden /> : null}
            <Tag
              {...(reachable ? { type: 'button' as const, onClick: () => onSelect(step.id) } : {})}
              aria-current={here ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-full py-1.5 ps-1.5 pe-4',
                here && 'bg-ink text-bg',
                done && 'text-accent-800 hover:bg-accent-100',
                !here && !done && 'opacity-45',
              )}
            >
              <span
                className={cn(
                  'flex size-6.5 items-center justify-center rounded-full text-2xs font-bold',
                  here ? 'bg-bg/20' : done ? 'bg-accent text-bg' : 'border border-line',
                )}
              >
                {done ? (
                  <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                ) : (
                  <ArabicNumber value={i + 1} grouped={false} />
                )}
              </span>
              <span className="text-sm font-bold">{step.label}</span>
            </Tag>
          </li>
        );
      })}
    </ol>
  );
}
