import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { findViewableListing, toPublicDetail } from '@/lib/domain/listing-detail';
import { withOrder } from './helpers/order-fixture';

/**
 * ═══ المحجوز والمباع يُعرضان — ولا يُشتريان ═══
 *
 * العطل الذي وُلد منه هذا الملف: **صفحتُهما كانت ٤٠٤.** فمن دفع للتوّ
 * لا يستطيع إعادة فتح صفحة المركبة التي اشتراها — والرابط في تاريخه
 * وفي بريده وفي طلبه. **وكل رابطٍ مفهرس يموت عند أوّل بيع.**
 *
 * وكشفه قياس المطابقة: شاشةُ `Wc` صارت ٤٠٤ بعد أن قُبل عرضٌ على
 * إعلانها في مشيٍ يدويّ — فظهر أن الحال ليست خاصّةً بالمشي.
 */

afterAll(async () => {
  await db.$disconnect();
});

describe('ما يُعرض وما لا يُعرض', () => {
  it('المحجوز والمباع يُفتحان، والمسودّة والموقوف لا', async () => {
    await withOrder(async (order) => {
      const { ref } = await db.listing.findUniqueOrThrow({
        where: { id: order.listingId },
        select: { ref: true },
      });

      for (const status of ['PUBLISHED', 'RESERVED', 'SOLD'] as const) {
        await db.listing.update({ where: { id: order.listingId }, data: { status } });
        expect(await findViewableListing(ref), status).not.toBeNull();
      }

      /**
       * **وهذه ٤٠٤ بحقّ**: المسودّة لم تُنشر، والمراجَع لم يُعتمد،
       * والموقوف أوقفته الإدارة — ولا حقّ لزائرٍ في رؤية أيٍّ منها.
       */
      for (const status of ['DRAFT', 'PENDING_REVIEW', 'SUSPENDED'] as const) {
        await db.listing.update({ where: { id: order.listingId }, data: { status } });
        expect(await findViewableListing(ref), status).toBeNull();
      }
    });
  });

  /**
   * **والحالة تصل الشاشة.** بدونها تعرض الصفحة مركبةً مباعة بزرّ
   * «اشترِ الآن» — فيضغط المشتري ويردّ الخادم، فيظنّ أن العطل فيه.
   */
  it('الحالة تخرج في التفصيل العام', async () => {
    await withOrder(async (order) => {
      await db.listing.update({ where: { id: order.listingId }, data: { status: 'SOLD' } });
      const { ref } = await db.listing.findUniqueOrThrow({
        where: { id: order.listingId },
        select: { ref: true },
      });

      const row = await findViewableListing(ref);
      expect(row).not.toBeNull();
      const detail = await toPublicDetail(row!);
      expect(detail.status).toBe('SOLD');

      /** والسرّ لا يخرج مهما تغيّرت الحالة — القاعدة ٨. */
      const serialised = JSON.stringify(detail);
      expect(serialised).not.toContain('reservePrice');
      expect(serialised).not.toContain('minAcceptPrice');
    });
  });
});
