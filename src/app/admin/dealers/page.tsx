import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { MonitorCards, MonitorTabs } from '@/components/admin/MonitorShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { dealerList, dealerStats } from '@/lib/domain/admin-dealers';
import type { DealerStatus } from '@/generated/prisma/enums';
import { toArabicDigits } from '@/lib/arabic';
import { DealersTable } from './DealersTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'التجار والمعارض' };

const FILTERS: readonly string[] = ['ACTIVE', 'PENDING', 'SUSPENDED'];

/**
 * A26 — التجار والمعارض.
 *
 * `Dealer.verified` رايةٌ **بلا كاتب**: الشارة تُقرأ في صفحة المعرض
 * وفي بطاقة الإعلان، ولا شيء في المنتج يمنحها — فكل معرضٍ مسجَّل يبقى
 * `PENDING` إلى الأبد.
 */
export default async function AdminDealersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'users.view')) redirect('/admin');

  const { filter } = await searchParams;
  const active = filter !== undefined && FILTERS.includes(filter) ? filter : null;

  const [rows, stats] = await Promise.all([
    dealerList(active as DealerStatus | null),
    dealerStats(),
  ]);

  return (
    <AdminShell title="التجار والمعارض"
      subtitle="المعارض وتوثيقها" activeHref="/admin/dealers" admin={admin}>
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-60">
        التحقّق والشارة والباقة. <b>ولا يُدار مخزونهم من هنا</b> — التاجر حسابٌ واحد
        بواجهتين: التطبيق للميدان واللوحة للحجم.
      </p>

      <MonitorCards
        cards={[
          { title: 'معارض نشطة', value: stats.active, note: 'موثّقة وتعرض' },
          { title: 'تنتظر التحقّق', value: stats.pending, note: 'سجل تجاريّ' },
          { title: 'متوسط المخزون', value: stats.averageInventory, note: 'مركبة لكل معرض' },
          {
            title: 'حصّتها من الإعلانات',
            value: `${toArabicDigits(String(stats.listingSharePct))}٪`,
            note: 'من المنشور',
          },
        ]}
      />

      <MonitorTabs
        basePath="/admin/dealers"
        active={active}
        tabs={[
          { key: null, label: 'الكل', count: stats.total },
          { key: 'ACTIVE', label: 'نشطة', count: stats.active },
          { key: 'PENDING', label: 'تنتظر', count: stats.pending },
          { key: 'SUSPENDED', label: 'موقوفة', count: stats.suspended },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="لا معارض بهذه الحالة"
          description="حين يسجّل معرضٌ حسابًا يظهر هنا بانتظار التحقّق من سجله التجاريّ."
        />
      ) : (
        <DealersTable rows={rows} />
      )}
    </AdminShell>
  );
}
