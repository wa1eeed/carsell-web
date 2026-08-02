import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { db } from '@/lib/db';
import { listModels, listTrims } from '@/lib/domain/catalog';
import { CatalogTree } from './CatalogTree';

export const dynamic = 'force-dynamic';

/**
 * A13 الطرازات والفئات — شجرة الماركة ← الطراز ← الفئة.
 *
 * الاختيار في الرابط (`?brand=&model=`) لا في حالة العميل: الرابط
 * قابل للمشاركة، والعودة بالمتصفّح تعيد نفس الموضع.
 */
export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; model?: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'catalog.manage')) redirect('/admin');

  const params = await searchParams;
  const brands = await db.brand.findMany({
    orderBy: [{ sort: 'asc' }, { nameAr: 'asc' }],
    select: { id: true, nameAr: true, nameEn: true, slug: true },
  });

  const brand =
    brands.find((b) => b.id === params.brand) ?? brands[0] ?? null;
  if (brand === null) {
    return (
      <AdminShell title="الطرازات والفئات" activeHref="/admin/catalog/brands" admin={admin}>
        <p className="text-sm opacity-60">لا ماركات بعد — ابدأ من شاشة البراندات.</p>
      </AdminShell>
    );
  }

  const models = await listModels(brand.id);
  const model = models.find((m) => m.id === params.model) ?? models[0] ?? null;
  const trims = model === null ? [] : await listTrims(model.id);

  return (
    <AdminShell
      title={`${brand.nameAr} · الطرازات والفئات`}
      activeHref="/admin/catalog/brands"
      admin={admin}
    >
      <CatalogTree
        brands={brands}
        brandId={brand.id}
        models={models}
        modelId={model?.id ?? null}
        trims={trims}
        canEdit={canWrite(admin.role, 'catalog.manage')}
      />
    </AdminShell>
  );
}
