import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  OFFER_TTL_HOURS,
  PAYMENT_WINDOW_HOURS,
  acceptOffer,
  counterOffer,
  createOffer,
  expireOffers,
  timeoutUnpaidOrders,
  withdrawOffer,
} from '@/lib/domain/offers';

/**
 * القواعد ١–٥ من القسم ٧، كلٌّ باختبار باسمها.
 *
 * **الزمن مُمرَّر لا مقروء من الساعة**: قاعدةٌ عن ٤٨ ساعة لا تُختبر
 * بالانتظار. وكل اختبار يبني بياناته ويهدمها، فلا يعتمد على زرعٍ قد
 * يتغيّر ولا يترك أثرًا يُفسد غيره.
 */

const T0 = new Date('2026-06-01T10:00:00Z');
const hours = (n: number): Date => new Date(T0.getTime() + n * 3600 * 1000);

let sellerId: string;
let buyerId: string;
let otherBuyerId: string;
let listingRef: string;
let listingId: string;
let vehicleId: string;

async function scaffold(minAcceptPrice: number | null): Promise<void> {
  const stamp = String(Date.now()).slice(-9);

  const [seller, buyer, other] = await Promise.all([
    db.user.create({ data: { phone: `+9665001${stamp}` } }),
    db.user.create({ data: { phone: `+9665002${stamp}` } }),
    db.user.create({ data: { phone: `+9665003${stamp}` } }),
  ]);
  sellerId = seller.id;
  buyerId = buyer.id;
  otherBuyerId = other.id;

  const model = await db.model.findFirstOrThrow({ include: { brand: true } });

  const vehicle = await db.vehicle.create({
    data: {
      ownerId: sellerId,
      brandId: model.brandId,
      modelId: model.id,
      brandName: model.brand.nameAr,
      modelName: model.nameAr,
      year: 2024,
      bodyType: 'SEDAN',
      transmission: 'AUTOMATIC',
      fuel: 'PETROL',
      drivetrain: 'FWD',
      seats: 5,
      mileageKm: 40_000,
      colorExterior: 'أبيض',
      spec: 'SAUDI',
      condition: 'USED',
      city: 'الرياض',
      entryMode: 'MANUAL',
    },
  });
  vehicleId = vehicle.id;

  const listing = await db.listing.create({
    data: {
      ref: `TST${stamp}`,
      vehicleId: vehicle.id,
      sellerId,
      type: 'NEGOTIATION',
      status: 'PUBLISHED',
      askPrice: 100_000,
      ...(minAcceptPrice === null ? {} : { minAcceptPrice }),
      negotiable: true,
      city: 'الرياض',
      publishedAt: T0,
    },
  });
  listingRef = listing.ref;
  listingId = listing.id;
}

async function teardown(): Promise<void> {
  await db.notification.deleteMany({ where: { userId: { in: [sellerId, buyerId, otherBuyerId] } } });
  await db.orderEvent.deleteMany({ where: { order: { listingId } } });
  await db.order.deleteMany({ where: { listingId } });
  await db.offer.deleteMany({ where: { listingId } });
  await db.listing.deleteMany({ where: { id: listingId } });
  await db.vehicle.deleteMany({ where: { id: vehicleId } });
  await db.user.deleteMany({ where: { id: { in: [sellerId, buyerId, otherBuyerId] } } });
}

afterAll(async () => {
  await db.$disconnect();
});

