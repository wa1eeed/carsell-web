import { db } from '@/lib/db';
import type { AdminUser, Brand, Model, Prisma, Trim } from '@/generated/prisma/client';
import type {
  BodyType,
  Drivetrain,
  FuelType,
  Transmission,
} from '@/generated/prisma/enums';

/**
 * الكتالوج — الماركات (A12).
 *
 * **كل تعديل يكتب `AuditLog`** بلا استثناء، وبالحالة قبل وبعد: سجلّ يقول
 * «عُدِّلت الماركة» بلا قيَم لا يجيب على «ماذا تغيّر ومتى» بعد شهر.
 */

export const BRAND_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type BrandRow = {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  logoUrl: string | null;
  visible: boolean;
  sort: number;
  modelCount: number;
  listingCount: number;
};

export type CatalogCounts = {
  brands: number;
  visibleBrands: number;
  models: number;
  trims: number;
  withoutLogo: number;
};

export type BrandInput = {
  nameAr: string;
  nameEn: string;
  slug?: string;
  logoUrl?: string | null;
  visible?: boolean;
  sort?: number;
};

export type BrandError =
  | { field: 'nameAr' | 'nameEn' | 'slug'; code: 'REQUIRED' | 'INVALID' | 'TAKEN' };

export type BrandResult =
  | { ok: true; brand: Brand }
  | { ok: false; errors: BrandError[] };

/** يشتقّ `slug` من الاسم الإنجليزي حين لا يُرسَل. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * الاسمان إلزاميان — معيار قبول المهمة ٧.
 * التطبيق يعرض بحسب لغة المستخدم، فماركة بلا اسم إنجليزي تظهر فارغة
 * في الواجهة الإنجليزية ولا يكتشفها أحد إلا بعد النشر.
 */
function validate(input: BrandInput): BrandError[] {
  const errors: BrandError[] = [];
  if (input.nameAr.trim() === '') errors.push({ field: 'nameAr', code: 'REQUIRED' });
  if (input.nameEn.trim() === '') errors.push({ field: 'nameEn', code: 'REQUIRED' });

  const slug = input.slug?.trim() ?? slugify(input.nameEn);
  if (slug === '') errors.push({ field: 'slug', code: 'REQUIRED' });
  else if (!BRAND_SLUG_PATTERN.test(slug)) errors.push({ field: 'slug', code: 'INVALID' });

  return errors;
}

async function audit(
  admin: AdminUser,
  action: string,
  brandId: string,
  before: Prisma.InputJsonValue | undefined,
  after: Prisma.InputJsonValue | undefined,
  ip: string | null,
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'Brand',
      entityId: brandId,
      action,
      before,
      after,
      ip,
    },
  });
}

/**
 * قائمة الماركات مع عدد الطرازات والإعلانات لكل واحدة.
 *
 * عدّ الإعلانات يمرّ بـ`Vehicle.brandId` لا بـ`brandName` النصّي:
 * اللقطة النصّية للعرض والمعرّف للإحصاء (قرار ٣٢).
 */
export async function listBrands(): Promise<BrandRow[]> {
  const brands = await db.brand.findMany({
    orderBy: [{ sort: 'asc' }, { nameAr: 'asc' }],
    include: { _count: { select: { models: true } } },
  });

  const perBrand = await db.vehicle.groupBy({
    by: ['brandId'],
    _count: { _all: true },
    where: { listings: { some: { status: { not: 'DRAFT' } } } },
  });
  const listingByBrand = new Map(perBrand.map((r) => [r.brandId, r._count._all]));

  return brands.map((brand) => ({
    id: brand.id,
    slug: brand.slug,
    nameAr: brand.nameAr,
    nameEn: brand.nameEn,
    logoUrl: brand.logoUrl,
    visible: brand.visible,
    sort: brand.sort,
    modelCount: brand._count.models,
    listingCount: listingByBrand.get(brand.id) ?? 0,
  }));
}

export async function catalogCounts(): Promise<CatalogCounts> {
  const [brands, visibleBrands, models, trims, withoutLogo] = await Promise.all([
    db.brand.count(),
    db.brand.count({ where: { visible: true } }),
    db.model.count(),
    db.trim.count(),
    db.brand.count({ where: { OR: [{ logoUrl: null }, { logoUrl: '' }] } }),
  ]);
  return { brands, visibleBrands, models, trims, withoutLogo };
}

