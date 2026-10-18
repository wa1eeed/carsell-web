import Link from 'next/link';
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
export default async function FeaturesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'catalog.manage')) redirect('/admin');

  const [features, counts, search] = await Promise.all([
    listFeatures(),
    featureCounts(),
    searchParams,
  ]);

  /**
   * **والشريحة من العنوان** — فالبطاقة تربط إليها، والرابط يُشارَك
   * ويعود بزرّ الرجوع. وحالةٌ في الذاكرة لا يبلغها رابط.
   */
  const TABS = ['ALL', 'ORPHANS', 'SAFETY', 'COMFORT', 'TECH'] as const;
  const asked = search.tab ?? '';
  const initialTab = (TABS as readonly string[]).includes(asked)
    ? (asked as (typeof TABS)[number])
    : undefined;

  return (
    <AdminShell title="المميزات" activeHref="/admin/catalog/brands" admin={admin}>
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="الأمان" value={counts.byGroup.SAFETY} />
        <StatCard label="الراحة" value={counts.byGroup.COMFORT} />
        <StatCard label="التقنية" value={counts.byGroup.TECH} />
        {/*
          ميزة يتيمة لا تظهر لأحد — تحذير لا خطأ (قرار A19 بند ٦).

          **والعدّاد يربط إلى شاشة أو لا يُعرض**: كان رقمًا ساكنًا، يقرؤه
          المحرّر ثمّ يبحث عن أربعٍ وثلاثين ميزةً في تسعٍ وثلاثين صفًّا.
          والصفرُ لا يُربط — وعدٌ ثم قائمةٌ فارغة أسوأ من رقمٍ ساكن.
        */}
        {counts.orphans === 0 ? (
          <StatCard label="غير مربوطة بأي فئة" value={counts.orphans} />
        ) : (
          <Link href="/admin/catalog/features?tab=ORPHANS" className="transition-opacity hover:opacity-80">
            <StatCard label="غير مربوطة بأي فئة" value={counts.orphans} tone="warn" />
          </Link>
        )}
      </div>

      <FeaturesTable
        features={features}
        canEdit={canWrite(admin.role, 'catalog.manage')}
        initialTab={initialTab}
      />
    </AdminShell>
  );
}
