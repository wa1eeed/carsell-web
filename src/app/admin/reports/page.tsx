import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { reportQueue, reportStats } from '@/lib/domain/admin-reports';
import { REPORT_STATUSES, type ReportStatus } from '@/lib/domain/report-rules';
import { ReportsQueue } from './ReportsQueue';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'البلاغات' };

/**
 * A17 — البلاغات.
 *
 * تُنشأ منذ بُنيت شاشة الإبلاغ، **ولم تكن شاشة تقرؤها**: فمن أبلغ عن
 * احتيالٍ يجد صمتًا، وقرار ٣٣ يَعِد بمراجعةٍ بشرية لا يقوم بها أحد.
 */
export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'reports.handle')) redirect('/admin');

  const { status } = await searchParams;
  // `all` تعني بلا تصفية، والمجهول يُقرأ «مفتوحة» ولا يُسقط الشاشة
  const filter: ReportStatus | null =
    status === 'all'
      ? null
      : status !== undefined && (REPORT_STATUSES as readonly string[]).includes(status)
        ? (status as ReportStatus)
        : 'open';

  const [rows, stats] = await Promise.all([reportQueue(filter), reportStats()]);

  return (
    <AdminShell title="البلاغات" activeHref="/admin/reports" admin={admin}>
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-60">
        ما أبلغ عنه المستخدمون — إعلانًا أو حسابًا. والبلاغ يُحيل إلى مراجعة بشرية ولا
        يحذف شيئًا بنفسه.
      </p>

      <ReportsQueue rows={rows} stats={stats} status={filter} />
    </AdminShell>
  );
}
