import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { StatCard } from '@/components/ui/StatCard';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { allCities } from '@/lib/domain/cities';
import { CitiesTable } from './CitiesTable';

export const dynamic = 'force-dynamic';

/**
 * ═══ المدن — إعدادٌ أساسيّ كان ثابتًا في الشيفرة ═══
 *
 * طلبُ المالك ٢٠٢٦-١١-٢٥: المدنُ من «الإعدادات الأساسية المطلوبة
 * لتشغيل المنصة». وكانت ستًّا وعشرين مدينةً في `labels/cities.ts` —
 * **لا تُضاف إليها واحدةٌ بلا نشر**.
 */
export default async function CitiesPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'catalog.manage')) redirect('/admin');

  const cities = await allCities();
  const visible = cities.filter((city) => city.visible).length;
  const regions = new Set(cities.map((city) => city.region)).size;
  const empty = cities.filter((city) => city.listings === 0).length;

  return (
    <AdminShell title="المدن" activeHref="/admin/catalog/cities" admin={admin}>
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="المدن" value={cities.length} />
        <StatCard label="المعروضة" value={visible} />
        <StatCard label="المناطق" value={regions} />
        {/*
          **ومدينةٌ بلا إعلان ليست عطلًا** — هي تغطيةٌ لم تصلها بعد.
          والرقمُ يقول أين تُفتح صفحةُ هبوطٍ على فراغ.
        */}
        <StatCard label="بلا إعلانات" value={empty} />
      </div>

      <CitiesTable rows={cities} mayWrite={canWrite(admin.role, 'catalog.manage')} />
    </AdminShell>
  );
}
