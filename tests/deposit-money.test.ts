import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { forfeitDeposit, holdDeposit, settleDeposits } from '@/lib/domain/auctions';

/**
 * ═══ العربون مالٌ لا وسم ═══
 *
 * كان `holdDeposit` يكتب صفًّا بـ`HELD` ولا يمرّ ببوابة — فالمزايدة
 * ليست التزامًا، و`forfeitDeposit` تصادر رقمًا في جدولنا.
 * وقرار المالك: **الحجز ببطاقة، والمُصادَر للمنصّة**.
 */

const made: {
  auctions: string[]; users: string[]; listings: string[]; vehicles: string[];
  bids: string[]; orderRefs: string[];
} = {
  auctions: [], users: [], listings: [], vehicles: [], bids: [], orderRefs: [],
};

async function scaffold(): Promise<{ auctionId: string; ref: string; bidderId: string }> {
  const admin = await db.adminUser.findFirst({ select: { id: true } });
  await db.paymentRoute.updateMany({
    where: { purpose: 'AUCTION_DEPOSIT' },
    data: {
      gatewayKey: 'sandbox', environment: 'TEST', enabled: true,
      ...(admin === null ? {} : { updatedBy: admin.id }),
    },
  });

  const stamp = `${String(Date.now()).slice(-9)}${String(made.auctions.length)}`;
  const [seller, bidder] = await Promise.all([
    db.user.create({ data: { phone: `+9665401${stamp}` } }),
    db.user.create({ data: { phone: `+9665402${stamp}` } }),
  ]);
  made.users.push(seller.id, bidder.id);

  const model = await db.model.findFirstOrThrow({ include: { brand: true } });
  const vehicle = await db.vehicle.create({
    data: {
      ownerId: seller.id, brandId: model.brandId, modelId: model.id,
      brandName: model.brand.nameAr, modelName: model.nameAr, year: 2023,
      bodyType: 'SEDAN', transmission: 'AUTOMATIC', fuel: 'PETROL', drivetrain: 'FWD',
      seats: 5, mileageKm: 30_000, colorExterior: 'أبيض', spec: 'SAUDI',
      condition: 'USED', city: 'الرياض', entryMode: 'MANUAL',
    },
  });
  made.vehicles.push(vehicle.id);

  const listing = await db.listing.create({
    data: {
      ref: `DEP${stamp}`, vehicleId: vehicle.id, sellerId: seller.id, type: 'AUCTION',
      status: 'PUBLISHED', askPrice: 80_000, city: 'الرياض', publishedAt: new Date(),
    },
  });
  made.listings.push(listing.id);

  const now = Date.now();
  const auction = await db.auction.create({
    data: {
      listingId: listing.id, status: 'LIVE',
      startsAt: new Date(now - 3_600_000), endsAt: new Date(now + 3_600_000),
      startPrice: 50_000, bidIncrement: 500, depositAmount: 5_000,
    },
  });
  made.auctions.push(auction.id);

  return { auctionId: auction.id, ref: listing.ref, bidderId: bidder.id };
}

afterEach(async () => {
  const rows = await db.deposit.findMany({
    where: { auctionId: { in: made.auctions } },
    select: { paymentId: true },
  });
  const payments = rows.map((r) => r.paymentId).filter((id): id is string => id !== null);
  /**
   * **والقيد يُحذف بمعاملته لا بملاحظته.** صارت المصادرة تكتب مرجع
   * الإعلان بدل الثابت `deposit.forfeited`، فحذفٌ بالثابت يترك
   * معاملةً كاملة — وقد تسرّبت خمسةُ آلافٍ إلى دفتر التطوير فعلًا.
   */
  const forfeits = await db.ledgerEntry.findMany({
    where: { event: 'deposit.forfeited', paymentId: { in: payments } },
    select: { txnId: true },
    distinct: ['txnId'],
  });
  if (forfeits.length > 0) {
    await db.ledgerEntry.deleteMany({
      where: { txnId: { in: forfeits.map((row) => row.txnId) } },
    });
  }

  /**
   * **والأثر الجديد يُتبَع في الاستعادة.** صار الطقم يُنشئ طلبًا
   * وقيودًا ومزايدات، وتركُها يُسقط جيرانه في التشغيل التالي.
   */
  if (made.orderRefs.length > 0) {
    const orders = await db.order.findMany({
      where: { ref: { in: made.orderRefs } },
      select: { id: true },
    });
    const ids = orders.map((row) => row.id);
    await db.ledgerEntry.deleteMany({ where: { orderId: { in: ids } } });
    await db.orderEvent.deleteMany({ where: { orderId: { in: ids } } });
    await db.notification.deleteMany({ where: { userId: { in: made.users } } });
    await db.order.deleteMany({ where: { id: { in: ids } } });
  }
  if (made.bids.length > 0) await db.bid.deleteMany({ where: { auctionId: { in: made.bids } } });
  await db.deposit.deleteMany({ where: { auctionId: { in: made.auctions } } });
  if (payments.length > 0) await db.payment.deleteMany({ where: { id: { in: payments } } });
  await db.auction.deleteMany({ where: { id: { in: made.auctions } } });
  await db.listing.deleteMany({ where: { id: { in: made.listings } } });
  await db.vehicle.deleteMany({ where: { id: { in: made.vehicles } } });
  await db.user.deleteMany({ where: { id: { in: made.users } } });
  made.auctions = []; made.listings = []; made.vehicles = []; made.users = [];
  made.bids = []; made.orderRefs = [];
});

