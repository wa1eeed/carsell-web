import { cloneElement, isValidElement, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * ═══ الحقل — صدفةٌ واحدة لكل مُدخَل ═══
 *
 * **وكان الشكلُ منسوخًا في سبعة ملفّات**: `const field = 'w-full
 * rounded-md …'` في أربعةٍ بنصٍّ واحد وفي ثلاثةٍ بنصٍّ ثانٍ، فتعديلُ
 * التصميم في واحدٍ يُبقي الستّة — وهو نمطُ `ActionLink` نفسه الذي
 * جُمع من سبعة ملفّات في مسح الهاتف.
 *
 * وما تملكه الصدفة:
 * - **العنوان مربوطٌ بالمُدخَل** (`<label>` يلفّه) — فالنقر على النصّ
 *   يُركّز الحقل، وقارئُ الشاشة يعلن الاثنين معًا.
 * - **المطلوب يُعلَّم مرّة** بنجمةٍ مخفيّةٍ عن القارئ و`required`
 *   يقرؤها، فلا تُقرأ «نجمة» في كل حقل.
 * - **والعطبُ مربوطٌ بـ`aria-describedby`** ومعلَّمٌ بـ`aria-invalid`:
 *   لونٌ أحمر وحده لا يصل من لا يرى اللون.
 * - **و`dir="ltr"` خاصّيةٌ لا قرارُ الحقل**: ما يُنسخ من مصدرٍ
 *   لاتينيّ ويُقارن خانةً بخانة (رمزٌ وآيبانٌ ولوحةٌ ورقمُ بوليصة).
 */

const SHELL =
  'w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-base outline-none focus:border-accent disabled:opacity-60';
const COMPACT =
  'w-full rounded-md border border-line bg-bg px-3 py-2.25 text-2xs outline-none focus:border-ink disabled:opacity-60';

export type FieldSize = 'form' | 'compact';

/** الصدفةُ وحدها — لمن يحتاج المُدخَل بلا عنوانٍ (خليّةُ جدول) */
export function fieldShell(size: FieldSize = 'form', invalid = false): string {
  return cn(size === 'compact' ? COMPACT : SHELL, invalid && 'border-danger');
}

export function Field({
  label,
  hint,
  note,
  error,
  required = false,
  unit,
  htmlFor,
  children,
}: {
  label: string;
  /** سطرٌ يشرح ما يُتوقَّع — ويُقرأ مع الحقل لا بعده */
  hint?: string;
  /**
   * ═══ والتنويه فوق الحقل لا تحته ═══
   *
   * **ما يَحكم قرارَ الكتابة يُقرأ قبلها.** سطرٌ تحت الحقل يقول «لا
   * يظهر للآخرين» يصل بعد أن قرّر صاحبُه أن يترك الحقل فارغًا — ومن
   * خشي أن يُعرض رقمُه لا يكتبه، ولا يعود ليقرأ ما تحته.
   *
   * **وبلونه**: الشرحُ الرمادي تحت كلّ حقلٍ يُمسح بالعين، والتنويهُ
   * الذي يرفع خشيةً يحتاج أن يُرى. (طلب المالك ٢٠٢٦-١٠-١٨.)
   */
  note?: string;
  /** نصُّ العطب — ووجودُه هو ما يجعل الحقل خاطئًا */
  error?: string;
  required?: boolean;
  /**
   * الوحدة — **و«قراءة العدّاد ١٢٠٬٤٠٠» بلا «كم» تُقرأ ريالًا**.
   * تُعرض بجوار المُدخَل وتُقرأ مع عنوانه.
   */
  unit?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  const described = [
    /** **والتنويهُ يُقرأ مع الحقل** — لا يبقى زينةً لمن يرى وحده. */
    note === undefined ? null : `${htmlFor}-note`,
    hint === undefined ? null : `${htmlFor}-hint`,
    error === undefined ? null : `${htmlFor}-error`,
  ].filter((id) => id !== null);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-2xs font-semibold opacity-70">
        {label}
        {!required ? null : (
          <>
            <span aria-hidden className="text-danger"> *</span>
            <span className="sr-only"> (مطلوب)</span>
          </>
        )}
        {unit === undefined ? null : <span className="opacity-65"> — {unit}</span>}
      </label>

      {/*
        **والصفةُ تُمرَّر إلى المُدخَل لا تُلفّ حوله**: `aria-describedby`
        على عنصرٍ حاوٍ لا يصل قارئَ الشاشة عند التركيز.
      */}
      {note === undefined ? null : (
        <p
          id={`${htmlFor}-note`}
          className="-mt-0.5 flex items-start gap-1.5 rounded-md bg-accent-100 px-2.5 py-1.5 text-3xs leading-loose text-accent-900"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="mt-1 size-3 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 7.6v.1" />
          </svg>
          <span>{note}</span>
        </p>
      )}

      {described.length === 0
        ? children
        : cloneDescribed(children, described.join(' '), error !== undefined)}

      {hint === undefined ? null : (
        <p id={`${htmlFor}-hint`} className="text-3xs leading-loose opacity-65">
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p id={`${htmlFor}-error`} className="text-3xs font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * يُلحق `aria-describedby` و`aria-invalid` بالمُدخَل نفسه.
 *
 * **ولا `any`**: `isValidElement` تُضيّق النوع، والخاصّيات تُدمج على
 * `Record<string, unknown>` — فما يُمرَّر معروفُ الشكل.
 */
function cloneDescribed(node: ReactNode, describedBy: string, invalid: boolean): ReactNode {
  if (!isValidElement(node)) return node;
  const extra: Record<string, unknown> = { 'aria-describedby': describedBy };
  if (invalid) extra['aria-invalid'] = true;
  return cloneElement(node, extra);
}
