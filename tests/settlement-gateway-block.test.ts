import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { settlementQueue } from '@/lib/domain/settlement-queue';
import { requestSettle } from '@/lib/domain/payments';
import { IMPLEMENTED_GATEWAYS } from '@/lib/payments/resolve';

/**
 * ═══ موافقتان لا تُنفَقان على ما لا يقع ═══
 *
 * كلُّ المحجوز اليوم على `bank_escrow` ولا وصلة لها في المنتج. وشاشة
 * التسويات تقول «ويحتاج تحويل المبلغ موافقة شخصين… وعند الاعتماد يُنادى
 * المزوّد» — فيطلب عضوٌ ويعتمد ثانٍ، **ثمّ يسقط النداء**.
 *
 * **والترتيب يُقاس**: جعلتُ فحص البوابة أوّلًا فقرأ المشغّل «بوابة بلا
 * وصلة» على ثلاثة طلبات سببُها «لم تُؤكَّد الملكية» — فأخفى ما يُتصرَّف
 * فيه بما لا يُتصرَّف فيه بعد. فصار آخرًا: لا يُقال إلا حين يكون كلُّ
 * ما عداه صالحًا.
 */

/**
 * ═══ والطقمُ يصنع طلبَه ولا يستعيره ═══
 *
 * كان يأخذ «أوّلَ طلبٍ محجوزٍ ماله» من البذرة، فمرّ على ثلاث مِحَن:
 * أوّلًا صار أوّلُ المطابقين متنازَعًا عليه، ثمّ صار ضمانُه مردودًا
 * جزئيًّا، ثمّ **استهلكه طقمٌ آخر في التشغيل نفسِه** — أفرج عنه فصار
 * `SETTLED`، فسقط هذا بعده وبدا تقطّعًا.
 *
 * وكلُّ مرّةٍ كان العلاج شرطًا يُضاف إلى الاستعلام. **والعلّةُ في
 * الشكل**: صفٌّ مزروع موردٌ مشترك، ومن يشترط فيه حالًا يشترط ألّا
 * يلمسه أحد. فيُصنع هنا ويُحذف هنا.
 */
const made: string[] = [];

afterAll(async () => {
  for (const id of made) {
    await db.escrow.deleteMany({ where: { orderId: id } });
    await db.payment.deleteMany({ where: { orderId: id } });
    await db.order.deleteMany({ where: { id } });
  }
  await db.$disconnect();
});

/** بوّابةٌ لا وصلةَ لها — تُشتقّ ولا تُكتب، فالقائمة تتبدّل. */
const UNSERVABLE = ['bank_escrow', 'tap'].find((key) => !IMPLEMENTED_GATEWAYS.includes(key));

const TAG = `GWB${String(Date.now()).slice(-9)}`;

/**
 * طلبٌ جاهزٌ للإفراج بكلّ شروطه: مرحلةُ `DONE`، ولا نزاع، ودفعةٌ
 * محجوزة، **وضمانٌ محجوز** — فما يُقاس بعدها هو البوّابة وحدها.
 */
async function heldOrder(gatewayKey: string) {
  const seed = await db.order.findFirstOrThrow({
    orderBy: { ref: 'asc' },
    select: { listingId: true, buyerId: true, sellerId: true },
  });

  const order = await db.order.create({
    data: {
      ref: `${TAG}-${String(made.length)}`,
      listingId: seed.listingId,
      buyerId: seed.buyerId,
      sellerId: seed.sellerId,
      source: 'DIRECT',
      stage: 'DONE',
      status: 'COMPLETED',
      agreedPrice: 80_000,
      commissionPct: 2.5,
      commissionAmount: 2_000,
      sellerCommission: 2_000,
      buyerCommission: 0,
      transferFee: 350,
      vatAmount: 300,
      totalAmount: 80_650,
    },
  });
  made.push(order.id);

  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      purpose: 'VEHICLE_ESCROW',
      gatewayKey,
      environment: 'TEST',
      amount: 80_650,
      method: 'mada',
      status: 'HELD',
      holdRef: `${TAG}_h${String(made.length)}`,
      heldAt: new Date(),
    },
  });

  /** **ولا دفعةً محجوزةً بلا ضمانها** — `applyState` تكتبهما معًا. */
  await db.escrow.create({
    data: { orderId: order.id, amount: 80_650, status: 'HELD', heldAt: new Date(), gatewayRef: gatewayKey },
  });

  return { ...order, payments: [payment] };
}

describe('الإفراج والبوابة بلا وصلة', () => {
  it('السبب القابل للتصرّف يسبق البوابة', async () => {
    const queue = await settlementQueue();
    const notDone = queue.blocked.filter((row) => row.stage !== 'DONE');
    expect(notDone.length).toBeGreaterThan(0);

    // طلبٌ لم تُنقل ملكيّتُه فعلُه تأكيدُ النقل — لا البوابة
    for (const row of notDone) {
      expect(row.blockedBy, row.orderRef).not.toBe('GATEWAY_UNAVAILABLE');
    }
  });

  it('وبوابةٌ بلا وصلة تحجب طلبًا صار جاهزًا', async () => {
    expect(UNSERVABLE, 'لا بوّابةَ بلا وصلة — فلا شيء يُقاس').toBeDefined();
    if (UNSERVABLE === undefined) return;

    const order = await heldOrder(UNSERVABLE);
    const queue = await settlementQueue();
    const row = queue.blocked.find((entry) => entry.orderRef === order.ref);
    expect(row?.blockedBy).toBe('GATEWAY_UNAVAILABLE');
    expect(queue.ready.some((entry) => entry.orderRef === order.ref)).toBe(false);
  });

  /** **وحارسٌ في العميل ليس حارسًا** — النداء المباشر يُردّ كذلك. */
  it('والخادم يردّ الطلب لا الشاشة وحدها', async () => {
    if (UNSERVABLE === undefined) return;

    const order = await heldOrder(UNSERVABLE);
    const result = await requestSettle('adm-probe', order.ref);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('GATEWAY_UNAVAILABLE');
  });

  it('وبوابةٌ لها وصلة لا تحجب', async () => {
    const servable = IMPLEMENTED_GATEWAYS[0];
    expect(servable).toBeDefined();
    if (servable === undefined) return;

    const order = await heldOrder(servable);
    const queue = await settlementQueue();
    expect(queue.ready.some((entry) => entry.orderRef === order.ref)).toBe(true);
  });
});