describe('حجز العربون', () => {
  /** **ولا يُكتب الصفّ قبل أن يُحجز المال** — وإلّا صار ملتزمًا في دفترنا حرًّا عند بطاقته. */
  it('بلا بطاقة يُطلب وسيلة ولا يُكتب صفّ', async () => {
    const { auctionId, ref, bidderId } = await scaffold();

    const result = await holdDeposit({ auctionId, userId: bidderId, auctionRef: ref });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('METHOD_REQUIRED');
      expect(result.amount).toBe('5000');
    }

    expect(await db.deposit.count({ where: { auctionId } })).toBe(0);
  });

  it('ببطاقةٍ يُحجز المال ويُربط بالصفّ', async () => {
    const { auctionId, ref, bidderId } = await scaffold();

    const result = await holdDeposit({
      auctionId, userId: bidderId, auctionRef: ref,
      method: 'mada', returnUrl: 'http://localhost/return',
    });
    expect(result.ok).toBe(true);

    const deposit = await db.deposit.findFirstOrThrow({
      where: { auctionId },
      include: { payment: true },
    });
    expect(deposit.status).toBe('HELD');
    expect(deposit.payment).not.toBeNull();
    expect(deposit.payment?.status).toBe('HELD');
    expect(deposit.payment?.purpose).toBe('AUCTION_DEPOSIT');
    // دفعةٌ بلا طلب — و`orderId` اختياريّ منذ المخطّط الأوّل
    expect(deposit.payment?.orderId).toBeNull();
  });
});

describe('مصير العربون', () => {
  /** حبسُه بعد انتهاء المزاد ليس ضمانةً بل احتجازُ مالٍ بلا سبب. */
  it('حجز الخاسر يُلغى عند البوابة لا يُوسَم فقط', async () => {
    const { auctionId, ref, bidderId } = await scaffold();
    await holdDeposit({
      auctionId, userId: bidderId, auctionRef: ref,
      method: 'mada', returnUrl: 'http://localhost/return',
    });

    // لا فائز ⇒ الجميع خاسرون
    await settleDeposits(auctionId, null);

    const deposit = await db.deposit.findFirstOrThrow({
      where: { auctionId },
      include: { payment: true },
    });
    expect(deposit.status).toBe('RELEASED');
    expect(deposit.payment?.status).toBe('CANCELLED');
  });

  /**
   * **والمُصادَر للمنصّة** (قرار المالك): يُحصَّل الحجز ويُقيَّد
   * إيرادًا. وبلا قيدٍ يدخل مالٌ حسابَنا ولا يظهر في دفترنا.
   */
  it('المصادرة تُحصّل وتُقيّد إيرادًا للمنصّة', async () => {
    const { auctionId, ref, bidderId } = await scaffold();
    await holdDeposit({
      auctionId, userId: bidderId, auctionRef: ref,
      method: 'mada', returnUrl: 'http://localhost/return',
    });

    const before = await db.ledgerEntry.count({ where: { event: 'deposit.forfeited' } });
    const result = await forfeitDeposit({ auctionId, userId: bidderId });
    expect(result.ok).toBe(true);

    const deposit = await db.deposit.findFirstOrThrow({
      where: { auctionId },
      include: { payment: true },
    });
    expect(deposit.status).toBe('FORFEITED');
    expect(deposit.payment?.status).toBe('SETTLED');
    expect(Number(deposit.payment?.settledAmount)).toBe(5_000);

    /**
     * قيدان متوازنان: نقدٌ مدين، وإيرادٌ دائن.
     *
     * **والحكم على القيد المعنيّ لا على العدّاد العامّ.** الجدول يحمل
     * مصادراتٍ أخرى (مزروعةً وسابقة)، و`find` على الكلّ يلتقط أوّلها —
     * فيسقط الاختبار على ما لا يقيسه.
     */
    const mine = deposit.paymentId;
    const after = await db.ledgerEntry.findMany({
      where: { event: 'deposit.forfeited', paymentId: mine },
    });
    expect(
      (await db.ledgerEntry.count({ where: { event: 'deposit.forfeited' } })) - before,
    ).toBe(2);
    expect(after).toHaveLength(2);
    const cash = after.find((row) => row.account === 'PLATFORM_CASH');
    const revenue = after.find((row) => row.account === 'PLATFORM_REVENUE');
    expect(Number(cash?.amount)).toBe(5_000);
    expect(Number(revenue?.amount)).toBe(5_000);
    expect(cash?.direction).toBe('DEBIT');
    expect(revenue?.direction).toBe('CREDIT');

    /**
     * **ومن صُودر عربونُه مكتوبٌ في القيد.** كان يُكتب الثابت
     * `deposit.forfeited` بلا صاحبٍ ولا مزاد، فخمسةُ آلافٍ تدخل
     * الإيراد ولا يقول الدفتر عربونَ من هي.
     */
    expect(cash?.note).toBe(ref);
    expect(cash?.userId).toBe(bidderId);
    expect(revenue?.note).toBe(ref);
  });
});

