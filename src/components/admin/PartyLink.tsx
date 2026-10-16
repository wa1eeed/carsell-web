import Link from 'next/link';
import { ArabicNumber } from '@/components/ui/ArabicNumber';

/**
 * ═══ اسمُ الطرف — رابطٌ ومعه لمحة ═══
 *
 * أسماءُ المشتري والبائع كانت نصًّا ميّتًا في الكرت وفي صفحة الطلب:
 * **من رأى اسمًا في نزاعٍ لا يصل إلى ملفّه** إلّا بنسخه والبحث عنه في
 * قائمة العملاء.
 *
 * ═══ ولماذا رابطٌ **ومعه** بطاقة، لا أحدهما ═══
 *
 * بطاقةٌ منبثقة وحدها تمنع ما يمنعه الزرّ الميّت: لا تُفتح بلوحة
 * مفاتيح إلّا بعمل، ولا تُفتح في تبويبةٍ جديدة، ولا تعمل على لمسٍ إلّا
 * بحيلة. **ورابطٌ وحده يُخرجك من الطلب لتقرأ سطرين** ثم ترجع.
 *
 * فالاسم **رابطٌ حقيقيّ** — يعمل بالنقر وبالوسط وبلوحة المفاتيح وعلى
 * الهاتف، والرجوعُ رجوعُ المتصفّح. واللمحةُ تحسينٌ فوقه: تظهر عند
 * المرور أو التركيز، فيُقرأ أكثرُ ما يُسأل عنه بلا مغادرة.
 *
 * **ولا جافاسكربت**: `group-hover` و`group-focus-within` كافيتان،
 * فلا حالةٌ تُدار ولا مكوّن عميل.
 */

export type PartyPeek = {
  id: string;
  name: string;
  phone: string;
  idVerified: boolean;
  /** سياقٌ لمن يقرّر في نزاع: أوّلُ صفقةٍ له أم العاشرة. */
  previousOrders: number;
};

export function PartyLink({
  party,
  role,
  className,
}: {
  party: PartyPeek;
  /** «المشتري» أو «البائع» — يُقرأ في اللمحة فلا تُلتبَس بالآخر. */
  role: string;
  className?: string;
}) {
  return (
    <span className="group relative inline-flex">
      <Link
        href={`/admin/users/${encodeURIComponent(party.id)}`}
        className={className ?? 'bidi-isolate underline decoration-dotted underline-offset-4 hover:decoration-solid'}
      >
        {party.name}
      </Link>

      <span
        role="tooltip"
        className="pointer-events-none absolute top-full z-30 mt-1.5 hidden w-60 flex-col gap-1.5 rounded-lg border border-line bg-bg p-3 text-start shadow-2xl group-hover:flex group-focus-within:flex start-0"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-3xs opacity-65">{role}</span>
          {party.idVerified ? (
            <span className="rounded-sm bg-accent/12 px-1.5 py-px text-3xs font-bold text-accent-700">
              موثَّق
            </span>
          ) : (
            <span className="rounded-sm bg-warn-100 px-1.5 py-px text-3xs font-bold text-warn-900">
              بلا توثيق
            </span>
          )}
        </span>

        <span className="bidi-isolate truncate text-2xs font-bold">{party.name}</span>

        {/* الهاتف يُقارن خانةً بخانة — لاتينيّ معزول */}
        <span dir="ltr" className="font-num text-start text-3xs opacity-70">
          {party.phone}
        </span>

        <span className="flex items-center gap-1.5 text-3xs opacity-70">
          <span>طلبات سابقة</span>
          <ArabicNumber value={party.previousOrders} />
        </span>

        <span className="mt-0.5 text-3xs font-semibold text-accent-700">افتح الملفّ ←</span>
      </span>
    </span>
  );
}
