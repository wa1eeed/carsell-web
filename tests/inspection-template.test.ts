import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  activeTemplate,
  addCategory,
  addItem,
  removeCategory,
  removeItem,
  updateCategory,
  updateItem,
} from '@/lib/domain/admin-inspection-template';
import { ensureDraft, draftView, saveDraftResult } from '@/lib/domain/inspection-draft';
import type { AdminUser, ServiceProvider } from '@/generated/prisma/client';

/**
 * ═══ القالبُ يُحرَّر — وحذفُ بندٍ يمحو جوابَ فاحص ═══
 *
 * `InspectionDraftResult.item` بـ`onDelete: Cascade`، فحذفُ بندٍ
 * أُجيب عنه **يمحو الجواب بلا أثر** ويجعل مسودّةً جارية ناقصةً بلا
 * سبب. وهذه تقيس الحارس — والعددَ الذي يُقال بدل «لا يمكن».
 */

let admin: AdminUser;
let inspector: ServiceProvider;
let version: number;
const madeItems: string[] = [];
const madeRefs: string[] = [];
const madeCategories: string[] = [];

beforeAll(async () => {
  admin = await db.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
  inspector = await db.serviceProvider.findFirstOrThrow({
    where: { type: 'INSPECTION' },
    orderBy: { id: 'asc' },
  });
  version = (await activeTemplate())?.version ?? 1;
});

/** **والاختبارُ يعيد ما غيّره** — والإصدارُ منه. */
afterEach(async () => {
  if (madeItems.length > 0) {
    await db.inspectionDraftResult.deleteMany({ where: { itemId: { in: madeItems } } });
    await db.inspectionItem.deleteMany({ where: { id: { in: madeItems } } });
    madeItems.length = 0;
  }
  if (madeRefs.length > 0) {
    const rows = await db.serviceRequest.findMany({
      where: { ref: { in: madeRefs } },
      select: { id: true },
    });
    const ids = rows.map((row) => row.id);
    await db.inspectionDraft.deleteMany({ where: { serviceRequestId: { in: ids } } });
    await db.serviceRequest.deleteMany({ where: { id: { in: ids } } });
    madeRefs.length = 0;
  }
  if (madeCategories.length > 0) {
    await db.inspectionItem.deleteMany({ where: { categoryId: { in: madeCategories } } });
    await db.inspectionCategory.deleteMany({ where: { id: { in: madeCategories } } });
    madeCategories.length = 0;
  }
  await db.auditLog.deleteMany({ where: { entity: 'InspectionItem' } });
  await db.auditLog.deleteMany({ where: { entity: 'InspectionCategory' } });
  const template = await activeTemplate();
  if (template !== null) {
    await db.inspectionTemplate.update({ where: { id: template.id }, data: { version } });
  }
});

async function firstCategory(): Promise<{ id: string; itemId: string }> {
  const template = await activeTemplate();
  const category = template?.categories[0];
  const item = category?.items[0];
  if (category === undefined || item === undefined) throw new Error('لا قالب');
  return { id: category.id, itemId: item.id };
}

