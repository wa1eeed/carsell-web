import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { db } from '@/lib/db';
import { advanceStage } from '@/lib/domain/orders';
import { cancelOrder } from '@/lib/domain/order-cancel';
import { withOrder } from './helpers/order-fixture';

/**
 * ═══ رحلةُ الطلب كانت صامتة ═══
 *
 * العطل الذي وُلد منه هذا الملف **قِيس لا لوحظ**: تسعةٌ وعشرون قالبًا
 * من واحدٍ وأربعين في `notification-templates.json` بلا كاتب — ورحلةُ
 * الطلب كلّها منها. فمشترٍ يَطلب مركبةً فتُحجَز على صاحبها وتُرفض
 * عروضُها القائمة **ولا يصل البائع سطرٌ واحد**، ويُدفع المال في الضمان
 * ويُفرَج عنه ويكتمل البيع — والجرس لا يرنّ مرّة.
 *
 * **والاختبار يفحص المستلم لا العدد.** «كُتب إشعار» صادقةٌ لو أُرسل إلى
 * الطرف الخطأ، وهو الخطأ الذي يقع: من فعل الفعل يُخطَر ومن ينتظر لا.
 */

afterAll(async () => {
  await db.$disconnect();
});

type Template = { key: string; channelInApp: boolean; bodyAr: string | null };

const TEMPLATES: readonly Template[] = JSON.parse(
  readFileSync(new URL('../prisma/seed-data/notification-templates.json', import.meta.url), 'utf8'),
) as Template[];

async function sent(ref: string, since: Date): Promise<{ key: string; userId: string }[]> {
  const rows = await db.notification.findMany({
    where: { entityType: 'Order', entityId: ref, createdAt: { gte: since } },
    select: { templateKey: true, userId: true },
  });
  return rows.map((row) => ({ key: row.templateKey, userId: row.userId }));
}

describe('تقدّم المرحلة يُخطِر من ينتظر', () => {
  /**
   * **ومن ضغط الزرّ لا يُخطَر.** رأى نتيجته على شاشته، ورسالةٌ تقول له
   * ما فعله للتوّ ضجيجٌ يُدرِّب على تجاهل الجرس.
   */
  it('يصل الطرف الآخر وحده', async () => {
    await withOrder(async (order) => {
      // طلبٌ في مرحلته الأولى — فالتقدّم خطوةٌ واحدة إلى الأمام
      await db.order.update({
        where: { id: order.id },
        data: { stage: 'REQUEST', status: 'ACTIVE' },
      });

      const since = new Date();
      const moved = await advanceStage({
        orderRef: order.ref,
        actorId: order.sellerId,
        to: 'APPROVED',
      });
      expect(moved).toEqual({ ok: true, stage: 'APPROVED' });

      const rows = await sent(order.ref, since);
      expect(rows).toEqual([{ key: 'order.stage_changed', userId: order.buyerId }]);
    });
  });
});

describe('الإلغاء يُخطِر من لم يُلغِ', () => {
  it('ألغى المشتري فيصل البائع', async () => {
    await withOrder(async (order) => {
      await db.order.update({
        where: { id: order.id },
        data: { stage: 'REQUEST', status: 'ACTIVE' },
      });

      const since = new Date();
      const done = await cancelOrder({
        orderRef: order.ref,
        actorId: order.buyerId,
        reason: 'انسحبت قبل الدفع',
      });
      expect(done.ok).toBe(true);

      const rows = await sent(order.ref, since);
      expect(rows.filter((row) => row.key === 'order.cancelled')).toEqual([
        { key: 'order.cancelled', userId: order.sellerId },
      ]);
    });
  });
});

/**
 * ═══ والمفتاح المكتوب له قالبٌ يُعرض ═══
 *
 * البوابة ٣٧ تفحص هذا على `src/lib/domain` كلّها، وهذا الفحص يحرس
 * **المفاتيح التي تخصّ الطلب باسمها**: فلو حُذف قالبٌ منها أو أُطفئت
 * قناتُه بقي الإشعار يُكتب ويصل سطرًا فارغًا.
 */
describe('قوالب رحلة الطلب', () => {
  const JOURNEY = [
    'order.received',
    'order.created',
    'order.stage_changed',
    'order.cancelled',
    'escrow.held',
    'escrow.released',
    'listing.sold',
  ] as const;

  it('كلٌّ له قالبٌ معروضٌ بنصّ', () => {
    for (const key of JOURNEY) {
      const template = TEMPLATES.find((row) => row.key === key);
      expect(template, key).toBeDefined();
      expect(template?.channelInApp, key).toBe(true);
      expect(template?.bodyAr ?? '', key).not.toBe('');
    }
  });

  /**
   * **ونصُّ «التفاصيل في التطبيق» ليس نصًّا.** الإشعار يُقرأ في سطره
   * ويُقرَّر عليه؛ وجملةٌ تُحيل إلى مكانٍ آخر تُنفق نظرةَ المستلم
   * ولا تعطيه شيئًا — وكانت نصَّ كل قالبٍ غير موصول.
   */
  it('ولا يُحيل إلى التطبيق بدل أن يقول', () => {
    for (const key of JOURNEY) {
      const body = TEMPLATES.find((row) => row.key === key)?.bodyAr ?? '';
      expect(body, key).not.toContain('التفاصيل في التطبيق');
    }
  });
});

/**
 * ═══ والفاتورة المحجوبة تُقال ═══
 *
 * «فاتورة ضريبية — يصدر عند الإفراج عن المبلغ» صادقةٌ قبل الإفراج،
 * **وبعده وعدٌ بموعدٍ مضى**: أُفرج ولم تصدر، فينتظر المشتري ورقةً لن
 * تأتي ولا يعرف أنه ينتظر. و`BLOCKED` معرَّفة في النوع منذ كُتب ولا
 * شيء يكتبها، والسبب مكتوبٌ في `invoice.blocked` يقرؤه الأدمن وحده.
 */
describe('مستندات الطلب بعد التسوية', () => {
  it('الفاتورة التي لم تصدر تُقال محجوبةً بسببها لا قادمةً بموعدها', async () => {
    const { orderDocuments } = await import('@/lib/domain/documents');

    const settled = await db.order.findFirst({
      where: { settlement: { isNot: null }, taxInvoices: { none: {} } },
      select: { ref: true, buyerId: true },
    });
    // لا طلبَ مسوّىً بلا فاتورة في هذه القاعدة — ولا شيء يُقاس
    if (settled === null) return;

    const docs = await orderDocuments(settled.ref, settled.buyerId);
    const invoice = docs?.find((doc) => doc.kind === 'INVOICE');

    expect(invoice?.state).toBe('BLOCKED');
    /** **ولا يُقال «يصدر عند الإفراج»** وقد أُفرج. */
    expect(invoice?.availableAt).toBeNull();
  });
});
