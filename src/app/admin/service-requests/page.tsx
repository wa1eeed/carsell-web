import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { StatCard } from '@/components/ui/StatCard';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { listServiceRequests } from '@/lib/domain/admin-services';
import { RequestsTable } from './RequestsTable';

export const dynamic = 'force-dynamic';

/**
 * A6 — طلبات الخدمات.
 *
 * **المهلة المتجاوزة بارزة** (معيار القبول): الطابور مرتَّب بالمهلة
 * تصاعديًّا، والمتجاوز أحمر في صدره. وترتيبٌ بتاريخ الإنشاء يدفن طلبًا
 * تأخّر أسبوعًا تحت عشرة وصلت اليوم.
 */
export default async function ServiceRequestsPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'serviceRequests.handle')) redirect('/admin');

  const requests = await listServiceRequests();
  const overdue = requests.filter((request) => request.overdue).length;
  const open = requests.filter((request) =>
    ['NEW', 'ASSIGNED', 'IN_PROGRESS'].includes(request.status),
  ).length;
  const unassigned = requests.filter((request) => request.providerName === null).length;

  return (
    <AdminShell title="طلبات الخدمات" activeHref="/admin/service-requests" admin={admin}>
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <StatCard label="مفتوحة" value={open} />
        <StatCard label="تجاوزت المهلة" value={overdue} tone={overdue > 0 ? 'warn' : 'plain'} />
        <StatCard label="بلا مزوّد" value={unassigned} tone={unassigned > 0 ? 'warn' : 'plain'} />
        <StatCard label="الإجمالي" value={requests.length} />
      </div>

      <RequestsTable requests={requests} />
    </AdminShell>
  );
}