export async function createBrand(
  admin: AdminUser,
  input: BrandInput,
  ip: string | null,
): Promise<BrandResult> {
  const errors = validate(input);
  if (errors.length > 0) return { ok: false, errors };

  const slug = input.slug?.trim() ?? slugify(input.nameEn);
  if ((await db.brand.findUnique({ where: { slug } })) !== null) {
    return { ok: false, errors: [{ field: 'slug', code: 'TAKEN' }] };
  }

  const brand = await db.brand.create({
    data: {
      slug,
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      logoUrl: input.logoUrl ?? null,
      visible: input.visible ?? true,
      sort: input.sort ?? 0,
    },
  });

  await audit(admin, 'brand.create', brand.id, undefined, { ...brand }, ip);
  return { ok: true, brand };
}

export async function updateBrand(
  admin: AdminUser,
  id: string,
  input: Partial<BrandInput>,
  ip: string | null,
): Promise<BrandResult | { ok: false; errors: BrandError[]; notFound: true }> {
  const before = await db.brand.findUnique({ where: { id } });
  if (before === null) {
    return { ok: false, errors: [], notFound: true };
  }

  const merged: BrandInput = {
    nameAr: input.nameAr ?? before.nameAr,
    nameEn: input.nameEn ?? before.nameEn,
    slug: input.slug ?? before.slug,
  };
  const errors = validate(merged);
  if (errors.length > 0) return { ok: false, errors };

  if (merged.slug !== before.slug) {
    const taken = await db.brand.findUnique({ where: { slug: merged.slug as string } });
    if (taken !== null) return { ok: false, errors: [{ field: 'slug', code: 'TAKEN' }] };
  }

  const brand = await db.brand.update({
    where: { id },
    data: {
      nameAr: merged.nameAr.trim(),
      nameEn: merged.nameEn.trim(),
      slug: merged.slug,
      ...(input.logoUrl === undefined ? {} : { logoUrl: input.logoUrl }),
      ...(input.visible === undefined ? {} : { visible: input.visible }),
      ...(input.sort === undefined ? {} : { sort: input.sort }),
    },
  });

  await audit(admin, 'brand.update', id, { ...before }, { ...brand }, ip);
  return { ok: true, brand };
}

/**
 * الإخفاء يمنع الإعلانات الجديدة على الماركة **ولا يحذف القائم**
 * ولا يخفي إعلانًا منشورًا — قاعدة A12 من ترميز التصميم.
 */
export async function setBrandVisibility(
  admin: AdminUser,
  id: string,
  visible: boolean,
  ip: string | null,
): Promise<BrandResult | { ok: false; errors: BrandError[]; notFound: true }> {
  return updateBrand(admin, id, { visible }, ip);
}

export type DeleteResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' | 'HAS_MODELS' | 'HAS_VEHICLES'; count?: number };

/**
 * الحذف النهائي متاح فقط لماركة **بلا طرازات وبلا مركبات**.
 * الفحص في الخادم لا في الواجهة: زرّ مخفي ليس قيدًا.
 */
