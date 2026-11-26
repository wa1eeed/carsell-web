import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { addDealerVehicle, validateAddVehicle } from '@/lib/domain/dealer-stock';
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
