import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { db } from '@/lib/db';
import {
  addDealerVehicle,
  stockAging,
  validateAddVehicle,
  AGED_FALLBACK_DAYS,
  AGED_MIN_SAMPLE,
} from '@/lib/domain/dealer-stock';
import { dealerStock } from '@/lib/domain/dealer-dashboard';

/**
 * ═══ `D2b` — المعرضُ يُدخل مركبةً إلى مخزونه ═══
 *
 * قِيس ٢٠٢٦-١١-٢٦ أنّ **لا بابَ في اللوحة يضيف مركبة**: منادي
 * `createListing` الوحيد معالجُ البيع الشخصيّ، وجدولُ المخزون بلا زرّ.
 * وهذه تفحص أنّ ما دخل يظهر في مخزون معرضه **ولا يصير إعلانًا**.
 */

const made: string[] = [];

afterAll(async () => {
  if (made.length === 0) return;
  await db.vehicleCost.deleteMany({ where: { vehicleId: { in: made } } });
  await db.auditLog.deleteMany({ where: { entity: 'Vehicle', entityId: { in: made } } });
  await db.vehicle.deleteMany({ where: { id: { in: made } } });
});

async function sample() {
  const model = await db.model.findFirstOrThrow({
    where: { trims: { some: { visible: true } } },
    include: { trims: { where: { visible: true }, take: 1 } },
  });
  return {
    brandId: model.brandId,
    modelId: model.id,
    trimId: model.trims[0]!.id,
    year: 2023,
    mileageKm: 52_000,
    transmission: 'AUTOMATIC' as const,
    fuel: 'PETROL' as const,
    spec: 'SAUDI' as const,
    condition: 'USED' as const,
    city: 'جدة',
    colorExterior: 'أبيض',
    vin: null,
  };
}

describe('validateAddVehicle', () => {
  it('يفرق بين سعر شراء صفر وبين «لاحقا»', async () => {
    const vehicle = await sample();
    expect(validateAddVehicle({ vehicle, branchId: null, purchasePrice: null })).toEqual({});
    expect(validateAddVehicle({ vehicle, branchId: null, purchasePrice: 0 })).toEqual({});
    expect(
      validateAddVehicle({ vehicle, branchId: null, purchasePrice: -1 }).purchasePrice,
    ).toBe('INVALID');
  });

  it('يرفض سنة خارج المدى ولونا فارغا', async () => {
    const vehicle = await sample();
    expect(validateAddVehicle({ vehicle: { ...vehicle, year: 1890 }, branchId: null, purchasePrice: null }).year).toBe('INVALID');
    expect(
      validateAddVehicle({ vehicle: { ...vehicle, colorExterior: '  ' }, branchId: null, purchasePrice: null })
        .colorExterior,
    ).toBe('REQUIRED');
  });
});