export async function deleteBrand(
  admin: AdminUser,
  id: string,
  ip: string | null,
): Promise<DeleteResult> {
  const brand = await db.brand.findUnique({
    where: { id },
    include: { _count: { select: { models: true, vehicles: true } } },
  });
  if (brand === null) return { ok: false, reason: 'NOT_FOUND' };

  if (brand._count.models > 0) {
    return { ok: false, reason: 'HAS_MODELS', count: brand._count.models };
  }
  if (brand._count.vehicles > 0) {
    return { ok: false, reason: 'HAS_VEHICLES', count: brand._count.vehicles };
  }

  await db.brand.delete({ where: { id } });
  await audit(admin, 'brand.delete', id, { ...brand }, undefined, ip);
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════
//  الطرازات والفئات (A13)
// ═══════════════════════════════════════════════════════════

export type ModelRow = {
  id: string;
  nameAr: string;
  nameEn: string;
  yearFrom: number;
  yearTo: number | null;
  bodyType: BodyType | null;
  visible: boolean;
  trimCount: number;
  listingCount: number;
};

export type TrimRow = {
  id: string;
  nameAr: string;
  nameEn: string;
  yearFrom: number;
  yearTo: number | null;
  bodyType: BodyType;
  transmission: Transmission;
  fuel: FuelType;
  drivetrain: Drivetrain;
  seats: number;
  doors: number;
  engineL: string | null;
  cylinders: number | null;
  horsepower: number | null;
  visible: boolean;
  listingCount: number;
};

export type ModelInput = {
  brandId: string;
  nameAr: string;
  nameEn: string;
  yearFrom: number;
  yearTo?: number | null;
  bodyType?: BodyType | null;
  visible?: boolean;
};

/** القيَم الموروثة إلزامية كلها — فئة ناقصة تُملأ فراغًا في نموذج البيع. */
export type TrimInput = {
  modelId: string;
  nameAr: string;
  nameEn: string;
  yearFrom: number;
  yearTo?: number | null;
  bodyType: BodyType;
  transmission: Transmission;
  fuel: FuelType;
  drivetrain: Drivetrain;
  seats: number;
  doors: number;
  engineL?: string | null;
  cylinders?: number | null;
  horsepower?: number | null;
  visible?: boolean;
};

export type CatalogError = { field: string; code: 'REQUIRED' | 'INVALID' };

const YEAR_MIN = 1970;
const YEAR_MAX = 2100;

function validateYears(
  yearFrom: number,
  yearTo: number | null | undefined,
): CatalogError[] {
  const errors: CatalogError[] = [];
  if (!Number.isInteger(yearFrom) || yearFrom < YEAR_MIN || yearFrom > YEAR_MAX) {
    errors.push({ field: 'yearFrom', code: 'INVALID' });
  }
  if (yearTo !== null && yearTo !== undefined) {
    if (!Number.isInteger(yearTo) || yearTo < YEAR_MIN || yearTo > YEAR_MAX) {
      errors.push({ field: 'yearTo', code: 'INVALID' });
    } else if (yearTo < yearFrom) {
      // سنة نهاية قبل البداية تنتج فئة لا تظهر لأي سنة
      errors.push({ field: 'yearTo', code: 'INVALID' });
    }
  }
  return errors;
}

function validateNames(nameAr: string, nameEn: string): CatalogError[] {
  const errors: CatalogError[] = [];
  if (nameAr.trim() === '') errors.push({ field: 'nameAr', code: 'REQUIRED' });
  if (nameEn.trim() === '') errors.push({ field: 'nameEn', code: 'REQUIRED' });
  return errors;
}

export async function listModels(brandId: string): Promise<ModelRow[]> {
  const models = await db.model.findMany({
    where: { brandId },
    orderBy: { nameAr: 'asc' },
    include: { _count: { select: { trims: true } } },
  });

  const perModel = await db.vehicle.groupBy({
    by: ['modelId'],
    _count: { _all: true },
    where: { brandId, listings: { some: { status: { not: 'DRAFT' } } } },
  });
  const byModel = new Map(perModel.map((r) => [r.modelId, r._count._all]));

  return models.map((m) => ({
    id: m.id,
    nameAr: m.nameAr,
    nameEn: m.nameEn,
    yearFrom: m.yearFrom,
    yearTo: m.yearTo,
    bodyType: m.bodyType,
    visible: m.visible,
    trimCount: m._count.trims,
    listingCount: byModel.get(m.id) ?? 0,
  }));
}

export async function listTrims(modelId: string): Promise<TrimRow[]> {
  const trims = await db.trim.findMany({
    where: { modelId },
    orderBy: { nameEn: 'asc' },
  });

  const perTrim = await db.vehicle.groupBy({
    by: ['trimId'],
    _count: { _all: true },
    where: { modelId, listings: { some: { status: { not: 'DRAFT' } } } },
  });
  const byTrim = new Map(
    perTrim.filter((r) => r.trimId !== null).map((r) => [r.trimId as string, r._count._all]),
  );

  return trims.map((t) => ({
    id: t.id,
    nameAr: t.nameAr,
    nameEn: t.nameEn,
    yearFrom: t.yearFrom,
    yearTo: t.yearTo,
    bodyType: t.bodyType,
    transmission: t.transmission,
    fuel: t.fuel,
    drivetrain: t.drivetrain,
    seats: t.seats,
    doors: t.doors,
    engineL: t.engineL?.toString() ?? null,
    cylinders: t.cylinders,
    horsepower: t.horsepower,
    visible: t.visible,
    listingCount: byTrim.get(t.id) ?? 0,
  }));
}

export type ModelResult =
  | { ok: true; model: Model }
  | { ok: false; errors: CatalogError[]; notFound?: true };

export async function createModel(
  admin: AdminUser,
  input: ModelInput,
  ip: string | null,
): Promise<ModelResult> {
  const errors = [
    ...validateNames(input.nameAr, input.nameEn),
    ...validateYears(input.yearFrom, input.yearTo),
  ];
  if ((await db.brand.findUnique({ where: { id: input.brandId } })) === null) {
    errors.push({ field: 'brandId', code: 'INVALID' });
  }
  if (errors.length > 0) return { ok: false, errors };

  const model = await db.model.create({
    data: {
      brandId: input.brandId,
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      yearFrom: input.yearFrom,
      yearTo: input.yearTo ?? null,
      bodyType: input.bodyType ?? null,
      visible: input.visible ?? true,
    },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id, actorType: 'admin', entity: 'Model', entityId: model.id,
      action: 'model.create', after: { ...model }, ip,
    },
  });
  return { ok: true, model };
}

