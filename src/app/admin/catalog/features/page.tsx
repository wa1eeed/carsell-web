import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { StatCard } from '@/components/ui/StatCard';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { featureCounts, listFeatures } from '@/lib/domain/catalog';
import { FeaturesTable } from './FeaturesTable';

export const dynamic = 'force-dynamic';

/**
 * A19 المميّزات — بنك واحد يغذّي الفئات وفلتر البحث وصفحة السيارة.
 */
export default async function FeaturesPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'catalog.manage')) redirect('/admin');

  const [features, counts] = await Promise.all([listFeatures(), featureCounts()]);

  return (
    <AdminShell title="المميّزات" activeHref="/admin/catalog/brands" admin={admin}>
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <StatCard label="الأمان" value={counts.byGroup.SAFETY} />
        <StatCard label="الراحة" value={counts.byGroup.COMFORT} />
        <StatCard label="التقنية" value={counts.byGroup.TECH} />
        {/* ميزة يتيمة لا تظهر لأحد — تحذير لا خطأ (قرار A19 بند ٦) */}
        <StatCard
          label="غير مربوطة بأي فئة"
          value={counts.orphans}
          tone={counts.orphans > 0 ? 'warn' : 'plain'}
        />
      </div>

      <FeaturesTable
        features={features}
        canEdit={canWrite(admin.role, 'catalog.manage')}
      />
    </AdminShell>
  );
}
