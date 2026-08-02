import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  createBrand,
  createModel,
  createTrim,
  deleteBrand,
  deleteModel,
  deleteTrim,
  setBrandVisibility,
  slugify,
  updateBrand,
  updateTrim,
} from '@/lib/domain/catalog';
import type { AdminUser } from '@/generated/prisma/client';

const PREFIX = 'test-brand-';
let admin: AdminUser;

async function cleanup(): Promise<void> {
  const brands = await db.brand.findMany({ where: { slug: { startsWith: PREFIX } } });
  for (const brand of brands) {
    await db.vehicle.deleteMany({ where: { brandId: brand.id } });
    const models = await db.model.findMany({ where: { brandId: brand.id } });
    for (const m of models) await db.trim.deleteMany({ where: { modelId: m.id } });
    await db.model.deleteMany({ where: { brandId: brand.id } });
    await db.auditLog.deleteMany({ where: { entity: 'Brand', entityId: brand.id } });
    await db.brand.delete({ where: { id: brand.id } });
  }
}

beforeEach(async () => {
  await cleanup();
  admin = await db.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

const input = (over: Partial<{ nameAr: string; nameEn: string; slug: string }> = {}) => ({
  nameAr: 'ماركة اختبار',
  nameEn: 'Test Brand',
  slug: `${PREFIX}one`,
  ...over,
});

describe('الاسمان إلزاميان — معيار قبول المهمة ٧', () => {
  it('يرفض غياب الاسم العربي', async () => {
    const result = await createBrand(admin, input({ nameAr: '' }), null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContainEqual({ field: 'nameAr', code: 'REQUIRED' });
  });

  it('يرفض غياب الاسم الإنجليزي', async () => {
    const result = await createBrand(admin, input({ nameEn: '' }), null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContainEqual({ field: 'nameEn', code: 'REQUIRED' });
  });

  it('يرفض المسافات وحدها — لا يكفي أن يكون الحقل غير فارغ', async () => {
    const result = await createBrand(admin, input({ nameAr: '   ' }), null);
    expect(result.ok).toBe(false);
  });

  it('يرفض إفراغ اسم عند التعديل لا عند الإنشاء فقط', async () => {
    const created = await createBrand(admin, input(), null);
    if (!created.ok) throw new Error('لم تُنشأ');
    const updated = await updateBrand(admin, created.brand.id, { nameEn: '' }, null);
    expect(updated.ok).toBe(false);
  });
});

describe('المعرّف في الرابط', () => {
  it('يُشتقّ من الاسم الإنجليزي حين لا يُرسَل', () => {
    expect(slugify('Land Rover')).toBe('land-rover');
    expect(slugify('  Mercedes-Benz ')).toBe('mercedes-benz');
    expect(slugify('BYD')).toBe('byd');
  });

  it('يرفض المكرّر', async () => {
    await createBrand(admin, input(), null);
    const again = await createBrand(admin, input({ nameAr: 'أخرى' }), null);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.errors).toContainEqual({ field: 'slug', code: 'TAKEN' });
  });

  it('يرفض شكلًا غير صالح', async () => {
    for (const bad of ['Toyota', 'تويوتا', 'a--b', '-a', 'a_b']) {
      const result = await createBrand(admin, input({ slug: bad }), null);
      expect(result.ok, bad).toBe(false);
    }
  });
});

describe('الإخفاء والحذف', () => {
  it('الإخفاء لا يحذف الطرازات ولا المركبات', async () => {
    const created = await createBrand(admin, input(), null);
    if (!created.ok) throw new Error('لم تُنشأ');
    await db.model.create({
      data: { brandId: created.brand.id, nameAr: 'ط', nameEn: 'M', yearFrom: 2020 },
    });

    await setBrandVisibility(admin, created.brand.id, false, null);

    const after = await db.brand.findUniqueOrThrow({ where: { id: created.brand.id } });
    expect(after.visible).toBe(false);
    expect(await db.model.count({ where: { brandId: created.brand.id } })).toBe(1);
  });

  it('لا تُحذف ماركة لها طرازات — والفحص في الخادم', async () => {
    const created = await createBrand(admin, input(), null);
    if (!created.ok) throw new Error('لم تُنشأ');
    await db.model.create({
      data: { brandId: created.brand.id, nameAr: 'ط', nameEn: 'M', yearFrom: 2020 },
    });

    const result = await deleteBrand(admin, created.brand.id, null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('HAS_MODELS');
      expect(result.count).toBe(1);
    }
    expect(await db.brand.count({ where: { id: created.brand.id } })).toBe(1);
  });

  it('تُحذف ماركة فارغة', async () => {
    const created = await createBrand(admin, input(), null);
    if (!created.ok) throw new Error('لم تُنشأ');
    expect((await deleteBrand(admin, created.brand.id, null)).ok).toBe(true);
    expect(await db.brand.count({ where: { id: created.brand.id } })).toBe(0);
  });
});

describe('سجل التدقيق', () => {
  it('كل إجراء يكتب AuditLog بالحالة قبل وبعد', async () => {
    const created = await createBrand(admin, input(), null);
    if (!created.ok) throw new Error('لم تُنشأ');
    const id = created.brand.id;

    await updateBrand(admin, id, { nameAr: 'اسم جديد' }, '1.2.3.4');

    const logs = await db.auditLog.findMany({
      where: { entity: 'Brand', entityId: id },
      orderBy: { createdAt: 'asc' },
    });

    expect(logs.map((l) => l.action)).toEqual(['brand.create', 'brand.update']);
    expect(logs[0]?.actorType).toBe('admin');
    expect(logs[0]?.actorId).toBe(admin.id);

    // التعديل يحمل «ماذا تغيّر» لا مجرّد «عُدِّل»
    const update = logs[1];
    expect((update?.before as { nameAr: string }).nameAr).toBe('ماركة اختبار');
    expect((update?.after as { nameAr: string }).nameAr).toBe('اسم جديد');
    expect(update?.ip).toBe('1.2.3.4');
  });
});

// ═══════════════════════════════════════════════════════════
//  الطرازات والفئات (A13)
// ═══════════════════════════════════════════════════════════

describe('الطرازات', () => {
  it('الاسمان إلزاميان هنا أيضًا', async () => {
    const brand = await createBrand(admin, input(), null);
    if (!brand.ok) throw new Error('لم تُنشأ');

    for (const bad of [{ nameAr: '' }, { nameEn: '' }, { nameAr: '  ' }]) {
      const result = await createModel(
        admin,
        { brandId: brand.brand.id, nameAr: 'كامري', nameEn: 'Camry', yearFrom: 2020, ...bad },
        null,
      );
      expect(result.ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('يرفض سنة نهاية قبل البداية — تنتج طرازًا لا يظهر لأي سنة', async () => {
    const brand = await createBrand(admin, input(), null);
    if (!brand.ok) throw new Error('لم تُنشأ');
    const result = await createModel(
      admin,
      { brandId: brand.brand.id, nameAr: 'ك', nameEn: 'C', yearFrom: 2024, yearTo: 2020 },
      null,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContainEqual({ field: 'yearTo', code: 'INVALID' });
  });

  it('لا يُحذف طراز له فئات', async () => {
    const brand = await createBrand(admin, input(), null);
    if (!brand.ok) throw new Error('لم تُنشأ');
    const model = await createModel(
      admin,
      { brandId: brand.brand.id, nameAr: 'ك', nameEn: 'C', yearFrom: 2020 },
      null,
    );
    if (!model.ok) throw new Error('لم يُنشأ');

    await createTrim(admin, {
      modelId: model.model.id, nameAr: 'LE', nameEn: 'LE', yearFrom: 2020,
      bodyType: 'SEDAN', transmission: 'AUTOMATIC', fuel: 'PETROL',
      drivetrain: 'FWD', seats: 5, doors: 4,
    }, null);

    const result = await deleteModel(admin, model.model.id, null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('HAS_TRIMS');
  });
});

describe('الفئات', () => {
  async function makeModel(): Promise<string> {
    const brand = await createBrand(admin, input(), null);
    if (!brand.ok) throw new Error('لم تُنشأ');
    const model = await createModel(
      admin,
      { brandId: brand.brand.id, nameAr: 'كامري', nameEn: 'Camry', yearFrom: 2018 },
      null,
    );
    if (!model.ok) throw new Error('لم يُنشأ');
    return model.model.id;
  }

  const base = (modelId: string) => ({
    modelId, nameAr: 'LE', nameEn: 'LE', yearFrom: 2020,
    bodyType: 'SEDAN' as const, transmission: 'AUTOMATIC' as const,
    fuel: 'PETROL' as const, drivetrain: 'FWD' as const, seats: 5, doors: 4,
  });

  it('يرفض مقاعد أو أبوابًا خارج المعقول', async () => {
    const modelId = await makeModel();
    for (const bad of [{ seats: 0 }, { seats: 99 }, { doors: 1 }, { doors: 9 }]) {
      const result = await createTrim(admin, { ...base(modelId), ...bad }, null);
      expect(result.ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('تعديل قيمة موروثة لا يمسّ مركبة منشورة — اللقطة صامدة', async () => {
    const modelId = await makeModel();
    const created = await createTrim(admin, base(modelId), null);
    if (!created.ok) throw new Error('لم تُنشأ');

    const model = await db.model.findUniqueOrThrow({ where: { id: modelId } });
    const owner = await db.user.findFirstOrThrow();
    const vehicle = await db.vehicle.create({
      data: {
        ownerId: owner.id, brandId: model.brandId, modelId, trimId: created.trim.id,
        brandName: 'ماركة', modelName: 'كامري', trimName: 'LE', year: 2022,
        bodyType: 'SEDAN', transmission: 'AUTOMATIC', fuel: 'PETROL',
        drivetrain: 'FWD', seats: 5, mileageKm: 1000, colorExterior: 'أبيض',
        spec: 'SAUDI', condition: 'USED', city: 'الرياض', entryMode: 'MANUAL',
      },
    });

    await updateTrim(admin, created.trim.id, { transmission: 'CVT', seats: 7 }, null);

    const after = await db.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    expect(after.transmission).toBe('AUTOMATIC');
    expect(after.seats).toBe(5);
  });

  it('لا تُحذف فئة لها مركبات', async () => {
    const modelId = await makeModel();
    const created = await createTrim(admin, base(modelId), null);
    if (!created.ok) throw new Error('لم تُنشأ');

    const model = await db.model.findUniqueOrThrow({ where: { id: modelId } });
    const owner = await db.user.findFirstOrThrow();
    await db.vehicle.create({
      data: {
        ownerId: owner.id, brandId: model.brandId, modelId, trimId: created.trim.id,
        brandName: 'ماركة', modelName: 'كامري', trimName: 'LE', year: 2022,
        bodyType: 'SEDAN', transmission: 'AUTOMATIC', fuel: 'PETROL',
        drivetrain: 'FWD', seats: 5, mileageKm: 1000, colorExterior: 'أبيض',
        spec: 'SAUDI', condition: 'USED', city: 'الرياض', entryMode: 'MANUAL',
      },
    });

    const result = await deleteTrim(admin, created.trim.id, null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('HAS_VEHICLES');
  });

  it('تُحذف فئة بلا مركبات، ويُكتب سجلّها', async () => {
    const modelId = await makeModel();
    const created = await createTrim(admin, base(modelId), null);
    if (!created.ok) throw new Error('لم تُنشأ');

    expect((await deleteTrim(admin, created.trim.id, null)).ok).toBe(true);
    const log = await db.auditLog.findFirst({
      where: { entity: 'Trim', entityId: created.trim.id, action: 'trim.delete' },
    });
    expect(log).not.toBeNull();
  });
});
