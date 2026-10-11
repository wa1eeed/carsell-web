'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { toLatinDigits } from '@/lib/arabic';

/** ستّ خانات (قرار ٢٨). */
export const OTP_BOXES = 6;

/**
 * رمز التحقّق — ستّ خانات.
 *
 * **`dir="ltr"` دائمًا**: الرمز يُملأ من اليسار حتى في واجهة عربية،
 * لأن القارئ ينسخه من رسالة لاتينية ويقارنه خانةً بخانة. عكسُه في RTL
 * يجعل أول رقم يكتبه يقع في آخر خانة.
 *
 * واللصق يملأ الخانات كلّها: الرمز يصل في رسالة، ومنعُ اللصق يجبر
 * القارئ على حفظ ستّة أرقام والتنقّل بينها — وهو أكثر ما يُخطئ فيه.
 * وحقل `one-time-code` يجعل نظام التشغيل يقترحه تلقائيًا.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  invalid = false,
  autoFocus = false,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus) boxes.current[0]?.focus();
  }, [autoFocus]);

  const set = (next: string): void => {
    const clean = toLatinDigits(next).replace(/\D/g, '').slice(0, OTP_BOXES);
    onChange(clean);
    if (clean.length === OTP_BOXES) onComplete?.(clean);
    else boxes.current[clean.length]?.focus();
  };

  return (
    /*
      ═══ ستّ خانات في عرض الشاشة لا في عرض محتواها ═══

      **والحاوية تُحدّ بعرضٍ أقصى.** على شاشةٍ عريضة تتمدّد الخانات
      بـ`flex-1` حتى تصير ستّ مربّعاتٍ ضخمة — ورمزٌ من ستّة أرقام لا
      يحتاج نصف الشاشة.
    */
    <div dir="ltr" className={cn('flex max-w-sm gap-2', className)}>
      {Array.from({ length: OTP_BOXES }, (_, i) => {
        const digit = value[i] ?? '';
        const active = i === value.length;

        return (
          <input
            key={i}
            ref={(element) => {
              boxes.current[i] = element;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={OTP_BOXES}
            disabled={disabled}
            value={digit}
            aria-label={String(i + 1)}
            aria-invalid={invalid}
            onChange={(event) => {
              const raw = event.target.value;
              // لصقٌ كامل في خانة واحدة يملأ الكل
              if (raw.length > 1) set(raw);
              else set(value.slice(0, i) + raw);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Backspace' && digit === '' && i > 0) {
                event.preventDefault();
                onChange(value.slice(0, i - 1));
                boxes.current[i - 1]?.focus();
              }
            }}
            className={cn(
              /*
                ═══ `min-w-0` — وبدونها لا تنكمش الخانة أبدًا ═══

                **عطلٌ قاسه المالك**: ستّ خانات بـ٢٢١px لكلٍّ على شاشة
                ٣٧٥، فتظهر واحدةٌ ونصف والباقي خارج الصفحة.

                والسبب أن `<input>` له **حدٌّ أدنى تلقائيّ** من سمة
                `size` (عشرون محرفًا افتراضًا)، و`flex-1` لا تنزل تحته
                لأن `min-width: auto`. فالخانة تطلب ٢٢١px مهما ضاقت
                الحاوية — و`flex-1` وحدها تبدو كافيةً وليست كذلك.

                و`w-0` تجعل الأساس صفرًا فيأتي العرض من القسمة وحدها.
              */
              'font-num aspect-square w-0 min-w-0 flex-1 rounded-md border bg-bg text-center text-xl font-bold outline-none',
              invalid
                ? 'border-danger'
                : digit !== ''
                  ? 'border-ink border-[1.5px]'
                  : active
                    ? 'border-accent border-[1.5px]'
                    : 'border-line',
              disabled && 'opacity-55',
            )}
          />
        );
      })}
    </div>
  );
}
