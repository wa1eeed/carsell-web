'use client';

import { useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * ═══ سؤالٌ بجوابين — لا مفتاحٌ ولا قائمة ═══
 *
 * **والمفتاحُ يصلح لـ«مفعَّل / غير مفعَّل» لا لـ«هذا أم ذاك».** حين
 * يكون الجوابان شيئين مختلفين — بطاقةٌ جمركية أم لوحاتٌ صادرة — فلا
 * أحدَهما «إطفاءٌ» للآخر، وعرضُهما مفتاحًا يجعل القارئ يسأل: ماذا
 * يعني أن أُطفئه؟
 *
 * **والقائمةُ المنسدلة تُخفي الجوابين** خلف نقرة. وهما اثنان، وأحدُهما
 * يُغيّر الحقلَ الذي يليه — فإظهارُهما معًا هو السؤال نفسُه.
 *
 * ═══ وما يملكه ═══
 *
 * - **`radiogroup` حقيقيّ** بـ`aria-checked` — فقارئُ الشاشة يعلن
 *   «واحدٌ من اثنين» لا «زرّان مضغوطان».
 * - **وتنقّلٌ بالأسهم مع `tabindex` متنقّل**: مجموعةُ اختيارٍ تأخذ
 *   موقفًا واحدًا في ترتيب `Tab` لا موقفًا لكلّ خيار.
 * - **ووصفٌ تحت كلّ خيار** — فمن لا يعرف الفرق لا يختار، ويترك
 *   السؤالَ كلَّه.
 * - **وبطاقةٌ كاملةٌ هي الزرّ** (البوابة ٤٨): لا تفاعليَّ داخل تفاعليّ.
 */
export type Choice = {
  value: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
};

export function ChoiceGroup({
  label,
  hint,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  hint?: string;
  value: string;
  options: readonly Choice[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const labelId = useId();
  const hintId = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  /** الأسهمُ تدور داخل المجموعة — وتنقل التركيز مع الاختيار. */
  const onKey = (event: React.KeyboardEvent): void => {
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const at = options.findIndex((option) => option.value === value);
    const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const next = options[(at + step + options.length) % options.length];
    if (next === undefined) return;
    onChange(next.value);
    const node = boxRef.current?.querySelector<HTMLElement>(`[data-value="${next.value}"]`);
    node?.focus();
  };

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <span id={labelId} className="text-2xs font-semibold opacity-70">
        {label}
      </span>
      {hint === undefined ? null : (
        <span id={hintId} className="-mt-1 text-3xs leading-loose opacity-65">
          {hint}
        </span>
      )}

      <div
        ref={boxRef}
        role="radiogroup"
        aria-labelledby={labelId}
        {...(hint === undefined ? {} : { 'aria-describedby': hintId })}
        onKeyDown={onKey}
        className="grid gap-3 sm:grid-cols-2"
      >
        {options.map((option) => {
          const here = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={here}
              data-value={option.value}
              tabIndex={here || (value === '' && option === options[0]) ? 0 : -1}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-4 text-start transition-colors',
                here ? 'border-accent bg-accent-100/40' : 'border-line bg-surface hover:border-ink',
              )}
            >
              {/*
                **والدائرةُ تُرسم دائمًا** — لا تظهر عند الاختيار:
                موضعٌ يفرغ ثمّ يمتلئ يزيح النصَّ بجواره.
              */}
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  here ? 'border-accent' : 'border-line',
                )}
              >
                <span className={cn('size-2 rounded-full', here ? 'bg-accent' : 'bg-transparent')} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-2xs font-bold">
                  {option.icon === undefined ? null : (
                    <span aria-hidden className="opacity-70">
                      {option.icon}
                    </span>
                  )}
                  {option.label}
                </span>
                {option.hint === undefined ? null : (
                  <span className="mt-1 block text-3xs leading-loose opacity-70">{option.hint}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
