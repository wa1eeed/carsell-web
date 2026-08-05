'use client';

import { ArabicNumber } from './ArabicNumber';
import { cn } from '@/lib/cn';

export type TabItem = {
  id: string;
  label: string;
  count?: number;
};

/**
 * تبويبات بعدّاد في دائرة، والتاب النشط **داكن ممتلئ** (A4، D2).
 * الفصل بخطّ سفلي لا بظلّ.
 */
export function Tabs({
  items,
  active,
  onChange,
  className,
}: {
  items: readonly TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      /*
        **الشريط يُمرَّر ولا يفيض.** أربعة تابز بعناوين عربية تبلغ
        ٥١٨px، فتُدفع الصفحة كلُّها على شاشة ٣٧٥ — وهو ما كان يُخرج
        صفحة السيارة عن حدّها على الهاتف. والتمرير داخل الشريط يُبقي
        كلّ تابٍ مبلوغًا، بخلاف الالتفاف الذي يُنتج سطرين متفاوتين.
      */
      className={cn(
        'no-scrollbar flex items-center gap-2 overflow-x-auto border-b border-line',
        className,
      )}
    >
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-t-sm px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap',
              isActive ? 'bg-ink text-bg' : 'text-ink opacity-60 hover:opacity-100',
            )}
          >
            {item.label}
            {item.count === undefined ? null : (
              <span
                className={cn(
                  'inline-flex size-4.5 items-center justify-center rounded-full text-3xs',
                  isActive ? 'bg-bg/22' : 'bg-ink/10',
                )}
              >
                <ArabicNumber value={item.count} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
