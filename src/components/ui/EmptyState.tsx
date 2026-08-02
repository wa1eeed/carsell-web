import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** حالة فارغة — نصّ وإجراء. إلزامية في كل جدول وكل شبكة نتائج. */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-line px-6 py-12 text-center',
        className,
      )}
    >
      <p className="text-lg font-bold">{title}</p>
      {description === undefined ? null : (
        <p className="max-w-sm text-sm opacity-60">{description}</p>
      )}
      {action === undefined ? null : <div className="mt-1">{action}</div>}
    </div>
  );
}
