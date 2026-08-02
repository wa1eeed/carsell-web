'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatDuration } from '@/lib/arabic';
import { cn } from '@/lib/cn';

export type CountdownTone = 'ink' | 'warn' | 'plain';

const TONE: Record<CountdownTone, string> = {
  ink: 'bg-ink text-bg px-2.5 py-1 rounded-sm',
  warn: 'bg-warn-200 text-warn-900 px-2.5 py-1 rounded-sm',
  plain: '',
};

/**
 * عدّاد `HH:MM:SS`.
 *
 * · **Latin في اللغتين** — أوضح وأسرع قراءة (HANDOFF §١٢).
 * · يتوقّف عند إخفاء الصفحة ويعيد الحساب عند العودة، فلا مؤقّت
 *   يعمل في تبويب مخفي ولا انحراف تراكمي.
 * · الوقت المتبقّي يُحسب من فارق زمني لا من عدّ تنازلي — تكبيرة
 *   واحدة في الثانية بلا تراكم خطأ.
 */
export function Countdown({
  endsAt,
  tone = 'ink',
  onEnd,
  className,
}: {
  endsAt: Date | string;
  tone?: CountdownTone;
  onEnd?: () => void;
  className?: string;
}) {
  const target = useMemo(
    () => (typeof endsAt === 'string' ? new Date(endsAt) : endsAt),
    [endsAt],
  );
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000)),
  );

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const tick = (): void => {
      const next = Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0 && timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
        onEnd?.();
      }
    };

    const start = (): void => {
      if (timer !== undefined) return;
      tick();
      timer = setInterval(tick, 1000);
    };

    const stop = (): void => {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
    };

    const onVisibility = (): void => {
      if (document.hidden) stop();
      else start();
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [target, onEnd]);

  return (
    <span
      dir="ltr"
      className={cn('font-num inline-block font-bold tabular-nums', TONE[tone], className)}
    >
      {formatDuration(remaining)}
    </span>
  );
}
