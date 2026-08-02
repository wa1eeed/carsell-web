'use client';

import type { ReactNode } from 'react';
import { ArabicNumber } from './ArabicNumber';
import { cn } from '@/lib/cn';

/**
 * الرقاقة — كبسولة (`rounded-full`) لا مستطيل، وهذا ما يفرّقها عن `Badge`.
 *
 * `filter` قابلة للنقر · `active` داكنة · `count` عدّاد في دائرة ·
 * `onRemove` يضيف × للرقائق المفعّلة فوق نتائج البحث (Wb).
 */
export function Chip({
  active = false,
  count,
  onRemove,
  onClick,
  disabled = false,
  children,
  className,
}: {
  active?: boolean;
  count?: number;
  onRemove?: () => void;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const interactive = onClick !== undefined;
  const Tag = interactive ? 'button' : 'span';

  return (
    <Tag
      {...(interactive ? { type: 'button' as const, onClick, disabled } : {})}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold whitespace-nowrap',
        active
          ? 'bg-ink text-bg'
          : 'border border-line text-ink',
        interactive && !disabled && !active && 'hover:bg-ink/5',
        disabled && 'pointer-events-none opacity-40',
        className,
      )}
    >
      {children}
      {count === undefined ? null : (
        <span
          className={cn(
            'inline-flex size-4.5 items-center justify-center rounded-full text-3xs',
            active ? 'bg-bg/22' : 'bg-ink/8',
          )}
        >
          <ArabicNumber value={count} />
        </span>
      )}
      {onRemove === undefined ? null : (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="-me-1 inline-flex size-4.5 items-center justify-center rounded-full opacity-55 hover:opacity-100"
          aria-label="remove"
        >
          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </Tag>
  );
}
