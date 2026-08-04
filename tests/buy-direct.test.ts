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
  const before = {
    status: listing.status,
    taxStatus: buyer.taxStatus,
    email: buyer.email,
    idVerified: buyer.idVerified,
  };

  /**
   * المشتري يُهيَّأ كما يصل إلى الشراء فعلًا: بريدٌ وتوثيق هوية. والشاشة
   * تقول «لن تستطيع الشراء قبل إكمالهما»، والحارس صار يقولها معها.
   */
  await db.user.update({
    where: { id: buyer.id },
    data: {
      email: buyer.email ?? `probe${buyer.id.slice(-6)}@carsell.one`,
      idVerified: true,
    },
  });

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
    await db.user.update({
      where: { id: buyer.id },
      data: {
        taxStatus: before.taxStatus,
        email: before.email,
        idVerified: before.idVerified,
      },
    });
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

describe('الوعد المعروض يُفرَض', () => {
  /**
   * **الحساب يقول «لن تستطيع الشراء قبل إكمال البريد وتوثيق الهوية».**
   * وكانت `canBuy` تُعرض ولا تُفرض — وعدٌ يقوله الحساب وينقضه الشراء.
   * والقاعدة في `profileCompletion` وحدها فلا تتباعد الشاشة والحارس.
   */
  it('ملفٌ ناقص يمنع الشراء', async () => {
    await withListing(async (ctx) => {
      const before = await db.user.findUniqueOrThrow({ where: { id: ctx.buyerId } });
      await db.user.update({
        where: { id: ctx.buyerId },
        data: { taxStatus: 'INDIVIDUAL', idVerified: false },
      });
      try {
        expect(await buyDirect({ listingRef: ctx.listingRef, buyerId: ctx.buyerId })).toEqual({
          ok: false,
          reason: 'PROFILE_INCOMPLETE',
        });
      } finally {
        await db.user.update({
          where: { id: ctx.buyerId },
          data: { idVerified: before.idVerified },
        });
      }
    });
  });
});

describe('والمهلة من إعداد الأدمن لا من ثابت', () => {
  /**
   * **قيمةٌ محفوظة لا يقرؤها أحد ليست إعدادًا.** والشاشة تعد المشغّل
   * بأن تعديله يسري — فيُقاس على صفٍّ حقيقيّ لا على القارئ وحده.
   *
   * والمهلة تُقرأ **عند الإنشاء** فتُخزَّن: تغييرُها بعدُ لا يحرّك
   * طلبًا قائمًا، وهو ما لا يقبله من دفع على وعدٍ سابق.
   */
  it('تعديل مهلة الدفع يغيّر `paymentDueAt` في طلبٍ جديد', async () => {
    const { setDeadline } = await import('../src/lib/domain/deadlines');
    await setDeadline({ key: 'paymentWindowHours', value: 72, adminId: 'test-admin', ip: null });

    try {
      await withListing(async (ctx) => {
        // الوضع الضريبيّ شرطٌ سابق — والطقم يستعيده ولا يضعه
        await db.user.update({
          where: { id: ctx.buyerId },
          data: { taxStatus: 'INDIVIDUAL' },
        });

        const now = new Date('2026-08-03T10:00:00.000Z');
        const result = await buyDirect(
          { listingRef: ctx.listingRef, buyerId: ctx.buyerId },
          now,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const order = await db.order.findUniqueOrThrow({ where: { ref: result.orderRef } });
        expect(order.paymentDueAt?.getTime()).toBe(now.getTime() + 72 * 3600 * 1000);
      });
    } finally {
      // الاختبار يعيد ما غيّره — وصفٌّ باقٍ يغيّر مهل كل اختبارٍ بعده
      await db.deadlineSetting.deleteMany({});
      await db.auditLog.deleteMany({ where: { actorId: 'test-admin' } });
    }
  });
});
