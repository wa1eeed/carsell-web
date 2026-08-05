'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ArabicNumber } from './ArabicNumber';
import { cn } from '@/lib/cn';

export type ButtonVariant =
  | 'primary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'icon';
export type ButtonSize = 'sm' | 'md';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-bg hover:bg-accent-700',
  outline: 'border border-ink text-ink hover:bg-ink/5',
  ghost: 'text-ink hover:bg-ink/6',
  danger: 'bg-danger text-bg hover:opacity-90',
  icon: 'border border-line bg-bg text-ink hover:bg-ink/5',
};

/**
 * الحشو مقيسٌ من الترميز: **‎10px/18px‎** للزرّ القياسيّ. وكان
 * ‎10px/14px‎ — أضيقُ أفقيًّا، فيبدو الزرّ مضغوطًا حول نصّه.
 *
 * **والمقاس النصّي على سُلَّمنا** لا على ‎11.5px‎ الخام: رُفع بقرارٍ
 * صريح من المالك.
 */
const SIZE: Record<ButtonSize, string> = {
  sm: 'px-4.5 py-2.5 text-sm',
  md: 'px-4.5 py-2.5 text-base',
};

/**
 * الزرّ. `count` يعرض عدّادًا في دائرة — كما في تبويبات الأدمن.
 * الحد الأدنى للمس ٤٤×٤٤ في `md` (HANDOFF §١٦).
 */
export function Button({
  variant = 'primary',
  size = 'md',
  count,
  icon,
  children,
  className,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  count?: number;
  icon?: ReactNode;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const isIconOnly = variant === 'icon' && children === undefined;

  return (
    <button
      type="button"
      className={cn(
        // نصف القطر ‎9px‎ كالترميز (`--radius-btn`) — و`rounded-md` أحدَ عشر
        'inline-flex items-center justify-center gap-2 rounded-btn font-bold whitespace-nowrap',
        'transition-colors disabled:pointer-events-none disabled:opacity-40',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        isIconOnly ? 'size-11 p-0' : SIZE[size],
        size === 'md' && !isIconOnly && 'min-h-11',
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
      {count === undefined ? null : (
        <span
          className={cn(
            'inline-flex size-5 items-center justify-center rounded-full text-3xs',
            variant === 'primary' || variant === 'danger'
              ? 'bg-bg/22 text-bg'
              : 'bg-ink/10 text-ink',
          )}
        >
          <ArabicNumber value={count} />
        </span>
      )}
    </button>
  );
}