describe('التحريرُ يرفع الإصدار', () => {
  it('تعديلُ وزنِ قسمٍ يرفعه', async () => {
    const { id } = await firstCategory();
    const before = (await activeTemplate())?.version ?? 0;

    expect((await updateCategory({ categoryId: id, weight: 3, adminId: admin.id, ip: null })).ok)
      .toBe(true);

    const after = await activeTemplate();
    expect(after?.version).toBe(before + 1);
    expect(after?.categories[0]?.weight).toBe(3);

    await updateCategory({ categoryId: id, weight: 1, adminId: admin.id, ip: null });
  });

  it('ووزنٌ دون واحدٍ يُرفض — فالقسمُ لا يخرج من الحساب بوزنٍ صفر', async () => {
    const { id } = await firstCategory();
    const result = await updateCategory({ categoryId: id, weight: 0, adminId: admin.id, ip: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('BAD_WEIGHT');
  });

  it('وإضافةُ بندٍ تزيد العدّاد وتُكتب في التدقيق', async () => {
    const { id } = await firstCategory();
    const before = (await activeTemplate())?.totalItems ?? 0;

    const added = await addItem({
      categoryId: id,
      nameAr: 'بندُ اختبار',
      nameEn: 'Probe item',
      inputType: 'STATUS',
      unit: null,
      isCritical: false,
      adminId: admin.id,
      ip: null,
    });
    expect(added.ok).toBe(true);
    if (added.ok && added.itemId !== undefined) madeItems.push(added.itemId);

    expect((await activeTemplate())?.totalItems).toBe(before + 1);
    const log = await db.auditLog.findFirst({
      where: { entity: 'InspectionItem', action: 'inspection.item_added' },
    });
    expect(log).not.toBeNull();
  });

  it('ووسمُ بندٍ حرجًا يظهر في العدّاد', async () => {
    const { itemId } = await firstCategory();
    const before = (await activeTemplate())?.criticalItems ?? 0;

    await updateItem({ itemId, isCritical: true, adminId: admin.id, ip: null });
    expect((await activeTemplate())?.criticalItems).toBe(before + 1);

    await updateItem({ itemId, isCritical: false, adminId: admin.id, ip: null });
    expect((await activeTemplate())?.criticalItems).toBe(before);
  });
});

describe('والحذفُ يُرفض ما دام أحدٌ أجاب', () => {
  it('بندٌ بلا أجوبة يُحذف', async () => {
    const { id } = await firstCategory();
    const added = await addItem({
      categoryId: id, nameAr: 'بندٌ يُحذف', nameEn: 'Gone',
      inputType: 'STATUS', unit: null, isCritical: false,
      adminId: admin.id, ip: null,
    });
    if (!added.ok || added.itemId === undefined) throw new Error('لم يُضَف');

    expect((await removeItem({ itemId: added.itemId, adminId: admin.id, ip: null })).ok).toBe(true);
  });

  /**
   * **والجوابُ يُمحى بالسلسلة** — فمسودّةٌ جارية تصير ناقصةً ولا يعرف
   * صاحبُها لماذا. والعددُ يُقال لا «لا يمكن».
   */
  it('وبندٌ أُجيب عنه يُرفض حذفُه بعدد أجوبته', async () => {
    const { id } = await firstCategory();
    const added = await addItem({
      categoryId: id, nameAr: 'بندٌ مُجاب', nameEn: 'Answered',
      inputType: 'STATUS', unit: null, isCritical: false,
      adminId: admin.id, ip: null,
    });
    if (!added.ok || added.itemId === undefined) throw new Error('لم يُضَف');
    madeItems.push(added.itemId);

    const service = await db.service.findFirstOrThrow({
      where: { providerType: 'INSPECTION' }, select: { id: true },
    });
    const listing = await db.listing.findFirstOrThrow({
      where: { status: 'PUBLISHED' }, select: { id: true, vehicleId: true, sellerId: true },
    });
    const ref = `SRV-T-${String(Date.now()).slice(-9)}`;
    madeRefs.push(ref);
    await db.serviceRequest.create({
      data: {
        ref, serviceId: service.id, userId: listing.sellerId, sellerId: listing.sellerId,
        listingId: listing.id, vehicleId: listing.vehicleId, status: 'IN_PROGRESS',
        providerId: inspector.id, amount: 575, adminFee: 50, vatAmount: 75, city: 'الرياض',
      },
    });

    await ensureDraft({ ref, providerId: inspector.id, providerUserId: null });
    await saveDraftResult({
      ref, providerId: inspector.id, itemId: added.itemId,
      state: 'PASS', value: null, note: null,
    });

    const result = await removeItem({ itemId: added.itemId, adminId: admin.id, ip: null });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('HAS_ANSWERS');
      expect(result.count).toBe(1);
    }

    /** **والجوابُ باقٍ** — فالرفضُ حرسه لا أخّره. */
    const view = await draftView(ref, inspector.id);
    const still = view?.categories[0]?.items.find((row) => row.id === added.itemId);
    expect(still?.state).toBe('PASS');
  });
});

/**
 * ═══ وقسمٌ يُضاف ويُقاعَد — وكان التحريرُ نصفَه ═══
 *
 * `updateCategory` و`addItem` و`removeItem` مبنيّةٌ منذ نُقل القالب،
 * **ولا إضافةَ قسمٍ ولا حذفُه** — فالمشغّل يُعيد تسمية قسمٍ ولا يفتح
 * قسمًا. (قرار المالك ٢٠٢٦-١٠-١٨.)
 */
describe('أقسامُ القالب', () => {
  it('يُضاف قسمٌ بمفتاحٍ مولَّدٍ لاتينيّ، ويرتفع الإصدار', async () => {
    const before = (await activeTemplate())?.version ?? 0;

    const created = await addCategory({
      adminId: admin.id,
      ip: null,
      nameAr: 'الزجاج والمرايا',
      nameEn: 'Glass and mirrors',
      weight: 2,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || created.categoryId === undefined) throw new Error('لم يُضَف');
    madeCategories.push(created.categoryId);

    const row = await db.inspectionCategory.findUniqueOrThrow({
      where: { id: created.categoryId },
      select: { key: true, nameAr: true, weight: true, sort: true },
    });
    /** **والمفتاحُ لاتينيٌّ يُولَّد** — فلا يكتبه مشغّلٌ بالعربية فيكسر المطابقة. */
    expect(row.key).toMatch(/^[a-z0-9_]+$/);
    expect(row.nameAr).toBe('الزجاج والمرايا');
    expect(row.weight).toBe(2);

    const after = (await activeTemplate())?.version ?? 0;
    expect(after).toBeGreaterThan(before);
  });

  it('والمفتاحُ لا يصطدم بقسمٍ قائم', async () => {
    const first = await addCategory({
      adminId: admin.id, ip: null, nameAr: 'فحصٌ إضافيّ', nameEn: 'Extra check', weight: 1,
    });
    const second = await addCategory({
      adminId: admin.id, ip: null, nameAr: 'فحصٌ إضافيّ آخر', nameEn: 'Extra check', weight: 1,
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error('لم يُضافا');
    madeCategories.push(first.categoryId ?? '', second.categoryId ?? '');

    const keys = await db.inspectionCategory.findMany({
      where: { id: { in: [first.categoryId ?? '', second.categoryId ?? ''] } },
      select: { key: true },
    });
    expect(new Set(keys.map((row) => row.key)).size).toBe(2);
  });

  /**
   * **ولا يُحذف قسمٌ فيه بند.** الحذفُ يمحو بنودَه بالسلسلة ومعها كلُّ
   * جوابٍ عنها في كل مسودّة — فالشرطُ أغلظُ من شرط البند، والعددُ يُقال.
   */
  it('ولا يُحذف قسمٌ فيه بند — ويُقال عددُه', async () => {
    const created = await addCategory({
      adminId: admin.id, ip: null, nameAr: 'قسمٌ للقياس', nameEn: 'Measured', weight: 1,
    });
    if (!created.ok || created.categoryId === undefined) throw new Error('لم يُضَف');
    madeCategories.push(created.categoryId);

    const item = await addItem({
      adminId: admin.id,
      ip: null,
      categoryId: created.categoryId,
      nameAr: 'بندٌ للقياس',
      nameEn: 'Measured point',
      inputType: 'STATUS',
      unit: null,
      isCritical: false,
    });
    expect(item.ok).toBe(true);

    const blocked = await removeCategory({
      adminId: admin.id, ip: null, categoryId: created.categoryId,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.reason).toBe('HAS_ITEMS');
      expect(blocked.count).toBe(1);
    }

    /** ويُفرَّغ ثمّ يُحذف — فلا يمرّ محوٌ جماعيّ تحت نقرةٍ واحدة. */
    if (item.ok && item.itemId !== undefined) {
      expect((await removeItem({ adminId: admin.id, ip: null, itemId: item.itemId })).ok).toBe(true);
    }
    const gone = await removeCategory({
      adminId: admin.id, ip: null, categoryId: created.categoryId,
    });
    expect(gone.ok).toBe(true);
    madeCategories.length = 0;
  });
});
