import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { buyDirect } from '@/lib/domain/orders';
import { computeOrderAmounts } from '@/lib/domain/order-amounts';

afterAll(async () => {
  await db.$disconnect();
});

/** يُعيد الإعلان والمشتري إلى حالهما مهما فعل الجسد أو رمى. */
async function withListing(
  body: (ctx: { listingRef: string; buyerId: string; sellerId: string; price: number }) => Promise<void>,
): Promise<void> {
  const listing = await db.listing.findFirstOrThrow({
    where: { status: 'PUBLISHED', type: { not: 'AUCTION' } },
    orderBy: { ref: 'asc' },
  });
  const buyer = await db.user.findFirstOrThrow({
    where: { dealerId: null, id: { not: listing.sellerId } },
  });
  const before = { status: listing.status, taxStatus: buyer.taxStatus };

  try {
    await body({
      listingRef: listing.ref,
      buyerId: buyer.id,
      sellerId: listing.sellerId,
      price: Number(listing.askPrice),
    });
  } finally {
    const orders = await db.order.findMany({
      where: { listingId: listing.id, source: 'DIRECT' },
      select: { id: true },
    });
    const ids = orders.map((row) => row.id);
    if (ids.length > 0) {
      await db.orderEvent.deleteMany({ where: { orderId: { in: ids } } });
      await db.order.deleteMany({ where: { id: { in: ids } } });
    }
    await db.listing.update({ where: { id: listing.id }, data: { status: before.status } });
    await db.user.update({ where: { id: buyer.id }, data: { taxStatus: before.taxStatus } });
  }
}

describe('الشراء المباشر', () => {
  /**
   * **الوضع الضريبيّ شرطٌ قبل الشراء لا بعده.** واكتشافُه بعد إنشاء
   * الطلب يترك طلبًا معلّقًا بمهلة تجري على مشترٍ لم يُكمل.
   */
  it('لا يُنشئ طلبًا قبل تحديد الوضع الضريبي', async () => {
    await withListing(async (ctx) => {
      await db.user.update({ where: { id: ctx.buyerId }, data: { taxStatus: null } });
      const result = await buyDirect({ listingRef: ctx.listingRef, buyerId: ctx.buyerId });
      expect(result).toEqual({ ok: false, reason: 'TAX_STATUS_REQUIRED' });
      // ولا أثر على هذا الإعلان — لا طلب ولا حجز
      const listing = await db.listing.findUniqueOrThrow({ where: { ref: ctx.listingRef } });
      expect(listing.status).toBe('PUBLISHED');
      expect(
        await db.order.count({ where: { listingId: listing.id, source: 'DIRECT' } }),
      ).toBe(0);
    });
  });

  it('يُنشئ طلبًا عند الدفع، ويحجز الإعلان في المعاملة نفسها', async () => {
    await withListing(async (ctx) => {
      await db.user.update({ where: { id: ctx.buyerId }, data: { taxStatus: 'INDIVIDUAL' } });
      const result = await buyDirect({ listingRef: ctx.listingRef, buyerId: ctx.buyerId });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const order = await db.order.findUniqueOrThrow({ where: { ref: result.orderRef } });
      expect(order.stage).toBe('PAYMENT');
      expect(order.source).toBe('DIRECT');
      expect(order.paymentDueAt).not.toBeNull();

      // الإعلان محجوز — وبقاؤه معروضًا يبيع المركبة مرّتين
      const listing = await db.listing.findUniqueOrThrow({ where: { ref: ctx.listingRef } });
      expect(listing.status).toBe('RESERVED');
    });
  });

  /**
   * **قاعدة المال تُكتب مرّة**: الطلب المباشر والطلب من عرضٍ مقبول
   * يحسبان بالدالّة نفسها — واختلافهما يعني قاعدتين تتباعدان.
   */
  it('مبالغه هي مبالغ القاعدة المشتركة بعينها', async () => {
    await withListing(async (ctx) => {
      await db.user.update({ where: { id: ctx.buyerId }, data: { taxStatus: 'INDIVIDUAL' } });
      const expected = await computeOrderAmounts(db, ctx.price);
      const result = await buyDirect({ listingRef: ctx.listingRef, buyerId: ctx.buyerId });
      if (!result.ok) throw new Error('expected success');

      const order = await db.order.findUniqueOrThrow({ where: { ref: result.orderRef } });
      expect(order.commissionAmount.toString()).toBe(expected.commissionAmount.toString());
      expect(order.transferFee.toString()).toBe(expected.transferFee.toString());
      expect(order.transferAdminFee.toString()).toBe(expected.transferAdminFee.toString());
      expect(order.processingFee.toString()).toBe(expected.processingFee.toString());
      expect(order.vatAmount.toString()).toBe(expected.vatAmount.toString());
      expect(order.totalAmount.toString()).toBe(expected.totalAmount.toString());
    });
  });

  /**
   * **طلبٌ حيٌّ واحد للإعلان.** واثنان يعنيان مهلتَي دفعٍ على مركبةٍ
   * واحدة: من يدفع أوّلًا يأخذها ومن يدفع ثانيًا يُسترجع.
   */
  it('لا يُنشئ طلبًا ثانيًا على إعلانٍ له طلب حيّ', async () => {
    await withListing(async (ctx) => {
      await db.user.update({ where: { id: ctx.buyerId }, data: { taxStatus: 'INDIVIDUAL' } });
      expect((await buyDirect({ listingRef: ctx.listingRef, buyerId: ctx.buyerId })).ok).toBe(true);
      expect(await buyDirect({ listingRef: ctx.listingRef, buyerId: ctx.buyerId })).toEqual({
        ok: false,
        reason: 'ORDER_EXISTS',
      });
      const listing = await db.listing.findUniqueOrThrow({ where: { ref: ctx.listingRef } });
      expect(
        await db.order.count({ where: { listingId: listing.id, source: 'DIRECT' } }),
      ).toBe(1);
    });
  });

  it('البائع لا يشتري إعلانه', async () => {
    await withListing(async (ctx) => {
      await db.user.update({ where: { id: ctx.sellerId }, data: { taxStatus: 'INDIVIDUAL' } });
      expect(await buyDirect({ listingRef: ctx.listingRef, buyerId: ctx.sellerId })).toEqual({
        ok: false,
        reason: 'OWN_LISTING',
      });
      await db.user.update({ where: { id: ctx.sellerId }, data: { taxStatus: null } });
    });
  });
});
