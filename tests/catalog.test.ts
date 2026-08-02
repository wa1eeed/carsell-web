import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  createBrand,
  deleteBrand,
  setBrandVisibility,
  slugify,
  updateBrand,
} from '@/lib/domain/catalog';
import type { AdminUser } from '@/generated/prisma/client';

const PREFIX = 'test-brand-';
let admin: AdminUser;

async function cleanup(): Promise<void> {
  const brands = await db.brand.findMany({ where: { slug: { startsWith: PREFIX } } });
  for (const brand of brands) {
    await db.vehicle.deleteMany({ where: { brandId: brand.id } });
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
