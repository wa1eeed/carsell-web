'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

export type FaqRow = { id: string; question: string; answer: string };

/**
 * الأسئلة الشائعة — **واحد مفتوح فقط** (قرار ٣١).
 *
 * فتحُ سؤال يغلق الآخر: القارئ يقارن جوابًا واحدًا في كل مرّة، وأعمدة
 * تنفتح كلها تُطيل الصفحة وتُفقد الترتيب.
 *
 * `<details>` أصلي: يفتح بلا JS ويُقرأ في HTML المُقدَّم — وهذا شرط
 * `FAQPage` في JSON-LD، إذ يجب أن يكون الجواب في المصدر لا في تفاعل.
 */
export function FaqAccordion({
  rows,
  columns = 1,
  className,
}: {
  rows: readonly FaqRow[];
  columns?: 1 | 2;
  className?: string;
}) {
  const [open, setOpen] = useState<string | null>(rows[0]?.id ?? null);

  return (
    <div
      className={cn(
        'grid gap-x-14',
        columns === 2 ? 'md:grid-cols-2' : 'grid-cols-1',
        className,
      )}
    >
      {rows.map((row) => (
        <details
          key={row.id}
          open={open === row.id}
          onToggle={(event) => {
            if (event.currentTarget.open) setOpen(row.id);
            else if (open === row.id) setOpen(null);
          }}
          className="border-b border-line-2"
        >
          <summary className="flex cursor-pointer list-none items-center gap-3.5 py-4 text-base font-bold [&::-webkit-details-marker]:hidden">
            <span className="flex-1">{row.question}</span>
            <svg
              viewBox="0 0 24 24"
              className={cn(
                'size-3.5 shrink-0 opacity-45 transition-transform',
                open === row.id && 'rotate-180',
              )}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <p className="max-w-2xl pb-4.5 text-sm leading-loose opacity-70">{row.answer}</p>
        </details>
      ))}
    </div>
  );
}
