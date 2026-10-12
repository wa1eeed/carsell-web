import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * ═══ رابط داخلي في صفحات التفاصيل ═══
 *
 * اسم المشتري ومرجع الإعلان ورقم الطلب كانت **نصًا ميتًا** في أكثر
 * الصفحات: من يحقق في نزاع يقرأ اسم البائع ثم ينسخه ويبحث عنه في
 * قائمة العملاء.
 *
 * وهو مكوّن واحد لا صنف مكرر: المظهر نفسه في كل صفحة، وتغييره يصل
 * الجميع. **والخط المنقّط يقول «هذا يُفتح»** بلا أن يصرخ كزر.
 */
export function AdminLink({
  href,
  ltr,
  children,
  className,
}: {
  href: string;
  /** للمراجع والأرقام — تُقارن خانة بخانة فلا ترث اتجاه السطر. */
  ltr?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      dir={ltr === true ? 'ltr' : undefined}
      className={cn(
        'underline decoration-dotted underline-offset-4 hover:decoration-solid',
        ltr === true ? 'font-num text-start' : 'bidi-isolate',
        className,
      )}
    >
      {children}
    </Link>
  );
}