describe('offer.autoReject — القاعدة ١', () => {
  beforeEach(async () => {
    await scaffold(90_000);
  });

  it('عرض دون الحدّ الأدنى يُرفض تلقائيًا', async () => {
    const result = await createOffer({ listingRef, buyerId, amount: 80_000 }, T0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.autoRejected).toBe(true);
    expect(result.offer.status).toBe('REJECTED');
    expect(result.offer.autoRejected).toBe(true);
    await teardown();
  });

  it('عرض عند الحدّ أو فوقه لا يُرفض', async () => {
    const at = await createOffer({ listingRef, buyerId, amount: 90_000 }, T0);
    expect(at.ok && at.autoRejected).toBe(false);
    expect(at.ok && at.offer.status).toBe('PENDING');
    await teardown();
  });

  /** «مع إشعار» جزء من القاعدة لا زينة — بلا سجلّ لا يُختبر الشرط. */
  it('الرفض يُشعِر المشتري، ولا يُشعِر البائع', async () => {
    const result = await createOffer({ listingRef, buyerId, amount: 50_000 }, T0);
    expect(result.ok).toBe(true);

    const toBuyer = await db.notification.findMany({ where: { userId: buyerId } });
    const toSeller = await db.notification.findMany({ where: { userId: sellerId } });

    expect(toBuyer.map((n) => n.templateKey)).toContain('offer.auto_rejected');
    expect(toSeller).toHaveLength(0);
    await teardown();
  });

  /** قرار ٢٩ — الحدّ لا يخرج ولا يُشتقّ من الرد. */
  it('لا يتسرّب الحدّ الأدنى في النتيجة ولا في الإشعار', async () => {
    const result = await createOffer({ listingRef, buyerId, amount: 50_000 }, T0);
    const notifications = await db.notification.findMany({ where: { userId: buyerId } });

    const json = JSON.stringify({ result, notifications });
    expect(json).not.toContain('90000');
    expect(json).not.toContain('minAcceptPrice');
    await teardown();
  });

  it('الرفض التلقائي يُسجَّل عرضًا ولا يُبتلع', async () => {
    await createOffer({ listingRef, buyerId, amount: 10_000 }, T0);
    const stored = await db.offer.count({ where: { listingId, autoRejected: true } });
    expect(stored).toBe(1);
    await teardown();
  });
});

describe('offer.singleActive — القاعدة ٢', () => {
  beforeEach(async () => {
    await scaffold(null);
  });

  it('عرض ثانٍ نشط من نفس المشتري يُرفض', async () => {
    expect((await createOffer({ listingRef, buyerId, amount: 95_000 }, T0)).ok).toBe(true);

    const second = await createOffer({ listingRef, buyerId, amount: 97_000 }, hours(1));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('ACTIVE_OFFER_EXISTS');
    await teardown();
  });

  it('مشترٍ آخر يقدّم عرضه بحرّية — القيد على الزوج لا على الإعلان', async () => {
    await createOffer({ listingRef, buyerId, amount: 95_000 }, T0);
    const other = await createOffer({ listingRef, buyerId: otherBuyerId, amount: 96_000 }, T0);
    expect(other.ok).toBe(true);
    await teardown();
  });

  it('بعد السحب يُقبل عرض جديد', async () => {
    const first = await createOffer({ listingRef, buyerId, amount: 95_000 }, T0);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    await withdrawOffer({ offerId: first.offer.id, buyerId }, hours(1));
    const again = await createOffer({ listingRef, buyerId, amount: 98_000 }, hours(2));
    expect(again.ok).toBe(true);
    await teardown();
  });

  it('البائع لا يقدّم عرضًا على إعلانه', async () => {
    const own = await createOffer({ listingRef, buyerId: sellerId, amount: 99_000 }, T0);
    expect(own.ok).toBe(false);
    if (!own.ok) expect(own.reason).toBe('OWN_LISTING');
    await teardown();
  });
});

describe('offer.expiry — القاعدة ٣', () => {
  beforeEach(async () => {
    await scaffold(null);
  });

  it('العرض يسقط بعد ٤٨ ساعة بالضبط لا قبلها', async () => {
    const created = await createOffer({ listingRef, buyerId, amount: 95_000 }, T0);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(created.offer.expiresAt.getTime()).toBe(hours(OFFER_TTL_HOURS).getTime());

    // قبل الموعد بساعة: لا يسقط
    expect(await expireOffers(hours(OFFER_TTL_HOURS - 1))).toBe(0);
    expect((await db.offer.findUniqueOrThrow({ where: { id: created.offer.id } })).status).toBe('PENDING');

    expect(await expireOffers(hours(OFFER_TTL_HOURS))).toBe(1);
    expect((await db.offer.findUniqueOrThrow({ where: { id: created.offer.id } })).status).toBe('EXPIRED');
    await teardown();
  });

  /**
   * الانتهاء **يُكتب** ولا يُستنتج عند القراءة: عرضٌ منتهٍ يجب أن يبدو
   * منتهيًا لكل قارئ، لا لمن تذكّر مقارنة التاريخ.
   */
  it('العرض المنتهي لا يُقبل ولا يُقابَل ولا يُسحب', async () => {
    const created = await createOffer({ listingRef, buyerId, amount: 95_000 }, T0);
    if (!created.ok) return;
    const late = hours(OFFER_TTL_HOURS + 1);

    const accepted = await acceptOffer({ offerId: created.offer.id, sellerId }, late);
    expect(accepted.ok).toBe(false);

    const countered = await counterOffer({ offerId: created.offer.id, sellerId, amount: 97_000 }, late);
    expect(countered.ok).toBe(false);

    const withdrawn = await withdrawOffer({ offerId: created.offer.id, buyerId }, late);
    expect(withdrawn.ok).toBe(false);
    await teardown();
  });

  it('العرض المقابل يبدأ مهلة جديدة لا يرث القديمة', async () => {
    const first = await createOffer({ listingRef, buyerId, amount: 95_000 }, T0);
    if (!first.ok) return;

    const counter = await counterOffer(
      { offerId: first.offer.id, sellerId, amount: 98_000 },
      hours(40),
    );
    expect(counter.ok).toBe(true);
    if (!counter.ok) return;

    expect(counter.offer.expiresAt.getTime()).toBe(hours(40 + OFFER_TTL_HOURS).getTime());
    expect((await db.offer.findUniqueOrThrow({ where: { id: first.offer.id } })).status).toBe('COUNTERED');
    await teardown();
  });
});

