'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Shell = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

function Backdrop({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="close"
      className="fixed inset-0 z-40 bg-ink/45"
    />
  );
}

/**
 * لوح منزلق من الحافة — فلاتر Wb على الشاشات الضيقة.
 * مقبض، عنوان، محتوى، فوتر. **الظل مسموح** فهو طبقة عائمة.
 */
export function Sheet({ open, onClose, title, children, footer, className }: Shell) {
  if (!open) return null;

  return (
    <>
      <Backdrop onClose={onClose} />
      <aside
        role="dialog"
        aria-modal
        aria-label={title}
        className={cn(
          'fixed inset-y-0 z-50 flex w-[380px] max-w-[90vw] flex-col bg-bg shadow-2xl end-0',
          className,
        )}
      >
        <header className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="h-1 w-9 rounded-full bg-ink/20" aria-hidden />
          <h2 className="text-lg font-bold">{title}</h2>
          <span className="flex-1" />
          <button type="button" onClick={onClose} aria-label="close" className="opacity-55 hover:opacity-100">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4.5">{children}</div>

        {footer === undefined ? null : (
          <footer className="border-t border-line px-5 py-4">{footer}</footer>
        )}
      </aside>
    </>
  );
}

/** حوار موسَّط — التأكيدات والإجراءات الحرجة. */
export function Modal({ open, onClose, title, children, footer, className }: Shell) {
  if (!open) return null;

  return (
    <>
      <Backdrop onClose={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
        <div
          role="dialog"
          aria-modal
          aria-label={title}
          className={cn(
            'flex w-[480px] max-w-full flex-col overflow-hidden rounded-2xl bg-bg shadow-2xl',
            className,
          )}
        >
          <header className="flex items-center gap-3 border-b border-line px-5.5 py-4">
            <h2 className="text-lg font-bold">{title}</h2>
            <span className="flex-1" />
            <button type="button" onClick={onClose} aria-label="close" className="opacity-55 hover:opacity-100">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>
          <div className="px-5.5 py-4.5">{children}</div>
          {footer === undefined ? null : (
            <footer className="flex justify-end gap-2 border-t border-line px-5.5 py-4">
              {footer}
            </footer>
          )}
        </div>
      </div>
    </>
  );
}