describe('addDealerVehicle', () => {
  it('يدخل المركبة إلى مخزون المعرض ولا ينشئ إعلانا', async () => {
    const owner = await db.user.findFirstOrThrow({
      where: { dealerRole: 'OWNER', dealer: { status: 'ACTIVE' } },
      select: { id: true, dealerId: true },
    });
    const dealerId = owner.dealerId as string;

    const result = await addDealerVehicle(
      { userId: owner.id, dealerId },
      { vehicle: await sample(), branchId: null, purchasePrice: 92_000 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    made.push(result.vehicleId);

    const row = await db.vehicle.findUniqueOrThrow({
      where: { id: result.vehicleId },
      select: { dealerId: true, ownerId: true, listings: { select: { id: true } }, costs: true },
    });
    expect(row.dealerId).toBe(dealerId);
    /** **ولا إعلان** — المخزونُ قبل العرض (`ADR 0003`). */
    expect(row.listings).toEqual([]);
    /** وكلفةُ الشراء معها، فيبدأ الهامشُ من يومها. */
    expect(row.costs).toHaveLength(1);
    expect(row.costs[0]?.kind).toBe('PURCHASE');

    /** وتظهر في جدول مخزونه — لا في مرآبٍ شخصيّ. */
    const stock = await dealerStock(dealerId, null);
    const mine = stock.find((entry) => entry.vehicleId === result.vehicleId);
    expect(mine?.listingRef).toBeNull();
    expect(mine?.cost).toBe('92000.00');
    /** **وعمرُها اليوم صفر** — وهي الحال التي كشفت «لا أيام» في العمود. */
    expect(mine?.ageDays).toBe(0);
  });

  /** **والفرعُ فرعُه** — ومعرّفٌ من معرضٍ آخر يُسند مخزونًا لجيرانه. */
  it('يرفض فرعا ليس من فروع المعرض', async () => {
    const owner = await db.user.findFirstOrThrow({
      where: { dealerRole: 'OWNER', dealer: { status: 'ACTIVE' } },
      select: { id: true, dealerId: true },
    });
    const stranger = await db.branch.findFirst({
      where: { dealerId: { not: owner.dealerId as string } },
      select: { id: true },
    });
    if (stranger === null) return;

    const result = await addDealerVehicle(
      { userId: owner.id, dealerId: owner.dealerId as string },
      { vehicle: await sample(), branchId: stranger.id, purchasePrice: null },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('BRANCH_NOT_YOURS');
  });
});

/**
 * ═══ `D2c` — والنشرُ من خيارات المركبة ═══
 *
 * طلبُ المالك: «ضمن خيارات السياره يمكن نشرها». والمسارُ **يترجم لا
 * يقرّر**: `createListing` مدخلُ النشر الوحيد، وفيه حُرّاسُ الملفّ
 * والباقةِ وتوثيقِ السجلّ والصور. فيُفحص هنا أنّه لا ينسخ شرطًا، وأنّ
 * المركبة تصير معروضةً في مخزونه.
 */
describe('نشر مركبة من المخزون', () => {
  it('المسار لا ينسخ حارسا — ينادي مدخل النشر الوحيد', () => {
    const source = readFileSync('src/app/api/v1/dealer/vehicles/[id]/publish/route.ts', 'utf8');
    expect(source).toContain('createListing');
    /** ولا يفحص ما تفحصه هي: نسختان من حارسٍ تتباعدان. */
    expect(source).not.toContain('profileCompletion');
    expect(source).not.toContain('sellingAllowance');
    expect(source).not.toContain('verified');
    /** **والرسائلُ من الوحدة المشتركة** — لا نسخةٌ ثانية للمعرض. */
    expect(source).toContain('LISTING_FAILURE');
    /** **ومركبةُ معرضٍ آخر لا تُعرض** — والفرعُ يحدّ بائعَه. */
    expect(source).toContain('dealerId: actor.dealerId');
    expect(source).toContain('actor.branchId');
  });

  /** **ولا مزادَ من الدرج** — له إعداداتُه وشاشتُه. */
  it('الدرج يعرض البيع المباشر والتفاوض، ويقول أين المزاد', () => {
    const drawer = readFileSync('src/app/dealer/inventory/PublishDrawer.tsx', 'utf8');
    expect(drawer).toContain('ListingType.DIRECT');
    expect(drawer).toContain('ListingType.NEGOTIATION');
    expect(drawer).toContain('شاشة المزادات');
    /** **والأرضيّةُ تُعرض لصاحبها حيث يقرّرها** — وإلّا فاوض بلا علم. */
    expect(drawer).toContain('لا يراه المشتري');
  });

  /** ومركبةٌ معروضةٌ لا يُعرض عليها زرُّ عرضٍ ثانٍ — ولا يُنشر لها إعلانان. */
  it('زر العرض يختفي عن المعروضة', () => {
    const table = readFileSync('src/app/dealer/inventory/StockTable.tsx', 'utf8');
    expect(table).toContain("row.listingRef !== null ? null");
  });
});

/**
 * ═══ `D2d` — البحثُ والمخزونُ الراكد ═══
 *
 * «البحث برقم الشاص في لحظة» و«تحليل المخزون الراكد» يبيعهما المنافسون
 * باسميهما، وجدولُنا كان بلا بحثٍ ولا عتبة.
 */
describe('بحث المخزون', () => {
  it('البحث برقم اللوحة يرد صاحبه وحده — وشرط فارغ يرد الجدول كله', async () => {
    const owner = await db.user.findFirstOrThrow({
      where: { dealerRole: 'OWNER', dealer: { status: 'ACTIVE' } },
      select: { dealerId: true },
    });
    const dealerId = owner.dealerId as string;

    const all = await dealerStock(dealerId, null);
    const withPlate = all.find((row) => row.plate !== null);
    expect(withPlate).toBeDefined();
    if (withPlate === undefined) return;

    const digits = (withPlate.plate ?? '').replace(/\D/g, '');
    expect(digits.length).toBeGreaterThan(0);

    /**
     * **والعطلُ الذي كشفه المشي**: بحثٌ برقمٍ خالص كان ينتج حروفَ لوحةٍ
     * فارغة، و`contains: ''` صحيحٌ في SQL **ويردّ كلَّ صفّ** — فيبدو
     * أنّ البحث لا يعمل وهو يعمل على الجميع.
     */
    const found = await dealerStock(dealerId, null, { q: digits });
    expect(found.length).toBeLessThan(all.length);
    expect(found.every((row) => (row.plate ?? '').replace(/\D/g, '').includes(digits))).toBe(true);
  });

  it('والبحث بالاسم العربي يطابق لقطة الكتالوج', async () => {
    const owner = await db.user.findFirstOrThrow({
      where: { dealerRole: 'OWNER', dealer: { status: 'ACTIVE' } },
      select: { dealerId: true },
    });
    const dealerId = owner.dealerId as string;
    const all = await dealerStock(dealerId, null);
    const sample = all[0];
    if (sample === undefined) return;

    const brand = sample.title.split(' ')[0] as string;
    const found = await dealerStock(dealerId, null, { q: brand });
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((row) => row.title.includes(brand))).toBe(true);
  });
});

describe('المخزون الراكد', () => {
  it('العتبة من وسيط المعرض، وبلا تاريخ كاف تقول إنها حد معلن', async () => {
    const owner = await db.user.findFirstOrThrow({
      where: { dealerRole: 'OWNER', dealer: { status: 'ACTIVE' } },
      select: { dealerId: true },
    });
    const aging = await stockAging(owner.dealerId as string, null);

    expect(aging.thresholdDays).toBeGreaterThan(0);
    /** **ولا يُدّعى وسيطٌ على عيّنةٍ لا تصنعه.** */
    if (aging.sample < AGED_MIN_SAMPLE) {
      expect(aging.fromOwnMedian).toBe(false);
      expect(aging.thresholdDays).toBe(AGED_FALLBACK_DAYS);
    } else {
      expect(aging.fromOwnMedian).toBe(true);
    }
  });

  it('وترشيح الراكد يرد ما تجاوز العتبة وحده', async () => {
    const owner = await db.user.findFirstOrThrow({
      where: { dealerRole: 'OWNER', dealer: { status: 'ACTIVE' } },
      select: { dealerId: true },
    });
    const dealerId = owner.dealerId as string;
    const aging = await stockAging(dealerId, null);

    const all = await dealerStock(dealerId, null);
    const aged = await dealerStock(dealerId, null, { agedOverDays: aging.thresholdDays });

    expect(aged.every((row) => row.ageDays > aging.thresholdDays)).toBe(true);
    /**
     * **ولا يُصدَّق ترشيحٌ لا يُسقط شيئًا.** لو لم يكن في المخزون صفٌّ
     * دون العتبة وآخرُ فوقها لمرّ الفحصُ على ترشيحٍ لا يعمل — وهو شرطُ
     * «حدٌّ لا تبلغه البيانات» المسجَّل في هذا المستودع.
     */
    expect(all.some((row) => row.ageDays <= aging.thresholdDays)).toBe(true);
    expect(aged.length).toBeLessThan(all.length);
    expect(aged.length).toBeGreaterThan(0);
  });
});
