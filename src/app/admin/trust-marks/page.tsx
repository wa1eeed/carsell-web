import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { adminTrustMarks } from '@/lib/domain/trust-marks';
import { TrustMarksTable } from './TrustMarksTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'علامات الموثوقية' };

/**
 * ═══ علاماتُ الموثوقية — الشاشة التي لم تكن ═══
 *
 * الوثيقة تقول إنّ رقمَ التسجيل ورابطَ التحقّق «يُضبطان من اللوحة»،
 * **ولا شاشةَ ولا مسارَ يكتبهما**: `TrustMark` كان بلا كاتبٍ إطلاقًا.
 * فالتذييل يعرض اليوم أربعَ جهاتٍ نظامية **بلا رقمٍ واحد**.
 *
 * **ووسمُ جهةٍ نظامية دعوى لا زينة**: «مسجَّلون للضريبة» · «سجلُّنا
 * التجاريّ قائم». ووسمٌ بلا رقمه صورةٌ لا تُراجَع، ووسمٌ لجهةٍ لا
 * نملك تسجيلَها دعوى كاذبة على الطرف الآخر منها جهةٌ رقابية.
 *
 * و«قبل أن تفرض شرطًا، افتح الباب الذي يُستوفى منه»: قيل للمالك
 * «أكّد كلَّ علامةٍ تملكها وأطفئ ما لا تملك» — وهذا بابُه.
 */
export default async function AdminTrustMarksPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'notifications.manage')) redirect('/admin');

  const marks = await adminTrustMarks();

  return (
    <AdminShell
      title="علامات الموثوقية"
      subtitle="شعارات الجهات في تذييل الموقع — ورقم كل تسجيل"
      activeHref="/admin/trust-marks"
      admin={admin}
    >
      <p className="mb-7 max-w-2xl text-sm leading-loose opacity-70">
        هذه العلامات تظهر في{' '}
        <Link
          href="/ar"
          className="font-bold underline underline-offset-2"
          target="_blank"
        >
          تذييل الموقع
        </Link>{' '}
        لكل زائر. <b>والعلامة دعوى لا صورة</b> — فرقم التسجيل تحتها هو ما يجعلها
        قابلة للتحقق، ورابط صفحة الجهة هو ما يثبتها. <b>وما لا تملكه أطفئه</b>:
        علامة لجهة لم تسجل فيها دعوى على الطرف الآخر منها جهة رقابية.
      </p>

      <TrustMarksTable marks={marks} canEdit={canWrite(admin.role, 'notifications.manage')} />
    </AdminShell>
  );
}
