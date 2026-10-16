import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** حالة فارغة — نصّ وإجراء. إلزامية في كل جدول وكل شبكة نتائج. */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      /**
       * ═══ علامةٌ يقرؤها القياس لا العين ═══
       *
       * تدقيق التصميم كان يستنتج «الشاشة بلا بيانات» بالبحث عن
       * «لا عروض» و«لا إعلانات» في نصّ الصفحة كلّه — **فوسمُ صفٍّ
       * واحد («لا عروض» تحت إعلانٍ له مشاهدات) يُخرج الشاشة كلّها من
       * المقام**. وسبعُ شاشات حسابٍ عامرةٍ بالبيانات كانت تُحسب
       * «فارغة» فتسقط من القياس، والنسبة تُقرأ على عيّنةٍ ناقصة.
       *
       * فالحالة الفارغة تُعلن نفسها بعلامةٍ ثابتة لا بصياغةٍ تتبدّل.
       */
      data-empty="true"
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-line px-6 py-12 text-center',
        className,
      )}
    >
      <p className="text-lg font-bold">{title}</p>
      {description === undefined ? null : (
        <p className="max-w-sm text-sm opacity-70">{description}</p>
      )}
      {action === undefined ? null : <div className="mt-1">{action}</div>}
    </div>
  );
}
