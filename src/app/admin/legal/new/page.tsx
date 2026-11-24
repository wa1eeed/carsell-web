import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { LinkButton } from '@/components/ui/Button';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { DraftEditor } from '../DraftEditor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'مستند قانوني جديد' };

/**
 * A34 — «مستند جديد»، وزرُّه في رأس الشاشة.
 *
 * **ويُولد مسوّدةً لا منشورًا**: نصٌّ قانونيّ يظهر للزائر لحظةَ كتابته
 * يظهر بلا مراجعة. فالمستند يُنشأ `active: false`، ولا يراه أحد حتى
 * تُنشر نسختُه الأولى.
 */
export default async function AdminLegalNewPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'notifications.manage')) redirect('/admin');

  return (
    <AdminShell
      title="مستند جديد"
      subtitle="ينشأ مسودة، ولا يراه زائر حتى تنشر"
      activeHref="/admin/legal"
      admin={admin}
      actions={
        <LinkButton href="/admin/legal" variant="ghost" size="sm">
          رجوع
        </LinkButton>
      }
    >
      <p className="mb-6 max-w-xl text-2xs leading-loose opacity-70">
        المفتاح يظهر في الرابط <span className="font-num" dir="ltr">/legal/&lt;key&gt;</span> ولا
        يتغير بعد الإنشاء، فاخترا قصيرا وصفيا. و«إلزامي للتسجيل» يجعل قبوله شرطا
        في شاشة الدخول ويسجل لكل حساب.
      </p>

      <DraftEditor
        docKey=""
        draft={{
          titleAr: '',
          titleEn: '',
          summaryAr: '',
          summaryEn: '',
          material: false,
          effectiveAt: '',
          sections: [{ n: 1, titleAr: '', titleEn: '', bodyAr: '', bodyEn: '' }],
        }}
        hasDraft={false}
        creating
        publishedVersion={null}
        draftVersion={null}
        acceptances={0}
      />
    </AdminShell>
  );
}
