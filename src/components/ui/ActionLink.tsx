import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * ═══ رابطُ الإجراء في ترويسة قسم — «عرض الكل» · «افتح» ═══
 *
 * كان النمط نفسه مكتوبًا في سبعة مواضع، **وكلُّها عشرون بكسلًا ارتفاعًا
 * على الهاتف** — دون الحدّ الأدنى لمساحة اللمس في WCAG 2.2 (٢٤). وهي
 * مداخلُ الأرفف: «عرض الكل» في الرئيسية، و«افتح» في كل صفّ حساب.
 *
 * **ومساحةُ اللمس ليست مساحةَ النصّ.** الحشو الرأسيّ يوسّع النقر في
 * عنصرٍ سطريّ بلا أن يزيح سطرًا، والهامش السالب يردّ ما يأخذه فيبقى
 * الشكل كما صُمّم — فلا تُرفع أحجام الخطوط ولا تُفكّ المحاذاة.
 *
 * ووُحِّد في مكوّنٍ لأن النسخة الثامنة كانت ستُكتب بالقياس القديم:
 * ما يتكرّر سبعًا يُكتب مرّة.
 */
export function ActionLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        '-my-2.5 inline-block py-2.5 text-xs font-bold text-accent-700 hover:underline',
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** الصيغة الزرّية — لما يبدّل عرضًا بدل أن ينتقل. */
export function ActionButton({
  onClick,
  children,
  className,
}: {
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-my-2.5 inline-block py-2.5 text-xs font-bold text-accent-700 hover:underline',
        className,
      )}
    >
      {children}
    </button>
  );
}
