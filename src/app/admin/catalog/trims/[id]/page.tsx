import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { db } from '@/lib/db';
import { TrimEditor } from './TrimEditor';

export const dynamic = 'force-dynamic';

/**
 * A14 محرّر الفئة — ما يُورَّث للإعلان تلقائيًا.
 */
export default async function TrimEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'catalog.manage')) redirect('/admin');

  const { id } = await params;
  const trim = await db.trim.findUnique({
    where: { id },
    include: {
      model: { include: { brand: true } },
      features: true,
      _count: { select: { vehicles: true } },
    },
  });
  if (trim === null) notFound();

  // المميّزات المعروضة في محرّر الفئة وحدها (موضع trim_editor)
  const features = await db.feature.findMany({
    where: { active: true, placements: { has: 'trim_editor' } },
    orderBy: [{ group: 'asc' }, { sort: 'asc' }],
  });

  return (
    <AdminShell
      title={`${trim.model.nameAr} ${trim.nameEn} — محرّر الفئة`}
      activeHref="/admin/catalog/brands"
      admin={admin}
    >
      <TrimEditor
        trim={{
          id: trim.id,
          nameAr: trim.nameAr,
          nameEn: trim.nameEn,
          yearFrom: trim.yearFrom,
          yearTo: trim.yearTo,
          bodyType: trim.bodyType,
          transmission: trim.transmission,
          fuel: trim.fuel,
          drivetrain: trim.drivetrain,
          seats: trim.seats,
          doors: trim.doors,
          engineL: trim.engineL?.toString() ?? null,
          cylinders: trim.cylinders,
          horsepower: trim.horsepower,
        }}
        path={{
          brand: trim.model.brand.nameAr,
          model: trim.model.nameAr,
          brandId: trim.model.brandId,
          modelId: trim.modelId,
        }}
        vehicleCount={trim._count.vehicles}
        features={features.map((f) => ({
          key: f.key,
          nameAr: f.nameAr,
          group: f.group,
        }))}
        selected={trim.features.map((f) => f.featureKey)}
        canEdit={canWrite(admin.role, 'catalog.manage')}
      />
    </AdminShell>
  );
}
