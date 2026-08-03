import { db } from '@/lib/db';

/**
 * خيارات الكتالوج للشاشات — **نوع معلَن يبنيه مُسلسِل**.
 *
 * تمرير صفّ Prisma إلى مكوّن عميل يُوصله المتصفّح كاملًا ولو عرضت
 * الشاشة حقلًا واحدًا منه. وهنا الحقول قليلة وغير حسّاسة، لكن القاعدة
 * لا تُبنى على حسّاسية اليوم: `Brand` قد يكتسب غدًا حقلًا داخليًّا،
 * والشاشة التي تمرّره لن تتغيّر.
 */

export type CatalogOption = { id: string; nameAr: string; nameEn: string };
export type FeatureOption = { key: string; nameAr: string; nameEn: string };

export async function listBrandOptions(): Promise<CatalogOption[]> {
  const rows = await db.brand.findMany({
    where: { visible: true },
    orderBy: [{ sort: 'asc' }],
    select: { id: true, nameAr: true, nameEn: true },
  });
  return rows.map((row) => ({ id: row.id, nameAr: row.nameAr, nameEn: row.nameEn }));
}

export async function listModelOptions(brandId: string | null): Promise<CatalogOption[]> {
  if (brandId === null) return [];
  const rows = await db.model.findMany({
    where: { brandId, visible: true },
    orderBy: { nameAr: 'asc' },
    select: { id: true, nameAr: true, nameEn: true },
  });
  return rows.map((row) => ({ id: row.id, nameAr: row.nameAr, nameEn: row.nameEn }));
}

export async function listFeatureOptions(placement: string): Promise<FeatureOption[]> {
  const rows = await db.feature.findMany({
    where: { active: true, placements: { has: placement } },
    orderBy: [{ group: 'asc' }, { sort: 'asc' }],
    select: { key: true, nameAr: true, nameEn: true },
  });
  return rows.map((row) => ({ key: row.key, nameAr: row.nameAr, nameEn: row.nameEn }));
}

/** خيارات الأدمن — تشمل المخفيّ، فالمحرّر يراه ليُظهره. */
export type AdminBrandOption = CatalogOption & { slug: string };

export async function listAdminBrandOptions(): Promise<AdminBrandOption[]> {
  const rows = await db.brand.findMany({
    orderBy: [{ sort: 'asc' }, { nameAr: 'asc' }],
    select: { id: true, nameAr: true, nameEn: true, slug: true },
  });
  return rows.map((row) => ({
    id: row.id, nameAr: row.nameAr, nameEn: row.nameEn, slug: row.slug,
  }));
}
