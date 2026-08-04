import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { listDeadlines } from '@/lib/domain/deadlines';
import { DeadlinesTable } from './DeadlinesTable';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'المهل الزمنية' };

/**
 * A22 — المهل الزمنية.
 *
 * والمهلة تُقرأ **عند إنشاء الصفّ** فتُخزَّن فيه: تغييرُ الإعداد لا
 * يحرّك طلبًا قائمًا ولا عرضًا مُرسَلًا. ولو قُرئت عند العرض لتغيّرت
 * مهل آلافٍ بضغطة، وهو ما لا يقبله من دفع على وعدٍ سابق.
 */
export default async function DeadlinesPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'finance.view')) redirect('/admin');

  const rows = await listDeadlines();

  return (
    <AdminShell title="المهل الزمنية" activeHref="/admin/deadlines" admin={admin}>
      <p className="mb-7 text-sm leading-loose opacity-60">
        قواعد وقتٍ يديرها المشغّل. والتعديل يسري على ما يُنشأ بعده — والطلبات
        والعروض القائمة تبقى على مهلتها المخزَّنة.
      </p>

      <DeadlinesTable rows={rows} canManage={canWrite(admin.role, 'finance.view')} />
    </AdminShell>
  );
}
