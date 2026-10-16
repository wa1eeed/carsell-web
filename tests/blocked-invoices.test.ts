import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { blockedInvoices } from '@/lib/domain/admin-tax';

/**
 * ═══ المنع غيرُ الانتظار ═══
 *
 * `/admin/tax` كان يقول «لا فواتير بعد · تصدر عند التسوية المؤكَّدة» —
 * وتُقرأ «لم تقع تسوية». وقد وقعت وحُجبت الفاتورة: `issueSettlementDocuments`
 * تبني `blocked` وتقول أيّ توريدٍ لم يُفوتَر ولماذا، ويُكتب حدثًا على
 * الطلب — **ولا يصل الشاشة التي يقف عندها من يراقب الامتثال**، وهو لا
 * يعرف أيّ طلبٍ يفتح أصلًا. وأوّلُ مطابقةٍ شهرية تكشف فرقًا بلا جواب.
 */

const made: string[] = [];

afterAll(async () => {
  // الاختبار يعيد ما صنعه — والحدث على كيانٍ مشترك
  if (made.length > 0) await db.orderEvent.deleteMany({ where: { id: { in: made } } });
  await db.$disconnect();
});

describe('الفواتير المحجوبة تُقرأ في شاشة الضريبة', () => {
  it('تُعاد بمرجع الطلب وسطورها', async () => {
    const order = await db.order.findFirst({ select: { id: true, ref: true } });
    expect(order).not.toBeNull();
    if (order === null) return;

    const event = await db.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'invoice.blocked',
        actorType: 'system',
        payload: {
          blocked: [
            { supplyType: 'VEHICLE', reason: 'RULE_AWAITING_APPROVAL' },
            { supplyType: 'DISBURSEMENT', reason: 'OUT_OF_SCOPE_NO_INVOICE' },
          ],
        },
      },
      select: { id: true },
    });
    made.push(event.id);

    const rows = await blockedInvoices();
    const row = rows.find((entry) => entry.orderRef === order.ref);
    expect(row).toBeDefined();
    expect(row?.lines).toEqual([
      { supplyType: 'VEHICLE', reason: 'RULE_AWAITING_APPROVAL' },
      { supplyType: 'DISBURSEMENT', reason: 'OUT_OF_SCOPE_NO_INVOICE' },
    ]);
  });

  /**
   * **وحمولةٌ مشوّهة لا تُسقط الشاشة.** الحدث يُكتب منذ بُني المنتج،
   * وقد يُقرأ بعد تغيّر شكله — وشاشةٌ تسقط على حدثٍ قديم أسوأ من سطرٍ
   * يقول «سببٌ غير معروف».
   */
  it('وحمولةٌ ناقصة تُقرأ ولا ترمي', async () => {
    const order = await db.order.findFirst({ select: { id: true, ref: true } });
    if (order === null) return;

    const event = await db.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'invoice.blocked',
        actorType: 'system',
        payload: { blocked: [{ supplyType: 'VEHICLE' }, {}] },
      },
      select: { id: true },
    });
    made.push(event.id);

    const rows = await blockedInvoices();
    const row = rows.find((entry) => entry.orderRef === order.ref);
    expect(row?.lines.some((line) => line.reason === 'UNKNOWN')).toBe(true);
  });

  /**
   * **والحكم على الصفّ المعنيّ لا على القائمة كلّها.**
   *
   * كان يفحص `blockedInvoices()` فارغةً تمامًا — وقاعدةُ المركبة
   * تنتظر إقرارًا رسميًّا، فـ**كلُّ بيعةٍ تكتمل في المنتج تكتب حجبًا
   * صحيحًا**. فأوّل صفقةٍ حقيقية تُسقط الاختبار، وهو يقيس بياناتِ
   * جيرانه لا ما صنعه هو. (وقد أسقطتها أوّلُ رحلةِ شراءٍ مُشيت
   * بالنقر: `ORD-2026-1013`.)
   */
  it('وما حُذف حجبُه يخرج من القائمة', async () => {
    const order = await db.order.findFirst({ select: { ref: true } });
    if (order === null) return;

    if (made.length > 0) await db.orderEvent.deleteMany({ where: { id: { in: made } } });
    made.length = 0;

    const rows = await blockedInvoices();
    expect(rows.find((entry) => entry.orderRef === order.ref)).toBeUndefined();
  });
});
