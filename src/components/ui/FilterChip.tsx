import Link from 'next/link';
import { ArabicNumber } from '@/components/ui/ArabicNumber';

/**
 * شريحةُ ترشيحٍ في الواجهة العامّة — **رابطٌ لا زرّ**.
 *
 * الرابط يكتب الحالة في العنوان: يُشارَك ويُحفظ ويعود بزرّ الرجوع،
 * ويعمل قبل أن تصل حزمة JS. وحالةٌ في الذاكرة تضيع بأوّل تحديث.
 *
 * و`Chip` في `ui/` زرٌّ بحالةٍ محلّية — وموضعُه حيث لا عنوان يحمل
 * الحالة (محرّر القوالب). وهذه أختُها للروابط.
 */
export function FilterChip({
  href,
  active,
  count,
  children,
}: {
  href: string;
  active: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? 'flex items-center gap-1.75 rounded-full bg-ink px-4 py-2.25 text-2xs font-bold text-bg'
          : 'flex items-center gap-1.75 rounded-full border border-line px-4 py-2.25 text-2xs font-semibold hover:border-ink'
      }
    >
      {children}
      {count === undefined ? null : (
        <span
          className={
            active
              ? 'rounded-full bg-bg/22 px-1.75 py-px font-num text-3xs'
              : 'rounded-full bg-ink/8 px-1.75 py-px font-num text-3xs'
          }
        >
          <ArabicNumber value={count} />
        </span>
      )}
    </Link>
  );
}