export async function updateModel(
  admin: AdminUser,
  id: string,
  input: Partial<Omit<ModelInput, 'brandId'>>,
  ip: string | null,
): Promise<ModelResult> {
  const before = await db.model.findUnique({ where: { id } });
  if (before === null) return { ok: false, errors: [], notFound: true };

  const nameAr = input.nameAr ?? before.nameAr;
  const nameEn = input.nameEn ?? before.nameEn;
  const yearFrom = input.yearFrom ?? before.yearFrom;
  const yearTo = input.yearTo === undefined ? before.yearTo : input.yearTo;

  const errors = [...validateNames(nameAr, nameEn), ...validateYears(yearFrom, yearTo)];
  if (errors.length > 0) return { ok: false, errors };

  const model = await db.model.update({
    where: { id },
    data: {
      nameAr: nameAr.trim(), nameEn: nameEn.trim(), yearFrom, yearTo,
      ...(input.bodyType === undefined ? {} : { bodyType: input.bodyType }),
      ...(input.visible === undefined ? {} : { visible: input.visible }),
    },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id, actorType: 'admin', entity: 'Model', entityId: id,
      action: 'model.update', before: { ...before }, after: { ...model }, ip,
    },
  });
  return { ok: true, model };
}

export type TrimResult =
  | { ok: true; trim: Trim }
  | { ok: false; errors: CatalogError[]; notFound?: true };

export async function createTrim(
  admin: AdminUser,
  input: TrimInput,
  ip: string | null,
): Promise<TrimResult> {
  const errors = [
    ...validateNames(input.nameAr, input.nameEn),
    ...validateYears(input.yearFrom, input.yearTo),
  ];
  if (!Number.isInteger(input.seats) || input.seats < 1 || input.seats > 20) {
    errors.push({ field: 'seats', code: 'INVALID' });
  }
  if (!Number.isInteger(input.doors) || input.doors < 2 || input.doors > 6) {
    errors.push({ field: 'doors', code: 'INVALID' });
  }
  if ((await db.model.findUnique({ where: { id: input.modelId } })) === null) {
    errors.push({ field: 'modelId', code: 'INVALID' });
  }
  if (errors.length > 0) return { ok: false, errors };

  const trim = await db.trim.create({
    data: {
      modelId: input.modelId,
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      yearFrom: input.yearFrom,
      yearTo: input.yearTo ?? null,
      bodyType: input.bodyType,
      transmission: input.transmission,
      fuel: input.fuel,
      drivetrain: input.drivetrain,
      seats: input.seats,
      doors: input.doors,
      engineL: input.engineL ?? null,
      cylinders: input.cylinders ?? null,
      horsepower: input.horsepower ?? null,
      visible: input.visible ?? true,
    },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id, actorType: 'admin', entity: 'Trim', entityId: trim.id,
      action: 'trim.create', after: { ...trim, engineL: trim.engineL?.toString() ?? null }, ip,
    },
  });
  return { ok: true, trim };
}

