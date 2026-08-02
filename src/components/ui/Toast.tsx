import { cn } from '@/lib/cn';

export type ToastTone = 'success' | 'error' | 'info';

const TONE: Record<ToastTone, string> = {
  success: 'bg-accent-100 border-accent/35 text-accent-900',
  error: 'bg-danger/10 border-danger/35 text-danger',
  info: 'bg-warn-100 border-warn/35 text-warn-900',
};

const ICON: Record<ToastTone, string> = {
  success: 'M4 12l6 6L20 6',
  error: 'M6 6l12 12M18 6L6 18',
  info: 'M12 8v5M12 16.5v.5',
};

/**
 * إشعار عابر.
 * **الظلّ مسموح هنا** — الطبقات العائمة استثناء قاعدة «الفصل بالخطوط»
 * (القسم ٣ قاعدة ٣: الظل للقوائم المنسدلة والحوارات فقط).
 */
export function Toast({
  tone = 'info',
  title,
  description,
  className,
}: {
  tone?: ToastTone;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex w-fit max-w-sm items-start gap-3 rounded-lg border px-4 py-3.5 shadow-lg',
        TONE[tone],
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <path d={ICON[tone]} />
      </svg>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-bold">{title}</p>
        {description === undefined ? null : (
          <p className="text-xs opacity-75">{description}</p>
        )}
      </div>
    </div>
  );
}
