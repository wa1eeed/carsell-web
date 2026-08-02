import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { StatCard } from '@/components/ui/StatCard';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * A1 لوحة القيادة — الهيكل والحراسة. البطاقات الكاملة في المهمة ٢٥.
 * كل رقم من DB ولا رقم ثابت (معيار قبول §٨).
 */
export default async function AdminDashboardPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');

  const [listings, orders, users, escrowHeld] = await Promise.all([
    db.listing.count({ where: { status: 'PUBLISHED' } }),
    db.order.count({ where: { status: 'ACTIVE' } }),
    db.user.count({ where: { status: 'ACTIVE' } }),
    db.escrow.aggregate({ where: { status: 'HELD' }, _sum: { amount: true } }),
  ]);

  return (
    <AdminShell title="لوحة القيادة" activeHref="/admin" admin={admin}>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="إعلانات منشورة" value={listings} />
        <StatCard label="طلبات نشطة" value={orders} />
        <StatCard label="عملاء نشطون" value={users} />
        {/* المالية خلف صلاحية — OPS لا يراها */}
        {can(admin.role, 'finance.view') ? (
          <StatCard
            label="محتجز في الضمان"
            value={escrowHeld._sum.amount?.toString() ?? 0}
            tone="ink"
            suffix="ريال"
          />
        ) : null}
      </div>
    </AdminShell>
  );
}
