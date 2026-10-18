'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * ═══ المفتاح — فعلٌ يقع الآن، لا حقلٌ يُرسَل لاحقًا ═══
 *
 * **ومربّعُ الاختيار ليس مفتاحًا.** المربّع يقول «سيُرسَل هذا مع
 * الاستمارة»، والمفتاح يقول «هذا مُفعَّل الآن» — والفرق يُقرأ في
 * اللحظة: من يؤشّر مربّعًا ينتظر زرَّ حفظ، ومن يقلب مفتاحًا يتوقّع
 * أثرًا. وإظهارُ اللوحة مع الإعلان من الثاني: اختيارٌ قائمٌ بذاته
 * يُغيّره صاحبُه متى شاء.
 *
 * ═══ وكان في `AuctionSettings` وحدها ═══
 *
 * فمن أراده في شاشةٍ أخرى نسخه أو وضع مربّعًا — **وقد وقع**: نموذج
 * المركبة كتب `<input type="checkbox">` بيده، فصار في المنتج شكلان
 * لفعلٍ واحد. وموضعُه `ui` لأنّه ليس من خصائص المزاد في شيء.
 *
 * ═══ وما يملكه ═══
 *
 * - **زرٌّ واحد `role="switch"`** — لا مربّعَ داخل رابطٍ ولا عنصران
 *   لفعلٍ واحد (البوابة ٤٨).
 * - **ومساحةُ لمسه البطاقةُ كلُّها** — لا المفتاحُ وحده (٢٤ بكسلًا
 *   حدُّ WCAG 2.2، والمفتاح ٢٠).
 * - **ولوحةُ المفاتيح تبلغه**: زرٌّ حقيقيّ، فالمسافة والإدخال يقلبانه.
 * - **والمعطَّل يقول لماذا** — مفتاحٌ لا يستجيب بلا سببٍ مكتوب يجعل
 *   صاحبه يظنّ العطل في جهازه.
 */
export function Toggle({
  label,
  hint,
  on,
  onToggle,
  disabled = false,
  disabledReason,
  icon,
  children,
  className,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** يُعرض مكان الشرح حين يكون معطَّلًا — ولا يُترك فارغًا. */
  disabledReason?: string;
  icon?: ReactNode;
  /**
   * ما ينكشف حين يُفتح — خياراتٌ تتبع القرار لا تسبقه.
   * **وخارج الزرّ**: تفاعليٌّ داخل تفاعليّ لا يجوز.
   */
  children?: ReactNode;
  className?: string;
}) {
  const explain = disabled ? (disabledReason ?? hint) : hint;

  return (
    <div
      className={cn(
        'rounded-xl border transition-colors',
        disabled
          ? 'border-line bg-surface opacity-65'
          : on
            ? 'border-accent bg-accent-100/40'
            : 'border-line bg-surface hover:border-ink',
        className,
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={onToggle}
        className="flex w-full items-start gap-3.5 p-4 text-start disabled:cursor-not-allowed"
      >
        {icon === undefined ? null : (
          <span aria-hidden className="mt-0.5 shrink-0 opacity-70">
            {icon}
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="block text-2xs font-bold">{label}</span>
          {explain === undefined ? null : (
            <span className="mt-1 block text-3xs leading-loose opacity-70">{explain}</span>
          )}
        </span>

        {/*
          **والمفتاح في الطرف لا في الصدر.** عينُ القارئ تمسح العناوين
          في عمودٍ واحد، فمفتاحٌ قبل العنوان يكسر المسح — والحالةُ
          تُقرأ في الطرف كما تُقرأ في كل لوحةٍ يعرفها المستخدم.
        */}
        <span
          aria-hidden
          className={cn(
            'mt-0.5 flex h-5.5 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200',
            on ? 'bg-accent' : 'bg-line',
          )}
        >
          <span
            className={cn(
              'size-4.5 rounded-full bg-bg shadow-sm transition-transform duration-200 ease-out',
              on ? '-translate-x-4.5 rtl:translate-x-4.5' : '',
            )}
          />
        </span>
      </button>

      {/* المنكشفُ يدخل من تحت العنوان — فيُقرأ تابعًا لا جديدًا */}
      {children === undefined || !on ? null : (
        <div className="reveal border-t border-line px-4 pt-4 pb-4">{children}</div>
      )}
    </div>
  );
}