/**
 * ═══ القاعدة ٩ تمامها ═══
 *
 * المواصفة ثلاثُ جُمَل: «يُرد لغير الفائزين · يُخصم للفائز · يُصادَر
 * عند الانسحاب». والأوّلان كانا يُناديان، **والثالث لا**. ثمّ تبيّن
 * أن الثاني ناقصٌ أيضًا: العربون **يُخصم من المطلوب ولا يُحصَّل**،
 * فيبقى محجوزًا عند بطاقة المزايد ويُنقص البائع مقداره.
 */
describe('عربون الفائز يُحصَّل ليصل البائع', () => {
  it('يُخصم من المطلوب ويُحصَّل قيدًا، فيتطابق الدفتر مع شاشة البائع', async () => {
    const { auctionId, ref, bidderId } = await scaffold();
    await holdDeposit({ auctionId, auctionRef: ref, userId: bidderId, method: 'mada', returnUrl: 'http://localhost/r' });

    await db.bid.create({ data: { auctionId, bidderId, amount: 55_000 } });
    made.bids.push(auctionId);

    await settleDeposits(auctionId, bidderId);
    const applied = await db.deposit.findFirstOrThrow({
      where: { auctionId, userId: bidderId },
      select: { status: true, amount: true },
    });
    expect(applied.status).toBe('APPLIED');

    const { createAuctionOrderStandalone } = await import('@/lib/domain/auction-order');
    const created = await createAuctionOrderStandalone(auctionId);
    if (!created.ok) throw new Error(created.reason);
    made.orderRefs.push(created.orderRef);

    const order = await db.order.findUniqueOrThrow({
      where: { ref: created.orderRef },
      select: { id: true, agreedPrice: true, totalAmount: true, depositApplied: true, listingId: true },
    });

    /** **المطلوب هو الإجمالي ناقص العربون** — والمطرقة تبقى للتدقيق. */
    expect(Number(order.depositApplied)).toBe(5_000);
    expect(Number(order.totalAmount)).toBe(Number(order.agreedPrice) + 350 - 5_000);

    const { captureAppliedDeposit } = await import('@/lib/domain/deposit-money');
    const captured = await captureAppliedDeposit({
      orderId: order.id,
      buyerId: bidderId,
      listingId: order.listingId,
    });
    expect(Number(captured)).toBe(5_000);

    /** والمال وصل فعلًا — الدفعة لدى البوابة صارت مُسوّاة. */
    const row = await db.deposit.findFirstOrThrow({
      where: { auctionId, userId: bidderId },
      select: { payment: { select: { status: true } } },
    });
    expect(row.payment?.status).toBe('SETTLED');

    const entries = await db.ledgerEntry.findMany({
      where: { orderId: order.id, event: 'deposit.captured' },
      select: { account: true, direction: true, amount: true },
    });
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => Number(entry.amount) === 5_000)).toBe(true);
    // نقدٌ يدخل الضمان مقابل التزامٍ للمشتري — شكل `order.paid` نفسه
    expect(entries.find((entry) => entry.account === 'ESCROW_AT_PROVIDER')?.direction).toBe('DEBIT');
    expect(entries.find((entry) => entry.account === 'BUYER_ADVANCE')?.direction).toBe('CREDIT');
  });

  /** **وتحصيلٌ وقع لا يُعاد** — وإلّا سُحب من البطاقة مرّتين. */
  it('لا يُحصَّل العربون مرّتين', async () => {
    const { auctionId, ref, bidderId } = await scaffold();
    await holdDeposit({ auctionId, auctionRef: ref, userId: bidderId, method: 'mada', returnUrl: 'http://localhost/r' });
    await db.bid.create({ data: { auctionId, bidderId, amount: 55_000 } });
    made.bids.push(auctionId);
    await settleDeposits(auctionId, bidderId);

    const { createAuctionOrderStandalone } = await import('@/lib/domain/auction-order');
    const created = await createAuctionOrderStandalone(auctionId);
    if (!created.ok) throw new Error(created.reason);
    made.orderRefs.push(created.orderRef);

    const order = await db.order.findUniqueOrThrow({
      where: { ref: created.orderRef },
      select: { id: true, listingId: true },
    });

    const { captureAppliedDeposit } = await import('@/lib/domain/deposit-money');
    const input = { orderId: order.id, buyerId: bidderId, listingId: order.listingId };
    expect(Number(await captureAppliedDeposit(input))).toBe(5_000);
    expect(await captureAppliedDeposit(input)).toBeNull();

    const count = await db.ledgerEntry.count({
      where: { orderId: order.id, event: 'deposit.captured' },
    });
    expect(count).toBe(2);
  });
});

