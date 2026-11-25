import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { costBook, recordCost, vehicleMargin } from '@/lib/domain/vehicle-costs';

/**
 * ═══ دفترُ كلفة المركبة — مُدخَلُ الهامش وضريبته ═══
 *
 * قرار المالك ٢٠٢٦-١١-٢٥: «ابدأ بالأساس». وهذا أثقلُ الأساس: محرّكُ
 * ضريبة الهامش مبنيٌّ منذ المرحلة الأولى و**مُدخَلُه لم يكن موجودًا**.
 */

const stamp = String(Date.now()).slice(-9);
const made: { vehicles: string[] } = { vehicles: [] };

async function cleanup(): Promise<void> {
  if (made.vehicles.length > 0) {
    await db.vehicleCost.deleteMany({ where: { vehicleId: { in: made.vehicles } } });
    await db.vehicle.deleteMany({ where: { id: { in: made.vehicles } } });
  }
  made.vehicles = [];
}

afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

async function vehicle() {
  const source = await db.vehicle.findFirstOrThrow({ where: { listings: { some: {} } } });
  const { id: _id, createdAt: _c, vin: _v, overriddenFields: _o, ...shape } = source;
  const row = await db.vehicle.create({
    data: { ...shape, vin: `CST${stamp}${String(made.vehicles.length)}XXXX` },
  });
  made.vehicles.push(row.id);
  return row;
}

async function actor(): Promise<string> {
  return (await db.user.findFirstOrThrow({ where: { status: 'ACTIVE' } })).id;
}

describe('دفتر كلفة المركبة', () => {
  it('ولا هامش بلا سعر شراء — و`null` ليست صفرا', async () => {
    const car = await vehicle();
    const who = await actor();

    /** مصاريفُ بلا ثمنِ شراء لا تُنتج هامشًا — ولا تُقرأ «ربحًا كاملًا». */
    await recordCost({ vehicleId: car.id, kind: 'TRANSPORT', amount: 500, recordedById: who });
    expect(await vehicleMargin(car.id, 100_000)).toBeNull();

    const book = await costBook(car.id);
    expect(book.purchase).toBeNull();
    expect(book.addOns).toBe('500.00');
  });

  /**
   * **وسعرُ شراءٍ ثانٍ يضاعف الكلفة فيُنتج هامشًا سالبًا تُحسب عليه
   * ضريبة.** والفحصُ في الدالّة يقول السبب، والفهرسُ الجزئيّ في
   * القاعدة يمنع ما يفلت منه — فحارسٌ في مدخلٍ واحد ليس حارسًا.
   */
  it('وسعر شراء واحد للمركبة — في الدالة وفي القاعدة', async () => {
    const car = await vehicle();
    const who = await actor();

    expect((await recordCost({ vehicleId: car.id, kind: 'PURCHASE', amount: 80_000, recordedById: who })).ok).toBe(true);

    const second = await recordCost({ vehicleId: car.id, kind: 'PURCHASE', amount: 70_000, recordedById: who });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('PURCHASE_EXISTS');

    /** والقاعدةُ ترفضه ولو تُخطّيت الدالّة. */
    await expect(
      db.vehicleCost.create({
        data: {
          vehicleId: car.id, kind: 'PURCHASE', amount: new Prisma.Decimal(70_000),
          incurredAt: new Date(), recordedById: who,
        },
      }),
    ).rejects.toThrow();

    expect(await db.vehicleCost.count({ where: { vehicleId: car.id, kind: 'PURCHASE' } })).toBe(1);
  });

  it('والهامش = السعر − (الشراء وما بعده)', async () => {
    const car = await vehicle();
    const who = await actor();
    await recordCost({ vehicleId: car.id, kind: 'PURCHASE', amount: 80_000, recordedById: who });
    await recordCost({ vehicleId: car.id, kind: 'TRANSPORT', amount: 1_500, recordedById: who });
    await recordCost({ vehicleId: car.id, kind: 'DETAILING', amount: 500, recordedById: who });

    const book = await costBook(car.id);
    expect(book.total).toBe('82000.00');

    const margin = await vehicleMargin(car.id, 95_000);
    expect(margin).not.toBeNull();
    expect(margin?.margin).toBe(13_000);
    expect(margin?.taxable).toBe(13_000);
  });

  /**
   * **وبيعٌ بخسارة لا يُنتج ضريبةً مستردّة.** الهامشُ السالب يبقى
   * بإشارته في التقارير، والخاضعُ للضريبة صفر.
   */
  it('والخسارة لا تنتج ضريبة مستردة', async () => {
    const car = await vehicle();
    const who = await actor();
    await recordCost({ vehicleId: car.id, kind: 'PURCHASE', amount: 90_000, recordedById: who });

    const margin = await vehicleMargin(car.id, 85_000);
    expect(margin?.margin).toBe(-5_000);
    expect(margin?.taxable).toBe(0);
  });

  it('والكلفة موجبة — فلا سطر سالب يعدل الهامش', async () => {
    const car = await vehicle();
    const who = await actor();
    const bad = await recordCost({ vehicleId: car.id, kind: 'TRANSPORT', amount: -500, recordedById: who });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('AMOUNT_INVALID');
  });
});
