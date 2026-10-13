import { afterAll, describe, expect, it } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { sellerBook } from '@/lib/domain/seller-book';
import { formatPercent } from '@/lib/arabic';
import { withOrder } from './helpers/order-fixture';

/**
 * ═══ «صافي ما استُحقّ لك ١٥٣٬٧٤٥» والمحجوز ٧٤٬٢٠٥ ═══
 *
 * قِيس على شاشة بائعٍ مزروع: البطاقات الثلاث فوق تقول محتجز ٧٤٬٢٠٥ ·
 * جاهز صفر · حُوِّل صفر، والإجمالي تحتها يقول ١٥٣٬٧٤٥. **رقمان في شاشة
 * مالٍ واحدة لا يلتقيان**، والفرق طلبٌ عند مرحلة «موافقة» لم يدفع
 * المشتري فيه ريالًا — وقد يُلغى غدًا فيتبخّر.
 *
 * والدفتر يعترف بالإيراد عند `HELD` (`recordOrderPaid`)، فالبيان يتبع
 * الحدث نفسه — وإلّا صار لرقمٍ واحد مصدران يتباعدان.
 */

afterAll(async () => {
  await db.$disconnect();
});

describe('دفتر البائع لا يعدّ ما لم يُقبض', () => {
  it('طلبٌ بلا ضمان لا يدخل المبيعات ولا المستحقّ، ويُقال إنه لم يدخل', async () => {
    await withOrder(async (order) => {
      // طلبٌ قائم بلا دفعة — وهو الحال الذي كان يُحسب مبيعًا
      await db.escrow.deleteMany({ where: { orderId: order.id } });
      await db.order.update({
        where: { id: order.id },
        data: { stage: 'APPROVED', status: 'ACTIVE' },
      });

      const book = await sellerBook(order.sellerId);
      const line = book.lines.find((row) => row.orderRef === order.ref);

      /** يبقى في القائمة — فهي بابُ البائع إلى طلبه */
      expect(line).toBeDefined();
      /** **والمانع يُسمّى**: لا ملكيةَ تُنقل قبل أن يدفع المشتري */
      expect(line?.blockedBy).toBe('AWAITING_PAYMENT');

      /**
       * **ولا يدخل الإجمالي — بالقيمة لا بالنصّ.**
       *
       * «لا يحوي الرقم» فحصٌ يسقط صدفةً (رقمٌ عشوائيّ يحوي الرقم)،
       * فالمقارنة على المجموع المحسوب من المقبوض وحده.
       */
      expect(book.awaitingPayment.count).toBeGreaterThan(0);

      const collected = await db.order.findMany({
        where: {
          sellerId: order.sellerId,
          status: { in: ['ACTIVE', 'COMPLETED'] },
          escrow: { is: { status: { not: 'PENDING' } } },
        },
        select: { agreedPrice: true },
      });
      const expected = collected.reduce(
        (sum, row) => sum.plus(row.agreedPrice),
        new Prisma.Decimal(0),
      );
      expect(book.totals.sales).toBe(expected.toFixed(2));
    });
  });

  /**
   * **والبطاقات تلتقي بالإجمالي.** ما استُحقّ عبر التاريخ لا يقلّ عمّا
   * هو محتجزٌ الآن: المحتجز جزءٌ منه لا شيءٌ خارجه.
   */
  it('والمستحقّ لا يقلّ عن المحتجز', async () => {
    const seller = await db.order.findFirst({
      where: { escrow: { status: 'HELD' } },
      select: { sellerId: true },
    });
    if (seller === null) return;

    const book = await sellerBook(seller.sellerId);
    expect(new Prisma.Decimal(book.totals.earned).greaterThanOrEqualTo(book.held)).toBe(true);
  });
});

/**
 * ═══ والإشارة للفرق لا للمستوى ═══
 *
 * «+٥٠٪ اكتمال الملف» — ونصفُ ملفٍ ليس زيادةً على شيء. والتصميم يفرّق
 * حرفيًّا: «+١٤٪» و«−٣٪» للفروق، و«٩٤٪» و«٥٨٪» للمستويات.
 */
describe('صياغة النسبة', () => {
  it('المستوى بلا إشارة', () => {
    expect(formatPercent(50, 'ar')).toBe('50٪');
    expect(formatPercent(94, 'en')).toBe('94%');
  });

  it('والفرق بإشارته', () => {
    expect(formatPercent(14, 'ar', { signed: true })).toBe('+14٪');
    expect(formatPercent(-3, 'ar', { signed: true })).toBe('−3٪');
    /** والصفر لا إشارة له في الحالين — «+٠٪» تقول صعودًا لم يقع */
    expect(formatPercent(0, 'ar', { signed: true })).toBe('0٪');
  });
});
