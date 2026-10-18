'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * ═══ قائمةُ اختيار — لنا لا للمتصفّح ═══
 *
 * **و`<select>` لا يحمل صورة.** الماركةُ تُعرف بشعارها قبل اسمها، وهو
 * في `Brand.logoUrl` منذ بُنيت لوحةُ الأدمن — ولا سبيل لعرضه داخل
 * `<option>`: المواصفة تمنع كلَّ ما ليس نصًّا. وشكلُه يتبدّل بين
 * ويندوز وماك وأندرويد، فيبدو المنتجُ ثلاثةَ منتجات.
 *
 * ═══ وما يملكه ═══
 *
 * - **زرٌّ و`listbox`** بـ`aria-activedescendant` — فقارئُ الشاشة
 *   يعلن الخيار المميَّز ويُعلن كم العدد.
 * - **ولوحةُ المفاتيح كاملة**: الأسهم تتنقّل، و`Home`/`End` إلى
 *   الطرفين، و`Enter`/`Space` يختار، و`Escape` يُغلق ويعيد التركيز.
 * - **وبحثٌ حين تطول القائمة** — اثنتان وأربعون ماركةً لا تُمسح بالعين.
 * - **والخيارُ المميَّز يُمرَّر إليه** (`scrollIntoView`) — وإلّا تنقّل
 *   السهمُ خارج المرئيّ ولا شيء يتحرّك.
 * - **ولا تفاعليَّ داخل تفاعليّ** (البوابة ٤٨): الزرُّ وحدَه، والخيارات
 *   `role="option"` على عناصرَ غير تفاعلية.
 *
 * **والمغلقةُ تبقى حقلًا**: الشكل من `fieldShell` نفسِه الذي تلبسه
 * بقيّةُ الحقول — فلا يبدو سطرٌ في الاستمارة غريبًا عن جيرانه.
 */
export type PickerOption = {
  value: string;
  label: string;
  /** سطرٌ ثانٍ تحت الاسم — المقابلُ اللاتينيّ أو وصفٌ قصير. */
  sub?: string;
  /** ما يُرسم في الطرف: شعارٌ أو حرفان. */
  media?: ReactNode;
};

export function Picker({
  value,
  options,
  onChange,
  id,
  placeholder,
  disabled = false,
  emptyLabel = '—',
  searchable,
  searchPlaceholder = 'ابحث…',
  invalid = false,
}: {
  value: string;
  options: readonly PickerOption[];
  onChange: (value: string) => void;
  id: string;
  placeholder: string;
  disabled?: boolean;
  /** نصُّ القائمة الفارغة — «اختر الماركة أولا» لا «لا نتائج». */
  emptyLabel?: string;
  /** يُفتح البحثُ تلقائيًّا للقوائم الطويلة، ويُفرَض بتمريره. */
  searchable?: boolean;
  searchPlaceholder?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const picked = options.find((option) => option.value === value) ?? null;
  const withSearch = searchable ?? options.length > 8;

  const shown =
    query.trim() === ''
      ? options
      : options.filter((option) =>
          `${option.label} ${option.sub ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()),
        );

  /** **والنقرُ خارجها يُغلق** — وإلّا بقيت مفتوحةً فوق ما تحتها. */
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  /**
   * **والمميَّزُ يبقى مرئيًّا.** سهمٌ ينزل خارج الإطار بلا تمرير يبدو
   * معطَّلًا — ومن يستعمل اللوحة لا يرى أين صار.
   */
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.children[active];
    if (node instanceof HTMLElement) node.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (option: PickerOption): void => {
    onChange(option.value);
    setOpen(false);
    setQuery('');
    buttonRef.current?.focus();
  };

  const onKey = (event: React.KeyboardEvent): void => {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setOpen(true);
        setActive(Math.max(options.findIndex((option) => option.value === value), 0));
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((at) => Math.min(at + 1, shown.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((at) => Math.max(at - 1, 0));
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActive(shown.length - 1);
      return;
    }
    if (event.key === 'Enter' || (event.key === ' ' && !withSearch)) {
      event.preventDefault();
      const option = shown[active];
      if (option !== undefined) choose(option);
    }
  };

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKey}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => {
          setOpen((was) => !was);
          setActive(Math.max(options.findIndex((option) => option.value === value), 0));
        }}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-md border bg-surface px-3.5 py-2.5 text-start text-base outline-none transition-colors',
          'disabled:cursor-not-allowed disabled:opacity-60',
          invalid ? 'border-danger' : open ? 'border-accent' : 'border-line hover:border-ink',
        )}
      >
        {picked?.media === undefined ? null : (
          <span aria-hidden className="shrink-0">
            {picked.media}
          </span>
        )}

        <span className={cn('min-w-0 flex-1 truncate', picked === null && 'opacity-55')}>
          {picked?.label ?? placeholder}
        </span>

        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className={cn('size-4 shrink-0 opacity-60 transition-transform', open && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {!open ? null : (
        <div className="reveal absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-line bg-bg shadow-[0_18px_40px_-24px_var(--color-ink)]">
          {!withSearch ? null : (
            <div className="border-b border-line p-2">
              <input
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full rounded-md bg-surface px-3 py-2 text-2xs outline-none"
              />
            </div>
          )}

          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={id}
            {...(shown[active] === undefined ? {} : { 'aria-activedescendant': `${listId}-${String(active)}` })}
            className="max-h-64 overflow-y-auto py-1"
          >
            {shown.length === 0 ? (
              <li className="px-3.5 py-3 text-2xs opacity-65">{emptyLabel}</li>
            ) : (
              shown.map((option, index) => {
                const here = option.value === value;
                return (
                  <li
                    key={option.value}
                    id={`${listId}-${String(index)}`}
                    role="option"
                    aria-selected={here}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(option)}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 px-3.5 py-2.5 text-2xs transition-colors',
                      index === active && 'bg-surface',
                      here && 'font-bold',
                    )}
                  >
                    {option.media === undefined ? null : (
                      <span aria-hidden className="shrink-0">
                        {option.media}
                      </span>
                    )}

                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{option.label}</span>
                      {option.sub === undefined ? null : (
                        <span className="mt-0.5 block truncate text-3xs opacity-65">
                          {option.sub}
                        </span>
                      )}
                    </span>

                    {!here ? null : (
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        className="size-3.5 shrink-0 text-accent-900"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m5 13 4 4L19 7" />
                      </svg>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * شعارُ ماركةٍ — **أو حرفاها حين لا شعار**.
 *
 * قِيس ٢٠٢٦-١٠-١٨: اثنتان وأربعون ماركةً و**صفرُ شعارات**. فالغيابُ
 * هو الحال الغالب اليوم، وصورةٌ مكسورةٌ في كلّ صفّ أسوأ من لا صورة —
 * والحرفان يملآن الموضع فلا تختلّ المحاذاة حين يُرفع الشعار.
 */
export function BrandMark({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl !== null) {
    // eslint-disable-next-line @next/next/no-img-element -- شعارٌ خارجيّ بمقاسٍ ثابت
    return <img src={logoUrl} alt="" className="size-7 rounded-md object-contain" />;
  }
  return (
    <span className="flex size-7 items-center justify-center rounded-md bg-line/70 text-3xs font-bold opacity-70">
      {Array.from(name.trim())[0] ?? '?'}
    </span>
  );
}
