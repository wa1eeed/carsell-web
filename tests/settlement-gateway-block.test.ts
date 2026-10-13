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

const touched: string[] = [];

afterAll(async () => {
  if (touched.length > 0) {
    await db.payment.updateMany({
      where: { id: { in: touched } },
      data: { gatewayKey: 'bank_escrow' },
    });
  }
  await db.$disconnect();
});

/** طلبٌ محجوزٌ ماله — ونُعيد مرحلتَه وحالةَ دفعته بعد كل حالة. */
async function heldOrder() {
  return db.order.findFirstOrThrow({
    where: { payments: { some: { status: 'HELD' } } },
    select: {
      id: true, ref: true, stage: true, status: true,
      payments: { where: { status: 'HELD' }, select: { id: true, gatewayKey: true } },
    },
    orderBy: { ref: 'asc' },
  });
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
    const order = await heldOrder();
    const before = { stage: order.stage, status: order.status };

    await db.order.update({
      where: { id: order.id },
      data: { stage: 'DONE', status: 'ACTIVE' },
    });
    try {
      const queue = await settlementQueue();
      const row = queue.blocked.find((entry) => entry.orderRef === order.ref);
      expect(row?.blockedBy).toBe('GATEWAY_UNAVAILABLE');
      expect(queue.ready.some((entry) => entry.orderRef === order.ref)).toBe(false);
    } finally {
      await db.order.update({ where: { id: order.id }, data: before });
    }
  });

  /** **وحارسٌ في العميل ليس حارسًا** — النداء المباشر يُردّ كذلك. */
  it('والخادم يردّ الطلب لا الشاشة وحدها', async () => {
    const order = await heldOrder();
    const before = { stage: order.stage, status: order.status };

    await db.order.update({
      where: { id: order.id },
      data: { stage: 'DONE', status: 'ACTIVE' },
    });
    try {
      const result = await requestSettle('adm-probe', order.ref);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('GATEWAY_UNAVAILABLE');
    } finally {
      await db.order.update({ where: { id: order.id }, data: before });
    }
  });

  it('وبوابةٌ لها وصلة لا تحجب', async () => {
    const order = await heldOrder();
    const payment = order.payments[0];
    expect(payment).toBeDefined();
    if (payment === undefined) return;

    const before = { stage: order.stage, status: order.status };
    const servable = IMPLEMENTED_GATEWAYS[0];
    expect(servable).toBeDefined();

    touched.push(payment.id);
    await db.payment.update({ where: { id: payment.id }, data: { gatewayKey: servable } });
    await db.order.update({ where: { id: order.id }, data: { stage: 'DONE', status: 'ACTIVE' } });
    try {
      const queue = await settlementQueue();
      expect(queue.ready.some((entry) => entry.orderRef === order.ref)).toBe(true);
    } finally {
      await db.order.update({ where: { id: order.id }, data: before });
      await db.payment.update({ where: { id: payment.id }, data: { gatewayKey: payment.gatewayKey } });
      touched.pop();
    }
  });
});
