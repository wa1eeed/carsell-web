import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { DetailStats } from '@/components/admin/DetailShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Year } from '@/components/ui/Year';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { db } from '@/lib/db';
import { MonitorTabs } from '@/components/admin/MonitorShell';
import { Timeline } from '@/components/admin/Timeline';
import { trimTimeline } from '@/lib/domain/admin-entity-timelines';
import { TrimEditor } from './TrimEditor';

export const dynamic = 'force-dynamic';

/**
 * A14 محرّر الفئة — ما يُورَّث للإعلان تلقائيًا.
 */
export default async function TrimEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

  /**
   * **وتعديلُ الفئة يغيّر مركباتٍ قائمة** — فمن غيّرها ومتى سؤالٌ
   * يُسأل حين تُشتكى سيارةٌ لا تطابق وصفَها.
   */
  const search = await searchParams;
  const timeline = search.tab === 'timeline';
  const events = timeline ? await trimTimeline(trim.id) : [];

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
      {/*
        **وعددُ المركبات نطاقُ الأثر.** ما يُعدَّل هنا يُورَّث، فمن
        يعدّل فئةً تحتها مئتا مركبة يحتاج أن يعرف ذلك **قبل** لا بعد.
      */}
      <DetailStats
        items={[
          { label: 'مركبات تستعملها', value: <ArabicNumber value={trim._count.vehicles} /> },
          { label: 'من سنة', value: <Year value={trim.yearFrom} /> },
          {
            label: 'إلى سنة',
            value: trim.yearTo === null ? 'ما زالت تُنتج' : <Year value={trim.yearTo} />,
          },
        ]}
      />

      <MonitorTabs
        basePath={`/admin/catalog/trims/${encodeURIComponent(trim.id)}`}
        param="tab"
        active={timeline ? 'timeline' : null}
        tabs={[
          { key: null, label: 'المحرّر' },
          { key: 'timeline', label: 'سجلّ التعديل' },
        ]}
      />

      {!timeline ? null : (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="mb-1.5 text-sm font-bold">سجلّ التعديل</h2>
          <p className="mb-5 max-w-xl text-3xs leading-loose opacity-70">
            ما يُعدَّل هنا يُورَّث إلى كل مركبةٍ تُنشأ من هذه الفئة — فمن غيّره ومتى
            سؤالٌ يُسأل حين تُشتكى سيارةٌ لا تطابق وصفَها.
          </p>
          <Timeline events={events} />
        </section>
      )}

      {timeline ? null : (
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
      )}
    </AdminShell>
  );
}
