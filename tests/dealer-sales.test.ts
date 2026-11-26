import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { branchResults, recordSale, sellerResults } from '@/lib/domain/dealer-sales';

/**
 * ═══ واقعةُ البيع — نتيجةُ الفرع ومبيعاتُ المندوب ═══
 *
 * طلبُ المالك: «نتيجةُ كلّ فرع» و«مبيعاتُ كلّ مندوب». والسؤالان كانا بلا
 * جوابٍ في المخزَّن: بيعةُ المنضدة فاتورةٌ وخروجُ مركبة بلا فرعٍ ولا بائع،
 * وبيعةُ السوق طلبٌ بلا مندوب.
 */

const madeSales: string[] = [];
const madeBranches: string[] = [];
const madeExpenses: string[] = [];

afterAll(async () => {
  if (madeSales.length > 0) {
    await db.dealerSale.deleteMany({ where: { id: { in: madeSales } } });
  }
  if (madeExpenses.length > 0) {
    await db.dealerExpense.deleteMany({ where: { id: { in: madeExpenses } } });
  }
  if (madeBranches.length > 0) {
    await db.branch.deleteMany({ where: { id: { in: madeBranches } } });
  }
});

/** نافذةُ القياس — بعيدةٌ عن الشهر الجاري فلا تخلط مزروعًا بمصنوع. */
const FROM = new Date(Date.UTC(2031, 0, 1));
const TO = new Date(Date.UTC(2031, 1, 1));
const AT = new Date(Date.UTC(2031, 0, 15));

describe('recordSale', () => {
  it('لا يثبت بيعتين لواقعة واحدة', async () => {
    const vehicle = await db.vehicle.findFirstOrThrow({
      where: { dealerId: { not: null } },
      select: { id: true, dealerId: true },
    });
    const order = await db.order.findFirstOrThrow({ select: { id: true } });

    const fact = {
      dealerId: vehicle.dealerId as string,
      branchId: null,
      vehicleId: vehicle.id,
      channel: 'MARKET' as const,
      soldById: null,
      price: '50000.00',
      buyerName: null,
      invoiceId: null,
      orderId: order.id,
    };

    /** **وويبهوكٌ يُعاد أو ضغطةٌ مكرّرة** — والمفتاحُ الفريد يمنع الثانية. */
    await recordSale(db, fact, AT);
    await recordSale(db, fact, AT);

    const rows = await db.dealerSale.findMany({
      where: { orderId: order.id },
      select: { id: true },
    });
    madeSales.push(...rows.map((row) => row.id));
    expect(rows).toHaveLength(1);
  });
});

describe('branchResults', () => {
  it('يبقي فرعا بلا مبيعات، ويجمع الإيراد والكلفة والمصروف', async () => {
    const dealer = await db.dealer.findFirstOrThrow({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    const vehicle = await db.vehicle.findFirstOrThrow({
      where: { dealerId: dealer.id },
      select: { id: true, costs: { select: { amount: true } } },
    });

    const [sold, quiet] = await Promise.all([
      db.branch.create({
        data: { dealerId: dealer.id, name: 'فرع قياس باع', city: 'الرياض' },
        select: { id: true },
      }),
      db.branch.create({
        data: { dealerId: dealer.id, name: 'فرع قياس صامت', city: 'جدة' },
        select: { id: true },
      }),
    ]);
    madeBranches.push(sold.id, quiet.id);

    const sale = await db.dealerSale.create({
      data: {
        dealerId: dealer.id,
        branchId: sold.id,
        vehicleId: vehicle.id,
        channel: 'COUNTER',
        soldById: null,
        price: '120000.00',
        soldAt: AT,
      },
      select: { id: true },
    });
    madeSales.push(sale.id);

    const spend = await db.dealerExpense.create({
      data: {
        dealerId: dealer.id,
        branchId: sold.id,
        kind: 'RENT',
        amount: '8000.00',
        spentAt: AT,
        note: 'قياس',
        recordedById: (
          await db.user.findFirstOrThrow({
            where: { dealerId: dealer.id, dealerRole: 'OWNER' },
            select: { id: true },
          })
        ).id,
      },
      select: { id: true },
    });
    madeExpenses.push(spend.id);

    const rows = await branchResults(dealer.id, FROM, TO);
    const soldRow = rows.find((row) => row.branchId === sold.id);
    const quietRow = rows.find((row) => row.branchId === quiet.id);

    expect(soldRow?.sales).toBe(1);
    expect(soldRow?.revenue).toBe('120000.00');
    expect(soldRow?.expenses).toBe('8000.00');
    /** والكلفةُ من دفتر المركبة لا من لقطةٍ مجمَّدة. */
    const cost = vehicle.costs.reduce((total, line) => total + Number(line.amount), 0);
    expect(Number(soldRow?.cost)).toBeCloseTo(cost, 2);
    /** **وكم مركبةً بلا كلفة** — فمجموعٌ ناقصٌ يُقرأ كاملًا. */
    expect(soldRow?.withoutCost).toBe(vehicle.costs.length === 0 ? 1 : 0);

    /**
     * **وفرعٌ لم يبع يبقى في الجدول** — وهو الصفُّ الذي وُضع الجدولُ
     * لأجله: قائمةٌ مشتقّةٌ من البيعات تُسقطه.
     */
    expect(quietRow).toBeDefined();
    expect(quietRow?.sales).toBe(0);
    expect(quietRow?.revenue).toBe('0');
  });
});

describe('sellerResults', () => {
  it('يعد كل عضو يبيع ولو لم يبع', async () => {
    const owner = await db.user.findFirstOrThrow({
      where: { dealerRole: 'OWNER', dealer: { status: 'ACTIVE' } },
      select: { id: true, dealerId: true },
    });
    const dealerId = owner.dealerId as string;

    const before = await sellerResults(dealerId, FROM, TO);
    const mine = before.find((row) => row.userId === owner.id);
    expect(mine, 'المالك عضوٌ يبيع فيجب أن يظهر').toBeDefined();
    expect(mine?.sales).toBe(0);

    const vehicle = await db.vehicle.findFirstOrThrow({
      where: { dealerId },
      select: { id: true },
    });
    const sale = await db.dealerSale.create({
      data: {
        dealerId,
        branchId: null,
        vehicleId: vehicle.id,
        channel: 'COUNTER',
        soldById: owner.id,
        price: '75000.00',
        soldAt: AT,
      },
      select: { id: true },
    });
    madeSales.push(sale.id);

    const after = await sellerResults(dealerId, FROM, TO);
    const counted = after.find((row) => row.userId === owner.id);
    expect(counted?.sales).toBe(1);
    expect(counted?.revenue).toBe('75000.00');
  });
});
