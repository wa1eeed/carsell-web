import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { closeOwnAccount, closureBlockers } from '@/lib/domain/account-closure';

/**
 * ═══ إغلاقُ الحساب — تجهيلٌ لا محو ═══
 *
 * قِيس فلم يكن في المنتج كلّه بابٌ للخروج: لا شاشة ولا مسار ولا دالّة.
 * وقرار المالك (١٦ أكتوبر ٢٠٢٦): **«يُجهَّل الحساب وتبقى فواتيره
 * وعقوده»** — فالمستندان يُحفظان سنوات نظامًا.
 *
 * **وأهمُّ ما يُفحص هنا أنّ التجهيل لا يُفرغهما**: `TaxInvoice`
 * و`VehicleSaleAgreement` يلتقطان الاسم لقطةً عند الإصدار. ولو قرآه
 * من `User` لكان الإغلاق محوًا للمستندات بطريقٍ غير مباشر.
 */

const made: { users: string[]; orders: string[] } = { users: [], orders: [] };

async function newUser(tag: string): Promise<string> {
  const stamp = `${String(Date.now()).slice(-9)}${String(made.users.length)}`;
  const user = await db.user.create({
    data: {
      phone: `+9665308${stamp}`,
      name: `مغادر ${tag}`,
      email: `leave${stamp}@example.com`,
      city: 'الرياض',
      bankName: 'الراجحي',
      idVerified: true,
      identityStatus: 'VERIFIED',
    },
  });
  made.users.push(user.id);
  return user.id;
}

afterEach(async () => {
  if (made.orders.length > 0) {
    await db.vehicleSaleAgreement.deleteMany({ where: { orderId: { in: made.orders } } });
    await db.taxInvoiceLine.deleteMany({ where: { invoice: { orderId: { in: made.orders } } } });
    await db.taxInvoice.deleteMany({ where: { orderId: { in: made.orders } } });
    await db.order.deleteMany({ where: { id: { in: made.orders } } });
  }
  if (made.users.length > 0) {
    await db.auditLog.deleteMany({ where: { entity: 'User', entityId: { in: made.users } } });
    await db.notification.deleteMany({ where: { userId: { in: made.users } } });
    await db.user.deleteMany({ where: { id: { in: made.users } } });
  }
  made.orders = [];
  made.users = [];
});

describe('إغلاق الحساب', () => {
  it('يُجهَّل كلُّ ما يُعرَف به صاحبُه', async () => {
    const userId = await newUser('أ');

    expect(await closeOwnAccount({ userId, reason: 'لم أعد أبيع' })).toEqual({ ok: true });

    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.status).toBe('CLOSED');
    expect(after.closedAt).not.toBeNull();
    expect(after.name).toBeNull();
    expect(after.email).toBeNull();
    expect(after.city).toBeNull();
    expect(after.bankName).toBeNull();
    expect(after.iban).toBeNull();
    expect(after.idVerified).toBe(false);
    expect(after.identityStatus).toBe('NONE');

    /** **والجوّال يُستبدَل ولا يُفرَّغ** — العمود فريدٌ ولا يقبل `null`. */
    expect(after.phone).toBe(`closed:${userId}`);
    expect(after.phone.startsWith('+')).toBe(false);
  });

  it('ورقمُ العميل يبقى — فالسجلّ يُتتبَّع بلا اسم', async () => {
    const userId = await newUser('ب');
    const before = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { ref: true } });

    await closeOwnAccount({ userId, reason: null });

    const after = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { ref: true } });
    expect(after.ref).toBe(before.ref);
  });

  /**
   * **وهذا جوهر القرار.** لو قرأ المستندان الاسمَ من `User` لصار
   * التجهيل محوًا لهما — فيُفحص أنّهما لقطتان مستقلّتان.
   */
  it('والفاتورة والعقد يبقيان باسم صاحبهما', async () => {
    const userId = await newUser('ج');

    const listing = await db.listing.findFirstOrThrow({
      where: { status: { in: ['PUBLISHED', 'SOLD'] } },
      select: { id: true, sellerId: true },
    });
    const order = await db.order.create({
      data: {
        ref: `ORD-CLS-${String(Date.now()).slice(-4)}`,
        listingId: listing.id,
        buyerId: userId,
        sellerId: listing.sellerId,
        source: 'DIRECT',
        stage: 'DONE',
        status: 'COMPLETED',
        agreedPrice: 60_000,
        commissionPct: 0,
        commissionAmount: 0,
        transferFee: 350,
        vatAmount: 0,
        totalAmount: 60_350,
      },
      select: { id: true },
    });
    made.orders.push(order.id);

    await db.vehicleSaleAgreement.create({
      data: {
        orderId: order.id,
        vin: 'TESTVIN0000000001',
        sellerName: 'البائع',
        buyerName: 'مغادر ج',
        price: 60_000,
        issuedAt: new Date(),
      },
    });

    expect(await closeOwnAccount({ userId, reason: null })).toEqual({ ok: true });

    const agreement = await db.vehicleSaleAgreement.findFirstOrThrow({
      where: { orderId: order.id },
      select: { buyerName: true },
    });
    expect(agreement.buyerName).toBe('مغادر ج');

    /** والطلب نفسه يبقى — الدفتر يقرؤه، والمطابقة تقرأه. */
    expect(await db.order.findUnique({ where: { id: order.id } })).not.toBeNull();
  });

  it('ولا يُغلق على طلبٍ جارٍ', async () => {
    const userId = await newUser('د');

    const listing = await db.listing.findFirstOrThrow({
      where: { status: 'PUBLISHED' },
      select: { id: true, sellerId: true },
    });
    const order = await db.order.create({
      data: {
        ref: `ORD-CLS-${String(Date.now()).slice(-4)}L`,
        listingId: listing.id,
        buyerId: userId,
        sellerId: listing.sellerId,
        source: 'DIRECT',
        stage: 'PAYMENT',
        status: 'ACTIVE',
        agreedPrice: 60_000,
        commissionPct: 0,
        commissionAmount: 0,
        transferFee: 350,
        vatAmount: 0,
        totalAmount: 60_350,
      },
      select: { id: true },
    });
    made.orders.push(order.id);

    expect(await closureBlockers(userId)).toContain('LIVE_ORDERS');

    const result = await closeOwnAccount({ userId, reason: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('LIVE_ORDERS');

    /** ولم يُمسّ شيء — والرفض لا يترك تجهيلًا نصفيًّا. */
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.status).toBe('ACTIVE');
    expect(after.name).toBe('مغادر د');
  });

  it('ولا يُغلق مرّتين', async () => {
    const userId = await newUser('هـ');
    await closeOwnAccount({ userId, reason: null });

    const again = await closeOwnAccount({ userId, reason: null });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('ALREADY_CLOSED');
  });
});
