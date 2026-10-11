import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { cancelOrder } from '@/lib/domain/order-cancel';
import { withOrder } from './helpers/order-fixture';

/**
 * ═══ إلغاء الطلب ═══
 *
 * العطل الذي وُلد منه هذا الملف: **`OrderStatus.CANCELLED` بلا كاتب.**
 * المخطّط يعرّفه، ولوحة الأدمن تعدّه، و`cancelReason` تُقرأ في تفصيل
 * الطلب — ولا شيء في المنتج يكتبه. **وشروطُنا المنشورة تَعِد به**،
 * فمن دفع ثم احتاج الإلغاء كان يفتح نزاعًا على ما ليس خلافًا.
 */

afterAll(async () => {
  await db.$disconnect();
});

describe('من يملك الإلغاء', () => {
  it('غير الطرفين لا يلغي', async () => {
    await withOrder(async (order) => {
      const stranger = await db.user.findFirstOrThrow({
        where: { id: { notIn: [order.buyerId, order.sellerId] } },
        select: { id: true },
      });

      expect(
        await cancelOrder({ orderRef: order.ref, actorId: stranger.id, reason: 'لا شأن لي' }),
      ).toEqual({ ok: false, reason: 'NOT_PARTY' });
    });
  });

  /**
   * **والسبب إلزاميّ**: إلغاءٌ بلا سببٍ يُقرأ بعد شهر ولا يُعرف أكان
   * خطأً أم انسحابًا — وهو أوّل ما يُسأل عنه في نزاعٍ لاحق.
   */
  it('بلا سببٍ مكتوب يُرفض', async () => {
    await withOrder(async (order) => {
      expect(
        await cancelOrder({ orderRef: order.ref, actorId: order.buyerId, reason: '  ' }),
      ).toEqual({ ok: false, reason: 'REASON_REQUIRED' });
    });
  });

  it('طلبٌ غير موجود يعيد سببًا لا يرمي', async () => {
    expect(
      await cancelOrder({ orderRef: 'ORD-NOPE-0000', actorId: 'x', reason: 'تجربة' }),
    ).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});

describe('ما بعد الإفراج لا يُلغى', () => {
  /**
   * **والمال عند البائع.** طلبٌ أُفرج عن ضمانه بيعٌ وقع — ومسارُه
   * نزاعٌ لا إلغاء. وزرٌّ يردّ ٤٠٩ بعد الضغط أسوأ من غيابه.
   */
  it('ضمانٌ مُفرَجٌ عنه يمنع الإلغاء', async () => {
    await withOrder(async (order) => {
      await db.order.update({
        where: { id: order.id },
        data: { stage: 'DONE', status: 'ACTIVE' },
      });
      await db.escrow.upsert({
        where: { orderId: order.id },
        create: { orderId: order.id, amount: order.totalAmount, status: 'RELEASED' },
        update: { status: 'RELEASED' },
      });

      expect(
        await cancelOrder({ orderRef: order.ref, actorId: order.buyerId, reason: 'غيّرت رأيي' }),
      ).toEqual({ ok: false, reason: 'TRANSFER_DONE' });
    });
  });

  it('الطلب المتنازَع عليه مجمَّد', async () => {
    await withOrder(async (order) => {
      await db.order.update({ where: { id: order.id }, data: { status: 'DISPUTED' } });

      expect(
        await cancelOrder({ orderRef: order.ref, actorId: order.buyerId, reason: 'غيّرت رأيي' }),
      ).toEqual({ ok: false, reason: 'DISPUTED' });
    });
  });
});

describe('الإلغاء يقع', () => {
  it('يكتب السبب ومن ألغى، ويعيد الإعلان معروضًا', async () => {
    await withOrder(async (order) => {
      await db.order.update({
        where: { id: order.id },
        data: { stage: 'PAYMENT', status: 'ACTIVE' },
      });
      await db.escrow.deleteMany({ where: { orderId: order.id } });
      await db.listing.update({ where: { id: order.listingId }, data: { status: 'RESERVED' } });

      const result = await cancelOrder({
        orderRef: order.ref,
        actorId: order.buyerId,
        reason: 'وجدتُ مركبةً أنسب',
      });
      expect(result).toMatchObject({ ok: true });

      const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.status).toBe('CANCELLED');
      expect(after.cancelReason).toBe('وجدتُ مركبةً أنسب');
      /** «المشتري انسحب» غير «البائع اعتذر» — فمن ألغى يُكتب. */
      expect(after.cancelledBy).toBe(order.buyerId);

      /**
       * **والإعلان يعود معروضًا**: مركبةٌ تبقى `RESERVED` بعد إلغاء
       * طلبها لا يراها أحد ولا يشتريها — فيخسر البائع بيعًا بسبب
       * انسحاب مشترٍ.
       */
      const listing = await db.listing.findUniqueOrThrow({ where: { id: order.listingId } });
      expect(listing.status).toBe('PUBLISHED');
    });
  });

  it('لا يُلغى مرّتين', async () => {
    await withOrder(async (order) => {
      await db.order.update({
        where: { id: order.id },
        data: { stage: 'PAYMENT', status: 'ACTIVE' },
      });
      await db.escrow.deleteMany({ where: { orderId: order.id } });

      expect(
        await cancelOrder({ orderRef: order.ref, actorId: order.buyerId, reason: 'انسحبت' }),
      ).toMatchObject({ ok: true });

      expect(
        await cancelOrder({ orderRef: order.ref, actorId: order.buyerId, reason: 'انسحبت' }),
      ).toEqual({ ok: false, reason: 'ALREADY_CLOSED' });
    });
  });
});
