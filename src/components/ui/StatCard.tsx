import type { ReactNode } from 'react';
import { ArabicNumber } from './ArabicNumber';
import { cn } from '@/lib/cn';

export type StatTone = 'plain' | 'warn' | 'ink';

const TONE: Record<StatTone, string> = {
  plain: 'bg-surface border border-line text-ink',
  warn: 'bg-warn-100 border border-warn/35 text-ink',
  ink: 'bg-ink text-bg',
};

/**
 * بطاقة إحصاء في لوحات الأدمن.
 * `delta` تغيّر النسبة: **أخضر للصعود وأوكر للهبوط** — الأحمر للفشل وحده.
 * و`breakdown` تفصيل الرقم، لأن كل رقم في A1 له تفصيله.
 */
export function StatCard({
  label,
  value,
  unit,
  delta,
  tone = 'plain',
  breakdown,
  className,
}: {
  label: string;
  value: number | string;
  unit?: string;
  /** موجب صعود وسالب هبوط، بالنسبة المئوية */
  delta?: number;
  tone?: StatTone;
  breakdown?: readonly { label: string; value: number | string }[];
  className?: string;
}) {
  const onInk = tone === 'ink';

  return (
    <div className={cn('flex flex-col gap-3.5 rounded-lg p-4.5', TONE[tone], className)}>
      <div className="flex items-center gap-2">
        <span className={cn('text-2xs font-semibold', onInk ? 'opacity-55' : 'opacity-50')}>
          {label}
        </span>
        <span className="flex-1" />
        {delta === undefined ? null : (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-3xs font-bold',
              delta >= 0
                ? onInk
                  ? 'text-accent-400'
                  : 'text-accent-700'
                : onInk
                  ? 'text-warn-400'
                  : 'text-warn-700',
            )}
          >
            <span className="bidi-isolate">{delta >= 0 ? '+' : '−'}</span>
            <ArabicNumber value={Math.abs(delta)} />
            <span className="bidi-isolate">٪</span>
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        <ArabicNumber value={value} className="text-4xl leading-none font-bold" />
        {unit === undefined ? null : (
          <span className="text-2xs opacity-55">{unit}</span>
        )}
      </div>

      {breakdown === undefined || breakdown.length === 0 ? null : (
        <ul
          className={cn(
            'mt-auto flex flex-col gap-2 border-t pt-3 text-2xs',
            onInk ? 'border-bg/14' : 'border-line-2',
          )}
        >
          {breakdown.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-3">
              <span className="opacity-60">{row.label}</span>
              <ArabicNumber value={row.value} className="font-semibold" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** صفّ تسمية/قيمة — جدول المواصفات في Wc، وتفصيل الأرقام في الأدمن. */
export function SpecRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 border-b border-line-2 py-2.5 text-sm last:border-b-0',
        className,
      )}
    >
      <span className="opacity-55">{label}</span>
      <span className="bidi-isolate text-end font-semibold">{children}</span>
    </div>
  );
}