describe('offer.acceptCascade — القاعدة ٤', () => {
  beforeEach(async () => {
    await scaffold(null);
  });

  it('القبول يُغلق الباقي ويسحب الإعلان ويفتح مهلة ٢٤ ساعة', async () => {
    const mine = await createOffer({ listingRef, buyerId, amount: 95_000 }, T0);
    const theirs = await createOffer({ listingRef, buyerId: otherBuyerId, amount: 93_000 }, T0);
    if (!mine.ok || !theirs.ok) return;

    const result = await acceptOffer({ offerId: mine.offer.id, sellerId }, hours(2));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.closedOffers).toBe(1);
    expect((await db.offer.findUniqueOrThrow({ where: { id: mine.offer.id } })).status).toBe('ACCEPTED');
    expect((await db.offer.findUniqueOrThrow({ where: { id: theirs.offer.id } })).status).toBe('REJECTED');

    // الإعلان يخرج من العرض العام
    expect((await db.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe('RESERVED');

    const order = await db.order.findUniqueOrThrow({ where: { ref: result.orderRef } });
    expect(order.stage).toBe('PAYMENT');
    expect(order.paymentDueAt?.getTime()).toBe(hours(2 + PAYMENT_WINDOW_HOURS).getTime());
    await teardown();
  });

  it('الخاسرون يُخطَرون، والفائز يُخطَر بأولوية حرجة', async () => {
    const mine = await createOffer({ listingRef, buyerId, amount: 95_000 }, T0);
    await createOffer({ listingRef, buyerId: otherBuyerId, amount: 93_000 }, T0);
    if (!mine.ok) return;

    await acceptOffer({ offerId: mine.offer.id, sellerId }, hours(2));

    const loser = await db.notification.findMany({ where: { userId: otherBuyerId } });
    expect(loser.map((n) => n.templateKey)).toContain('offer.lost');

    const winner = await db.notification.findFirstOrThrow({
      where: { userId: buyerId, templateKey: 'offer.accepted' },
    });
    // فوات المهلة يُلغي الصفقة — فالإشعار حرج (قاعدة ١٧)
    expect(winner.priority).toBe('critical');
    await teardown();
  });

  /** قاعدة ١١ — العمولة لقطة: تعديل الباقة لا يمسّ القائم. */
  it('العمولة ورسوم النقل تُنسخ لقطةً في الطلب', async () => {
    const mine = await createOffer({ listingRef, buyerId, amount: 95_000 }, T0);
    if (!mine.ok) return;

    const result = await acceptOffer({ offerId: mine.offer.id, sellerId }, hours(1));
    if (!result.ok) return;

    const order = await db.order.findUniqueOrThrow({ where: { ref: result.orderRef } });
    const platform = await db.platformSetting.findUniqueOrThrow({ where: { id: 'default' } });

    expect(Number(order.agreedPrice)).toBe(95_000);
    expect(Number(order.transferFee)).toBe(Number(platform.transferFee));
    expect(Number(order.totalAmount)).toBe(
      Number(order.agreedPrice) + Number(order.commissionAmount) + Number(order.transferFee),
    );
    // الضريبة مضمَّنة ١٥/١١٥ لا مضافة (قرار ١٧)
    expect(Number(order.vatAmount)).toBeLessThan(Number(order.totalAmount));
    expect(Number(order.vatAmount)).toBeCloseTo(
      (Number(order.totalAmount) * Number(platform.vatPct)) / (100 + Number(platform.vatPct)),
      1,
    );
    await teardown();
  });

  it('لا يقبل غير البائع', async () => {
    const mine = await createOffer({ listingRef, buyerId, amount: 95_000 }, T0);
    if (!mine.ok) return;

    const stolen = await acceptOffer({ offerId: mine.offer.id, sellerId: otherBuyerId }, hours(1));
    expect(stolen.ok).toBe(false);
    if (!stolen.ok) expect(stolen.reason).toBe('NOT_SELLER');
    await teardown();
  });

  it('لا يُقبل عرضان على إعلان واحد', async () => {
    const first = await createOffer({ listingRef, buyerId, amount: 95_000 }, T0);
    const second = await createOffer({ listingRef, buyerId: otherBuyerId, amount: 96_000 }, T0);
    if (!first.ok || !second.ok) return;

    expect((await acceptOffer({ offerId: first.offer.id, sellerId }, hours(1))).ok).toBe(true);
    // الثاني أُغلق مع القبول الأول
    expect((await acceptOffer({ offerId: second.offer.id, sellerId }, hours(1))).ok).toBe(false);
    expect(await db.order.count({ where: { listingId } })).toBe(1);
    await teardown();
  });
});

describe('order.paymentTimeout — القاعدة ٥', () => {
  beforeEach(async () => {
    await scaffold(null);
  });

  it('فوات المهلة يُلغي الطلب ويعيد نشر الإعلان', async () => {
    const mine = await createOffer({ listingRef, buyerId, amount: 95_000 }, T0);
    if (!mine.ok) return;
    const accepted = await acceptOffer({ offerId: mine.offer.id, sellerId }, hours(1));
    if (!accepted.ok) return;

    // قبل الموعد: لا شيء
    expect(await timeoutUnpaidOrders(hours(1 + PAYMENT_WINDOW_HOURS - 1))).toBe(0);

    expect(await timeoutUnpaidOrders(hours(1 + PAYMENT_WINDOW_HOURS))).toBe(1);

    const order = await db.order.findUniqueOrThrow({ where: { ref: accepted.orderRef } });
    expect(order.status).toBe('CANCELLED');
    // الإلغاء حالة لا مرحلة — الطلب يبقى عند التي مات فيها
    expect(order.stage).toBe('PAYMENT');
    expect(order.cancelReason).toBe('payment.timeout');

    expect((await db.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe('PUBLISHED');
    await teardown();
  });

  it('المتقدّمون يُخطَرون بإعادة النشر', async () => {
    const mine = await createOffer({ listingRef, buyerId, amount: 95_000 }, T0);
    await createOffer({ listingRef, buyerId: otherBuyerId, amount: 93_000 }, T0);
    if (!mine.ok) return;

    const accepted = await acceptOffer({ offerId: mine.offer.id, sellerId }, hours(1));
    if (!accepted.ok) return;
    await timeoutUnpaidOrders(hours(1 + PAYMENT_WINDOW_HOURS));

    const relisted = await db.notification.findMany({
      where: { userId: otherBuyerId, templateKey: 'listing.relisted' },
    });
    expect(relisted).toHaveLength(1);
    await teardown();
  });

  /** من انسحب أو رُفض تلقائيًا اختار الخروج — وإخطاره ضجيج. */
  it('المرفوض تلقائيًا لا يُخطَر بإعادة النشر', async () => {
    await teardown();
    await scaffold(90_000);

    await createOffer({ listingRef, buyerId: otherBuyerId, amount: 50_000 }, T0);
    const mine = await createOffer({ listingRef, buyerId, amount: 95_000 }, T0);
    if (!mine.ok) return;

    const accepted = await acceptOffer({ offerId: mine.offer.id, sellerId }, hours(1));
    if (!accepted.ok) return;
    await timeoutUnpaidOrders(hours(1 + PAYMENT_WINDOW_HOURS));

    const relisted = await db.notification.findMany({
      where: { userId: otherBuyerId, templateKey: 'listing.relisted' },
    });
    expect(relisted).toHaveLength(0);
    await teardown();
  });

  it('المشتري المتأخّر يُخطَر بأولوية حرجة', async () => {
    const mine = await createOffer({ listingRef, buyerId, amount: 95_000 }, T0);
    if (!mine.ok) return;
    const accepted = await acceptOffer({ offerId: mine.offer.id, sellerId }, hours(1));
    if (!accepted.ok) return;

    await timeoutUnpaidOrders(hours(1 + PAYMENT_WINDOW_HOURS));
    const notice = await db.notification.findFirstOrThrow({
      where: { userId: buyerId, templateKey: 'order.payment_timeout' },
    });
    expect(notice.priority).toBe('critical');
    await teardown();
  });
});