/**
 * **تعديل قيمة موروثة لا يمسّ الإعلانات المنشورة.**
 * القيَم تُنسخ لقطةً في المركبة وقت الإضافة، والتعديل يسري على الجديد
 * وحده — وهذا ما يمنع تغييرًا في الكتالوج من العبث بإعلان قديم (§١٥).
 */
export async function updateTrim(
  admin: AdminUser,
  id: string,
  input: Partial<Omit<TrimInput, 'modelId'>>,
  ip: string | null,
): Promise<TrimResult> {
  const before = await db.trim.findUnique({ where: { id } });
  if (before === null) return { ok: false, errors: [], notFound: true };

  const nameAr = input.nameAr ?? before.nameAr;
  const nameEn = input.nameEn ?? before.nameEn;
  const yearFrom = input.yearFrom ?? before.yearFrom;
  const yearTo = input.yearTo === undefined ? before.yearTo : input.yearTo;

  const errors = [...validateNames(nameAr, nameEn), ...validateYears(yearFrom, yearTo)];
  if (errors.length > 0) return { ok: false, errors };

  const trim = await db.trim.update({
    where: { id },
    data: {
      nameAr: nameAr.trim(), nameEn: nameEn.trim(), yearFrom, yearTo,
      ...(input.bodyType === undefined ? {} : { bodyType: input.bodyType }),
      ...(input.transmission === undefined ? {} : { transmission: input.transmission }),
      ...(input.fuel === undefined ? {} : { fuel: input.fuel }),
      ...(input.drivetrain === undefined ? {} : { drivetrain: input.drivetrain }),
      ...(input.seats === undefined ? {} : { seats: input.seats }),
      ...(input.doors === undefined ? {} : { doors: input.doors }),
      ...(input.engineL === undefined ? {} : { engineL: input.engineL }),
      ...(input.cylinders === undefined ? {} : { cylinders: input.cylinders }),
      ...(input.horsepower === undefined ? {} : { horsepower: input.horsepower }),
      ...(input.visible === undefined ? {} : { visible: input.visible }),
    },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id, actorType: 'admin', entity: 'Trim', entityId: id,
      action: 'trim.update',
      before: { ...before, engineL: before.engineL?.toString() ?? null },
      after: { ...trim, engineL: trim.engineL?.toString() ?? null },
      ip,
    },
  });
  return { ok: true, trim };
}

export type CatalogDeleteResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' | 'HAS_TRIMS' | 'HAS_VEHICLES'; count?: number };

export async function deleteModel(
  admin: AdminUser,
  id: string,
  ip: string | null,
): Promise<CatalogDeleteResult> {
  const model = await db.model.findUnique({
    where: { id },
    include: { _count: { select: { trims: true, vehicles: true } } },
  });
  if (model === null) return { ok: false, reason: 'NOT_FOUND' };
  if (model._count.trims > 0) {
    return { ok: false, reason: 'HAS_TRIMS', count: model._count.trims };
  }
  if (model._count.vehicles > 0) {
    return { ok: false, reason: 'HAS_VEHICLES', count: model._count.vehicles };
  }

  await db.model.delete({ where: { id } });
  await db.auditLog.create({
    data: {
      actorId: admin.id, actorType: 'admin', entity: 'Model', entityId: id,
      action: 'model.delete', before: { ...model }, ip,
    },
  });
  return { ok: true };
}

export async function deleteTrim(
  admin: AdminUser,
  id: string,
  ip: string | null,
): Promise<CatalogDeleteResult> {
  const trim = await db.trim.findUnique({
    where: { id },
    include: { _count: { select: { vehicles: true } } },
  });
  if (trim === null) return { ok: false, reason: 'NOT_FOUND' };
  if (trim._count.vehicles > 0) {
    return { ok: false, reason: 'HAS_VEHICLES', count: trim._count.vehicles };
  }

  await db.trim.delete({ where: { id } });
  await db.auditLog.create({
    data: {
      actorId: admin.id, actorType: 'admin', entity: 'Trim', entityId: id,
      action: 'trim.delete',
      before: { ...trim, engineL: trim.engineL?.toString() ?? null },
      ip,
    },
  });
  return { ok: true };
}
