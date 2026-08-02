'use client';

import { useId } from 'react';
import { cn } from '@/lib/cn';
import { toLatinDigits } from '@/lib/arabic';

/** مفتاح الدولة ثابت — المرحلة الأولى سعودية، والاختيار وهمٌ لا خيار. */
export const COUNTRY_CODE = '+966';

/**
 * رقم الجوال.
 *
 * **يُكتب Latin ويُخزَّن Latin** — لا تحويل عربي-هندي هنا: القارئ يقارن
 * ما يكتبه بما على شاشة جواله، وشاشة الجوال لاتينية. وهذا الاستثناء
 * نفسه المطبَّق على العدّاد والمعرّفات (قاعدة ٥).
 *
 * ويقبل اللصق بأي صيغة (`٠٥٥…` · `+96655…` · `05 5123`) ويطبّعها:
 * منع اللصق يجبر القارئ على قراءة رقمه من رسالة ثم كتابته، وهو أكثر
 * ما يُخطئ فيه.
 */
export function PhoneInput({
  value,
  onChange,
  disabled = false,
  invalid = false,
  label,
  className,
}: {
  /** الجزء المحلّي بلا مفتاح الدولة — تسعة أرقام تبدأ بـ٥. */
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  label: string;
  className?: string;
}) {
  const id = useId();

  /** يقبل كل صيغة ويُخرج الجزء المحلّي وحده. */
  const normalise = (raw: string): string => {
    let digits = toLatinDigits(raw).replace(/\D/g, '');
    if (digits.startsWith('00966')) digits = digits.slice(5);
    else if (digits.startsWith('966')) digits = digits.slice(3);
    if (digits.startsWith('0')) digits = digits.slice(1);
    return digits.slice(0, 9);
  };

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block text-2xs font-semibold opacity-60">
        {label}
      </label>
      <div
        dir="ltr"
        className={cn(
          'flex items-center gap-2.5 rounded-md border bg-bg px-4 py-3.5',
          invalid ? 'border-danger' : 'border-line',
          disabled && 'opacity-55',
        )}
      >
        <span className="font-num text-sm font-semibold opacity-55">{COUNTRY_CODE}</span>
        <span className="h-4 w-px bg-line" aria-hidden />
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(normalise(event.target.value))}
          placeholder="5X XXX XXXX"
          aria-invalid={invalid}
          className="font-num w-full bg-transparent text-sm font-semibold tracking-wide outline-none placeholder:opacity-35"
        />
      </div>
    </div>
  );
}
