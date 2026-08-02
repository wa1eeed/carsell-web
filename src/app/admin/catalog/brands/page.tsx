import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { StatCard } from '@/components/ui/StatCard';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { catalogCounts, listBrands } from '@/lib/domain/catalog';
import { isR2Configured } from '@/lib/r2';
import { BrandsTable } from './BrandsTable';

export const dynamic = 'force-dynamic';

/**
 * A12 البراندات — بالعربية والإنجليزية مع الشعار.
 * معيار القبول: **الاسمان إلزاميان**.
 */
export default async function BrandsPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'catalog.manage')) redirect('/admin');

  const [brands, counts] = await Promise.all([listBrands(), catalogCounts()]);

  return (
    <AdminShell
      title="البراندات"
      activeHref="/admin/catalog/brands"
      admin={admin}
    >
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <StatCard label="الماركات" value={counts.brands} />
        <StatCard label="الطرازات" value={counts.models} />
        <StatCard label="الفئات" value={counts.trims} />
        {/* الماركات بلا شعار تظهر بالحرف الأول — تحذير لا خطأ */}
        <StatCard
          label="بلا شعار"
          value={counts.withoutLogo}
          tone={counts.withoutLogo > 0 ? 'warn' : 'plain'}
        />
      </div>

      <BrandsTable
        brands={brands}
        canEdit={canWrite(admin.role, 'catalog.manage')}
        canUploadLogo={canWrite(admin.role, 'catalog.uploadLogo')}
        uploadsReady={isR2Configured()}
      />

      <section className="mt-5 rounded-lg border border-line bg-surface p-5.5">
        <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-45">
          قواعد الكتالوج
        </h2>
        <ul className="flex flex-col gap-2.5 text-sm leading-loose opacity-72">
          <li>الاسمان العربي والإنجليزي إلزاميان — التطبيق يعرض بحسب لغة المستخدم.</li>
          <li>
            الشعار PNG أو SVG بخلفية شفافة، يرفعه السوبر أدمن أو فريق المحتوى،
            ويظهر في شبكة الماركات في الرئيسية.
          </li>
          <li>إخفاء ماركة يمنع الإعلانات الجديدة عليها ولا يحذف القائم.</li>
          <li>ماركة بلا شعار تظهر بالحرف الأول حتى يُرفع.</li>
          <li>لا تُحذف ماركة لها طرازات أو مركبات — تُخفى بدل ذلك.</li>
        </ul>
      </section>
    </AdminShell>
  );
}
