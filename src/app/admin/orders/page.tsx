import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { StatCard } from '@/components/ui/StatCard';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { listAdminOrders } from '@/lib/domain/admin-orders';
import { OrdersTable } from './OrdersTable';

export const dynamic = 'force-dynamic';

/**
 * A4 — الطلبات.
 *
 * **مدّة البقاء + تنبيه تجاوز الضعف** (معيار القبول). و«الضعف» ضعف
 * الهدف المعلن لكل مرحلة لا رقم واحد للجميع: رقمٌ موحّد يصرخ على مرحلة
 * بطيئة بطبعها ويصمت عن أخرى تعثّرت.
 */
export default async function AdminOrdersPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'orders.view')) redirect('/admin');

  const orders = await listAdminOrders();
  const late = orders.filter((order) => order.late).length;
  const critical = orders.filter((order) => order.critical).length;
  const disputed = orders.filter((order) => order.hasDispute).length;

  return (
    <AdminShell title="الطلبات"
      subtitle="تابز لكل مرحلة وإجراء مباشر" activeHref="/admin/orders" admin={admin}>
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <StatCard label="طلبات جارية" value={orders.length} />
        <StatCard label="تجاوزت الهدف" value={late} tone={late > 0 ? 'warn' : 'plain'} />
        <StatCard label="تجاوزت الضعف" value={critical} tone={critical > 0 ? 'warn' : 'plain'} />
        <StatCard label="عليها نزاع" value={disputed} tone={disputed > 0 ? 'warn' : 'plain'} />
      </div>

      <OrdersTable orders={orders} />

    </AdminShell>
  );
}