describe('الانسحاب بعد الرسوّ', () => {
  /**
   * الجملة الثالثة من القاعدة ٩ — **ولم يكن يناديها شيء**. فمن يربح
   * مزادًا ولا يدفع كان يخسر المركبة ويحتفظ بعربونه، والعربون هو
   * الشيء الوحيد الذي يجعل المزايدة التزامًا لا نيّة.
   */
  it('يُصادَر عربون من رسا عليه ثم لم يُكمل', async () => {
    const { auctionId, ref, bidderId } = await scaffold();
    await holdDeposit({ auctionId, auctionRef: ref, userId: bidderId, method: 'mada', returnUrl: 'http://localhost/r' });
    await db.bid.create({ data: { auctionId, bidderId, amount: 55_000 } });
    made.bids.push(auctionId);
    await settleDeposits(auctionId, bidderId);

    const { createAuctionOrderStandalone } = await import('@/lib/domain/auction-order');
    const created = await createAuctionOrderStandalone(auctionId);
    if (!created.ok) throw new Error(created.reason);
    made.orderRefs.push(created.orderRef);

    const order = await db.order.findUniqueOrThrow({
      where: { ref: created.orderRef },
      select: { id: true },
    });

    const { forfeitOnWithdrawal } = await import('@/lib/domain/auctions');
    expect(await forfeitOnWithdrawal({ orderId: order.id, reason: 'payment.timeout' })).toEqual({
      forfeited: true,
    });

    const deposit = await db.deposit.findFirstOrThrow({
      where: { auctionId, userId: bidderId },
      select: { status: true, payment: { select: { status: true } } },
    });
    expect(deposit.status).toBe('FORFEITED');
    // **والوسم يتبع التحصيل** — فلا يقول الدفتر إننا قبضنا ما لم نقبض
    expect(deposit.payment?.status).toBe('SETTLED');

    /** ويُقال لصاحبه — مالٌ يخرج بلا خبرٍ أسوأ من المصادرة نفسها. */
    const told = await db.notification.count({
      where: { userId: bidderId, templateKey: 'deposit.forfeited' },
    });
    expect(told).toBe(1);
  });

  /** **وطلبٌ مباشر لا يُصادَر له عربون** — ولو كان إعلانه مزادًا سابقًا. */
  it('لا يمسّ طلبًا غير مزاديّ', async () => {
    const direct = await db.order.findFirstOrThrow({
      where: { source: { not: 'AUCTION' } },
      select: { id: true },
    });
    const { forfeitOnWithdrawal } = await import('@/lib/domain/auctions');
    expect(await forfeitOnWithdrawal({ orderId: direct.id, reason: 'buyer.cancelled' })).toEqual({
      forfeited: false,
    });
  });
});
